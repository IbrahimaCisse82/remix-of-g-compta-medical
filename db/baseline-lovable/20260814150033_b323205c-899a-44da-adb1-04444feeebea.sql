DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_creer_ecriture(uuid,uuid,text,date,text,jsonb,text,text,text)',
    'public.fn_contrepasser_ecriture(uuid,text)',
    'public.fn_valider_ecriture(uuid)',
    'public.fn_rouvrir_exercice(uuid,text)',
    'public.fn_refresh_balance()',
    'public.fn_balance_ecarts(uuid,uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.get_entreprise_role(uuid,uuid)',
    'public.get_cabinet_role(uuid,uuid)',
    'public.is_cabinet_member(uuid,uuid)',
    'public.can_write_entreprise(uuid)',
    'public.can_admin_entreprise(uuid)',
    'public.get_user_entreprise_ids(uuid)'
  ]
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'fonction absente: %', fn;
    END;
  END LOOP;
END $$;