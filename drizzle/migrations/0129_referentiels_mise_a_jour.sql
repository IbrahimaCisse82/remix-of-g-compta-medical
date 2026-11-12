-- 0129 — Mise à jour des référentiels depuis le back-office : plan comptable SYSCOHADA et CIM-10.
-- Plan comptable (texte normatif, visé par l'expert-comptable) : on ne modifie jamais une version visée.
--   1. un opérateur crée une nouvelle version « brouillon » (copie de la version en vigueur) ;
--   2. il y ajoute, renomme ou retire des comptes ; l'écart avec la version en vigueur est affiché ;
--   3. le propriétaire de la plateforme la publie avec le nom de l'expert-comptable qui l'a visée ;
--   4. à la publication, chaque dossier reçoit les comptes ajoutés par la version ; un compte renommé n'est renommé que dans les
--      dossiers qui avaient gardé l'intitulé d'origine ; rien n'est supprimé ni désactivé dans un dossier.
--   Les correspondances des états financiers sont copiées sans changement (les nouveaux comptes suivent leur compte parent).
--   La version d'origine SYSCOHADA_REVISE_2019_V1 reste visée (verrou de clôture inchangé).
-- CIM-10 : ajout, correction ou désactivation d'un code officiel ; après le chargement d'une nouvelle version,
--   désactivation des codes absents de cette version (aperçu d'abord). Les diagnostics déjà codés gardent leur libellé.
--   Un code officiel ajouté remplace dans la recherche le code identique qu'une structure aurait ajouté.
-- Toutes les opérations sont inscrites au journal de la plateforme.
-- Retour : docs/rollback/0129_referentiels_mise_a_jour_down.sql

ALTER TABLE public.syscohada_references
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS base_version text,
  ADD COLUMN IF NOT EXISTS cree_par uuid,
  ADD COLUMN IF NOT EXISTS publie_par uuid;

-- ---------------------------------------------------------------- Plan comptable

-- Comptes d'une version, à plat (numéro, intitulé, sens).
CREATE OR REPLACE FUNCTION public.plan_version_comptes(_version text)
RETURNS TABLE(numero text, intitule text, sens text, classe text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r->>'compte', r->>'intitule', coalesce(r->>'sens_normal_indicatif', ''), r->>'classe'
    FROM public.syscohada_references s, jsonb_array_elements(s.comptes) r WHERE s.version = _version
$$;
REVOKE ALL ON FUNCTION public.plan_version_comptes(text) FROM PUBLIC, anon, authenticated;

-- Écart entre une version et la version en vigueur.
CREATE OR REPLACE FUNCTION public.plateforme_plan_ecarts(_version text)
RETURNS TABLE(numero text, nature text, intitule_avant text, intitule_apres text, sens_avant text, sens_apres text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _active text := public.plan_reference_version();
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT coalesce(n.numero, a.numero),
           CASE WHEN a.numero IS NULL THEN 'ajout' WHEN n.numero IS NULL THEN 'retrait' ELSE 'modification' END,
           a.intitule, n.intitule, a.sens, n.sens
      FROM (SELECT * FROM public.plan_version_comptes(_version)) n
      FULL JOIN (SELECT * FROM public.plan_version_comptes(_active)) a ON a.numero = n.numero
     WHERE _version <> _active
       AND (a.numero IS NULL OR n.numero IS NULL OR a.intitule IS DISTINCT FROM n.intitule OR a.sens IS DISTINCT FROM n.sens)
     ORDER BY 1;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_plan_ecarts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_plan_ecarts(text) TO authenticated;

-- Versions du plan : en vigueur, anciennes, brouillon.
CREATE OR REPLACE FUNCTION public.plateforme_plan_versions() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _active text := public.plan_reference_version(); _res jsonb;
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'version', s.version, 'source', s.source, 'note', s.note, 'base_version', s.base_version,
      'valide', s.valide_officiellement, 'visa_le', s.visa_le, 'visa_expert', s.visa_expert,
      'cree_le', s.created_at, 'comptes', jsonb_array_length(s.comptes),
      'statut', CASE WHEN s.version = _active THEN 'en_vigueur' WHEN s.valide_officiellement THEN 'ancienne' ELSE 'brouillon' END,
      'ecarts', CASE WHEN s.version = _active THEN NULL ELSE (
        SELECT jsonb_build_object('ajouts', count(*) FILTER (WHERE e.nature = 'ajout'),
                                  'modifications', count(*) FILTER (WHERE e.nature = 'modification'),
                                  'retraits', count(*) FILTER (WHERE e.nature = 'retrait'))
          FROM public.plateforme_plan_ecarts(s.version) e) END)
    ORDER BY (s.version = _active) DESC, s.valide_officiellement, s.created_at DESC), '[]')
    INTO _res FROM public.syscohada_references s;
  RETURN jsonb_build_object('en_vigueur', _active, 'proprietaire', public.est_proprietaire_plateforme(), 'versions', _res);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_plan_versions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_plan_versions() TO authenticated;

-- Nouvelle version brouillon : copie de la version en vigueur.
CREATE OR REPLACE FUNCTION public.plateforme_plan_version_creer(_version text, _note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v text := upper(regexp_replace(btrim(coalesce(_version, '')), '[\s-]+', '_', 'g')); _active text := public.plan_reference_version();
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  IF _v !~ '^[A-Z0-9_.]{3,60}$' THEN RAISE EXCEPTION 'Nom de version : 3 à 60 caractères (lettres, chiffres, _), ex. SYSCOHADA_REVISE_2019_V2'; END IF;
  IF EXISTS (SELECT 1 FROM public.syscohada_references WHERE version = _v) THEN RAISE EXCEPTION 'La version % existe déjà', _v; END IF;
  INSERT INTO public.syscohada_references(version, source, comptes, mapping, valide_officiellement, note, base_version, cree_par)
    SELECT _v, 'Back-office, depuis ' || s.version, s.comptes, s.mapping, false, nullif(btrim(coalesce(_note, '')), ''), s.version, auth.uid()
      FROM public.syscohada_references s WHERE s.version = _active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version en vigueur introuvable'; END IF;
  PERFORM public.plateforme_tracer('plan_version_creee', 'plan_comptable', _v, jsonb_build_object('depuis', _active, 'note', _note));
  RETURN _v;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_plan_version_creer(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_plan_version_creer(text, text) TO authenticated;

-- Ajouter, renommer ou retirer un compte d'un brouillon.
CREATE OR REPLACE FUNCTION public.plateforme_plan_compte_modifier(_version text, _numero text, _intitule text DEFAULT NULL,
  _sens text DEFAULT NULL, _retirer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _num text := regexp_replace(coalesce(_numero, ''), '\s', '', 'g'); _ref public.syscohada_references%ROWTYPE;
        _avant jsonb; _apres jsonb; _parent text; _comptes jsonb; _s text := nullif(btrim(coalesce(_sens, '')), '');
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _ref FROM public.syscohada_references WHERE version = _version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version % introuvable', _version; END IF;
  IF _ref.valide_officiellement THEN RAISE EXCEPTION 'La version % est visée : créez une nouvelle version pour la modifier', _version; END IF;
  IF _num !~ '^[1-9][0-9]{1,9}$' THEN RAISE EXCEPTION 'Numéro de compte de 2 à 10 chiffres'; END IF;
  SELECT r INTO _avant FROM jsonb_array_elements(_ref.comptes) r WHERE r->>'compte' = _num;
  IF coalesce(_retirer, false) THEN
    IF _avant IS NULL THEN RAISE EXCEPTION 'Le compte % n''est pas dans la version', _num; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(_ref.comptes) r WHERE r->>'compte' LIKE _num || '_%') THEN
      RAISE EXCEPTION 'Le compte % a des sous-comptes : retirez-les d''abord', _num;
    END IF;
  ELSE
    IF length(btrim(coalesce(_intitule, ''))) < 3 THEN RAISE EXCEPTION 'Intitulé requis'; END IF;
    IF _s IS NOT NULL AND _s NOT IN ('D', 'C', 'D/C') THEN RAISE EXCEPTION 'Sens attendu : D, C ou D/C'; END IF;
    IF _avant IS NULL THEN
      SELECT r->>'compte' INTO _parent FROM jsonb_array_elements(_ref.comptes) r
       WHERE length(r->>'compte') < length(_num) AND _num LIKE (r->>'compte') || '%' ORDER BY length(r->>'compte') DESC LIMIT 1;
      IF _parent IS NULL AND length(_num) > 2 THEN RAISE EXCEPTION 'Le compte % doit subdiviser un compte de la version', _num; END IF;
      _apres := jsonb_build_object('compte', _num, 'intitule', btrim(_intitule), 'classe', left(_num, 1), 'niveau', length(_num),
                                   'parent', _parent, 'sens_normal_indicatif', coalesce(_s, 'D/C'));
    ELSE
      _apres := _avant || jsonb_build_object('intitule', btrim(_intitule), 'sens_normal_indicatif', coalesce(_s, _avant->>'sens_normal_indicatif'));
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'compte'), '[]') INTO _comptes FROM (
    SELECT r AS x FROM jsonb_array_elements(_ref.comptes) r WHERE r->>'compte' <> _num
    UNION ALL SELECT _apres WHERE _apres IS NOT NULL) t;
  UPDATE public.syscohada_references SET comptes = _comptes WHERE version = _version;
  PERFORM public.plateforme_tracer('plan_compte_modifie', 'plan_comptable', _version || ' ' || _num,
    jsonb_build_object('avant', _avant, 'apres', _apres));
  RETURN jsonb_build_object('numero', _num, 'avant', _avant, 'apres', _apres);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_plan_compte_modifier(text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_plan_compte_modifier(text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_plan_version_supprimer(_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.syscohada_references WHERE version = _version AND NOT valide_officiellement;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seul un brouillon peut être supprimé'; END IF;
  PERFORM public.plateforme_tracer('plan_version_supprimee', 'plan_comptable', _version, '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_plan_version_supprimer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_plan_version_supprimer(text) TO authenticated;

-- Publication (propriétaire) : visa de l'expert-comptable, puis mise à jour non destructive des dossiers.
CREATE OR REPLACE FUNCTION public.plateforme_plan_version_publier(_version text, _expert text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ancienne text := public.plan_reference_version(); _ajoutes int := 0; _renommes int := 0; _ecarts jsonb;
BEGIN
  IF NOT public.est_proprietaire_plateforme() THEN RAISE EXCEPTION 'Réservé au propriétaire de la plateforme' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(_expert, ''))) < 3 THEN RAISE EXCEPTION 'Nom de l''expert-comptable qui a visé la version requis'; END IF;
  PERFORM 1 FROM public.syscohada_references WHERE version = _version AND NOT valide_officiellement FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brouillon % introuvable', _version; END IF;
  SELECT jsonb_build_object('ajouts', count(*) FILTER (WHERE nature = 'ajout'), 'modifications', count(*) FILTER (WHERE nature = 'modification'),
                            'retraits', count(*) FILTER (WHERE nature = 'retrait'))
    INTO _ecarts FROM public.plateforme_plan_ecarts(_version);
  CREATE TEMP TABLE _mod ON COMMIT DROP AS
    SELECT e.numero, e.intitule_avant, e.intitule_apres, e.sens_avant, e.sens_apres FROM public.plateforme_plan_ecarts(_version) e
     WHERE e.nature = 'modification';
  CREATE TEMP TABLE _aj ON COMMIT DROP AS
    SELECT e.numero, e.intitule_apres, e.sens_apres FROM public.plateforme_plan_ecarts(_version) e
     WHERE e.nature = 'ajout' AND length(e.numero) >= 3 AND left(e.numero, 1) <> '9';
  UPDATE public.syscohada_references
     SET valide_officiellement = true, visa_le = now(), visa_declare_par = auth.uid(), publie_par = auth.uid(), visa_expert = btrim(_expert)
   WHERE version = _version;
  -- Comptes ajoutés par la version (installables : 3 chiffres et plus, classes 1 à 8) : ajoutés à chaque dossier.
  INSERT INTO public.plan_comptable(entreprise_id, numero, intitule, classe, sens, type_compte, actif)
    SELECT e.id, a.numero, a.intitule_apres, left(a.numero, 1),
           CASE WHEN a.sens_apres IN ('D', 'C') THEN a.sens_apres ELSE 'D/C' END,
           CASE left(a.numero, 1) WHEN '6' THEN 'Résultat' WHEN '7' THEN 'Résultat' WHEN '8' THEN 'HAO' ELSE 'Bilan' END, true
      FROM _aj a CROSS JOIN public.entreprises e
  ON CONFLICT (entreprise_id, numero) DO NOTHING;
  GET DIAGNOSTICS _ajoutes = ROW_COUNT;
  -- Comptes renommés : seulement là où le dossier avait gardé l'intitulé d'origine.
  UPDATE public.plan_comptable p
     SET intitule = m.intitule_apres,
         sens = CASE WHEN p.sens = CASE WHEN m.sens_avant IN ('D', 'C') THEN m.sens_avant ELSE 'D/C' END AND m.sens_apres IN ('D', 'C', 'D/C')
                     THEN m.sens_apres ELSE p.sens END
    FROM _mod m WHERE p.numero = m.numero AND p.intitule = m.intitule_avant;
  GET DIAGNOSTICS _renommes = ROW_COUNT;
  PERFORM public.plateforme_tracer('plan_version_publiee', 'plan_comptable', _version,
    jsonb_build_object('remplace', _ancienne, 'expert', btrim(_expert), 'ecarts', _ecarts,
                       'comptes_ajoutes_dossiers', _ajoutes, 'comptes_renommes_dossiers', _renommes));
  RETURN jsonb_build_object('version', _version, 'ecarts', _ecarts, 'comptes_ajoutes_dossiers', _ajoutes, 'comptes_renommes_dossiers', _renommes);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_plan_version_publier(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_plan_version_publier(text, text) TO authenticated;

-- ---------------------------------------------------------------- CIM-10

-- Un code officiel actif l'emporte sur un code identique ajouté par une structure.
CREATE OR REPLACE FUNCTION public.sante_cim10_structure(_structure_id uuid)
RETURNS TABLE(code text, libelle text, chapitre text, recherche text, propre boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.code, k.libelle, k.chapitre, k.recherche, false FROM public.sante_cim10 k WHERE k.actif
  UNION ALL
  SELECT l.code, l.libelle, o.chapitre, l.recherche, true
    FROM public.sante_cim10_structure_codes l
    LEFT JOIN public.sante_cim10 o ON o.code = left(l.code, 3)
   WHERE l.structure_id = _structure_id AND l.actif
     AND NOT EXISTS (SELECT 1 FROM public.sante_cim10 k WHERE k.code = l.code AND k.actif)
$$;
REVOKE ALL ON FUNCTION public.sante_cim10_structure(uuid) FROM PUBLIC, anon, authenticated;

-- Recherche back-office, codes désactivés compris.
CREATE OR REPLACE FUNCTION public.plateforme_cim10_chercher(_q text, _inactifs boolean DEFAULT true, _limite int DEFAULT 50)
RETURNS TABLE(code text, libelle text, chapitre text, version text, actif boolean, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c text := public.sante_cim10_code(_q); _mots text[] := public.sante_cim10_mots(_q);
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(_q, ''))) < 2 THEN RETURN; END IF;
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre, k.version, k.actif, k.updated_at FROM public.sante_cim10 k
     WHERE (k.actif OR coalesce(_inactifs, true))
       AND ((length(_c) >= 1 AND k.code LIKE _c || '%') OR public.sante_cim10_correspond(k.recherche, _mots))
     ORDER BY (k.code = _c) DESC, (k.code LIKE _c || '%') DESC, k.actif DESC, length(k.code), k.code
     LIMIT greatest(least(coalesce(_limite, 50), 200), 1);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_cim10_chercher(text, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_cim10_chercher(text, boolean, int) TO authenticated;

-- Ajouter, corriger ou (dés)activer un code officiel.
CREATE OR REPLACE FUNCTION public.plateforme_cim10_code_definir(_code text, _libelle text, _actif boolean DEFAULT true, _chapitre text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c text := public.sante_cim10_code(_code); _avant public.sante_cim10%ROWTYPE; _lib text := left(btrim(coalesce(_libelle, '')), 500);
        _chap text; _locaux int;
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  IF _c !~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$' THEN RAISE EXCEPTION 'Code CIM-10 attendu (ex. A00 ou A00.0)'; END IF;
  IF length(_lib) < 2 THEN RAISE EXCEPTION 'Libellé requis'; END IF;
  SELECT * INTO _avant FROM public.sante_cim10 WHERE code = _c FOR UPDATE;
  IF NOT FOUND AND length(_c) > 3 AND NOT EXISTS (SELECT 1 FROM public.sante_cim10 WHERE code = left(_c, 3)) THEN
    RAISE EXCEPTION 'Créez d''abord la catégorie %', left(_c, 3);
  END IF;
  _chap := coalesce(nullif(btrim(coalesce(_chapitre, '')), ''), _avant.chapitre, (SELECT chapitre FROM public.sante_cim10 WHERE code = left(_c, 3)));
  INSERT INTO public.sante_cim10(code, libelle, chapitre, recherche, version, actif, updated_at)
  VALUES (_c, _lib, _chap, public.sante_texte_recherche(_c || ' ' || replace(_c, '.', '') || ' ' || _lib), 'Ajouts plateforme', coalesce(_actif, true), now())
  ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, chapitre = EXCLUDED.chapitre, recherche = EXCLUDED.recherche,
    actif = EXCLUDED.actif, updated_at = now();
  SELECT count(*) INTO _locaux FROM public.sante_cim10_structure_codes WHERE code = _c AND actif;
  PERFORM public.plateforme_tracer('cim10_code_defini', 'referentiel', _c, jsonb_build_object(
    'avant', CASE WHEN _avant.code IS NULL THEN NULL ELSE jsonb_build_object('libelle', _avant.libelle, 'actif', _avant.actif, 'version', _avant.version) END,
    'apres', jsonb_build_object('libelle', _lib, 'actif', coalesce(_actif, true)), 'codes_structures_couverts', _locaux));
  RETURN jsonb_build_object('code', _c, 'cree', _avant.code IS NULL, 'codes_structures_couverts', _locaux);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_cim10_code_definir(text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_cim10_code_definir(text, text, boolean, text) TO authenticated;

-- Après le chargement d'une nouvelle version : désactiver les codes qui n'y figurent pas (aperçu par défaut).
-- Les codes ajoutés à la main en back-office (« Ajouts plateforme ») ne sont pas concernés.
CREATE OR REPLACE FUNCTION public.plateforme_cim10_desactiver_absents(_version text, _appliquer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int; _ex jsonb; _taille int;
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO _taille FROM public.sante_cim10 WHERE version = _version AND actif;
  IF _taille < 1000 THEN RAISE EXCEPTION 'La version % ne compte que % codes : chargement incomplet ?', _version, _taille; END IF;
  SELECT count(*), coalesce(jsonb_agg(x) FILTER (WHERE rn <= 20), '[]') INTO _n, _ex FROM (
    SELECT k.code || ' ' || k.libelle || ' (' || k.version || ')' AS x, row_number() OVER (ORDER BY k.code) rn
      FROM public.sante_cim10 k WHERE k.actif AND k.version <> _version AND k.version <> 'Ajouts plateforme') t;
  IF coalesce(_appliquer, false) THEN
    IF NOT public.est_proprietaire_plateforme() THEN RAISE EXCEPTION 'Réservé au propriétaire de la plateforme' USING ERRCODE = '42501'; END IF;
    UPDATE public.sante_cim10 SET actif = false, updated_at = now()
     WHERE actif AND version <> _version AND version <> 'Ajouts plateforme';
    GET DIAGNOSTICS _n = ROW_COUNT;
    PERFORM public.plateforme_tracer('cim10_absents_desactives', 'referentiel', _version, jsonb_build_object('desactives', _n, 'exemples', _ex));
  END IF;
  RETURN jsonb_build_object('version', _version, 'codes_version', _taille, 'a_desactiver', _n, 'exemples', _ex, 'applique', coalesce(_appliquer, false));
END $$;
REVOKE ALL ON FUNCTION public.plateforme_cim10_desactiver_absents(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_cim10_desactiver_absents(text, boolean) TO authenticated;
