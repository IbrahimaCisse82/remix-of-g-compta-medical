
-- =============================================
-- FIX 1: Change ALL RLS policies from RESTRICTIVE to PERMISSIVE
-- =============================================

-- Drop all existing policies and recreate as PERMISSIVE

-- ENTREPRISES
DROP POLICY IF EXISTS "Users manage own entreprises" ON public.entreprises;
DROP POLICY IF EXISTS "Anon read demo entreprises" ON public.entreprises;

CREATE POLICY "Users manage own entreprises" ON public.entreprises
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anon read demo entreprises" ON public.entreprises
  FOR SELECT TO anon
  USING (user_id IS NULL);

-- EXERCICES
DROP POLICY IF EXISTS "Users manage own exercices" ON public.exercices;
DROP POLICY IF EXISTS "Anon read demo exercices" ON public.exercices;

CREATE POLICY "Users manage own exercices" ON public.exercices
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo exercices" ON public.exercices
  FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));

-- BALANCE
DROP POLICY IF EXISTS "Users manage own balance" ON public.balance;
DROP POLICY IF EXISTS "Anon read demo balance" ON public.balance;

CREATE POLICY "Users manage own balance" ON public.balance
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo balance" ON public.balance
  FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));

-- JOURNAL
DROP POLICY IF EXISTS "Users manage own journal" ON public.journal;
DROP POLICY IF EXISTS "Anon read demo journal" ON public.journal;

CREATE POLICY "Users manage own journal" ON public.journal
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo journal" ON public.journal
  FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));

-- PLAN_COMPTABLE
DROP POLICY IF EXISTS "Users manage own plan_comptable" ON public.plan_comptable;
DROP POLICY IF EXISTS "Anon read demo plan_comptable" ON public.plan_comptable;

CREATE POLICY "Users manage own plan_comptable" ON public.plan_comptable
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo plan_comptable" ON public.plan_comptable
  FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));

-- PROFILES
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;

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

-- =============================================
-- FIX 2: Create missing trigger for handle_new_user
-- =============================================
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
