CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sante_patients p WHERE p.id = _patient_id
    AND public.structure_module_actif(p.structure_id, 'sante_patients')
    AND public.has_any_medical_role(p.structure_id, ARRAY['admin_structure','medecin','biologiste','technicien','preleveur','secretaire','caissier','tiers_payant']))
$$;