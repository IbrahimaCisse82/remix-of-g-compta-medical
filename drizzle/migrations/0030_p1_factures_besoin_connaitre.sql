DROP POLICY IF EXISTS "Lecture facturation" ON public.sante_factures;
CREATE POLICY "Lecture facturation" ON public.sante_factures FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','caissier','comptable','tiers_payant']));
DROP POLICY IF EXISTS "Lecture lignes" ON public.sante_facture_lignes;
CREATE POLICY "Lecture lignes" ON public.sante_facture_lignes FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','caissier','tiers_payant']));
DROP POLICY IF EXISTS "Lecture encaissements" ON public.sante_encaissements;
CREATE POLICY "Lecture encaissements" ON public.sante_encaissements FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','caissier','comptable','tiers_payant']));