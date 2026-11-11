-- 0125 — CIM-10 : mode « recommandé » par défaut, mode « strict » au choix du cabinet.
-- Recommandé : le médecin voit d'abord les codes de sa spécialité, plus les symptômes (R), les motifs de recours (Z)
--   et les pathologies fréquentes (paludisme, HTA, diabète, VIH, drépanocytose, anémies, tuberculose) ; un autre code
--   reste possible sur action volontaire et il est marqué « hors spécialité » (suivi dans les statistiques).
-- Strict : uniquement les codes de la spécialité (comportement de 0124).
-- Maladies chroniques : jamais restreintes (historique du patient, toutes spécialités).
-- Retour : docs/rollback/0125_cim10_mode_recommande_down.sql

CREATE TABLE IF NOT EXISTS public.sante_structure_cim10 (
  structure_id uuid PRIMARY KEY REFERENCES public.structures(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'recommande' CHECK (mode IN ('recommande', 'strict')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sante_structure_cim10 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sante_structure_cim10 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sante_structure_cim10 TO authenticated;
DROP POLICY IF EXISTS "Lecture réglage CIM-10" ON public.sante_structure_cim10;
CREATE POLICY "Lecture réglage CIM-10" ON public.sante_structure_cim10 FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure', 'medecin', 'biologiste']));

ALTER TABLE public.sante_consultation_diagnostics ADD COLUMN IF NOT EXISTS hors_specialite boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sante_cim10_mode(_structure_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT mode FROM public.sante_structure_cim10 WHERE structure_id = _structure_id), 'recommande')
$$;
REVOKE ALL ON FUNCTION public.sante_cim10_mode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_mode(uuid) TO authenticated;

-- Symptômes, motifs de recours et pathologies fréquentes, proposés à toutes les spécialités en mode recommandé.
CREATE OR REPLACE FUNCTION public.sante_cim10_plages_communes() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT ARRAY['R00-R99', 'Z00-Z99', 'A15-A19', 'B20-B24', 'B50-B54', 'D50-D64', 'E10-E14', 'I10-I15']
$$;

-- Plages proposées en priorité ; NULL = toute la CIM-10.
CREATE OR REPLACE FUNCTION public.sante_cim10_plages_effectives(_structure_id uuid, _praticien_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p text[] := public.sante_cim10_plages(_structure_id, _praticien_id);
BEGIN
  IF _p IS NULL OR public.sante_cim10_mode(_structure_id) = 'strict' THEN RETURN _p; END IF;
  RETURN _p || public.sante_cim10_plages_communes();
END $$;
REVOKE ALL ON FUNCTION public.sante_cim10_plages_effectives(uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.sante_cim10_mode_definir(_structure_id uuid, _mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure']) THEN
    RAISE EXCEPTION 'Réservé à l''administrateur de la structure' USING ERRCODE = '42501';
  END IF;
  IF _mode NOT IN ('recommande', 'strict') THEN RAISE EXCEPTION 'Mode attendu : recommande ou strict'; END IF;
  INSERT INTO public.sante_structure_cim10(structure_id, mode) VALUES (_structure_id, _mode)
  ON CONFLICT (structure_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.sante_cim10_mode_definir(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_mode_definir(uuid, text) TO authenticated;

-- Recherche en consultation : codes proposés d'abord ; « _toutes » (mode recommandé) ajoute les autres, marqués.
CREATE OR REPLACE FUNCTION public.sante_cim10_specialite(_consultation_id uuid, _q text, _toutes boolean DEFAULT false, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text, dans_specialite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; _plages text[]; _elargir boolean;
  _mots text[] := public.sante_cim10_mots(_q); _c text := public.sante_cim10_code(_q);
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF c.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Consultation introuvable' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_q, ''))) < 2 THEN RETURN; END IF;
  _plages := public.sante_cim10_plages_effectives(c.structure_id, c.praticien_id);
  _elargir := coalesce(_toutes, false) AND public.sante_cim10_mode(c.structure_id) = 'recommande';
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre, public.sante_cim10_autorise(k.code, _plages)
    FROM public.sante_cim10 k
    WHERE k.actif AND (_elargir OR public.sante_cim10_autorise(k.code, _plages))
      AND (k.code LIKE _c || '%' OR public.sante_cim10_correspond(k.recherche, _mots))
    ORDER BY (k.code = _c) DESC, public.sante_cim10_autorise(k.code, _plages) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;

-- Dossier patient (maladies chroniques) : toute la CIM-10, codes de la spécialité du médecin connecté en premier.
CREATE OR REPLACE FUNCTION public.sante_cim10_patient(_patient_id uuid, _q text, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text, dans_specialite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _plages text[]; _mots text[] := public.sante_cim10_mots(_q); _c text := public.sante_cim10_code(_q);
BEGIN
  SELECT structure_id INTO _s FROM public.sante_patients WHERE id = _patient_id;
  IF _s IS NULL OR NOT public.sante_medecin_du_dossier(_s, _patient_id) THEN
    RAISE EXCEPTION 'Dossier introuvable' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_q, ''))) < 2 THEN RETURN; END IF;
  _plages := public.sante_cim10_plages_effectives(_s, public.sante_praticien_courant(_s));
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre, public.sante_cim10_autorise(k.code, _plages)
    FROM public.sante_cim10 k
    WHERE k.actif AND (k.code LIKE _c || '%' OR public.sante_cim10_correspond(k.recherche, _mots))
    ORDER BY (k.code = _c) DESC, public.sante_cim10_autorise(k.code, _plages) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;

-- Recours au hors-spécialité sur 90 jours (carte de l'administrateur).
CREATE OR REPLACE FUNCTION public.sante_cim10_statistiques(_structure_id uuid)
RETURNS TABLE(codages bigint, hors_specialite bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*), count(*) FILTER (WHERE d.hors_specialite)
  FROM public.sante_consultation_diagnostics d
  WHERE d.structure_id = _structure_id AND d.created_at >= now() - interval '90 days'
    AND public.has_any_medical_role(_structure_id, ARRAY['admin_structure'])
$$;
REVOKE ALL ON FUNCTION public.sante_cim10_statistiques(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_statistiques(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_diagnostic_coder(_consultation_id uuid, _code text, _principal boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; k public.sante_cim10; _id uuid; _hors boolean;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id FOR UPDATE;
  IF c.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Seul un médecin ayant accès au dossier code le diagnostic' USING ERRCODE = '42501';
  END IF;
  IF c.statut = 'cloturee' THEN RAISE EXCEPTION 'Consultation clôturée : ajoutez un addendum'; END IF;
  SELECT * INTO k FROM public.sante_cim10 WHERE code = public.sante_cim10_code(_code) AND actif;
  IF k.code IS NULL THEN RAISE EXCEPTION 'Code CIM-10 inconnu : %', _code; END IF;
  _hors := NOT public.sante_cim10_autorise(k.code, public.sante_cim10_plages_effectives(c.structure_id, c.praticien_id));
  IF _hors AND public.sante_cim10_mode(c.structure_id) = 'strict' THEN
    RAISE EXCEPTION 'Code % hors de la spécialité du praticien', k.code;
  END IF;
  IF _principal OR NOT EXISTS (SELECT 1 FROM public.sante_consultation_diagnostics WHERE consultation_id = c.id AND principal) THEN
    UPDATE public.sante_consultation_diagnostics SET principal = false WHERE consultation_id = c.id AND principal;
    _principal := true;
  END IF;
  INSERT INTO public.sante_consultation_diagnostics(structure_id, patient_id, consultation_id, code, libelle, principal, hors_specialite)
  VALUES (c.structure_id, c.patient_id, c.id, k.code, k.libelle, coalesce(_principal, false), _hors)
  ON CONFLICT (consultation_id, code) DO UPDATE SET principal = EXCLUDED.principal
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Maladie chronique : pas de restriction de spécialité (retour à la règle de 0121).
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
