-- 0124 — Codes CIM-10 limités à la spécialité : le cabinet ne voit que les codes de ses spécialités, le praticien
-- spécialiste ne voit que ceux de sa spécialité (ex. gynécologie-obstétrique : 907 codes). Plus de recherche hors
-- spécialité ; le contrôle est aussi fait à l'enregistrement d'un diagnostic codé ou d'une maladie chronique.
-- Règle : spécialité du praticien si elle est renseignée, sinon spécialités de la structure ; une spécialité sans
-- plage (médecine générale, pédiatrie, urgences) ou une structure sans spécialité donne toute la classification.
-- Retour : docs/rollback/0124_cim10_restriction_specialite_down.sql

-- Plages autorisées ; NULL = toute la CIM-10.
CREATE OR REPLACE FUNCTION public.sante_cim10_plages(_structure_id uuid, _praticien_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _ids text[]; _p text[];
BEGIN
  SELECT ARRAY[specialite_id] INTO _ids FROM public.sante_praticiens
   WHERE id = _praticien_id AND structure_id = _structure_id AND specialite_id IS NOT NULL;
  IF _ids IS NULL THEN
    SELECT array_agg(specialite_id) INTO _ids FROM public.sante_structure_specialites WHERE structure_id = _structure_id;
  END IF;
  IF _ids IS NULL OR EXISTS (SELECT 1 FROM public.sante_specialites WHERE id = ANY(_ids) AND plages = '{}') THEN RETURN NULL; END IF;
  SELECT array_agg(DISTINCT p) INTO _p FROM public.sante_specialites s, unnest(s.plages) p WHERE s.id = ANY(_ids);
  RETURN coalesce(_p, '{}');
END $$;
REVOKE ALL ON FUNCTION public.sante_cim10_plages(uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.sante_cim10_autorise(_code text, _plages text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT _plages IS NULL OR public.sante_cim10_dans_plages(_code, _plages)
$$;

-- Fiche praticien de l'utilisateur connecté dans la structure (pour le dossier patient hors consultation).
CREATE OR REPLACE FUNCTION public.sante_praticien_courant(_structure_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.sante_praticiens WHERE structure_id = _structure_id AND user_id = auth.uid() AND actif ORDER BY created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.sante_praticien_courant(uuid) FROM PUBLIC, anon;

-- Recherche en consultation : uniquement les codes autorisés (_toutes est conservé dans la signature mais ignoré).
CREATE OR REPLACE FUNCTION public.sante_cim10_specialite(_consultation_id uuid, _q text, _toutes boolean DEFAULT false, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text, dans_specialite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; _plages text[];
  _mots text[] := public.sante_cim10_mots(_q); _c text := public.sante_cim10_code(_q);
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF c.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Consultation introuvable' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_q, ''))) < 2 THEN RETURN; END IF;
  _plages := public.sante_cim10_plages(c.structure_id, c.praticien_id);
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre, true
    FROM public.sante_cim10 k
    WHERE k.actif AND public.sante_cim10_autorise(k.code, _plages)
      AND (k.code LIKE _c || '%' OR public.sante_cim10_correspond(k.recherche, _mots))
    ORDER BY (k.code = _c) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;

-- Recherche depuis le dossier patient (maladies chroniques) : spécialité du médecin connecté, sinon de la structure.
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
  _plages := public.sante_cim10_plages(_s, public.sante_praticien_courant(_s));
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre, true
    FROM public.sante_cim10 k
    WHERE k.actif AND public.sante_cim10_autorise(k.code, _plages)
      AND (k.code LIKE _c || '%' OR public.sante_cim10_correspond(k.recherche, _mots))
    ORDER BY (k.code = _c) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;
REVOKE ALL ON FUNCTION public.sante_cim10_patient(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_patient(uuid, text, int) TO authenticated;

-- Couverture : codes accessibles par spécialité (sans ajout des chapitres R et Z).
CREATE OR REPLACE FUNCTION public.sante_cim10_couverture(_structure_id uuid)
RETURNS TABLE(specialite_id text, libelle text, codes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.libelle,
    (SELECT count(*) FROM public.sante_cim10 k WHERE k.actif AND (s.plages = '{}' OR public.sante_cim10_dans_plages(k.code, s.plages)))
  FROM public.sante_structure_specialites ss JOIN public.sante_specialites s ON s.id = ss.specialite_id
  WHERE ss.structure_id = _structure_id AND public.has_any_medical_role(_structure_id, ARRAY['admin_structure', 'medecin'])
  ORDER BY s.ordre
$$;

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
  IF NOT public.sante_cim10_autorise(k.code, public.sante_cim10_plages(c.structure_id, c.praticien_id)) THEN
    RAISE EXCEPTION 'Code % hors de la spécialité du praticien', k.code;
  END IF;
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
    IF NOT public.sante_cim10_autorise(k.code, public.sante_cim10_plages(_s, public.sante_praticien_courant(_s))) THEN
      RAISE EXCEPTION 'Code % hors de votre spécialité', k.code;
    END IF;
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
