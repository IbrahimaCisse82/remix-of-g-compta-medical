-- 0121 — Diagnostic codé (CIM-10) et maladies chroniques du patient.
-- * sante_cim10 : référentiel commun à la plateforme (codes et libellés, aucune donnée patient), lisible par tout
--   utilisateur connecté, chargé par un opérateur de la plateforme (double authentification, tracé au journal).
-- * sante_consultation_diagnostics : codes posés par le médecin sur une consultation en cours (le diagnostic en texte
--   libre reste le champ de référence pour la clôture) ; libellé figé au moment du codage.
-- * sante_maladies_chroniques : liste des affections au long cours du patient (déclarée par le médecin, active ou
--   résolue), affichée dans le suivi.
-- Lecture des deux tables cliniques : accès clinique au patient ; aucune écriture directe.
-- Retour : docs/rollback/0121_cim10_diagnostics_chroniques_down.sql

CREATE OR REPLACE FUNCTION public.sante_texte_recherche(_t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT lower(translate(replace(replace(coalesce(_t, ''), 'œ', 'oe'), 'Œ', 'OE'),
    'ÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑàâäáãéèêëíìîïóòôöõúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'))
$$;

CREATE OR REPLACE FUNCTION public.sante_cim10_code(_c text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  -- « A000 », « a00.0 », « A00.0 » → « A00.0 » ; les codes de 3 caractères restent tels quels.
  SELECT CASE WHEN length(x) > 3 THEN left(x, 3) || '.' || substr(x, 4) ELSE x END
  FROM (SELECT upper(regexp_replace(coalesce(_c, ''), '[^A-Za-z0-9]', '', 'g')) AS x) s
$$;

CREATE TABLE IF NOT EXISTS public.sante_cim10 (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'),
  libelle text NOT NULL CHECK (length(btrim(libelle)) BETWEEN 2 AND 500),
  chapitre text,
  recherche text NOT NULL,
  version text NOT NULL,
  actif boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sante_cim10 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sante_cim10 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sante_cim10 TO authenticated;
DROP POLICY IF EXISTS "Lecture CIM-10" ON public.sante_cim10;
CREATE POLICY "Lecture CIM-10" ON public.sante_cim10 FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.sante_consultation_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  consultation_id uuid NOT NULL REFERENCES public.sante_consultations(id),
  code text NOT NULL,
  libelle text NOT NULL,
  principal boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultation_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS sante_consultation_diag_principal ON public.sante_consultation_diagnostics (consultation_id) WHERE principal;
CREATE INDEX IF NOT EXISTS sante_consultation_diag_patient ON public.sante_consultation_diagnostics (patient_id);
ALTER TABLE public.sante_consultation_diagnostics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sante_consultation_diagnostics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sante_consultation_diagnostics TO authenticated;
DROP POLICY IF EXISTS "Lecture diagnostics codés" ON public.sante_consultation_diagnostics;
CREATE POLICY "Lecture diagnostics codés" ON public.sante_consultation_diagnostics FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id, 'sante_clinique') AND public.can_access_clinique(patient_id));
DROP POLICY IF EXISTS "MFA aal2 si facteur actif" ON public.sante_consultation_diagnostics;
CREATE POLICY "MFA aal2 si facteur actif" ON public.sante_consultation_diagnostics AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme());

CREATE TABLE IF NOT EXISTS public.sante_maladies_chroniques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  code text,
  libelle text NOT NULL CHECK (length(btrim(libelle)) BETWEEN 2 AND 300),
  depuis date,
  statut text NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'resolue')),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  consultation_id uuid REFERENCES public.sante_consultations(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sante_maladies_chroniques_unique ON public.sante_maladies_chroniques (patient_id, code) WHERE code IS NOT NULL AND statut = 'active';
ALTER TABLE public.sante_maladies_chroniques ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sante_maladies_chroniques FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sante_maladies_chroniques TO authenticated;
DROP POLICY IF EXISTS "Lecture maladies chroniques" ON public.sante_maladies_chroniques;
CREATE POLICY "Lecture maladies chroniques" ON public.sante_maladies_chroniques FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id, 'sante_clinique') AND public.can_access_clinique(patient_id));
DROP POLICY IF EXISTS "MFA aal2 si facteur actif" ON public.sante_maladies_chroniques;
CREATE POLICY "MFA aal2 si facteur actif" ON public.sante_maladies_chroniques AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme());

-- Chargement du référentiel par lots (5 000 lignes au plus) : [{ "code": "A00.0", "libelle": "...", "chapitre": "I" }].
CREATE OR REPLACE FUNCTION public.plateforme_cim10_importer(_version text, _lignes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int; _ok int; _rejets jsonb;
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(_version, ''))) < 2 THEN RAISE EXCEPTION 'Version du référentiel requise (ex. CIM-10 FR 2025)'; END IF;
  IF jsonb_typeof(_lignes) <> 'array' THEN RAISE EXCEPTION 'Liste de lignes attendue'; END IF;
  _n := jsonb_array_length(_lignes);
  IF _n = 0 OR _n > 5000 THEN RAISE EXCEPTION 'Entre 1 et 5 000 lignes par envoi'; END IF;
  CREATE TEMP TABLE _cim ON COMMIT DROP AS
    SELECT CASE WHEN x->>'code' LIKE '%-%' THEN '' ELSE public.sante_cim10_code(x->>'code') END AS code, left(btrim(x->>'libelle'), 500) AS libelle, nullif(btrim(x->>'chapitre'), '') AS chapitre
    FROM jsonb_array_elements(_lignes) x;
  SELECT coalesce(jsonb_agg(code) FILTER (WHERE true), '[]'::jsonb) INTO _rejets FROM (
    SELECT code FROM _cim WHERE code !~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$' OR coalesce(length(libelle), 0) < 2 LIMIT 20) r;
  INSERT INTO public.sante_cim10(code, libelle, chapitre, recherche, version, actif, updated_at)
    SELECT DISTINCT ON (code) code, libelle, chapitre, public.sante_texte_recherche(code || ' ' || replace(code, '.', '') || ' ' || libelle), btrim(_version), true, now()
    FROM _cim WHERE code ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$' AND length(libelle) >= 2
    ORDER BY code
  ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, chapitre = EXCLUDED.chapitre, recherche = EXCLUDED.recherche,
    version = EXCLUDED.version, actif = true, updated_at = now();
  GET DIAGNOSTICS _ok = ROW_COUNT;
  PERFORM public.plateforme_tracer('cim10_import', 'referentiel', btrim(_version), jsonb_build_object('lignes', _n, 'enregistrees', _ok));
  RETURN jsonb_build_object('recues', _n, 'enregistrees', _ok, 'rejets', _rejets);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_cim10_importer(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_cim10_importer(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_cim10_chercher(_q text, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t text := public.sante_texte_recherche(btrim(coalesce(_q, ''))); _mots text[]; _c text := public.sante_cim10_code(_q);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF length(_t) < 2 THEN RETURN; END IF;
  _mots := regexp_split_to_array(_t, '\s+');
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre FROM public.sante_cim10 k
    WHERE k.actif AND (k.code LIKE _c || '%' OR NOT EXISTS (SELECT 1 FROM unnest(_mots) m WHERE position(m IN k.recherche) = 0))
    ORDER BY (k.code = _c) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;
REVOKE ALL ON FUNCTION public.sante_cim10_chercher(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_chercher(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_medecin_du_dossier(_structure_id uuid, _patient_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mfa_conforme() AND public.has_any_medical_role(_structure_id, ARRAY['medecin']) AND public.can_access_clinique(_patient_id)
$$;
REVOKE ALL ON FUNCTION public.sante_medecin_du_dossier(uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.sante_diagnostic_coder(_consultation_id uuid, _code text, _principal boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; k public.sante_cim10; _id uuid;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id FOR UPDATE;
  IF c.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Seul un médecin ayant accès au dossier code le diagnostic' USING ERRCODE = '42501';
  END IF;
  IF c.statut = 'cloturee' THEN RAISE EXCEPTION 'Consultation clôturée : ajoutez un addendum'; END IF;
  SELECT * INTO k FROM public.sante_cim10 WHERE code = public.sante_cim10_code(_code) AND actif;
  IF k.code IS NULL THEN RAISE EXCEPTION 'Code CIM-10 inconnu : %', _code; END IF;
  IF _principal OR NOT EXISTS (SELECT 1 FROM public.sante_consultation_diagnostics WHERE consultation_id = c.id AND principal) THEN
    UPDATE public.sante_consultation_diagnostics SET principal = false WHERE consultation_id = c.id AND principal;
    _principal := true;
  END IF;
  INSERT INTO public.sante_consultation_diagnostics(structure_id, patient_id, consultation_id, code, libelle, principal)
  VALUES (c.structure_id, c.patient_id, c.id, k.code, k.libelle, coalesce(_principal, false))
  ON CONFLICT (consultation_id, code) DO UPDATE SET principal = EXCLUDED.principal
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_diagnostic_coder(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_diagnostic_coder(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_diagnostic_retirer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.sante_consultation_diagnostics; c public.sante_consultations;
BEGIN
  SELECT * INTO d FROM public.sante_consultation_diagnostics WHERE id = _id;
  SELECT * INTO c FROM public.sante_consultations WHERE id = d.consultation_id FOR UPDATE;
  IF d.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Diagnostic introuvable' USING ERRCODE = '42501';
  END IF;
  IF c.statut = 'cloturee' THEN RAISE EXCEPTION 'Consultation clôturée : ajoutez un addendum'; END IF;
  DELETE FROM public.sante_consultation_diagnostics WHERE id = d.id;
  IF d.principal THEN
    UPDATE public.sante_consultation_diagnostics SET principal = true
    WHERE id = (SELECT id FROM public.sante_consultation_diagnostics WHERE consultation_id = c.id ORDER BY created_at LIMIT 1);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.sante_diagnostic_retirer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_diagnostic_retirer(uuid) TO authenticated;

-- Déclarer une maladie chronique : avec un code CIM-10 (libellé du référentiel) ou en texte libre.
CREATE OR REPLACE FUNCTION public.sante_chronique_declarer(_patient_id uuid, _code text DEFAULT NULL, _libelle text DEFAULT NULL,
  _depuis date DEFAULT NULL, _consultation_id uuid DEFAULT NULL, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; k public.sante_cim10; _id uuid;
BEGIN
  SELECT structure_id INTO _s FROM public.sante_patients WHERE id = _patient_id AND statut = 'actif';
  IF _s IS NULL OR NOT public.sante_medecin_du_dossier(_s, _patient_id) THEN
    RAISE EXCEPTION 'Seul un médecin ayant accès au dossier déclare une maladie chronique' USING ERRCODE = '42501';
  END IF;
  IF _consultation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sante_consultations WHERE id = _consultation_id AND patient_id = _patient_id) THEN
    RAISE EXCEPTION 'Consultation d''un autre patient';
  END IF;
  IF nullif(btrim(coalesce(_code, '')), '') IS NOT NULL THEN
    SELECT * INTO k FROM public.sante_cim10 WHERE code = public.sante_cim10_code(_code) AND actif;
    IF k.code IS NULL THEN RAISE EXCEPTION 'Code CIM-10 inconnu : %', _code; END IF;
  ELSIF length(btrim(coalesce(_libelle, ''))) < 2 THEN
    RAISE EXCEPTION 'Code CIM-10 ou libellé requis';
  END IF;
  IF _depuis IS NOT NULL AND _depuis > current_date THEN RAISE EXCEPTION 'Date de début dans le futur'; END IF;
  IF k.code IS NOT NULL AND EXISTS (SELECT 1 FROM public.sante_maladies_chroniques WHERE patient_id = _patient_id AND code = k.code AND statut = 'active') THEN
    RAISE EXCEPTION 'Déjà dans la liste des maladies chroniques du patient';
  END IF;
  INSERT INTO public.sante_maladies_chroniques(structure_id, patient_id, code, libelle, depuis, consultation_id, note)
  VALUES (_s, _patient_id, k.code, coalesce(nullif(btrim(_libelle), ''), k.libelle), _depuis, _consultation_id, nullif(btrim(coalesce(_note, '')), ''))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_chronique_declarer(uuid, text, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_chronique_declarer(uuid, text, text, date, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_chronique_statut(_id uuid, _statut text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.sante_maladies_chroniques;
BEGIN
  SELECT * INTO m FROM public.sante_maladies_chroniques WHERE id = _id FOR UPDATE;
  IF m.id IS NULL OR NOT public.sante_medecin_du_dossier(m.structure_id, m.patient_id) THEN
    RAISE EXCEPTION 'Maladie chronique introuvable' USING ERRCODE = '42501';
  END IF;
  IF _statut NOT IN ('active', 'resolue') THEN RAISE EXCEPTION 'Statut attendu : active ou resolue'; END IF;
  UPDATE public.sante_maladies_chroniques SET statut = _statut, updated_at = now() WHERE id = m.id;
END $$;
REVOKE ALL ON FUNCTION public.sante_chronique_statut(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_chronique_statut(uuid, text) TO authenticated;
