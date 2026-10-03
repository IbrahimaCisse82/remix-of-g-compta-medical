DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_generer_alertes_echeances() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_balance() FROM authenticated;
ALTER TABLE public.portail_acces ADD COLUMN IF NOT EXISTS jeton text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24),'hex');