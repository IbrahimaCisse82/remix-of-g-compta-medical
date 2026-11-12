-- 0119 — Suivi médical : contrôles programmés depuis la consultation et liste des « patients à revoir ».
-- * Le médecin (accès clinique au patient) programme un contrôle : date, motif, et s'il le souhaite l'heure, ce qui
--   crée aussi le rendez-vous chez le même praticien (contrôles habituels de l'agenda : chevauchement, praticien actif).
-- * Possible même après la clôture de la consultation (le contrôle est une décision de suivi, pas une modification).
-- * Le contrôle passe « réalisé » automatiquement à la consultation suivante du patient (à partir de 7 jours avant
--   la date prévue) ; il peut être annulé avec un motif.
-- * Liste « à revoir » : médecin et administrateur voient le motif ; la secrétaire voit le patient, la date et le
--   rendez-vous, sans le motif clinique.
-- Retour : docs/rollback/0119_suivi_controles_down.sql

CREATE TABLE IF NOT EXISTS public.sante_controles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  consultation_id uuid REFERENCES public.sante_consultations(id),
  praticien_id uuid REFERENCES public.sante_praticiens(id),
  prevu_le date NOT NULL,
  motif text NOT NULL CHECK (length(btrim(motif)) BETWEEN 3 AND 300),
  rdv_id uuid REFERENCES public.sante_rendez_vous(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'prevu' CHECK (statut IN ('prevu', 'realise', 'annule')),
  realise_par uuid REFERENCES public.sante_consultations(id),
  annule_motif text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sante_controles_a_revoir_idx ON public.sante_controles (structure_id, prevu_le) WHERE statut = 'prevu';
CREATE INDEX IF NOT EXISTS sante_controles_patient_idx ON public.sante_controles (patient_id, prevu_le DESC);
ALTER TABLE public.sante_controles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sante_controles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sante_controles TO authenticated;
DROP POLICY IF EXISTS "Lecture contrôles" ON public.sante_controles;
CREATE POLICY "Lecture contrôles" ON public.sante_controles FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id, 'sante_clinique') AND public.can_access_clinique(patient_id));
DROP POLICY IF EXISTS "MFA aal2 si facteur actif" ON public.sante_controles;
CREATE POLICY "MFA aal2 si facteur actif" ON public.sante_controles AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme());

CREATE OR REPLACE FUNCTION public.sante_programmer_controle(_consultation_id uuid, _prevu_le date, _motif text,
  _heure time DEFAULT NULL, _duree_min int DEFAULT 20)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; _rdv uuid; _id uuid;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT (public.has_any_medical_role(c.structure_id, ARRAY['medecin']) AND public.can_access_clinique(c.patient_id)) THEN
    RAISE EXCEPTION 'Seul un médecin ayant accès au dossier programme un contrôle' USING ERRCODE = '42501';
  END IF;
  IF _prevu_le IS NULL OR _prevu_le < current_date OR _prevu_le > current_date + 400 THEN
    RAISE EXCEPTION 'Date de contrôle attendue entre aujourd''hui et 13 mois';
  END IF;
  IF _heure IS NOT NULL THEN
    INSERT INTO public.sante_rendez_vous(structure_id, praticien_id, patient_id, debut, duree_min, motif)
    VALUES (c.structure_id, c.praticien_id, c.patient_id, (_prevu_le + _heure) AT TIME ZONE 'Africa/Dakar',
            coalesce(_duree_min, 20), left('Contrôle : ' || btrim(_motif), 300))
    RETURNING id INTO _rdv;
  END IF;
  INSERT INTO public.sante_controles(structure_id, patient_id, consultation_id, praticien_id, prevu_le, motif, rdv_id)
  VALUES (c.structure_id, c.patient_id, c.id, c.praticien_id, _prevu_le, btrim(_motif), _rdv)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_programmer_controle(uuid, date, text, time, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_programmer_controle(uuid, date, text, time, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_annuler_controle(_controle_id uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k public.sante_controles;
BEGIN
  SELECT * INTO k FROM public.sante_controles WHERE id = _controle_id FOR UPDATE;
  IF k.id IS NULL THEN RAISE EXCEPTION 'Contrôle introuvable'; END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT (public.has_any_medical_role(k.structure_id, ARRAY['medecin']) AND public.can_access_clinique(k.patient_id)) THEN
    RAISE EXCEPTION 'Seul un médecin ayant accès au dossier annule un contrôle' USING ERRCODE = '42501';
  END IF;
  IF k.statut <> 'prevu' THEN RAISE EXCEPTION 'Ce contrôle est déjà %', CASE k.statut WHEN 'realise' THEN 'réalisé' ELSE 'annulé' END; END IF;
  IF length(btrim(coalesce(_motif, ''))) < 3 THEN RAISE EXCEPTION 'Motif d''annulation requis'; END IF;
  UPDATE public.sante_controles SET statut = 'annule', annule_motif = btrim(_motif), updated_at = now() WHERE id = k.id;
  UPDATE public.sante_rendez_vous SET statut = 'annule' WHERE id = k.rdv_id AND statut = 'planifie';
END $$;
REVOKE ALL ON FUNCTION public.sante_annuler_controle(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_annuler_controle(uuid, text) TO authenticated;

-- Une nouvelle consultation du patient réalise les contrôles prévus (à partir de 7 jours avant la date prévue).
CREATE OR REPLACE FUNCTION public.trg_sante_controle_realise() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sante_controles SET statut = 'realise', realise_par = NEW.id, updated_at = now()
  WHERE patient_id = NEW.patient_id AND statut = 'prevu' AND (NEW.created_at)::date >= prevu_le - 7
    AND (consultation_id IS NULL OR consultation_id <> NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_sante_controle_realise() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sante_controle_realise ON public.sante_consultations;
CREATE TRIGGER trg_sante_controle_realise AFTER INSERT ON public.sante_consultations
  FOR EACH ROW EXECUTE FUNCTION public.trg_sante_controle_realise();

CREATE OR REPLACE FUNCTION public.sante_controles_a_revoir(_structure_id uuid, _horizon_jours int DEFAULT 7)
RETURNS TABLE(controle_id uuid, patient_id uuid, numero_dossier text, patient text, telephone text, prevu_le date,
              en_retard boolean, motif text, praticien text, rdv_debut timestamptz, rdv_statut text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _clinique boolean;
BEGIN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT (public.structure_module_actif(_structure_id, 'sante_clinique')
          AND public.has_any_medical_role(_structure_id, ARRAY['admin_structure', 'medecin', 'secretaire'])) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
  END IF;
  _clinique := public.has_any_medical_role(_structure_id, ARRAY['admin_structure', 'medecin']);
  RETURN QUERY
    SELECT k.id, p.id, p.numero_dossier, (p.nom || ' ' || p.prenoms)::text, p.telephone, k.prevu_le, k.prevu_le < current_date,
      CASE WHEN _clinique THEN k.motif END, pr.nom::text, r.debut, r.statut
    FROM public.sante_controles k
    JOIN public.sante_patients p ON p.id = k.patient_id
    LEFT JOIN public.sante_praticiens pr ON pr.id = k.praticien_id
    LEFT JOIN public.sante_rendez_vous r ON r.id = k.rdv_id
    WHERE k.structure_id = _structure_id AND k.statut = 'prevu'
      AND k.prevu_le <= current_date + greatest(least(coalesce(_horizon_jours, 7), 90), 0)
    ORDER BY k.prevu_le, p.nom;
END $$;
REVOKE ALL ON FUNCTION public.sante_controles_a_revoir(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_controles_a_revoir(uuid, int) TO authenticated;
