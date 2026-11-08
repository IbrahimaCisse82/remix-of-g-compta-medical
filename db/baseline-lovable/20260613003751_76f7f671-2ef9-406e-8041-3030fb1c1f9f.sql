
-- EMPLOYEES
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  matricule text NOT NULL,
  prenom text NOT NULL,
  nom text NOT NULL,
  sexe text DEFAULT 'M',
  date_naissance date,
  lieu_naissance text,
  nationalite text DEFAULT 'Sénégalaise',
  adresse text,
  telephone text,
  situation_famille text DEFAULT 'Célibataire',
  femmes int DEFAULT 0,
  enfants int DEFAULT 0,
  fonction text,
  convention text,
  categorie text,
  statut text DEFAULT 'employés',
  contrat text DEFAULT 'CDI',
  date_entree date,
  date_sortie date,
  salaire_base numeric NOT NULL DEFAULT 0,
  sursalaire numeric NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, matricule)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_select" ON public.employees FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "employees_modify" ON public.employees FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- PAIE PARAMETRES
CREATE TABLE public.paie_parametres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL UNIQUE REFERENCES public.entreprises(id) ON DELETE CASCADE,
  parametres jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paie_parametres TO authenticated;
GRANT ALL ON public.paie_parametres TO service_role;
ALTER TABLE public.paie_parametres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paie_param_all" ON public.paie_parametres FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE TRIGGER trg_paie_param_updated BEFORE UPDATE ON public.paie_parametres
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- BULLETINS PAIE
CREATE TABLE public.bulletins_paie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid REFERENCES public.exercices(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  periode text NOT NULL,
  annee int NOT NULL,
  mois int NOT NULL,
  salaire_base numeric DEFAULT 0,
  sursalaire numeric DEFAULT 0,
  prime_anciennete numeric DEFAULT 0,
  brut numeric DEFAULT 0,
  ir numeric DEFAULT 0,
  trimf numeric DEFAULT 0,
  ipres_rg_s numeric DEFAULT 0,
  ipres_rc_s numeric DEFAULT 0,
  ipm_s numeric DEFAULT 0,
  total_retenues numeric DEFAULT 0,
  cfce numeric DEFAULT 0,
  ipres_rg_p numeric DEFAULT 0,
  ipres_rc_p numeric DEFAULT 0,
  css_af numeric DEFAULT 0,
  css_at numeric DEFAULT 0,
  ipm_p numeric DEFAULT 0,
  charges_patronales numeric DEFAULT 0,
  transport numeric DEFAULT 0,
  net_payer numeric DEFAULT 0,
  comptabilise boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, periode)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulletins_paie TO authenticated;
GRANT ALL ON public.bulletins_paie TO service_role;
ALTER TABLE public.bulletins_paie ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bulletins_all" ON public.bulletins_paie FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE TRIGGER trg_bulletins_updated BEFORE UPDATE ON public.bulletins_paie
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
