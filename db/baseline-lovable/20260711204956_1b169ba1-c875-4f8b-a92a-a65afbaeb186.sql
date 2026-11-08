CREATE TABLE public.moyens_paiement (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  operateur TEXT NOT NULL CHECK (operateur IN ('wave','orange_money','free_money','wizall','autre')),
  libelle TEXT NOT NULL,
  numero TEXT,
  compte_associe TEXT NOT NULL,
  devise TEXT NOT NULL DEFAULT 'XOF',
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.moyens_paiement TO authenticated;
GRANT ALL ON public.moyens_paiement TO service_role;
ALTER TABLE public.moyens_paiement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moyens_paiement_all" ON public.moyens_paiement FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE INDEX idx_moyens_paiement_ent ON public.moyens_paiement(entreprise_id);
CREATE TRIGGER trg_moyens_paiement_updated BEFORE UPDATE ON public.moyens_paiement
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.transactions_mm (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  moyen_id UUID NOT NULL REFERENCES public.moyens_paiement(id) ON DELETE CASCADE,
  date_operation DATE NOT NULL,
  sens TEXT NOT NULL CHECK (sens IN ('entree','sortie')),
  montant NUMERIC(18,2) NOT NULL,
  frais NUMERIC(18,2) NOT NULL DEFAULT 0,
  reference TEXT,
  contrepartie TEXT,
  telephone TEXT,
  libelle TEXT,
  statut TEXT NOT NULL DEFAULT 'importee' CHECK (statut IN ('importee','rapprochee','ignoree')),
  journal_id UUID REFERENCES public.journal(id) ON DELETE SET NULL,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions_mm TO authenticated;
GRANT ALL ON public.transactions_mm TO service_role;
ALTER TABLE public.transactions_mm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_mm_all" ON public.transactions_mm FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE INDEX idx_transactions_mm_ent ON public.transactions_mm(entreprise_id);
CREATE INDEX idx_transactions_mm_moyen ON public.transactions_mm(moyen_id);
CREATE INDEX idx_transactions_mm_date ON public.transactions_mm(date_operation);
CREATE TRIGGER trg_transactions_mm_updated BEFORE UPDATE ON public.transactions_mm
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();