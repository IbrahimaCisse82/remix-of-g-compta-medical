CREATE OR REPLACE FUNCTION public.audit_sante_row()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _sid uuid; _j jsonb := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  IF _j ? 'structure_id' THEN _sid := (_j->>'structure_id')::uuid;
  ELSE SELECT structure_id INTO _sid FROM public.sante_patients WHERE id = (_j->>'patient_id')::uuid; END IF;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (_sid, auth.uid(), TG_OP, TG_TABLE_NAME, (_j->>'id')::uuid,
    CASE WHEN TG_OP <> 'INSERT' THEN jsonb_build_object('id', OLD.id) END,
    CASE WHEN TG_OP <> 'DELETE' THEN jsonb_build_object('id', NEW.id) END);
  RETURN COALESCE(NEW, OLD);
END $function$;