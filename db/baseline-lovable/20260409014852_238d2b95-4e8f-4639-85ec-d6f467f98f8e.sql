
-- 1. LETTRAGE
CREATE TABLE public.lettrage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  compte text NOT NULL,
  code_lettrage text NOT NULL,
  journal_entry_id uuid NOT NULL,
  montant numeric NOT NULL DEFAULT 0,
  date_lettrage date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lettrage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lettrage" ON public.lettrage FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

-- 2. AXES ANALYTIQUES
CREATE TABLE public.axes_analytiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL,
  code text NOT NULL,
  libelle text NOT NULL,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.axes_analytiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own axes" ON public.axes_analytiques FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

-- VENTILATIONS ANALYTIQUES
CREATE TABLE public.ventilations_analytiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  axe_id uuid NOT NULL REFERENCES public.axes_analytiques(id) ON DELETE CASCADE,
  centre text NOT NULL,
  montant numeric NOT NULL DEFAULT 0,
  pourcentage numeric NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ventilations_analytiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ventilations" ON public.ventilations_analytiques FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

-- 3. BUDGETS
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  compte text NOT NULL,
  intitule text NOT NULL DEFAULT '',
  mois integer NOT NULL CHECK (mois >= 1 AND mois <= 12),
  montant_budget numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, exercice_id, compte, mois)
);
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own budgets" ON public.budgets FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

-- 4. TVA PARAMETRAGE
CREATE TABLE public.tva_parametrage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL,
  code text NOT NULL,
  libelle text NOT NULL,
  taux numeric NOT NULL DEFAULT 18,
  compte_tva_collectee text NOT NULL DEFAULT '4431',
  compte_tva_deductible text NOT NULL DEFAULT '4451',
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tva_parametrage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tva_param" ON public.tva_parametrage FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

-- DECLARATIONS TVA
CREATE TABLE public.declarations_tva (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  periode text NOT NULL,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  tva_collectee numeric NOT NULL DEFAULT 0,
  tva_deductible numeric NOT NULL DEFAULT 0,
  tva_nette numeric NOT NULL DEFAULT 0,
  credit_precedent numeric NOT NULL DEFAULT 0,
  tva_a_payer numeric NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'brouillon',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.declarations_tva ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own declarations" ON public.declarations_tva FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

-- 5. ECRITURES D'ABONNEMENT
CREATE TABLE public.ecritures_abonnement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  libelle text NOT NULL,
  journal_code text NOT NULL DEFAULT 'OD',
  periodicite text NOT NULL DEFAULT 'mensuel',
  jour_execution integer NOT NULL DEFAULT 1,
  date_debut date NOT NULL,
  date_fin date,
  derniere_execution date,
  actif boolean NOT NULL DEFAULT true,
  lignes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ecritures_abonnement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own abonnements" ON public.ecritures_abonnement FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

-- 6. CLOTURE LOGS
CREATE TABLE public.cloture_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cloture_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own cloture_logs" ON public.cloture_logs FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));
CREATE POLICY "Users insert own cloture_logs" ON public.cloture_logs FOR INSERT TO authenticated
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));
