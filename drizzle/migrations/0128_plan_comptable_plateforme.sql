-- 0128 — Plan comptable géré par la plateforme (back-office), comptes propres à chaque dossier.
-- * Le référentiel SYSCOHADA révisé (syscohada_references, version visée par l'expert-comptable) reste la base ;
--   il n'est pas modifiable en back-office (texte normatif) : on le consulte avec son visa.
-- * Comptes communs de la plateforme (ex. 70611 « Prestations de santé — consultations ») : définis en back-office
--   par un opérateur, ajoutés à tous les dossiers (jamais modifiés ni supprimés dans un dossier existant).
-- * L'installation du plan dans un dossier lit désormais la base (référentiel visé + comptes communs) au lieu d'une
--   liste figée dans l'application ; elle n'ajoute que les comptes absents.
-- * Les comptes ajoutés par un dossier restent dans ce dossier (inchangé) ; le back-office les compte par dossier.
-- * Back-office : état des référentiels (CIM-10, plan comptable) ; journal : retrace les opérations initiales faites
--   directement en base (inscription du propriétaire, chargement CIM-10) quand elles ne sont pas déjà tracées.
-- Retour : docs/rollback/0128_plan_comptable_plateforme_down.sql

CREATE TABLE IF NOT EXISTS public.plateforme_comptes_communs (
  numero text PRIMARY KEY CHECK (numero ~ '^[1-8][0-9]{3,9}$'),
  intitule text NOT NULL CHECK (length(btrim(intitule)) BETWEEN 3 AND 200),
  sens text NOT NULL DEFAULT 'D/C' CHECK (sens IN ('D', 'C', 'D/C')),
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plateforme_comptes_communs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plateforme_comptes_communs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plateforme_comptes_communs TO authenticated;
DROP POLICY IF EXISTS "Lecture comptes communs" ON public.plateforme_comptes_communs;
CREATE POLICY "Lecture comptes communs" ON public.plateforme_comptes_communs FOR SELECT TO authenticated USING (true);

-- Sous-comptes santé jusqu'ici figés dans l'application (rattachés à 7061).
INSERT INTO public.plateforme_comptes_communs(numero, intitule, sens) VALUES
  ('70611', 'Prestations de santé — consultations', 'C'),
  ('70612', 'Prestations de santé — actes et soins', 'C'),
  ('70613', 'Prestations de santé — analyses de laboratoire', 'C'),
  ('70618', 'Prestations de santé — autres', 'C')
ON CONFLICT (numero) DO NOTHING;

-- Version du référentiel en vigueur : la dernière visée, à défaut la version d'origine.
CREATE OR REPLACE FUNCTION public.plan_reference_version() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT version FROM public.syscohada_references WHERE valide_officiellement ORDER BY visa_le DESC NULLS LAST, created_at DESC LIMIT 1),
    'SYSCOHADA_REVISE_2019_V1')
$$;
REVOKE ALL ON FUNCTION public.plan_reference_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_reference_version() TO authenticated;

-- Comptes installables : référentiel (niveaux 3 et plus, classes 1 à 8) + comptes communs actifs ;
-- _tous : y compris les comptes communs désactivés (pour reconnaître l'origine d'un compte déjà installé).
CREATE OR REPLACE FUNCTION public.plan_reference_comptes(_tous boolean DEFAULT false)
RETURNS TABLE(numero text, intitule text, classe text, sens text, type_compte text, origine text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ref AS (
    SELECT r->>'compte' AS numero, r->>'intitule' AS intitule, r->>'classe' AS classe,
           CASE WHEN r->>'sens_normal_indicatif' IN ('D', 'C') THEN r->>'sens_normal_indicatif' ELSE 'D/C' END AS sens
      FROM public.syscohada_references s, jsonb_array_elements(s.comptes) r
     WHERE s.version = public.plan_reference_version() AND length(r->>'compte') >= 3 AND r->>'classe' <> '9'
  )
  SELECT numero, intitule, classe, sens,
         CASE classe WHEN '6' THEN 'Résultat' WHEN '7' THEN 'Résultat' WHEN '8' THEN 'HAO' ELSE 'Bilan' END, 'referentiel' FROM ref
  UNION ALL
  SELECT c.numero, c.intitule, left(c.numero, 1), c.sens,
         CASE left(c.numero, 1) WHEN '6' THEN 'Résultat' WHEN '7' THEN 'Résultat' WHEN '8' THEN 'HAO' ELSE 'Bilan' END, 'plateforme'
    FROM public.plateforme_comptes_communs c
   WHERE (c.actif OR _tous) AND NOT EXISTS (SELECT 1 FROM ref WHERE ref.numero = c.numero)
$$;
REVOKE ALL ON FUNCTION public.plan_reference_comptes(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_reference_comptes(boolean) TO authenticated;

-- Ajoute au dossier les comptes installables absents ; ne modifie ni ne supprime rien.
CREATE OR REPLACE FUNCTION public.plan_installer_reference(_entreprise_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT public.can_write_entreprise(_entreprise_id) THEN
    RAISE EXCEPTION 'Réservé à l''administrateur ou au comptable du dossier' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.plan_comptable(entreprise_id, numero, intitule, classe, sens, type_compte, actif)
    SELECT _entreprise_id, r.numero, r.intitule, r.classe, r.sens, r.type_compte, true FROM public.plan_reference_comptes() r
  ON CONFLICT (entreprise_id, numero) DO NOTHING;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.plan_installer_reference(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_installer_reference(uuid) TO authenticated;

-- Back-office : définir un compte commun ; actif, il est ajouté à tous les dossiers qui ne l'ont pas.
CREATE OR REPLACE FUNCTION public.plateforme_compte_commun_definir(_numero text, _intitule text, _sens text DEFAULT 'D/C', _actif boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _num text := regexp_replace(coalesce(_numero, ''), '\s', '', 'g'); _n int := 0; _type text;
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  IF _num !~ '^[1-8][0-9]{3,9}$' THEN RAISE EXCEPTION 'Numéro de compte de 4 à 10 chiffres, classes 1 à 8'; END IF;
  IF EXISTS (SELECT 1 FROM public.plan_reference_comptes() r WHERE r.numero = _num AND r.origine = 'referentiel') THEN
    RAISE EXCEPTION 'Le compte % fait partie du référentiel SYSCOHADA : il n''est pas modifiable ici', _num;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_reference_comptes() r WHERE r.origine = 'referentiel'
                  AND length(r.numero) < length(_num) AND _num LIKE r.numero || '%') THEN
    RAISE EXCEPTION 'Le compte % doit être une subdivision d''un compte du référentiel SYSCOHADA', _num;
  END IF;
  IF length(btrim(coalesce(_intitule, ''))) < 3 THEN RAISE EXCEPTION 'Intitulé requis'; END IF;
  IF coalesce(_sens, 'D/C') NOT IN ('D', 'C', 'D/C') THEN RAISE EXCEPTION 'Sens attendu : D, C ou D/C'; END IF;
  INSERT INTO public.plateforme_comptes_communs(numero, intitule, sens, actif)
  VALUES (_num, btrim(_intitule), coalesce(_sens, 'D/C'), coalesce(_actif, true))
  ON CONFLICT (numero) DO UPDATE SET intitule = EXCLUDED.intitule, sens = EXCLUDED.sens, actif = EXCLUDED.actif, updated_at = now();
  IF coalesce(_actif, true) THEN
    _type := CASE left(_num, 1) WHEN '6' THEN 'Résultat' WHEN '7' THEN 'Résultat' WHEN '8' THEN 'HAO' ELSE 'Bilan' END;
    INSERT INTO public.plan_comptable(entreprise_id, numero, intitule, classe, sens, type_compte, actif)
      SELECT e.id, _num, btrim(_intitule), left(_num, 1), coalesce(_sens, 'D/C'), _type, true FROM public.entreprises e
    ON CONFLICT (entreprise_id, numero) DO NOTHING;
    GET DIAGNOSTICS _n = ROW_COUNT;
  END IF;
  PERFORM public.plateforme_tracer('compte_commun_defini', 'plan_comptable', _num,
    jsonb_build_object('intitule', btrim(_intitule), 'sens', coalesce(_sens, 'D/C'), 'actif', coalesce(_actif, true), 'dossiers_completes', _n));
  RETURN jsonb_build_object('numero', _num, 'dossiers_completes', _n);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_compte_commun_definir(text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_compte_commun_definir(text, text, text, boolean) TO authenticated;

-- Back-office : état des référentiels et des comptes propres à chaque dossier.
CREATE OR REPLACE FUNCTION public.plateforme_referentiels_etat() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _res jsonb;
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  WITH ref AS (SELECT numero, origine FROM public.plan_reference_comptes(true)),
       inst AS (SELECT numero FROM public.plan_reference_comptes(false))
  SELECT jsonb_build_object(
    'cim10', (SELECT coalesce(jsonb_agg(jsonb_build_object('version', version, 'codes', n, 'mis_a_jour', maj) ORDER BY n DESC), '[]')
                FROM (SELECT version, count(*) n, max(updated_at) maj FROM public.sante_cim10 WHERE actif GROUP BY version) v),
    'cim10_codes_structures', (SELECT jsonb_build_object('codes', count(*), 'structures', count(DISTINCT structure_id))
                FROM public.sante_cim10_structure_codes WHERE actif),
    'plan', (SELECT jsonb_build_object('version', s.version, 'source', s.source, 'valide', s.valide_officiellement,
                'visa_le', s.visa_le, 'visa_expert', s.visa_expert,
                'comptes_referentiel', (SELECT count(*) FROM ref WHERE origine = 'referentiel'))
               FROM public.syscohada_references s WHERE s.version = public.plan_reference_version()),
    'comptes_communs', (SELECT coalesce(jsonb_agg(jsonb_build_object('numero', c.numero, 'intitule', c.intitule, 'sens', c.sens, 'actif', c.actif,
                'dossiers', (SELECT count(*) FROM public.plan_comptable p WHERE p.numero = c.numero)) ORDER BY c.numero), '[]')
               FROM public.plateforme_comptes_communs c),
    'dossiers', (SELECT coalesce(jsonb_agg(d ORDER BY d->>'nom'), '[]') FROM (
                SELECT jsonb_build_object('entreprise_id', e.id, 'nom', e.nom,
                  'comptes', count(p.id),
                  'propres', count(p.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM ref WHERE ref.numero = p.numero)),
                  'manquants', (SELECT count(*) FROM inst WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable q WHERE q.entreprise_id = e.id AND q.numero = inst.numero)),
                  'exemples_propres', (SELECT coalesce(jsonb_agg(x.numero || ' ' || x.intitule), '[]') FROM (
                      SELECT q.numero, q.intitule FROM public.plan_comptable q WHERE q.entreprise_id = e.id
                        AND NOT EXISTS (SELECT 1 FROM ref WHERE ref.numero = q.numero) ORDER BY q.numero LIMIT 10) x)) AS d
                  FROM public.entreprises e LEFT JOIN public.plan_comptable p ON p.entreprise_id = e.id
                 GROUP BY e.id, e.nom) t)
  ) INTO _res;
  RETURN _res;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_referentiels_etat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_referentiels_etat() TO authenticated;

-- Journal : opérations initiales faites en base, retracées une seule fois.
INSERT INTO public.plateforme_audit(operateur_id, action, cible_type, cible_id, details, created_at)
SELECT o.user_id, 'operateur_ajoute', 'operateur', o.user_id::text,
       jsonb_build_object('role', o.role, 'retrace', true, 'note', 'Inscription initiale faite directement en base'), o.created_at
  FROM public.plateforme_operateurs o
 WHERE o.role = 'proprietaire'
   AND NOT EXISTS (SELECT 1 FROM public.plateforme_audit a WHERE a.action = 'operateur_ajoute' AND a.cible_id = o.user_id::text);
INSERT INTO public.plateforme_audit(operateur_id, action, cible_type, cible_id, details, created_at)
SELECT (SELECT user_id FROM public.plateforme_operateurs WHERE role = 'proprietaire' AND actif ORDER BY created_at LIMIT 1),
       'cim10_import', 'referentiel', v.version,
       jsonb_build_object('enregistrees', v.n, 'retrace', true, 'note', 'Chargement initial fait directement en base'), v.maj
  FROM (SELECT version, count(*) n, min(updated_at) maj FROM public.sante_cim10 WHERE version LIKE 'CIM-10 FR%' GROUP BY version) v
 WHERE NOT EXISTS (SELECT 1 FROM public.plateforme_audit a WHERE a.action = 'cim10_import' AND a.cible_id = v.version);
