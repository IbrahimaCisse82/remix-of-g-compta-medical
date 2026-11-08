
-- ─── FOURNISSEURS ───────────────────────────────────────────
CREATE TABLE public.fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  code text NOT NULL,
  raison_sociale text NOT NULL,
  ninea text,
  rccm text,
  adresse text,
  telephone text,
  email text,
  compte_tiers text NOT NULL DEFAULT '401',
  conditions_reglement text,
  delai_paiement_jours int DEFAULT 30,
  actif boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fournisseurs_select" ON public.fournisseurs FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "fournisseurs_mutate" ON public.fournisseurs FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE TRIGGER trg_fournisseurs_updated BEFORE UPDATE ON public.fournisseurs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── FACTURES D'ACHAT ───────────────────────────────────────
CREATE TABLE public.factures_achat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE RESTRICT,
  numero_interne text NOT NULL,
  numero_fournisseur text,
  date_facture date NOT NULL,
  date_reception date,
  date_echeance date,
  objet text,
  total_ht numeric(18,2) NOT NULL DEFAULT 0,
  total_tva numeric(18,2) NOT NULL DEFAULT 0,
  total_ttc numeric(18,2) NOT NULL DEFAULT 0,
  montant_paye numeric(18,2) NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','validee','payee_partiel','payee','annulee')),
  comptabilisee boolean NOT NULL DEFAULT false,
  piece_journal text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, numero_interne)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.factures_achat TO authenticated;
GRANT ALL ON public.factures_achat TO service_role;
ALTER TABLE public.factures_achat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factures_achat_select" ON public.factures_achat FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "factures_achat_mutate" ON public.factures_achat FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE TRIGGER trg_factures_achat_updated BEFORE UPDATE ON public.factures_achat
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_factures_achat_ent ON public.factures_achat(entreprise_id, exercice_id);
CREATE INDEX idx_factures_achat_frn ON public.factures_achat(fournisseur_id);

-- ─── LIGNES DE FACTURES D'ACHAT ─────────────────────────────
CREATE TABLE public.factures_achat_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES public.factures_achat(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  designation text NOT NULL,
  quantite numeric(18,4) NOT NULL DEFAULT 1,
  prix_unitaire numeric(18,2) NOT NULL DEFAULT 0,
  taux_tva numeric(5,2) NOT NULL DEFAULT 18,
  compte_charge text NOT NULL DEFAULT '601',
  montant_ht numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.factures_achat_lignes TO authenticated;
GRANT ALL ON public.factures_achat_lignes TO service_role;
ALTER TABLE public.factures_achat_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "factures_achat_lignes_select" ON public.factures_achat_lignes FOR SELECT TO authenticated
  USING (facture_id IN (SELECT id FROM public.factures_achat WHERE entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid()))));
CREATE POLICY "factures_achat_lignes_mutate" ON public.factures_achat_lignes FOR ALL TO authenticated
  USING (facture_id IN (SELECT id FROM public.factures_achat WHERE entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid()))))
  WITH CHECK (facture_id IN (SELECT id FROM public.factures_achat WHERE entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid()))));

CREATE INDEX idx_factures_achat_lignes_fact ON public.factures_achat_lignes(facture_id);
