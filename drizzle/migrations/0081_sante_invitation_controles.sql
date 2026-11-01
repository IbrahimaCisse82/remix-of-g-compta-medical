-- Invitations : mêmes contrôles que la gestion d'équipe (31/10/2026).
-- Avant : create_medical_invitation ne vérifiait ni la MFA ni la compatibilité rôle / type de structure,
-- alors que sante_equipe_modifier les impose (une invitation « biologiste » dans un cabinet pouvait être acceptée).
-- Ajout : invitation déjà en attente pour le même e-mail et le même rôle → renvoie la même (pas de doublon,
-- import d'équipe relançable). Signature et valeur de retour inchangées. Aucune invitation existante n'est
-- concernée (0 invitation incompatible en attente au 31/10).
CREATE OR REPLACE FUNCTION public.create_medical_invitation(_structure_id uuid, _email text, _role medical_role, _site_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _invitation_id uuid;
  _type public.structure_type;
  _mail text := lower(trim(coalesce(_email, '')));
BEGIN
  IF NOT coalesce(public.is_structure_admin(_structure_id), false) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT coalesce(public.mfa_conforme(), false) THEN
    RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes avant d''inviter.';
  END IF;
  IF _mail !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN RAISE EXCEPTION 'Adresse email invalide'; END IF;
  IF _site_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sites WHERE id = _site_id AND structure_id = _structure_id) THEN
    RAISE EXCEPTION 'Site invalide';
  END IF;
  SELECT type INTO _type FROM public.structures WHERE id = _structure_id;
  IF (_type = 'cabinet' AND _role::text IN ('biologiste','technicien','preleveur')) OR (_type = 'laboratoire' AND _role::text = 'medecin') THEN
    RAISE EXCEPTION 'Rôle incompatible avec la structure : % dans un %', _role, _type;
  END IF;
  SELECT id INTO _invitation_id FROM public.medical_invitations
   WHERE structure_id = _structure_id AND lower(email) = _mail AND role = _role AND statut = 'en_attente' AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;
  IF _invitation_id IS NOT NULL THEN RETURN _invitation_id; END IF;
  INSERT INTO public.medical_invitations(structure_id, site_id, email, role, invited_by)
  VALUES (_structure_id, _site_id, _mail, _role, auth.uid())
  RETURNING id INTO _invitation_id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'CREATE', 'medical_invitations', _invitation_id, jsonb_build_object('email', _mail, 'role', _role));
  RETURN _invitation_id;
END
$function$;
