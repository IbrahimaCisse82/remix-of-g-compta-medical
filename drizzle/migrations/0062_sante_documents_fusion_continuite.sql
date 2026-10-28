CREATE OR REPLACE FUNCTION public.sante_document_patient_effectif(_path text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT d.patient_id FROM public.sante_documents_patient d WHERE d.storage_path=_path),public.sante_storage_patient(_path));
$$;
REVOKE ALL ON FUNCTION public.sante_document_patient_effectif(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_document_patient_effectif(text) TO authenticated;
ALTER POLICY sante_docs_select ON storage.objects USING (bucket_id='sante-documents' AND public.mfa_conforme() AND public.can_access_clinique(public.sante_document_patient_effectif(name)));
CREATE POLICY sante_docs_orphan_cleanup ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='sante-documents' AND owner_id=auth.uid()::text AND public.mfa_conforme() AND public.can_access_patient(public.sante_storage_patient(name)) AND NOT EXISTS(SELECT 1 FROM public.sante_documents_patient d WHERE d.storage_path=name)
);

CREATE OR REPLACE FUNCTION public.sante_fusion_documents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _ids jsonb;
BEGIN
 IF OLD.statut='proposee' AND NEW.statut='confirmee' THEN
  SELECT coalesce(jsonb_agg(id),'[]'::jsonb) INTO _ids FROM public.sante_documents_patient WHERE patient_id=NEW.patient_fusionne AND structure_id=NEW.structure_id;
  NEW.snapshot:=coalesce(NEW.snapshot,'{}'::jsonb)||jsonb_build_object('documents',_ids);
  UPDATE public.sante_documents_patient SET patient_id=NEW.patient_conserve WHERE patient_id=NEW.patient_fusionne AND structure_id=NEW.structure_id;
 ELSIF OLD.statut='confirmee' AND NEW.statut='annulee' THEN
  UPDATE public.sante_documents_patient SET patient_id=NEW.patient_fusionne WHERE structure_id=NEW.structure_id AND patient_id=NEW.patient_conserve AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(coalesce(OLD.snapshot->'documents','[]'::jsonb)));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sante_fusion_documents() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_sante_fusion_documents BEFORE UPDATE OF statut ON public.sante_fusions FOR EACH ROW EXECUTE FUNCTION public.sante_fusion_documents();

CREATE OR REPLACE FUNCTION public.sante_fusion_verifier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
 IF TG_OP='UPDATE' AND OLD.statut<>NEW.statut THEN
  IF NEW.statut='confirmee' AND (NOT public.has_any_medical_role(NEW.structure_id,ARRAY['medecin','secretaire']) OR NEW.fusionne_par=auth.uid()) THEN RAISE EXCEPTION 'Confirmation par un autre soignant requise'; END IF;
  IF NEW.statut='annulee' AND NOT public.is_structure_admin(NEW.structure_id) THEN RAISE EXCEPTION 'Annulation réservée à l’administrateur'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sante_fusion_verifier() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_sante_fusion_verifier BEFORE INSERT OR UPDATE ON public.sante_fusions FOR EACH ROW EXECUTE FUNCTION public.sante_fusion_verifier();