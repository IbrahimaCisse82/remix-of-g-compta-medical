
-- Drop the old overly restrictive policy
DROP POLICY IF EXISTS "Users manage own entreprises" ON public.entreprises;

-- Owner can do everything on their own entreprises
CREATE POLICY "Owner manages own entreprises"
  ON public.entreprises FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Cabinet members can READ entreprises linked to their cabinet
CREATE POLICY "Cabinet members read cabinet entreprises"
  ON public.entreprises FOR SELECT
  TO authenticated
  USING (
    cabinet_id IS NOT NULL 
    AND public.is_cabinet_member(auth.uid(), cabinet_id)
  );

-- Cabinet admins can UPDATE cabinet_id on entreprises (link/unlink)
CREATE POLICY "Cabinet admins update cabinet entreprises"
  ON public.entreprises FOR UPDATE
  TO authenticated
  USING (
    cabinet_id IS NOT NULL 
    AND public.get_cabinet_role(auth.uid(), cabinet_id) = 'admin'
  )
  WITH CHECK (
    cabinet_id IS NOT NULL 
    AND public.get_cabinet_role(auth.uid(), cabinet_id) = 'admin'
  );
