CREATE OR REPLACE FUNCTION public.sante_config_rappels(_structure_id uuid, _actifs boolean, _expediteur text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e text := nullif(trim(_expediteur),'');
BEGIN
  IF NOT public.is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF _e IS NOT NULL AND _e !~ '^\+[1-9][0-9]{7,14}$' AND NOT (_e ~ '^[A-Za-z0-9 ]{3,11}$' AND _e ~ '[A-Za-z]') THEN
    RAISE EXCEPTION 'Expéditeur : numéro international (+221…) ou nom de 3 à 11 caractères (ex. CLINIQUE)'; END IF;
  IF coalesce(_actifs,false) AND _e IS NULL THEN RAISE EXCEPTION 'Renseignez un expéditeur avant d''activer les rappels'; END IF;
  UPDATE public.structures SET rappels_sms_actifs = coalesce(_actifs,false), sms_expediteur = _e WHERE id = _structure_id;
END $$;