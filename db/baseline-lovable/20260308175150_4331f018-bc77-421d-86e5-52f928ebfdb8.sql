
-- =============================================
-- FIX: All RLS policies are RESTRICTIVE (should be PERMISSIVE)
-- Drop all existing policies and recreate as PERMISSIVE
-- =============================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- BALANCE
CREATE POLICY "Users manage own balance" ON public.balance
  AS PERMISSIVE FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo balance" ON public.balance
  AS PERMISSIVE FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

-- ENTREPRISES
CREATE POLICY "Users manage own entreprises" ON public.entreprises
  AS PERMISSIVE FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anon read demo entreprises" ON public.entreprises
  AS PERMISSIVE FOR SELECT TO anon
  USING (user_id IS NULL);

-- EXERCICES
CREATE POLICY "Users manage own exercices" ON public.exercices
  AS PERMISSIVE FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo exercices" ON public.exercices
  AS PERMISSIVE FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

-- JOURNAL
CREATE POLICY "Users manage own journal" ON public.journal
  AS PERMISSIVE FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo journal" ON public.journal
  AS PERMISSIVE FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

-- PLAN_COMPTABLE
CREATE POLICY "Users manage own plan_comptable" ON public.plan_comptable
  AS PERMISSIVE FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo plan_comptable" ON public.plan_comptable
  AS PERMISSIVE FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM public.entreprises WHERE user_id IS NULL));

-- PROFILES
CREATE POLICY "Users read own profile" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users update own profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users insert own profile" ON public.profiles
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
