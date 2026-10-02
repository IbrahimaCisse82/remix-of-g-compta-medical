CREATE TABLE public.sante_sequences (
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  type text NOT NULL, annee int NOT NULL, dernier bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (structure_id, type, annee)
);
GRANT ALL ON public.sante_sequences TO service_role;
ALTER TABLE public.sante_sequences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sante_prochain_numero(_structure_id uuid, _type text, _prefixe text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _an int := extract(year FROM now())::int; _n bigint;
BEGIN
  INSERT INTO public.sante_sequences(structure_id, type, annee, dernier) VALUES (_structure_id, _type, _an, 1)
  ON CONFLICT (structure_id, type, annee) DO UPDATE SET dernier = public.sante_sequences.dernier + 1 RETURNING dernier INTO _n;
  RETURN _prefixe || _an || '-' || lpad(_n::text, 6, '0');
END $$;
REVOKE EXECUTE ON FUNCTION public.sante_prochain_numero(uuid,text,text) FROM public, anon, authenticated;

-- Praticiens
CREATE TABLE public.sante_praticiens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  user_id uuid, nom text NOT NULL, specialite text, numero_ordre text,
  actif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sante_praticiens TO authenticated;
GRANT ALL ON public.sante_praticiens TO service_role;
ALTER TABLE public.sante_praticiens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture praticiens" ON public.sante_praticiens FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','medecin','secretaire','caissier','biologiste']));
CREATE POLICY "Gestion praticiens" ON public.sante_praticiens FOR INSERT TO authenticated WITH CHECK (public.is_structure_admin(structure_id));
CREATE POLICY "Maj praticiens" ON public.sante_praticiens FOR UPDATE TO authenticated USING (public.is_structure_admin(structure_id));

-- Catalogue des actes et médicaments
CREATE TABLE public.sante_actes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  code text NOT NULL, libelle text NOT NULL, tarif numeric(14,0) NOT NULL DEFAULT 0 CHECK (tarif >= 0),
  regime_tva text NOT NULL DEFAULT 'a_valider' CHECK (regime_tva IN ('exonere','taxable','a_valider')),
  actif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.sante_actes TO authenticated;
GRANT ALL ON public.sante_actes TO service_role;
ALTER TABLE public.sante_actes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture actes" ON public.sante_actes FOR SELECT TO authenticated USING (public.is_structure_member(structure_id));
CREATE POLICY "Ajout actes" ON public.sante_actes FOR INSERT TO authenticated WITH CHECK (public.is_structure_admin(structure_id));
CREATE POLICY "Maj actes" ON public.sante_actes FOR UPDATE TO authenticated USING (public.is_structure_admin(structure_id));

CREATE TABLE public.sante_catalogue_medicaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  dci text NOT NULL, nom_commercial text, forme text, dosage text,
  actif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sante_catalogue_medicaments TO authenticated;
GRANT ALL ON public.sante_catalogue_medicaments TO service_role;
ALTER TABLE public.sante_catalogue_medicaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture médicaments" ON public.sante_catalogue_medicaments FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['medecin','admin_structure']));
CREATE POLICY "Ajout médicaments" ON public.sante_catalogue_medicaments FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['medecin','admin_structure']));
CREATE POLICY "Maj médicaments" ON public.sante_catalogue_medicaments FOR UPDATE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['medecin','admin_structure']));

-- Rendez-vous
CREATE TABLE public.sante_rendez_vous (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  site_id uuid REFERENCES public.sites(id),
  praticien_id uuid NOT NULL REFERENCES public.sante_praticiens(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  debut timestamptz NOT NULL, duree_min int NOT NULL DEFAULT 20 CHECK (duree_min BETWEEN 5 AND 240),
  motif text,
  statut text NOT NULL DEFAULT 'planifie' CHECK (statut IN ('planifie','arrive','en_consultation','termine','annule','absent')),
  arrive_le timestamptz, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sante_rdv_jour ON public.sante_rendez_vous (structure_id, debut);
CREATE INDEX idx_sante_rdv_praticien ON public.sante_rendez_vous (praticien_id, debut);
GRANT SELECT, INSERT, UPDATE ON public.sante_rendez_vous TO authenticated;
GRANT ALL ON public.sante_rendez_vous TO service_role;
ALTER TABLE public.sante_rendez_vous ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture RDV" ON public.sante_rendez_vous FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id,'sante_clinique') AND public.has_any_medical_role(structure_id, ARRAY['medecin','secretaire']));
CREATE POLICY "Création RDV" ON public.sante_rendez_vous FOR INSERT TO authenticated
  WITH CHECK (public.structure_module_actif(structure_id,'sante_clinique') AND public.has_any_medical_role(structure_id, ARRAY['medecin','secretaire'])
    AND EXISTS (SELECT 1 FROM public.sante_patients p WHERE p.id = patient_id AND p.structure_id = sante_rendez_vous.structure_id)
    AND EXISTS (SELECT 1 FROM public.sante_praticiens pr WHERE pr.id = praticien_id AND pr.structure_id = sante_rendez_vous.structure_id));
CREATE POLICY "Maj RDV" ON public.sante_rendez_vous FOR UPDATE TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['medecin','secretaire']));

CREATE OR REPLACE FUNCTION public.trg_sante_rdv_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.structure_id <> OLD.structure_id OR NEW.patient_id <> OLD.patient_id THEN RAISE EXCEPTION 'Modification interdite'; END IF;
  IF NEW.statut <> OLD.statut AND NOT (
    (OLD.statut = 'planifie' AND NEW.statut IN ('arrive','annule','absent')) OR
    (OLD.statut = 'arrive' AND NEW.statut IN ('en_consultation','annule')) OR
    (OLD.statut = 'en_consultation' AND NEW.statut = 'termine')
  ) THEN RAISE EXCEPTION 'Transition de rendez-vous interdite : % → %', OLD.statut, NEW.statut; END IF;
  IF OLD.statut IN ('termine','annule','absent') THEN RAISE EXCEPTION 'Rendez-vous clos : modification interdite'; END IF;
  IF NEW.statut = 'arrive' AND OLD.statut <> 'arrive' THEN NEW.arrive_le := now(); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sante_rdv_transition BEFORE UPDATE ON public.sante_rendez_vous FOR EACH ROW EXECUTE FUNCTION public.trg_sante_rdv_transition();
CREATE TRIGGER trg_audit_sante_rdv AFTER INSERT OR UPDATE ON public.sante_rendez_vous FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

-- Consultations
CREATE TABLE public.sante_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  praticien_id uuid NOT NULL REFERENCES public.sante_praticiens(id),
  rdv_id uuid REFERENCES public.sante_rendez_vous(id),
  motif text, anamnese text, examen text, diagnostic text, conduite text,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','cloturee')),
  cloturee_le timestamptz, cloturee_par uuid,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sante_consult_patient ON public.sante_consultations (patient_id, created_at DESC);
GRANT SELECT, UPDATE ON public.sante_consultations TO authenticated;
GRANT ALL ON public.sante_consultations TO service_role;
ALTER TABLE public.sante_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture consultations" ON public.sante_consultations FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id,'sante_clinique') AND public.has_any_medical_role(structure_id, ARRAY['medecin']));
CREATE POLICY "Maj consultation brouillon" ON public.sante_consultations FOR UPDATE TO authenticated
  USING (statut = 'brouillon' AND public.has_any_medical_role(structure_id, ARRAY['medecin']));

CREATE OR REPLACE FUNCTION public.trg_sante_consult_verrou()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Suppression de consultation interdite'; END IF;
  IF OLD.statut = 'cloturee' THEN RAISE EXCEPTION 'Consultation clôturée : utilisez un addendum'; END IF;
  IF NEW.statut = 'cloturee' AND current_setting('sante.cloture', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Clôture uniquement via la fonction dédiée'; END IF;
  IF NEW.structure_id <> OLD.structure_id OR NEW.patient_id <> OLD.patient_id THEN RAISE EXCEPTION 'Modification interdite'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sante_consult_verrou BEFORE UPDATE OR DELETE ON public.sante_consultations FOR EACH ROW EXECUTE FUNCTION public.trg_sante_consult_verrou();
CREATE TRIGGER trg_audit_sante_consult AFTER INSERT OR UPDATE ON public.sante_consultations FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

CREATE TABLE public.sante_consultation_addenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.sante_consultations(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  texte text NOT NULL CHECK (char_length(trim(texte)) >= 5),
  auteur uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sante_consultation_addenda TO authenticated;
GRANT ALL ON public.sante_consultation_addenda TO service_role;
ALTER TABLE public.sante_consultation_addenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture addenda" ON public.sante_consultation_addenda FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sante_consultations c WHERE c.id = consultation_id));
CREATE POLICY "Ajout addendum" ON public.sante_consultation_addenda FOR INSERT TO authenticated
  WITH CHECK (auteur = auth.uid() AND EXISTS (SELECT 1 FROM public.sante_consultations c WHERE c.id = consultation_id AND c.statut = 'cloturee' AND c.patient_id = sante_consultation_addenda.patient_id));
CREATE TRIGGER trg_audit_sante_addenda AFTER INSERT ON public.sante_consultation_addenda FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

CREATE TABLE public.sante_constantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.sante_consultations(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  ta_sys int CHECK (ta_sys BETWEEN 40 AND 300), ta_dia int CHECK (ta_dia BETWEEN 20 AND 200),
  pouls int CHECK (pouls BETWEEN 20 AND 250), temperature numeric(4,1) CHECK (temperature BETWEEN 30 AND 45),
  poids numeric(5,1) CHECK (poids BETWEEN 0.3 AND 400), taille int CHECK (taille BETWEEN 20 AND 250),
  spo2 int CHECK (spo2 BETWEEN 50 AND 100), glycemie numeric(4,2) CHECK (glycemie BETWEEN 0.2 AND 6),
  mesure_par uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sante_constantes TO authenticated;
GRANT ALL ON public.sante_constantes TO service_role;
ALTER TABLE public.sante_constantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture constantes" ON public.sante_constantes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sante_consultations c WHERE c.id = consultation_id));
CREATE POLICY "Ajout constantes brouillon" ON public.sante_constantes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sante_consultations c WHERE c.id = consultation_id AND c.statut = 'brouillon' AND c.patient_id = sante_constantes.patient_id));

-- Ordonnances (émises = immuables)
CREATE TABLE public.sante_ordonnances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  consultation_id uuid NOT NULL REFERENCES public.sante_consultations(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  praticien_id uuid NOT NULL REFERENCES public.sante_praticiens(id),
  numero text NOT NULL, recommandations text,
  emise_par uuid NOT NULL, emise_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, numero)
);
CREATE TABLE public.sante_ordonnance_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordonnance_id uuid NOT NULL REFERENCES public.sante_ordonnances(id),
  ordre int NOT NULL, medicament text NOT NULL, posologie text NOT NULL, duree text, quantite text
);
GRANT SELECT ON public.sante_ordonnances, public.sante_ordonnance_lignes TO authenticated;
GRANT ALL ON public.sante_ordonnances, public.sante_ordonnance_lignes TO service_role;
ALTER TABLE public.sante_ordonnances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_ordonnance_lignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture ordonnances" ON public.sante_ordonnances FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id,'sante_clinique') AND public.has_any_medical_role(structure_id, ARRAY['medecin']));
CREATE POLICY "Lecture lignes ordonnance" ON public.sante_ordonnance_lignes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sante_ordonnances o WHERE o.id = ordonnance_id));
CREATE TRIGGER trg_audit_sante_ordonnances AFTER INSERT ON public.sante_ordonnances FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

-- RPC transactionnelles
CREATE OR REPLACE FUNCTION public.sante_demarrer_consultation(_patient_id uuid, _praticien_id uuid, _rdv_id uuid DEFAULT NULL, _motif text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _id uuid;
BEGIN
  SELECT structure_id INTO _sid FROM public.sante_patients WHERE id = _patient_id AND statut = 'actif';
  IF _sid IS NULL THEN RAISE EXCEPTION 'Patient introuvable'; END IF;
  IF NOT public.structure_module_actif(_sid, 'sante_clinique') OR NOT public.has_any_medical_role(_sid, ARRAY['medecin']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sante_praticiens WHERE id = _praticien_id AND structure_id = _sid AND actif) THEN RAISE EXCEPTION 'Praticien invalide'; END IF;
  IF _rdv_id IS NOT NULL THEN
    UPDATE public.sante_rendez_vous SET statut = 'en_consultation' WHERE id = _rdv_id AND patient_id = _patient_id AND statut = 'arrive';
    IF NOT FOUND THEN RAISE EXCEPTION 'Le patient doit être marqué arrivé'; END IF;
    SELECT coalesce(_motif, motif) INTO _motif FROM public.sante_rendez_vous WHERE id = _rdv_id;
  END IF;
  INSERT INTO public.sante_consultations(structure_id, patient_id, praticien_id, rdv_id, motif) VALUES (_sid, _patient_id, _praticien_id, _rdv_id, _motif) RETURNING id INTO _id;
  PERFORM public.sante_ouvrir_dossier(_patient_id, 'consultation');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_cloturer_consultation(_consultation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id FOR UPDATE;
  IF NOT FOUND OR c.statut <> 'brouillon' THEN RAISE EXCEPTION 'Consultation introuvable ou déjà clôturée'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['medecin']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(trim(c.motif),'') = '' OR coalesce(trim(c.diagnostic),'') = '' THEN RAISE EXCEPTION 'Motif et diagnostic obligatoires avant clôture'; END IF;
  PERFORM set_config('sante.cloture', 'on', true);
  UPDATE public.sante_consultations SET statut = 'cloturee', cloturee_le = now(), cloturee_par = auth.uid() WHERE id = _consultation_id;
  PERFORM set_config('sante.cloture', 'off', true);
  IF c.rdv_id IS NOT NULL THEN UPDATE public.sante_rendez_vous SET statut = 'termine' WHERE id = c.rdv_id AND statut = 'en_consultation'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sante_emettre_ordonnance(_consultation_id uuid, _lignes jsonb, _recommandations text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations%ROWTYPE; _id uuid; l jsonb; i int := 0;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['medecin']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF jsonb_array_length(coalesce(_lignes,'[]')) = 0 THEN RAISE EXCEPTION 'Ordonnance vide'; END IF;
  INSERT INTO public.sante_ordonnances(structure_id, consultation_id, patient_id, praticien_id, numero, recommandations, emise_par)
  VALUES (c.structure_id, c.id, c.patient_id, c.praticien_id, public.sante_prochain_numero(c.structure_id, 'ordonnance', 'ORD'), nullif(trim(_recommandations),''), auth.uid())
  RETURNING id INTO _id;
  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    IF coalesce(trim(l->>'medicament'),'') = '' OR coalesce(trim(l->>'posologie'),'') = '' THEN RAISE EXCEPTION 'Médicament et posologie obligatoires'; END IF;
    INSERT INTO public.sante_ordonnance_lignes(ordonnance_id, ordre, medicament, posologie, duree, quantite)
    VALUES (_id, i, trim(l->>'medicament'), trim(l->>'posologie'), nullif(trim(l->>'duree'),''), nullif(trim(l->>'quantite'),''));
    i := i + 1;
  END LOOP;
  RETURN _id;
END $$;

REVOKE EXECUTE ON FUNCTION public.sante_demarrer_consultation(uuid,uuid,uuid,text), public.sante_cloturer_consultation(uuid), public.sante_emettre_ordonnance(uuid,jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sante_demarrer_consultation(uuid,uuid,uuid,text), public.sante_cloturer_consultation(uuid), public.sante_emettre_ordonnance(uuid,jsonb,text) TO authenticated;