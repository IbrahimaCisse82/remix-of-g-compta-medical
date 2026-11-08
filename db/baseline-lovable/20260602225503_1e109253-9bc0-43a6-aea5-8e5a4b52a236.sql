-- Table immobilisations
CREATE TABLE public.immobilisations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL,
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  categorie TEXT NOT NULL DEFAULT 'corporelle',
  compte_immo TEXT NOT NULL,
  compte_amort TEXT,
  compte_dotation TEXT DEFAULT '6813',
  date_acquisition DATE NOT NULL,
  date_mise_service DATE,
  valeur_origine NUMERIC NOT NULL DEFAULT 0,
  valeur_residuelle NUMERIC NOT NULL DEFAULT 0,
  duree_annees NUMERIC NOT NULL DEFAULT 5,
  mode_amortissement TEXT NOT NULL DEFAULT 'lineaire',
  taux NUMERIC,
  statut TEXT NOT NULL DEFAULT 'actif',
  date_cession DATE,
  prix_cession NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.immobilisations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.immobilisations TO authenticated;
GRANT ALL ON public.immobilisations TO service_role;

ALTER TABLE public.immobilisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own immobilisations"
ON public.immobilisations FOR ALL TO authenticated
USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo immobilisations"
ON public.immobilisations FOR SELECT TO anon
USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));

CREATE INDEX idx_immo_entreprise ON public.immobilisations(entreprise_id);

-- Table amortissements (plan d'amortissement annuel)
CREATE TABLE public.amortissements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL,
  immobilisation_id UUID NOT NULL REFERENCES public.immobilisations(id) ON DELETE CASCADE,
  exercice_id UUID,
  annee INTEGER NOT NULL,
  dotation NUMERIC NOT NULL DEFAULT 0,
  cumul NUMERIC NOT NULL DEFAULT 0,
  vnc NUMERIC NOT NULL DEFAULT 0,
  comptabilise BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.amortissements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amortissements TO authenticated;
GRANT ALL ON public.amortissements TO service_role;

ALTER TABLE public.amortissements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own amortissements"
ON public.amortissements FOR ALL TO authenticated
USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo amortissements"
ON public.amortissements FOR SELECT TO anon
USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));

CREATE INDEX idx_amort_immo ON public.amortissements(immobilisation_id);
CREATE INDEX idx_amort_exercice ON public.amortissements(exercice_id);

-- Trigger updated_at sur immobilisations
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_immo_updated
BEFORE UPDATE ON public.immobilisations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();