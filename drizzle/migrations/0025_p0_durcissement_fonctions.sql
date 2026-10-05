-- P0.2 — Fonctions SECURITY DEFINER acceptant un _user_id : plus d'interrogation des droits d'un autre utilisateur.
-- Retour arrière : docs/rollback/p0_durcissement_fonctions_down.sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_entreprise_role(_user_id uuid, _entreprise_id uuid)
 RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN NULL ELSE COALESCE(
    (SELECT 'admin'::public.app_role FROM public.entreprises e
      WHERE e.id = _entreprise_id AND e.user_id = _user_id),
    (SELECT cm.role FROM public.entreprises e
       JOIN public.cabinet_members cm ON cm.cabinet_id = e.cabinet_id
      WHERE e.id = _entreprise_id AND cm.user_id = _user_id LIMIT 1),
    (SELECT ur.role FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.entreprise_id = _entreprise_id LIMIT 1)
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.get_cabinet_role(_user_id uuid, _cabinet_id uuid)
 RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT role FROM public.cabinet_members
  WHERE user_id = _user_id AND cabinet_id = _cabinet_id
    AND (auth.uid() IS NULL OR _user_id = auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_cabinet_member(_user_id uuid, _cabinet_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid()) AND EXISTS (
    SELECT 1 FROM public.cabinet_members WHERE user_id = _user_id AND cabinet_id = _cabinet_id);
$$;

CREATE OR REPLACE FUNCTION public.get_user_entreprise_ids(_user_id uuid)
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id FROM public.entreprises WHERE user_id = _user_id AND (auth.uid() IS NULL OR _user_id = auth.uid())
  UNION
  SELECT e.id FROM public.entreprises e
  INNER JOIN public.cabinet_members cm ON cm.cabinet_id = e.cabinet_id
  WHERE cm.user_id = _user_id AND (auth.uid() IS NULL OR _user_id = auth.uid());
$$;

-- Fonctions de déclencheur : jamais appelables par les clients.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
  END LOOP;
END $$;

-- Table du jeton de tâche planifiée : aucun privilège client (RLS sans politique déjà active).
REVOKE ALL ON public.sante_cron_config FROM anon, authenticated;