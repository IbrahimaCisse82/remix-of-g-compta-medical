
-- ARTICLES (référentiel stocks)
CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  designation TEXT NOT NULL,
  unite TEXT NOT NULL DEFAULT 'U',
  methode_valorisation TEXT NOT NULL DEFAULT 'CUMP',
  compte_stock TEXT NOT NULL DEFAULT '311',
  compte_achat TEXT NOT NULL DEFAULT '601',
  compte_vente TEXT NOT NULL DEFAULT '701',
  compte_variation TEXT NOT NULL DEFAULT '6031',
  prix_achat_moyen NUMERIC(18,4) NOT NULL DEFAULT 0,
  quantite_stock NUMERIC(18,4) NOT NULL DEFAULT 0,
  stock_minimum NUMERIC(18,4) NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage articles" ON public.articles FOR ALL
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE TRIGGER trg_articles_updated BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- MOUVEMENTS DE STOCK
CREATE TABLE public.mouvements_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id UUID REFERENCES public.exercices(id) ON DELETE SET NULL,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  date_mvt DATE NOT NULL,
  type_mvt TEXT NOT NULL,
  reference TEXT,
  quantite NUMERIC(18,4) NOT NULL,
  prix_unitaire NUMERIC(18,4) NOT NULL DEFAULT 0,
  montant NUMERIC(18,2) NOT NULL DEFAULT 0,
  cump_apres NUMERIC(18,4) NOT NULL DEFAULT 0,
  qte_apres NUMERIC(18,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mouvements_stock TO authenticated;
GRANT ALL ON public.mouvements_stock TO service_role;
ALTER TABLE public.mouvements_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage mvt stock" ON public.mouvements_stock FOR ALL
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE INDEX idx_mvt_stock_article ON public.mouvements_stock(article_id, date_mvt);

-- PROVISIONS & DÉPRÉCIATIONS
CREATE TABLE public.provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id UUID REFERENCES public.exercices(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  nature TEXT NOT NULL,
  compte_provision TEXT NOT NULL,
  compte_dotation TEXT NOT NULL,
  compte_reprise TEXT NOT NULL,
  montant_initial NUMERIC(18,2) NOT NULL DEFAULT 0,
  montant_actuel NUMERIC(18,2) NOT NULL DEFAULT 0,
  date_constitution DATE NOT NULL,
  date_reprise DATE,
  statut TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisions TO authenticated;
GRANT ALL ON public.provisions TO service_role;
ALTER TABLE public.provisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage provisions" ON public.provisions FOR ALL
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE TRIGGER trg_provisions_updated BEFORE UPDATE ON public.provisions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
