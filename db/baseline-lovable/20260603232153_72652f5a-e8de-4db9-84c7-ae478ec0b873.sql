
-- Clients
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id uuid NOT NULL,
  code text NOT NULL,
  nom text NOT NULL,
  ninea text,
  rccm text,
  adresse text,
  email text,
  tel text,
  compte_tiers text NOT NULL DEFAULT '411',
  actif boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT ON public.clients TO anon;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own clients" ON public.clients FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));
CREATE POLICY "Anon read demo clients" ON public.clients FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Factures
CREATE TABLE public.factures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  client_id uuid NOT NULL,
  numero text NOT NULL,
  date_facture date NOT NULL DEFAULT CURRENT_DATE,
  date_echeance date,
  objet text,
  notes text,
  total_ht numeric NOT NULL DEFAULT 0,
  total_tva numeric NOT NULL DEFAULT 0,
  total_ttc numeric NOT NULL DEFAULT 0,
  taux_tva numeric NOT NULL DEFAULT 18,
  statut text NOT NULL DEFAULT 'brouillon', -- brouillon | validee | payee | annulee
  compte_vente text NOT NULL DEFAULT '701',
  comptabilisee boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factures TO authenticated;
GRANT SELECT ON public.factures TO anon;
GRANT ALL ON public.factures TO service_role;
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own factures" ON public.factures FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));
CREATE POLICY "Anon read demo factures" ON public.factures FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));
CREATE TRIGGER trg_factures_updated BEFORE UPDATE ON public.factures FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Lignes facture
CREATE TABLE public.facture_lignes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  facture_id uuid NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  designation text NOT NULL,
  quantite numeric NOT NULL DEFAULT 1,
  prix_unitaire numeric NOT NULL DEFAULT 0,
  remise_pct numeric NOT NULL DEFAULT 0,
  montant_ht numeric NOT NULL DEFAULT 0,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facture_lignes TO authenticated;
GRANT SELECT ON public.facture_lignes TO anon;
GRANT ALL ON public.facture_lignes TO service_role;
ALTER TABLE public.facture_lignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own facture_lignes" ON public.facture_lignes FOR ALL TO authenticated
  USING (facture_id IN (SELECT id FROM public.factures WHERE entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid()))))
  WITH CHECK (facture_id IN (SELECT id FROM public.factures WHERE entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid()))));
CREATE POLICY "Anon read demo facture_lignes" ON public.facture_lignes FOR SELECT TO anon
  USING (facture_id IN (SELECT id FROM public.factures WHERE entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL)));

CREATE INDEX idx_factures_entreprise ON public.factures(entreprise_id, exercice_id);
CREATE INDEX idx_facture_lignes_facture ON public.facture_lignes(facture_id);
CREATE UNIQUE INDEX uniq_facture_numero ON public.factures(entreprise_id, numero);
CREATE UNIQUE INDEX uniq_client_code ON public.clients(entreprise_id, code);
