-- Retour arrière de 0081 : version d'origine de create_medical_invitation (sans MFA, sans contrôle de compatibilité).
-- Déconseillé : réintroduit les invitations incompatibles avec le type de structure.
CREATE OR REPLACE FUNCTION public.create_medical_invitation(_structure_id uuid, _email text, _role medical_role, _site_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _invitation_id uuid;
BEGIN
  IF NOT public.is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF position('@' in _email) < 2 THEN RAISE EXCEPTION 'Adresse email invalide'; END IF;
  IF _site_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sites WHERE id = _site_id AND structure_id = _structure_id) THEN
    RAISE EXCEPTION 'Site invalide';
  END IF;
  INSERT INTO public.medical_invitations(structure_id, site_id, email, role, invited_by)
  VALUES (_structure_id, _site_id, lower(trim(_email)), _role, auth.uid())
  RETURNING id INTO _invitation_id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'CREATE', 'medical_invitations', _invitation_id, jsonb_build_object('email', lower(trim(_email)), 'role', _role));
  RETURN _invitation_id;
END
$function$;
