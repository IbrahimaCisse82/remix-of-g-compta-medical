-- Fusion de dossiers en deux temps : proposition, confirmation par une personne différente, annulation avec restauration.
ALTER TABLE public.sante_fusions ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'proposee' CHECK (statut IN ('proposee','confirmee','annulee'));
ALTER TABLE public.sante_fusions ADD COLUMN IF NOT EXISTS confirme_par uuid;
ALTER TABLE public.sante_fusions ADD COLUMN IF NOT EXISTS confirme_le timestamptz;
ALTER TABLE public.sante_fusions ADD COLUMN IF NOT EXISTS annule_par uuid;
ALTER TABLE public.sante_fusions ADD COLUMN IF NOT EXISTS annule_le timestamptz;
ALTER TABLE public.sante_fusions ADD COLUMN IF NOT EXISTS motif_annulation text;
ALTER TABLE public.sante_fusions ADD COLUMN IF NOT EXISTS snapshot jsonb;

GRANT SELECT ON public.sante_fusions TO authenticated;
CREATE POLICY "fusions lecture soignants" ON public.sante_fusions FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','medecin','secretaire']));
CREATE POLICY "fusions mfa" ON public.sante_fusions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());

-- 1) Proposition : ne déplace rien. Refus si sexe connu et différent.
CREATE OR REPLACE FUNCTION public.sante_proposer_fusion(_conserve uuid, _fusionne uuid, _motif text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.sante_patients%ROWTYPE; f public.sante_patients%ROWTYPE; _id uuid;
BEGIN
  SELECT * INTO c FROM public.sante_patients WHERE id = _conserve AND statut = 'actif';
  SELECT * INTO f FROM public.sante_patients WHERE id = _fusionne AND statut = 'actif';
  IF c.id IS NULL OR f.id IS NULL OR c.structure_id <> f.structure_id OR _conserve = _fusionne THEN RAISE EXCEPTION 'Fusion impossible'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['medecin','secretaire']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif obligatoire (5 caractères minimum)'; END IF;
  IF c.sexe IS NOT NULL AND f.sexe IS NOT NULL AND c.sexe <> f.sexe THEN RAISE EXCEPTION 'Fusion refusée : sexe différent entre les deux dossiers'; END IF;
  IF c.date_naissance IS NOT NULL AND f.date_naissance IS NOT NULL AND c.date_naissance <> f.date_naissance THEN RAISE EXCEPTION 'Fusion refusée : dates de naissance différentes'; END IF;
  IF EXISTS (SELECT 1 FROM public.sante_fusions WHERE statut = 'proposee' AND (patient_conserve IN (_conserve,_fusionne) OR patient_fusionne IN (_conserve,_fusionne))) THEN RAISE EXCEPTION 'Une fusion est déjà en attente pour l''un de ces dossiers'; END IF;
  INSERT INTO public.sante_fusions(structure_id, patient_conserve, patient_fusionne, motif, fusionne_par)
  VALUES (c.structure_id, _conserve, _fusionne, trim(_motif), auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, entite, entite_id, details)
  VALUES (c.structure_id, auth.uid(), 'fusion_proposee', 'patient', _fusionne, jsonb_build_object('conserve', _conserve, 'motif', trim(_motif)));
  RETURN _id;
END $function$;

-- 2) Confirmation : obligatoirement par une AUTRE personne que le proposant.
CREATE OR REPLACE FUNCTION public.sante_confirmer_fusion(_fusion_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f public.sante_fusions%ROWTYPE; _snap jsonb;
BEGIN
  SELECT * INTO f FROM public.sante_fusions WHERE id = _fusion_id AND statut = 'proposee';
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition de fusion introuvable ou déjà traitée'; END IF;
  IF NOT public.has_any_medical_role(f.structure_id, ARRAY['medecin','secretaire']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF f.fusionne_par = auth.uid() THEN RAISE EXCEPTION 'La confirmation doit être faite par une personne différente du proposant'; END IF;
  IF f.created_at < now() - interval '7 days' THEN RAISE EXCEPTION 'Proposition expirée (7 jours) : refaites une proposition'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sante_patients WHERE id = f.patient_conserve AND statut = 'actif')
     OR NOT EXISTS (SELECT 1 FROM public.sante_patients WHERE id = f.patient_fusionne AND statut = 'actif') THEN RAISE EXCEPTION 'Fusion impossible : un dossier a changé de statut'; END IF;
  SELECT jsonb_build_object(
    'assurances', coalesce((SELECT jsonb_agg(id) FROM public.sante_patient_assurances WHERE patient_id = f.patient_fusionne), '[]'::jsonb),
    'antecedents', coalesce((SELECT jsonb_agg(id) FROM public.sante_antecedents WHERE patient_id = f.patient_fusionne), '[]'::jsonb),
    'consentements', coalesce((SELECT jsonb_agg(id) FROM public.sante_consentements WHERE patient_id = f.patient_fusionne), '[]'::jsonb)
  ) INTO _snap;
  UPDATE public.sante_patient_assurances SET patient_id = f.patient_conserve WHERE patient_id = f.patient_fusionne;
  UPDATE public.sante_antecedents SET patient_id = f.patient_conserve WHERE patient_id = f.patient_fusionne;
  UPDATE public.sante_consentements SET patient_id = f.patient_conserve WHERE patient_id = f.patient_fusionne;
  UPDATE public.sante_patients SET statut = 'fusionne', fusionne_dans = f.patient_conserve WHERE id = f.patient_fusionne;
  UPDATE public.sante_fusions SET statut = 'confirmee', confirme_par = auth.uid(), confirme_le = now(), snapshot = _snap WHERE id = _fusion_id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, entite, entite_id, details)
  VALUES (f.structure_id, auth.uid(), 'fusion_confirmee', 'patient', f.patient_fusionne, jsonb_build_object('conserve', f.patient_conserve));
END $function$;

-- 3) Annulation : administrateur de structure uniquement, avec restauration exacte des lignes déplacées.
CREATE OR REPLACE FUNCTION public.sante_annuler_fusion(_fusion_id uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f public.sante_fusions%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.sante_fusions WHERE id = _fusion_id AND statut = 'confirmee';
  IF NOT FOUND THEN RAISE EXCEPTION 'Fusion confirmée introuvable (ou déjà annulée)'; END IF;
  IF NOT public.has_any_medical_role(f.structure_id, ARRAY['admin_structure']) THEN RAISE EXCEPTION 'Annulation réservée à l''administrateur de la structure'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 10 THEN RAISE EXCEPTION 'Motif d''annulation obligatoire (10 caractères minimum)'; END IF;
  UPDATE public.sante_patient_assurances SET patient_id = f.patient_fusionne WHERE id IN (SELECT (jsonb_array_elements_text(f.snapshot->'assurances'))::uuid);
  UPDATE public.sante_antecedents SET patient_id = f.patient_fusionne WHERE id IN (SELECT (jsonb_array_elements_text(f.snapshot->'antecedents'))::uuid);
  UPDATE public.sante_consentements SET patient_id = f.patient_fusionne WHERE id IN (SELECT (jsonb_array_elements_text(f.snapshot->'consentements'))::uuid);
  UPDATE public.sante_patients SET statut = 'actif', fusionne_dans = NULL WHERE id = f.patient_fusionne;
  UPDATE public.sante_fusions SET statut = 'annulee', annule_par = auth.uid(), annule_le = now(), motif_annulation = trim(_motif) WHERE id = _fusion_id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, entite, entite_id, details)
  VALUES (f.structure_id, auth.uid(), 'fusion_annulee', 'patient', f.patient_fusionne, jsonb_build_object('conserve', f.patient_conserve, 'motif', trim(_motif)));
END $function$;

-- L'ancienne fusion directe est retirée : seule la voie en deux temps est acceptée.
CREATE OR REPLACE FUNCTION public.sante_fusionner_patients(_conserve uuid, _fusionne uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Fusion directe supprimée : utilisez la proposition de fusion puis sa confirmation par un second soignant';
END $function$;
COMMENT ON FUNCTION public.sante_fusionner_patients(uuid, uuid, text) IS 'DEPRECATED: remplacée par sante_proposer_fusion + sante_confirmer_fusion + sante_annuler_fusion (P4)';