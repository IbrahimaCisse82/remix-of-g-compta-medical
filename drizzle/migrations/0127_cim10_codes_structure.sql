-- 0127 — Codes CIM-10 propres à une structure. Le référentiel officiel reste géré en back-office (opérateurs) ;
-- l'administrateur d'une structure peut y ajouter ses propres codes (sous-codes plus précis, intitulés d'usage du
-- cabinet), visibles uniquement dans sa structure : recherche en consultation et dans le dossier, codage du
-- diagnostic, maladies chroniques. Ils suivent les mêmes règles de spécialité (3 premiers caractères).
-- Un code propre doit rattacher une catégorie officielle existante (ex. N80.10 sous N80) et ne pas exister
-- dans le référentiel officiel. Désactivation possible ; les diagnostics déjà codés conservent leur libellé.
-- Retour : docs/rollback/0127_cim10_codes_structure_down.sql

CREATE TABLE IF NOT EXISTS public.sante_cim10_structure_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'),
  libelle text NOT NULL CHECK (length(btrim(libelle)) BETWEEN 3 AND 300),
  recherche text NOT NULL,
  actif boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, code)
);
ALTER TABLE public.sante_cim10_structure_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sante_cim10_structure_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sante_cim10_structure_codes TO authenticated;
DROP POLICY IF EXISTS "Lecture codes CIM-10 de la structure" ON public.sante_cim10_structure_codes;
CREATE POLICY "Lecture codes CIM-10 de la structure" ON public.sante_cim10_structure_codes FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure', 'medecin', 'biologiste']));
DROP POLICY IF EXISTS "MFA aal2 si facteur actif" ON public.sante_cim10_structure_codes;
CREATE POLICY "MFA aal2 si facteur actif" ON public.sante_cim10_structure_codes AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme());

-- Référentiel vu par une structure : codes officiels actifs + ses propres codes actifs.
CREATE OR REPLACE FUNCTION public.sante_cim10_structure(_structure_id uuid)
RETURNS TABLE(code text, libelle text, chapitre text, recherche text, propre boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.code, k.libelle, k.chapitre, k.recherche, false FROM public.sante_cim10 k WHERE k.actif
  UNION ALL
  SELECT l.code, l.libelle, o.chapitre, l.recherche, true
    FROM public.sante_cim10_structure_codes l
    LEFT JOIN public.sante_cim10 o ON o.code = left(l.code, 3)
   WHERE l.structure_id = _structure_id AND l.actif
$$;
REVOKE ALL ON FUNCTION public.sante_cim10_structure(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sante_cim10_code_ajouter(_structure_id uuid, _code text, _libelle text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c text := public.sante_cim10_code(_code); _id uuid;
BEGIN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure']) THEN
    RAISE EXCEPTION 'Seul l''administrateur de la structure ajoute des codes' USING ERRCODE = '42501';
  END IF;
  IF _c !~ '^[A-Z][0-9]{2}\.[0-9A-Z]{1,4}$' THEN
    RAISE EXCEPTION 'Code attendu : une catégorie officielle suivie d''une précision (ex. N80.10)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sante_cim10 WHERE code = left(_c, 3) AND actif) THEN
    RAISE EXCEPTION 'La catégorie % n''existe pas dans la CIM-10', left(_c, 3);
  END IF;
  IF EXISTS (SELECT 1 FROM public.sante_cim10 WHERE code = _c) THEN
    RAISE EXCEPTION 'Le code % existe déjà dans la CIM-10 officielle', _c;
  END IF;
  IF length(btrim(coalesce(_libelle, ''))) < 3 THEN RAISE EXCEPTION 'Libellé requis'; END IF;
  INSERT INTO public.sante_cim10_structure_codes(structure_id, code, libelle, recherche)
  VALUES (_structure_id, _c, btrim(_libelle), public.sante_texte_recherche(_c || ' ' || replace(_c, '.', '') || ' ' || btrim(_libelle)))
  ON CONFLICT (structure_id, code) DO UPDATE SET libelle = EXCLUDED.libelle, recherche = EXCLUDED.recherche, actif = true, updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_cim10_code_ajouter(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_code_ajouter(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_cim10_code_activer(_id uuid, _actif boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.sante_cim10_structure_codes;
BEGIN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  SELECT * INTO l FROM public.sante_cim10_structure_codes WHERE id = _id;
  IF l.id IS NULL OR NOT public.has_any_medical_role(l.structure_id, ARRAY['admin_structure']) THEN
    RAISE EXCEPTION 'Code introuvable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sante_cim10_structure_codes SET actif = coalesce(_actif, false), updated_at = now() WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_cim10_code_activer(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_code_activer(uuid, boolean) TO authenticated;

-- Recherches, codage du diagnostic et maladies chroniques : référentiel officiel + codes de la structure.
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
    FROM public.sante_cim10_structure(c.structure_id) k
    WHERE (_elargir OR public.sante_cim10_autorise(k.code, _plages))
      AND (k.code LIKE _c || '%' OR public.sante_cim10_correspond(k.recherche, _mots))
    ORDER BY (k.code = _c) DESC, public.sante_cim10_autorise(k.code, _plages) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;

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
    FROM public.sante_cim10_structure(_s) k
    WHERE (k.code LIKE _c || '%' OR public.sante_cim10_correspond(k.recherche, _mots))
    ORDER BY (k.code = _c) DESC, public.sante_cim10_autorise(k.code, _plages) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;

CREATE OR REPLACE FUNCTION public.sante_diagnostic_coder(_consultation_id uuid, _code text, _principal boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; k public.sante_cim10; _id uuid; _hors boolean;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id FOR UPDATE;
  IF c.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Seul un médecin ayant accès au dossier code le diagnostic' USING ERRCODE = '42501';
  END IF;
  IF c.statut = 'cloturee' THEN RAISE EXCEPTION 'Consultation clôturée : ajoutez un addendum'; END IF;
  SELECT x.code, x.libelle INTO k FROM public.sante_cim10_structure(c.structure_id) x WHERE x.code = public.sante_cim10_code(_code);
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
    SELECT x.code, x.libelle INTO k FROM public.sante_cim10_structure(_s) x WHERE x.code = public.sante_cim10_code(_code);
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
