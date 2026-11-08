
CREATE POLICY "ged_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ged'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_entreprise_ids(auth.uid()))
  );
CREATE POLICY "ged_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ged'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_entreprise_ids(auth.uid()))
  );
CREATE POLICY "ged_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ged'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_entreprise_ids(auth.uid()))
  );
CREATE POLICY "ged_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ged'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_entreprise_ids(auth.uid()))
  );
