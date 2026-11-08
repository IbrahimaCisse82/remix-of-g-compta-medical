
-- Entreprises
CREATE TABLE public.entreprises (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  sigle TEXT,
  ninea TEXT,
  rccm TEXT,
  tel TEXT,
  adresse TEXT,
  forme_juridique TEXT,
  secteur TEXT,
  monnaie TEXT DEFAULT 'FCFA',
  cabinet_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.entreprises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read entreprises" ON public.entreprises FOR SELECT USING (true);
CREATE POLICY "Public insert entreprises" ON public.entreprises FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update entreprises" ON public.entreprises FOR UPDATE USING (true);
CREATE POLICY "Public delete entreprises" ON public.entreprises FOR DELETE USING (true);

-- Exercices
CREATE TABLE public.exercices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'cloture')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.exercices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read exercices" ON public.exercices FOR SELECT USING (true);
CREATE POLICY "Public insert exercices" ON public.exercices FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update exercices" ON public.exercices FOR UPDATE USING (true);
CREATE POLICY "Public delete exercices" ON public.exercices FOR DELETE USING (true);

-- Plan comptable
CREATE TABLE public.plan_comptable (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  intitule TEXT NOT NULL,
  classe TEXT NOT NULL,
  sens TEXT NOT NULL,
  type_compte TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_comptable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read plan_comptable" ON public.plan_comptable FOR SELECT USING (true);
CREATE POLICY "Public insert plan_comptable" ON public.plan_comptable FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update plan_comptable" ON public.plan_comptable FOR UPDATE USING (true);
CREATE POLICY "Public delete plan_comptable" ON public.plan_comptable FOR DELETE USING (true);

-- Balance
CREATE TABLE public.balance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exercice_id UUID NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  compte TEXT NOT NULL,
  intitule TEXT NOT NULL,
  sd NUMERIC NOT NULL DEFAULT 0,
  sc NUMERIC NOT NULL DEFAULT 0,
  md NUMERIC NOT NULL DEFAULT 0,
  mc NUMERIC NOT NULL DEFAULT 0,
  sfd NUMERIC NOT NULL DEFAULT 0,
  sfc NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read balance" ON public.balance FOR SELECT USING (true);
CREATE POLICY "Public insert balance" ON public.balance FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update balance" ON public.balance FOR UPDATE USING (true);
CREATE POLICY "Public delete balance" ON public.balance FOR DELETE USING (true);

-- Journal
CREATE TABLE public.journal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exercice_id UUID NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  date_ecriture DATE NOT NULL,
  piece TEXT NOT NULL,
  journal_code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  compte TEXT NOT NULL,
  intitule TEXT NOT NULL,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read journal" ON public.journal FOR SELECT USING (true);
CREATE POLICY "Public insert journal" ON public.journal FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update journal" ON public.journal FOR UPDATE USING (true);
CREATE POLICY "Public delete journal" ON public.journal FOR DELETE USING (true);

-- Indexes
CREATE INDEX idx_exercices_entreprise ON public.exercices(entreprise_id);
CREATE INDEX idx_plan_comptable_entreprise ON public.plan_comptable(entreprise_id);
CREATE INDEX idx_balance_exercice ON public.balance(exercice_id);
CREATE INDEX idx_balance_entreprise ON public.balance(entreprise_id);
CREATE INDEX idx_journal_exercice ON public.journal(exercice_id);
CREATE INDEX idx_journal_entreprise ON public.journal(entreprise_id);
CREATE INDEX idx_journal_compte ON public.journal(compte);
CREATE INDEX idx_balance_compte ON public.balance(compte);
