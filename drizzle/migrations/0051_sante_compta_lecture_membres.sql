-- Les membres d'une structure santé ayant un rôle à vocation comptable
-- (comptable, caissier, admin_structure, lecteur) doivent voir l'entreprise
-- comptable liée à leur structure, sinon l'espace santé affiche « Entreprise — »
-- et un journal vide.

CREATE OR REPLACE FUNCTION public.get_user_entreprise_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM public.entreprises WHERE user_id = _user_id AND (auth.uid() IS NULL OR _user_id = auth.uid())
  UNION
  SELECT e.id FROM public.entreprises e
  INNER JOIN public.cabinet_members cm ON cm.cabinet_id = e.cabinet_id
  WHERE cm.user_id = _user_id AND (auth.uid() IS NULL OR _user_id = auth.uid())
  UNION
  SELECT s.entreprise_id FROM public.structures s
  INNER JOIN public.structure_memberships sm ON sm.structure_id = s.id AND sm.statut = 'actif'
  INNER JOIN public.medical_user_roles mr ON mr.membership_id = sm.id
  WHERE sm.user_id = _user_id AND s.entreprise_id IS NOT NULL
    AND mr.role IN ('comptable', 'caissier', 'admin_structure', 'lecteur')
    AND (auth.uid() IS NULL OR _user_id = auth.uid());
$function$;

-- Lecture de la fiche entreprise elle-même (les politiques existantes
-- n'utilisent pas get_user_entreprise_ids).
CREATE POLICY "Membres santé lisent l'entreprise liée" ON public.entreprises
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.structures s
    INNER JOIN public.structure_memberships sm ON sm.structure_id = s.id AND sm.statut = 'actif'
    INNER JOIN public.medical_user_roles mr ON mr.membership_id = sm.id
    WHERE s.entreprise_id = entreprises.id
      AND sm.user_id = auth.uid()
      AND mr.role IN ('comptable', 'caissier', 'admin_structure', 'lecteur')
  )
);