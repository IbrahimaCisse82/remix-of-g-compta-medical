-- 0126 — Rattacher une facture déjà émise (à la main) à la consultation qu'elle paie, pour qu'elle sorte de
-- « Consultations à facturer » et ne soit pas facturée une seconde fois. La facture elle-même n'est pas modifiée
-- (elle est immuable) : le lien passe par sante_facturation_sources, comme pour une facture émise depuis la consultation.
-- Retour : docs/rollback/0126_rattachement_facture_consultation_down.sql

-- Factures candidates : même patient, facture active, sans consultation déjà rattachée, émises à ±60 jours.
CREATE OR REPLACE FUNCTION public.sante_factures_rattachables(_consultation_id uuid)
RETURNS TABLE(facture_id uuid, numero text, total numeric, emise_le timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF c.id IS NULL OR NOT public.has_any_medical_role(c.structure_id, ARRAY['admin_structure', 'secretaire', 'caissier', 'medecin']) THEN
    RAISE EXCEPTION 'Consultation introuvable' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT f.id, f.numero, f.total, f.created_at FROM public.sante_factures f
    WHERE f.structure_id = c.structure_id AND f.patient_id = c.patient_id AND f.type = 'facture' AND NOT f.annulee
      AND f.consultation_id IS NULL
      AND f.created_at BETWEEN c.created_at - interval '60 days' AND c.created_at + interval '60 days'
      AND NOT EXISTS (SELECT 1 FROM public.sante_facturation_sources s WHERE s.facture_id = f.id AND s.source_type = 'consultation' AND s.actif)
    ORDER BY abs(extract(epoch FROM f.created_at - c.created_at));
END $$;
REVOKE ALL ON FUNCTION public.sante_factures_rattachables(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_factures_rattachables(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_rattacher_facture_consultation(_consultation_id uuid, _facture_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; f public.sante_factures;
BEGIN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id FOR UPDATE;
  IF c.id IS NULL OR NOT public.has_any_medical_role(c.structure_id, ARRAY['admin_structure', 'secretaire', 'caissier', 'medecin']) THEN
    RAISE EXCEPTION 'Consultation introuvable' USING ERRCODE = '42501';
  END IF;
  IF c.statut <> 'cloturee' THEN RAISE EXCEPTION 'La consultation doit être clôturée'; END IF;
  SELECT * INTO f FROM public.sante_factures WHERE id = _facture_id;
  IF f.id IS NULL OR f.structure_id <> c.structure_id THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF f.patient_id <> c.patient_id THEN RAISE EXCEPTION 'Cette facture concerne un autre patient'; END IF;
  IF f.type <> 'facture' OR f.annulee THEN RAISE EXCEPTION 'Facture annulée ou avoir : rattachement impossible'; END IF;
  IF f.consultation_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.sante_facturation_sources s
       WHERE s.facture_id = f.id AND s.source_type = 'consultation' AND s.actif) THEN
    RAISE EXCEPTION 'Cette facture est déjà rattachée à une consultation';
  END IF;
  BEGIN
    INSERT INTO public.sante_facturation_sources(structure_id, source_type, source_id, facture_id)
    VALUES (c.structure_id, 'consultation', c.id, f.id);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Cette consultation est déjà facturée';
  END;
END $$;
REVOKE ALL ON FUNCTION public.sante_rattacher_facture_consultation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_rattacher_facture_consultation(uuid, uuid) TO authenticated;
