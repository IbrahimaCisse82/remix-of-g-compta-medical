
-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'comptable', 'lecteur');

-- 2. Create cabinets table
CREATE TABLE public.cabinets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cabinets ENABLE ROW LEVEL SECURITY;

-- 3. Create cabinet_members table (roles per cabinet)
CREATE TABLE public.cabinet_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'comptable',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cabinet_id, user_id)
);
ALTER TABLE public.cabinet_members ENABLE ROW LEVEL SECURITY;

-- 4. Create invitations table
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.cabinets(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'comptable',
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cabinet_id, email)
);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- 5. Security definer function: check if user is member of a cabinet
CREATE OR REPLACE FUNCTION public.is_cabinet_member(_user_id UUID, _cabinet_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cabinet_members
    WHERE user_id = _user_id AND cabinet_id = _cabinet_id
  );
$$;

-- 6. Security definer function: check cabinet role
CREATE OR REPLACE FUNCTION public.get_cabinet_role(_user_id UUID, _cabinet_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.cabinet_members
  WHERE user_id = _user_id AND cabinet_id = _cabinet_id
  LIMIT 1;
$$;

-- 7. Security definer function: get all entreprise IDs user can access (owned + cabinet shared)
CREATE OR REPLACE FUNCTION public.get_user_entreprise_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Owned entreprises
  SELECT id FROM public.entreprises WHERE user_id = _user_id
  UNION
  -- Cabinet entreprises (user is a member of the cabinet)
  SELECT e.id FROM public.entreprises e
  INNER JOIN public.cabinet_members cm ON cm.cabinet_id = e.cabinet_id
  WHERE cm.user_id = _user_id;
$$;

-- 8. RLS policies for cabinets
CREATE POLICY "Owner manages cabinet"
  ON public.cabinets FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Members read cabinet"
  ON public.cabinets FOR SELECT TO authenticated
  USING (public.is_cabinet_member(auth.uid(), id));

-- 9. RLS policies for cabinet_members
CREATE POLICY "Admin manages members"
  ON public.cabinet_members FOR ALL TO authenticated
  USING (
    public.get_cabinet_role(auth.uid(), cabinet_id) = 'admin'
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.get_cabinet_role(auth.uid(), cabinet_id) = 'admin'
  );

CREATE POLICY "Members read members"
  ON public.cabinet_members FOR SELECT TO authenticated
  USING (public.is_cabinet_member(auth.uid(), cabinet_id));

-- 10. RLS policies for invitations
CREATE POLICY "Admin manages invitations"
  ON public.invitations FOR ALL TO authenticated
  USING (
    public.get_cabinet_role(auth.uid(), cabinet_id) = 'admin'
  )
  WITH CHECK (
    public.get_cabinet_role(auth.uid(), cabinet_id) = 'admin'
  );

CREATE POLICY "Invitee reads own invitation"
  ON public.invitations FOR SELECT TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
