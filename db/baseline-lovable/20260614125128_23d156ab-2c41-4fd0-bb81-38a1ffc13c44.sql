
CREATE TABLE public.echeances_fiscales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id UUID REFERENCES public.exercices(id) ON DELETE SET NULL,
  type_declaration TEXT NOT NULL,
  libelle TEXT NOT NULL,
  periode TEXT NOT NULL,
  date_limite DATE NOT NULL,
  montant_du NUMERIC(18,2) DEFAULT 0,
  montant_paye NUMERIC(18,2) DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'a_declarer',
  reference_paiement TEXT,
  date_declaration DATE,
  date_paiement DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.echeances_modeles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  type_declaration TEXT NOT NULL,
  libelle TEXT NOT NULL,
  periodicite TEXT NOT NULL,
  jour_limite INT NOT NULL DEFAULT 15,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.echeances_fiscales TO authenticated;
GRANT ALL ON public.echeances_fiscales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.echeances_modeles TO authenticated;
GRANT ALL ON public.echeances_modeles TO service_role;

ALTER TABLE public.echeances_fiscales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.echeances_modeles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage echeances" ON public.echeances_fiscales FOR ALL
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Members manage modeles" ON public.echeances_modeles FOR ALL
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE TRIGGER trg_echeances_updated BEFORE UPDATE ON public.echeances_fiscales
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_modeles_updated BEFORE UPDATE ON public.echeances_modeles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_echeances_entreprise_date ON public.echeances_fiscales(entreprise_id, date_limite);
CREATE INDEX idx_echeances_statut ON public.echeances_fiscales(statut);
