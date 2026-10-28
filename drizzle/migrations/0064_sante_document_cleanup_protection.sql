CREATE OR REPLACE FUNCTION public.sante_document_sans_fiche(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.sante_documents_patient WHERE storage_path=_path);
$$;
REVOKE ALL ON FUNCTION public.sante_document_sans_fiche(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_document_sans_fiche(text) TO authenticated;
ALTER POLICY sante_docs_orphan_cleanup ON storage.objects USING (bucket_id='sante-documents' AND owner_id=auth.uid()::text AND public.mfa_conforme() AND public.can_access_patient(public.sante_storage_patient(name)) AND public.sante_document_sans_fiche(name));