-- 0120 — Consultations clôturées non facturées : liste pour l'accueil et la caisse, et facturation rattachée.
-- * La liste ne montre aucune donnée clinique (ni motif, ni diagnostic) : patient, date de clôture, praticien.
-- * La facturation passe par sante_creer_facture (droits, tiers payant, conventions, anti-doublon inchangés) après
--   avoir vérifié que la consultation est clôturée, de la même structure et du même patient.
-- * L'acte proposé est l'acte de consultation configuré pour la structure (structures.acte_consultation_code).
-- Retour : docs/rollback/0120_consultations_a_facturer_down.sql

CREATE OR REPLACE FUNCTION public.sante_consultations_a_facturer(_structure_id uuid, _jours int DEFAULT 30)
RETURNS TABLE(consultation_id uuid, cloturee_le timestamptz, patient_id uuid, numero_dossier text, patient text,
              praticien text, acte_code text, acte_libelle text, acte_tarif numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure', 'secretaire', 'caissier', 'medecin']) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.cloturee_le, p.id, p.numero_dossier, (p.nom || ' ' || p.prenoms)::text, pr.nom::text, a.code::text, a.libelle::text, a.tarif
    FROM public.sante_consultations c
    JOIN public.sante_patients p ON p.id = c.patient_id
    JOIN public.structures s ON s.id = c.structure_id
    LEFT JOIN public.sante_praticiens pr ON pr.id = c.praticien_id
    LEFT JOIN public.sante_actes a ON a.structure_id = c.structure_id AND a.code = s.acte_consultation_code AND a.actif
    WHERE c.structure_id = _structure_id AND c.statut = 'cloturee'
      AND c.cloturee_le >= now() - make_interval(days => greatest(least(coalesce(_jours, 30), 365), 1))
      AND NOT EXISTS (SELECT 1 FROM public.sante_facturation_sources f
                      WHERE f.source_type = 'consultation' AND f.source_id = c.id AND f.actif)
    ORDER BY c.cloturee_le DESC
    LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.sante_consultations_a_facturer(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_consultations_a_facturer(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_facturer_consultation(_consultation_id uuid, _patient_id uuid, _lignes jsonb, _assurance_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF c.id IS NULL OR NOT public.has_any_medical_role(c.structure_id, ARRAY['admin_structure', 'secretaire', 'caissier', 'medecin']) THEN
    RAISE EXCEPTION 'Consultation introuvable' USING ERRCODE = '42501';
  END IF;
  IF c.patient_id <> _patient_id THEN RAISE EXCEPTION 'Cette consultation concerne un autre patient'; END IF;
  IF c.statut <> 'cloturee' THEN RAISE EXCEPTION 'La consultation doit être clôturée par le médecin avant facturation'; END IF;
  RETURN public.sante_creer_facture(_patient_id, _lignes, _assurance_id, 0, NULL, _consultation_id, NULL);
END $$;
REVOKE ALL ON FUNCTION public.sante_facturer_consultation(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_facturer_consultation(uuid, uuid, jsonb, uuid) TO authenticated;
