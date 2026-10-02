CREATE TYPE public.structure_type AS ENUM ('cabinet', 'laboratoire', 'mixte');
CREATE TYPE public.medical_role AS ENUM ('admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire', 'caissier', 'comptable', 'lecteur');
CREATE TYPE public.membership_status AS ENUM ('invite', 'actif', 'suspendu');
CREATE TYPE public.medical_theme AS ENUM ('clinique', 'laboratoire', 'urgences');

CREATE TABLE public.structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.structure_type NOT NULL,
  nom text NOT NULL CHECK (char_length(trim(nom)) >= 2),
  ninea text,
  rccm text,
  autorisation_exercice text,
  inscription_ordre text,
  adresse text,
  telephone text,
  logo_path text,
  devise text NOT NULL DEFAULT 'XOF' CHECK (devise = 'XOF'),
  theme_medical public.medical_theme NOT NULL DEFAULT 'clinique',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.structures TO authenticated;
GRANT ALL ON public.structures TO service_role;
ALTER TABLE public.structures ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  nom text NOT NULL,
  adresse text,
  telephone text,
  principal boolean NOT NULL DEFAULT false,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, nom)
);
GRANT SELECT, INSERT, UPDATE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.structure_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  statut public.membership_status NOT NULL DEFAULT 'invite',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, user_id)
);
GRANT SELECT ON public.structure_memberships TO authenticated;
GRANT ALL ON public.structure_memberships TO service_role;
ALTER TABLE public.structure_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.medical_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.structure_memberships(id) ON DELETE CASCADE,
  role public.medical_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, role)
);
GRANT SELECT ON public.medical_user_roles TO authenticated;
GRANT ALL ON public.medical_user_roles TO service_role;
ALTER TABLE public.medical_user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.medical_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  email text NOT NULL,
  role public.medical_role NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','acceptee','expiree','annulee')),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.medical_invitations TO authenticated;
GRANT ALL ON public.medical_invitations TO service_role;
ALTER TABLE public.medical_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.medical_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medical_audit_log TO authenticated;
GRANT ALL ON public.medical_audit_log TO service_role;
ALTER TABLE public.medical_audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.medical_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_id uuid,
  ecran text NOT NULL,
  motif text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medical_access_log TO authenticated;
GRANT ALL ON public.medical_access_log TO service_role;
ALTER TABLE public.medical_access_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sites_structure ON public.sites(structure_id);
CREATE INDEX idx_structure_memberships_user ON public.structure_memberships(user_id, structure_id);
CREATE INDEX idx_medical_roles_membership ON public.medical_user_roles(membership_id, role);
CREATE INDEX idx_medical_invitations_structure_email ON public.medical_invitations(structure_id, email);
CREATE INDEX idx_medical_audit_structure_date ON public.medical_audit_log(structure_id, created_at DESC);
CREATE INDEX idx_medical_access_structure_date ON public.medical_access_log(structure_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_structure_member(_structure_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.structure_memberships m
    WHERE m.structure_id = _structure_id
      AND m.user_id = auth.uid()
      AND m.statut = 'actif'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_medical_role(_structure_id uuid, _role public.medical_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.structure_memberships m
    JOIN public.medical_user_roles r ON r.membership_id = m.id
    WHERE m.structure_id = _structure_id
      AND m.user_id = auth.uid()
      AND m.statut = 'actif'
      AND r.role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_structure_admin(_structure_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_medical_role(_structure_id, 'admin_structure'::public.medical_role)
$$;

REVOKE ALL ON FUNCTION public.is_structure_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_medical_role(uuid, public.medical_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_structure_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_structure_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_medical_role(uuid, public.medical_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_structure_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_medical_structure(
  _type public.structure_type,
  _nom text,
  _ninea text DEFAULT NULL,
  _rccm text DEFAULT NULL,
  _autorisation_exercice text DEFAULT NULL,
  _inscription_ordre text DEFAULT NULL,
  _adresse text DEFAULT NULL,
  _telephone text DEFAULT NULL,
  _theme public.medical_theme DEFAULT 'clinique'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _structure_id uuid;
  _membership_id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF char_length(trim(_nom)) < 2 THEN RAISE EXCEPTION 'Nom de structure invalide'; END IF;

  INSERT INTO public.structures(type, nom, ninea, rccm, autorisation_exercice, inscription_ordre, adresse, telephone, theme_medical, created_by)
  VALUES (_type, trim(_nom), nullif(trim(_ninea),''), nullif(trim(_rccm),''), nullif(trim(_autorisation_exercice),''), nullif(trim(_inscription_ordre),''), nullif(trim(_adresse),''), nullif(trim(_telephone),''), _theme, _user_id)
  RETURNING id INTO _structure_id;

  INSERT INTO public.structure_memberships(structure_id, user_id, statut)
  VALUES (_structure_id, _user_id, 'actif') RETURNING id INTO _membership_id;

  INSERT INTO public.medical_user_roles(membership_id, role)
  VALUES (_membership_id, 'admin_structure');

  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, _user_id, 'CREATE', 'structures', _structure_id, jsonb_build_object('type', _type, 'nom', trim(_nom)));

  RETURN _structure_id;
END
$$;
REVOKE ALL ON FUNCTION public.create_medical_structure(public.structure_type,text,text,text,text,text,text,text,public.medical_theme) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_medical_structure(public.structure_type,text,text,text,text,text,text,text,public.medical_theme) TO authenticated;

CREATE POLICY "Members read structures" ON public.structures FOR SELECT TO authenticated USING (public.is_structure_member(id));
CREATE POLICY "Users create own structures through RPC" ON public.structures FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Admins update structures" ON public.structures FOR UPDATE TO authenticated USING (public.is_structure_admin(id)) WITH CHECK (public.is_structure_admin(id));

CREATE POLICY "Members read sites" ON public.sites FOR SELECT TO authenticated USING (public.is_structure_member(structure_id));
CREATE POLICY "Admins insert sites" ON public.sites FOR INSERT TO authenticated WITH CHECK (public.is_structure_admin(structure_id));
CREATE POLICY "Admins update sites" ON public.sites FOR UPDATE TO authenticated USING (public.is_structure_admin(structure_id)) WITH CHECK (public.is_structure_admin(structure_id));

CREATE POLICY "Members read memberships" ON public.structure_memberships FOR SELECT TO authenticated USING (public.is_structure_member(structure_id));
CREATE POLICY "Members read medical roles" ON public.medical_user_roles FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.structure_memberships m WHERE m.id = membership_id AND public.is_structure_member(m.structure_id)));

CREATE POLICY "Admins read invitations" ON public.medical_invitations FOR SELECT TO authenticated USING (public.is_structure_admin(structure_id));
CREATE POLICY "Admins create invitations" ON public.medical_invitations FOR INSERT TO authenticated WITH CHECK (public.is_structure_admin(structure_id) AND invited_by = auth.uid());
CREATE POLICY "Admins update invitations" ON public.medical_invitations FOR UPDATE TO authenticated USING (public.is_structure_admin(structure_id)) WITH CHECK (public.is_structure_admin(structure_id));

CREATE POLICY "Admins read audit" ON public.medical_audit_log FOR SELECT TO authenticated USING (public.is_structure_admin(structure_id));
CREATE POLICY "Authorized staff read access log" ON public.medical_access_log FOR SELECT TO authenticated USING (public.is_structure_admin(structure_id) OR public.has_medical_role(structure_id, 'medecin') OR public.has_medical_role(structure_id, 'biologiste'));

CREATE OR REPLACE FUNCTION public.audit_medical_structure_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (COALESCE(NEW.id, OLD.id), auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), to_jsonb(OLD), to_jsonb(NEW));
  RETURN COALESCE(NEW, OLD);
END
$$;
REVOKE ALL ON FUNCTION public.audit_medical_structure_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_medical_structure_change() TO service_role;

CREATE TRIGGER trg_audit_structures AFTER UPDATE ON public.structures FOR EACH ROW EXECUTE FUNCTION public.audit_medical_structure_change();