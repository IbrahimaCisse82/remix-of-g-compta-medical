-- Notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  titre TEXT NOT NULL,
  message TEXT,
  lien TEXT,
  meta JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "notif_delete" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE INDEX idx_notif_user ON public.notifications(user_id, read_at);
CREATE INDEX idx_notif_ent ON public.notifications(entreprise_id, created_at DESC);

-- Marker portail source on documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'interne',
  ADD COLUMN IF NOT EXISTS depose_par_email TEXT,
  ADD COLUMN IF NOT EXISTS statut_validation TEXT NOT NULL DEFAULT 'valide';