-- Retour arrière de la migration 0025_p0_durcissement_fonctions (à exécuter par un rôle propriétaire).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;
CREATE OR REPLACE FUNCTION public.get_cabinet_role(_user_id uuid, _cabinet_id uuid) RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.cabinet_members WHERE user_id = _user_id AND cabinet_id = _cabinet_id LIMIT 1; $$;
CREATE OR REPLACE FUNCTION public.is_cabinet_member(_user_id uuid, _cabinet_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.cabinet_members WHERE user_id = _user_id AND cabinet_id = _cabinet_id); $$;
CREATE OR REPLACE FUNCTION public.get_user_entreprise_ids(_user_id uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT id FROM public.entreprises WHERE user_id = _user_id
      UNION SELECT e.id FROM public.entreprises e JOIN public.cabinet_members cm ON cm.cabinet_id = e.cabinet_id WHERE cm.user_id = _user_id; $$;
CREATE OR REPLACE FUNCTION public.get_entreprise_role(_user_id uuid, _entreprise_id uuid) RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE(
  (SELECT 'admin'::public.app_role FROM public.entreprises e WHERE e.id = _entreprise_id AND e.user_id = _user_id),
  (SELECT cm.role FROM public.entreprises e JOIN public.cabinet_members cm ON cm.cabinet_id = e.cabinet_id WHERE e.id = _entreprise_id AND cm.user_id = _user_id LIMIT 1),
  (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.entreprise_id = _entreprise_id LIMIT 1)); $$;
-- Les fonctions de déclencheur n'ont pas besoin d'être ré-ouvertes (non appelables directement).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sante_cron_config TO authenticated; -- état antérieur (RLS sans politique : toujours inaccessible)
