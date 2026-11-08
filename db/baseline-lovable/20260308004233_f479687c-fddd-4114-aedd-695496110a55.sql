
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.get_user_entreprise_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.entreprises WHERE user_id = _user_id;
$$;

DROP POLICY IF EXISTS "Public read entreprises" ON public.entreprises;
DROP POLICY IF EXISTS "Public insert entreprises" ON public.entreprises;
DROP POLICY IF EXISTS "Public update entreprises" ON public.entreprises;
DROP POLICY IF EXISTS "Public delete entreprises" ON public.entreprises;

DROP POLICY IF EXISTS "Public read exercices" ON public.exercices;
DROP POLICY IF EXISTS "Public insert exercices" ON public.exercices;
DROP POLICY IF EXISTS "Public update exercices" ON public.exercices;
DROP POLICY IF EXISTS "Public delete exercices" ON public.exercices;

DROP POLICY IF EXISTS "Public read balance" ON public.balance;
DROP POLICY IF EXISTS "Public insert balance" ON public.balance;
DROP POLICY IF EXISTS "Public update balance" ON public.balance;
DROP POLICY IF EXISTS "Public delete balance" ON public.balance;

DROP POLICY IF EXISTS "Public read journal" ON public.journal;
DROP POLICY IF EXISTS "Public insert journal" ON public.journal;
DROP POLICY IF EXISTS "Public update journal" ON public.journal;
DROP POLICY IF EXISTS "Public delete journal" ON public.journal;

DROP POLICY IF EXISTS "Public read plan_comptable" ON public.plan_comptable;
DROP POLICY IF EXISTS "Public insert plan_comptable" ON public.plan_comptable;
DROP POLICY IF EXISTS "Public update plan_comptable" ON public.plan_comptable;
DROP POLICY IF EXISTS "Public delete plan_comptable" ON public.plan_comptable;

CREATE POLICY "Users manage own entreprises" ON public.entreprises
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anon read demo entreprises" ON public.entreprises
  FOR SELECT TO anon, authenticated
  USING (user_id IS NULL);

CREATE POLICY "Users manage own exercices" ON public.exercices
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo exercices" ON public.exercices
  FOR SELECT TO anon, authenticated
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

CREATE POLICY "Users manage own balance" ON public.balance
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo balance" ON public.balance
  FOR SELECT TO anon, authenticated
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

CREATE POLICY "Users manage own journal" ON public.journal
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo journal" ON public.journal
  FOR SELECT TO anon, authenticated
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

CREATE POLICY "Users manage own plan_comptable" ON public.plan_comptable
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo plan_comptable" ON public.plan_comptable
  FOR SELECT TO anon, authenticated
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
