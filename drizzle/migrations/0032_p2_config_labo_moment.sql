CREATE OR REPLACE FUNCTION public.sante_config_labo_moment(_structure_id uuid, _moment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF _moment NOT IN ('enregistrement','validation') THEN RAISE EXCEPTION 'Valeur invalide'; END IF;
  UPDATE structures SET facturation_labo_moment = _moment WHERE id = _structure_id;
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'config_facturation_labo', 'structures', _structure_id, jsonb_build_object('moment', _moment));
END $$;
REVOKE ALL ON FUNCTION public.sante_config_labo_moment(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_config_labo_moment(uuid,text) TO authenticated;