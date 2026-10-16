ALTER TABLE public.sante_ordonnance_lignes ADD COLUMN IF NOT EXISTS justification_allergie text;
CREATE OR REPLACE FUNCTION public.sante_emettre_ordonnance(_consultation_id uuid, _lignes jsonb, _recommandations text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.sante_consultations%ROWTYPE; _id uuid; l jsonb; i int := 0; _med text; _just text; _allergie text;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['medecin']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF jsonb_array_length(coalesce(_lignes,'[]')) = 0 THEN RAISE EXCEPTION 'Ordonnance vide'; END IF;
  INSERT INTO public.sante_ordonnances(structure_id, consultation_id, patient_id, praticien_id, numero, recommandations, emise_par)
  VALUES (c.structure_id, c.id, c.patient_id, c.praticien_id, public.sante_prochain_numero(c.structure_id, 'ordonnance', 'ORD'), nullif(trim(_recommandations),''), auth.uid())
  RETURNING id INTO _id;
  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    _med := trim(coalesce(l->>'medicament',''));
    IF _med = '' OR coalesce(trim(l->>'posologie'),'') = '' THEN RAISE EXCEPTION 'Médicament et posologie obligatoires'; END IF;
    _just := nullif(trim(coalesce(l->>'justification_allergie','')),'');
    SELECT a.libelle INTO _allergie FROM public.sante_antecedents a
     WHERE a.patient_id = c.patient_id AND lower(a.type) = 'allergie' AND length(trim(a.libelle)) >= 3
       AND (lower(_med) LIKE '%' || lower(trim(a.libelle)) || '%' OR lower(trim(a.libelle)) LIKE '%' || lower(_med) || '%')
     LIMIT 1;
    IF _allergie IS NOT NULL AND (_just IS NULL OR length(_just) < 15) THEN
      RAISE EXCEPTION 'ALLERGIE: patient allergique (%) — % exige une justification écrite (15 caractères minimum)', _allergie, _med;
    END IF;
    INSERT INTO public.sante_ordonnance_lignes(ordonnance_id, ordre, medicament, posologie, duree, quantite, justification_allergie)
    VALUES (_id, i, _med, trim(l->>'posologie'), nullif(trim(l->>'duree'),''), nullif(trim(l->>'quantite'),''), CASE WHEN _allergie IS NOT NULL THEN _just END);
    i := i + 1;
  END LOOP;
  RETURN _id;
END $function$;