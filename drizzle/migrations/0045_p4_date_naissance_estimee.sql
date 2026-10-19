ALTER TABLE public.sante_patients ADD COLUMN date_naissance_estimee boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.sante_patients.date_naissance_estimee IS 'Date de naissance déclarative / approximative (ex. âge estimé à l''accueil), pas un document d''état civil';

DROP FUNCTION public.sante_creer_patient(uuid,text,text,text,date,text,text,text,text,boolean,boolean);

CREATE FUNCTION public.sante_creer_patient(_structure_id uuid, _nom text, _prenoms text, _sexe text, _date_naissance date DEFAULT NULL,
  _telephone text DEFAULT NULL, _adresse text DEFAULT NULL, _contact_urgence_nom text DEFAULT NULL, _contact_urgence_tel text DEFAULT NULL,
  _consentement boolean DEFAULT false, _ignorer_doublons boolean DEFAULT false, _date_naissance_estimee boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _seq bigint; _an int := extract(year FROM now())::int;
BEGIN
  IF NOT public.structure_module_actif(_structure_id, 'sante_patients') THEN RAISE EXCEPTION 'Module Dossier patient inactif'; END IF;
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['medecin','secretaire','biologiste','preleveur']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF char_length(trim(_nom)) < 2 OR char_length(trim(_prenoms)) < 1 THEN RAISE EXCEPTION 'Nom et prénoms obligatoires'; END IF;
  IF _date_naissance IS NOT NULL AND _date_naissance > current_date THEN RAISE EXCEPTION 'Date de naissance invalide'; END IF;
  IF _date_naissance IS NULL AND _date_naissance_estimee THEN RAISE EXCEPTION 'Une date estimée exige une date de naissance'; END IF;
  IF NOT _ignorer_doublons AND EXISTS (SELECT 1 FROM public.sante_doublons_patient(_structure_id, _nom, _prenoms, _date_naissance, _telephone)) THEN
    RAISE EXCEPTION 'DOUBLON_POSSIBLE';
  END IF;
  INSERT INTO public.sante_patient_sequences(structure_id, annee, dernier) VALUES (_structure_id, _an, 1)
  ON CONFLICT (structure_id, annee) DO UPDATE SET dernier = public.sante_patient_sequences.dernier + 1 RETURNING dernier INTO _seq;
  INSERT INTO public.sante_patients(structure_id, numero_dossier, nom, prenoms, sexe, date_naissance, date_naissance_estimee, telephone, adresse, contact_urgence_nom, contact_urgence_tel, created_by)
  VALUES (_structure_id, 'P' || _an || '-' || lpad(_seq::text, 6, '0'), upper(trim(_nom)), initcap(trim(_prenoms)), _sexe, _date_naissance,
    coalesce(_date_naissance_estimee, false) AND _date_naissance IS NOT NULL,
    nullif(trim(_telephone),''), nullif(trim(_adresse),''), nullif(trim(_contact_urgence_nom),''), nullif(trim(_contact_urgence_tel),''), auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.sante_consentements(patient_id, type, version_texte, accorde, preuve)
  VALUES (_id, 'traitement_donnees', 'v1-2026', _consentement, 'recueil oral à l''accueil');
  RETURN _id;
END $$;

REVOKE EXECUTE ON FUNCTION public.sante_creer_patient(uuid,text,text,text,date,text,text,text,text,boolean,boolean,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sante_creer_patient(uuid,text,text,text,date,text,text,text,text,boolean,boolean,boolean) TO authenticated;