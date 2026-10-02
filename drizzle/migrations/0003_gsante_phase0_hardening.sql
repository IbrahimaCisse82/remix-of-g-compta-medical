ALTER TABLE public.structures FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.structure_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.medical_user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.medical_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.medical_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.medical_access_log FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_medical_site(_structure_id uuid, _nom text, _adresse text DEFAULT NULL, _telephone text DEFAULT NULL, _principal boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _site_id uuid;
BEGIN
  IF NOT public.is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF char_length(trim(_nom)) < 2 THEN RAISE EXCEPTION 'Nom de site invalide'; END IF;
  IF _principal THEN UPDATE public.sites SET principal = false WHERE structure_id = _structure_id; END IF;
  INSERT INTO public.sites(structure_id, nom, adresse, telephone, principal)
  VALUES (_structure_id, trim(_nom), nullif(trim(_adresse),''), nullif(trim(_telephone),''), _principal)
  RETURNING id INTO _site_id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'CREATE', 'sites', _site_id, jsonb_build_object('nom', trim(_nom), 'principal', _principal));
  RETURN _site_id;
END
$$;
REVOKE ALL ON FUNCTION public.create_medical_site(uuid,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_medical_site(uuid,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_medical_invitation(_structure_id uuid, _email text, _role public.medical_role, _site_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.create_medical_invitation(uuid,text,public.medical_role,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_medical_invitation(uuid,text,public.medical_role,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_medical_invitation(_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _user_email text;
  _inv public.medical_invitations%ROWTYPE;
  _membership_id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT lower(email) INTO _user_email FROM auth.users WHERE id = _user_id;
  SELECT * INTO _inv FROM public.medical_invitations WHERE id = _invitation_id FOR UPDATE;
  IF NOT FOUND OR _inv.statut <> 'en_attente' OR _inv.expires_at <= now() OR lower(_inv.email) <> _user_email THEN
    RAISE EXCEPTION 'Invitation invalide ou expirée';
  END IF;
  INSERT INTO public.structure_memberships(structure_id, user_id, site_id, statut)
  VALUES (_inv.structure_id, _user_id, _inv.site_id, 'actif')
  ON CONFLICT (structure_id, user_id) DO UPDATE SET site_id = EXCLUDED.site_id, statut = 'actif', updated_at = now()
  RETURNING id INTO _membership_id;
  INSERT INTO public.medical_user_roles(membership_id, role) VALUES (_membership_id, _inv.role)
  ON CONFLICT (membership_id, role) DO NOTHING;
  UPDATE public.medical_invitations SET statut = 'acceptee' WHERE id = _invitation_id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_inv.structure_id, _user_id, 'ACCEPT', 'medical_invitations', _invitation_id, jsonb_build_object('membership_id', _membership_id));
  RETURN _inv.structure_id;
END
$$;
REVOKE ALL ON FUNCTION public.accept_medical_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_medical_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_medical_theme(_structure_id uuid, _theme public.medical_theme)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.structures SET theme_medical = _theme, updated_at = now() WHERE id = _structure_id;
END
$$;
REVOKE ALL ON FUNCTION public.set_medical_theme(uuid,public.medical_theme) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_medical_theme(uuid,public.medical_theme) TO authenticated;