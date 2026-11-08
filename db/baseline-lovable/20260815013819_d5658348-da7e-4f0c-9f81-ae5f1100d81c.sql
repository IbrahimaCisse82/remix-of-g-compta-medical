CREATE OR REPLACE FUNCTION public.fn_resync_balance(_entreprise_id uuid, _exercice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer := 0;
BEGIN
  IF NOT public.can_write_entreprise(_entreprise_id) THEN
    RAISE EXCEPTION 'Droits insuffisants sur cette entreprise';
  END IF;
  IF public.exercice_est_cloture(_exercice_id) THEN
    RAISE EXCEPTION 'Exercice clôturé : resynchronisation impossible';
  END IF;

  PERFORM public.fn_refresh_balance();

  DELETE FROM public.balance WHERE entreprise_id = _entreprise_id AND exercice_id = _exercice_id;

  INSERT INTO public.balance (entreprise_id, exercice_id, compte, intitule, sd, sc, md, mc, sfd, sfc)
  SELECT _entreprise_id, _exercice_id, b.compte, COALESCE(b.intitule, ''), 0, 0, b.md, b.mc, b.sfd, b.sfc
  FROM public.fn_balance(_entreprise_id, _exercice_id) b;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_resync_balance(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resync_balance(uuid, uuid) TO authenticated, service_role;