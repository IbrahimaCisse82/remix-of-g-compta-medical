
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id UUID REFERENCES public.exercices(id) ON DELETE SET NULL,
  ref_type TEXT NOT NULL,
  ref_id UUID,
  nom TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  taille_octets BIGINT,
  categorie TEXT,
  description TEXT,
  tags TEXT[],
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "documents_insert" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "documents_update" ON public.documents FOR UPDATE TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "documents_delete" ON public.documents FOR DELETE TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE INDEX idx_documents_ent ON public.documents(entreprise_id);
CREATE INDEX idx_documents_ref ON public.documents(ref_type, ref_id);
CREATE TRIGGER documents_touch BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.journal
  ADD COLUMN IF NOT EXISTS statut_validation TEXT NOT NULL DEFAULT 'brouillon',
  ADD COLUMN IF NOT EXISTS soumis_par UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS soumis_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valide_par UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valide_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motif_refus TEXT;
CREATE INDEX IF NOT EXISTS idx_journal_statut_val ON public.journal(statut_validation);

CREATE TABLE public.portail_acces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nom TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  peut_voir_bilan BOOLEAN NOT NULL DEFAULT true,
  peut_voir_resultat BOOLEAN NOT NULL DEFAULT true,
  peut_voir_documents BOOLEAN NOT NULL DEFAULT true,
  peut_voir_factures BOOLEAN NOT NULL DEFAULT true,
  peut_deposer_documents BOOLEAN NOT NULL DEFAULT false,
  derniere_connexion TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portail_acces TO authenticated;
GRANT ALL ON public.portail_acces TO service_role;
ALTER TABLE public.portail_acces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portail_acces_all" ON public.portail_acces FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE TRIGGER portail_acces_touch BEFORE UPDATE ON public.portail_acces
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
