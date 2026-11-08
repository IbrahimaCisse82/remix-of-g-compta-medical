
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS uuid_dgid TEXT,
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS hash_certif TEXT,
  ADD COLUMN IF NOT EXISTS statut_dgid TEXT NOT NULL DEFAULT 'non_transmise',
  ADD COLUMN IF NOT EXISTS date_transmission TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dgid_error TEXT,
  ADD COLUMN IF NOT EXISTS dgid_mode TEXT NOT NULL DEFAULT 'test';

CREATE TABLE IF NOT EXISTS public.dgid_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE UNIQUE,
  mode TEXT NOT NULL DEFAULT 'test',
  ninea_transmetteur TEXT,
  certificat TEXT,
  endpoint TEXT,
  actif BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dgid_config TO authenticated;
GRANT ALL ON public.dgid_config TO service_role;
ALTER TABLE public.dgid_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dgid_config access" ON public.dgid_config FOR ALL
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE TRIGGER trg_dgid_config_touch BEFORE UPDATE ON public.dgid_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.dgid_transmissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  facture_id UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  statut TEXT NOT NULL,
  payload JSONB,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dgid_transmissions TO authenticated;
GRANT ALL ON public.dgid_transmissions TO service_role;
ALTER TABLE public.dgid_transmissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dgid_transmissions access" ON public.dgid_transmissions FOR ALL
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE INDEX IF NOT EXISTS idx_dgid_trans_facture ON public.dgid_transmissions(facture_id);
