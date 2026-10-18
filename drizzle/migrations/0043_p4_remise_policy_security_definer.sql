CREATE OR REPLACE FUNCTION public.sante_remise_possible(_demande_id uuid, _structure_id uuid, _patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.sante_demandes_labo d WHERE d.id = _demande_id AND d.structure_id = _structure_id AND d.patient_id = _patient_id AND d.statut = 'validee');
$$;
REVOKE ALL ON FUNCTION public.sante_remise_possible(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_remise_possible(uuid, uuid, uuid) TO authenticated, service_role;
DROP POLICY "remises ajout" ON public.sante_remises_resultats;
CREATE POLICY "remises ajout" ON public.sante_remises_resultats FOR INSERT TO authenticated
  WITH CHECK (remis_par = auth.uid()
    AND public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','secretaire'])
    AND public.sante_remise_possible(demande_id, structure_id, patient_id));