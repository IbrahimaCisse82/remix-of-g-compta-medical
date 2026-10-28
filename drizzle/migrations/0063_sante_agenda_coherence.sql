CREATE OR REPLACE FUNCTION public.sante_rdv_coherence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
 IF TG_OP='UPDATE' AND (NEW.structure_id<>OLD.structure_id OR NEW.patient_id<>OLD.patient_id) THEN RAISE EXCEPTION 'Le patient et la structure du rendez-vous ne peuvent pas être remplacés'; END IF;
 PERFORM 1 FROM public.sante_praticiens WHERE id=NEW.praticien_id AND structure_id=NEW.structure_id AND actif FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Praticien actif de la structure requis'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sante_patients WHERE id=NEW.patient_id AND structure_id=NEW.structure_id AND statut='actif') THEN RAISE EXCEPTION 'Patient actif de la structure requis'; END IF;
 IF NEW.statut IN ('planifie','arrive','en_consultation') AND EXISTS(
 SELECT 1 FROM public.sante_rendez_vous r WHERE r.praticien_id=NEW.praticien_id AND r.id<>NEW.id AND r.statut IN ('planifie','arrive','en_consultation')
 AND r.debut<NEW.debut+make_interval(mins=>NEW.duree_min) AND NEW.debut<r.debut+make_interval(mins=>r.duree_min)) THEN RAISE EXCEPTION 'Ce créneau chevauche un rendez-vous du praticien'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sante_rdv_coherence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_sante_rdv_coherence BEFORE INSERT OR UPDATE ON public.sante_rendez_vous FOR EACH ROW EXECUTE FUNCTION public.sante_rdv_coherence();

CREATE OR REPLACE FUNCTION public.sante_consultation_rdv_coherence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
 IF NEW.rdv_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sante_rendez_vous r WHERE r.id=NEW.rdv_id AND r.structure_id=NEW.structure_id AND r.patient_id=NEW.patient_id AND r.praticien_id=NEW.praticien_id AND r.statut='en_consultation') THEN RAISE EXCEPTION 'Rendez-vous incompatible avec la consultation'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sante_consultation_rdv_coherence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_sante_consultation_rdv_coherence BEFORE INSERT ON public.sante_consultations FOR EACH ROW EXECUTE FUNCTION public.sante_consultation_rdv_coherence();