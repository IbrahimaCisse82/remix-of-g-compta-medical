
CREATE TABLE IF NOT EXISTS public.plans_abonnement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  prix_fcfa INTEGER NOT NULL,
  periodicite TEXT NOT NULL DEFAULT 'mois',
  description TEXT,
  limites JSONB NOT NULL DEFAULT '{}'::jsonb,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  ordre INTEGER NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  populaire BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans_abonnement TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans_abonnement TO authenticated;
GRANT ALL ON public.plans_abonnement TO service_role;
ALTER TABLE public.plans_abonnement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.plans_abonnement FOR SELECT USING (true);
CREATE TRIGGER trg_plans_touch BEFORE UPDATE ON public.plans_abonnement
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.abonnements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans_abonnement(id),
  statut TEXT NOT NULL DEFAULT 'essai',
  date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin DATE,
  essai_fin DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abonnements TO authenticated;
GRANT ALL ON public.abonnements TO service_role;
ALTER TABLE public.abonnements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abonnements access" ON public.abonnements FOR ALL
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE TRIGGER trg_abonnements_touch BEFORE UPDATE ON public.abonnements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.plans_abonnement (code, nom, prix_fcfa, description, limites, features, ordre, populaire) VALUES
  ('starter', 'Starter', 15000,
   'Pour l''auto-entrepreneur ou la TPE qui démarre.',
   '{"dossiers":1,"utilisateurs":1,"stockage_go":2}'::jsonb,
   '["Comptabilité SYSCOHADA complète","Bilan, Compte de Résultat, TFT","34 Notes Annexes + Liasse DSF","Import FEC/CSV","Mobile Money (Wave/OM/Free)","Support email"]'::jsonb,
   1, false),
  ('pro', 'Pro', 35000,
   'Pour la PME qui veut piloter finement.',
   '{"dossiers":3,"utilisateurs":5,"stockage_go":20}'::jsonb,
   '["Tout Starter, plus :","Paie & bulletins","Immobilisations & amortissements","GED documents illimitée","Facturation client + e-facture DGID","Analytique & Budgets","Support prioritaire"]'::jsonb,
   2, true),
  ('cabinet', 'Cabinet', 75000,
   'Pour les experts-comptables multi-clients.',
   '{"dossiers":-1,"utilisateurs":-1,"stockage_go":100}'::jsonb,
   '["Tout Pro, plus :","Dossiers & utilisateurs illimités","Portail client sécurisé","KPI collaborateurs","Copilote IA (imputation, anomalies)","Multi-cabinet & rôles avancés","Support dédié"]'::jsonb,
   3, false)
ON CONFLICT (code) DO NOTHING;
