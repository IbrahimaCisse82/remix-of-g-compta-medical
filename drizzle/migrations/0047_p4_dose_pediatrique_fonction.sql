CREATE OR REPLACE FUNCTION public.sante_emettre_ordonnance(_consultation_id uuid, _lignes jsonb, _recommandations text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.sante_consultations%ROWTYPE; _id uuid; l jsonb; i int := 0; _med text; _just text; _just_ped text; _allergie text;
  _naissance date; _poids numeric; _dose_max numeric; _dose numeric;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['medecin']) THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  IF jsonb_array_length(coalesce(_lignes,'[]')) = 0 THEN RAISE EXCEPTION 'Ordonnance vide'; END IF;
  SELECT date_naissance INTO _naissance FROM public.sante_patients WHERE id = c.patient_id;
  INSERT INTO public.sante_ordonnances(structure_id, consultation_id, patient_id, praticien_id, numero, recommandations, emise_par)
  VALUES (c.structure_id, c.id, c.patient_id, c.praticien_id, public.sante_prochain_numero(c.structure_id, 'ordonnance', 'ORD'), nullif(trim(_recommandations),''), auth.uid())
  RETURNING id INTO _id;
  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    _med := trim(coalesce(l->>'medicament',''));
    IF _med = '' OR coalesce(trim(l->>'posologie'),'') = '' THEN RAISE EXCEPTION 'Medicament et posologie obligatoires'; END IF;
    _just := nullif(trim(coalesce(l->>'justification_allergie','')),'');
    _just_ped := nullif(trim(coalesce(l->>'justification_pediatrie','')),'');
    SELECT a.libelle INTO _allergie FROM public.sante_antecedents a
     WHERE a.patient_id = c.patient_id AND lower(a.type) = 'allergie' AND length(trim(a.libelle)) >= 3
       AND (lower(_med) LIKE '%' || lower(trim(a.libelle)) || '%' OR lower(trim(a.libelle)) LIKE '%' || lower(_med) || '%')
     LIMIT 1;
    IF _allergie IS NOT NULL AND (_just IS NULL OR length(_just) < 15) THEN
      RAISE EXCEPTION 'ALLERGIE: patient allergique (%) — % exige une justification ecrite (15 caracteres minimum)', _allergie, _med;
    END IF;
    IF _naissance IS NOT NULL AND _naissance > current_date - interval '12 years' THEN
      SELECT m.dose_max_pediatrique_mg_kg INTO _dose_max FROM public.sante_catalogue_medicaments m
       WHERE m.structure_id = c.structure_id AND m.actif AND m.dose_max_pediatrique_mg_kg IS NOT NULL
         AND (lower(_med) LIKE '%' || lower(m.dci) || '%' OR (m.nom_commercial IS NOT NULL AND lower(_med) LIKE '%' || lower(m.nom_commercial) || '%'))
       LIMIT 1;
      IF _dose_max IS NOT NULL THEN
        SELECT k.poids INTO _poids FROM public.sante_constantes k
         WHERE k.patient_id = c.patient_id AND k.poids IS NOT NULL ORDER BY k.created_at DESC LIMIT 1;
        _dose := nullif(trim(coalesce(l->>'dose_mg_jour','')),'')::numeric;
        IF _poids IS NULL AND (_just_ped IS NULL OR length(_just_ped) < 15) THEN
          RAISE EXCEPTION 'PEDIATRIE_POIDS: enfant de moins de 12 ans sans poids mesure — % exige une pesee ou une justification ecrite (15 caracteres minimum)', _med;
        END IF;
        IF _poids IS NOT NULL AND _dose IS NOT NULL AND _dose > _dose_max * _poids AND (_just_ped IS NULL OR length(_just_ped) < 15) THEN
          RAISE EXCEPTION 'PEDIATRIE_DOSE: % mg/j depasse le maximum pediatrique (% mg/kg/j pour % kg) de % — justification ecrite exigee (15 caracteres minimum)', _dose, _dose_max, _poids, _med;
        END IF;
      END IF;
    END IF;
    INSERT INTO public.sante_ordonnance_lignes(ordonnance_id, ordre, medicament, posologie, duree, quantite, justification_allergie, dose_mg_jour, justification_pediatrie)
    VALUES (_id, i, _med, trim(l->>'posologie'), nullif(trim(l->>'duree'),''), nullif(trim(l->>'quantite'),''), CASE WHEN _allergie IS NOT NULL THEN _just END,
      nullif(trim(coalesce(l->>'dose_mg_jour','')),'')::numeric, _just_ped);
    i := i + 1;
  END LOOP;
  RETURN _id;
END $function$;