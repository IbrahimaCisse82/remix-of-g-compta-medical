CREATE TABLE public.sante_remises_resultats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  demande_id uuid NOT NULL REFERENCES public.sante_demandes_labo(id),
  patient_id uuid NOT NULL,
  beneficiaire text NOT NULL CHECK (beneficiaire IN ('patient','mandataire')),
  nom_mandataire text,
  piece_type text NOT NULL,
  piece_numero text NOT NULL CHECK (length(trim(piece_numero)) >= 4),
  procuration boolean NOT NULL DEFAULT false,
  remis_par uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (beneficiaire = 'patient' OR (procuration AND length(trim(coalesce(nom_mandataire,''))) >= 3))
);
GRANT SELECT, INSERT ON public.sante_remises_resultats TO authenticated;
GRANT ALL ON public.sante_remises_resultats TO service_role;
ALTER TABLE public.sante_remises_resultats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "remises lecture" ON public.sante_remises_resultats FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','secretaire','technicien']));
CREATE POLICY "remises ajout" ON public.sante_remises_resultats FOR INSERT TO authenticated
  WITH CHECK (remis_par = auth.uid()
    AND public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','secretaire'])
    AND EXISTS (SELECT 1 FROM public.sante_demandes_labo d WHERE d.id = demande_id AND d.structure_id = sante_remises_resultats.structure_id AND d.patient_id = sante_remises_resultats.patient_id AND d.statut = 'validee'));
CREATE POLICY "remises mfa" ON public.sante_remises_resultats AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());