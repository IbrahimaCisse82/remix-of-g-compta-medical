-- Rôle comptable des membres d'une structure de santé (31/10/2026).
-- Constat (recette par profil) : le comptable d'une structure, et l'administrateur qui n'est pas propriétaire du
-- dossier, ne pouvaient ni saisir une écriture, ni enregistrer un salarié, un budget ou un mouvement de stock :
-- get_entreprise_role ne connaissait que le propriétaire, les membres de cabinet et user_roles, alors que la
-- lecture (get_user_entreprise_ids) acceptait déjà admin_structure, comptable, caissier et lecteur.
-- Ajout d'une quatrième source, après les trois existantes (inchangées) : membre actif d'une structure reliée
-- au dossier, MFA conforme. admin_structure → admin, comptable → comptable, caissier ou lecteur → lecteur.
-- can_write_entreprise et can_admin_entreprise s'appuient sur cette fonction ; l'écran (useUserRole) aussi.
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
      WHERE ur.user_id = _user_id AND ur.entreprise_id = _entreprise_id LIMIT 1),
    (SELECT CASE
              WHEN bool_or(r.role = 'admin_structure') THEN 'admin'
              WHEN bool_or(r.role = 'comptable') THEN 'comptable'
              WHEN bool_or(r.role IN ('caissier', 'lecteur')) THEN 'lecteur'
            END::public.app_role
       FROM public.structures s
       JOIN public.structure_memberships m ON m.structure_id = s.id AND m.statut = 'actif'
       JOIN public.medical_user_roles r ON r.membership_id = m.id
      WHERE s.entreprise_id = _entreprise_id AND m.user_id = _user_id
        AND (auth.uid() IS NULL OR coalesce(public.mfa_conforme(), false)))
  ) END;
$function$;
