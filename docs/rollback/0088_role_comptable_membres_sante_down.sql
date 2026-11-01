-- Retour arrière de 0088 : définition d'origine (sans les membres des structures de santé).
CREATE OR REPLACE FUNCTION public.get_entreprise_role(_user_id uuid, _entreprise_id uuid)
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN NULL ELSE COALESCE(
    (SELECT 'admin'::public.app_role FROM public.entreprises e
      WHERE e.id = _entreprise_id AND e.user_id = _user_id),
    (SELECT cm.role FROM public.entreprises e
       JOIN public.cabinet_members cm ON cm.cabinet_id = e.cabinet_id
      WHERE e.id = _entreprise_id AND cm.user_id = _user_id LIMIT 1),
    (SELECT ur.role FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.entreprise_id = _entreprise_id LIMIT 1)
  ) END;
$function$;
