-- ===== S2 : certificats médicaux (immuables) =====
CREATE TABLE public.sante_certificats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  consultation_id uuid NOT NULL REFERENCES public.sante_consultations(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  praticien_id uuid NOT NULL REFERENCES public.sante_praticiens(id),
  numero text NOT NULL,
  type text NOT NULL CHECK (type IN ('aptitude','arret_travail','repos','constat','autre')),
  contenu text NOT NULL,
  jours_arret int CHECK (jours_arret IS NULL OR jours_arret BETWEEN 1 AND 365),
  emis_le timestamptz NOT NULL DEFAULT now(), emis_par uuid,
  UNIQUE (structure_id, numero)
);
GRANT SELECT ON public.sante_certificats TO authenticated;
GRANT ALL ON public.sante_certificats TO service_role;
ALTER TABLE public.sante_certificats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_certificats FORCE ROW LEVEL SECURITY;
CREATE POLICY "Lecture certificats" ON public.sante_certificats FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['medecin']));

CREATE OR REPLACE FUNCTION public.sante_emettre_certificat(_consultation_id uuid, _type text, _contenu text, _jours int DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations%ROWTYPE; _id uuid;
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['medecin']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(trim(_contenu),'') = '' THEN RAISE EXCEPTION 'Contenu obligatoire'; END IF;
  IF _type = 'arret_travail' AND _jours IS NULL THEN RAISE EXCEPTION 'Durée d''arrêt obligatoire'; END IF;
  INSERT INTO public.sante_certificats(structure_id, consultation_id, patient_id, praticien_id, numero, type, contenu, jours_arret, emis_par)
  VALUES (c.structure_id, c.id, c.patient_id, c.praticien_id, public.sante_prochain_numero(c.structure_id,'certificat','CERT'), _type, trim(_contenu), _jours, auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- ===== S3 : laboratoire =====
CREATE TABLE public.sante_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  code text NOT NULL, libelle text NOT NULL,
  section text NOT NULL CHECK (section IN ('hematologie','biochimie','serologie','bacteriologie','parasitologie','hormonologie','urines')),
  tube text, echantillon text, delai_heures int NOT NULL DEFAULT 24, jeune boolean NOT NULL DEFAULT false,
  tarif numeric(14,0) NOT NULL DEFAULT 0 CHECK (tarif >= 0), sous_traitee boolean NOT NULL DEFAULT false,
  actif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.sante_analyses TO authenticated;
GRANT ALL ON public.sante_analyses TO service_role;
ALTER TABLE public.sante_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture analyses" ON public.sante_analyses FOR SELECT TO authenticated USING (public.is_structure_member(structure_id));
CREATE POLICY "Ajout analyses" ON public.sante_analyses FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Maj analyses" ON public.sante_analyses FOR UPDATE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));

CREATE TABLE public.sante_analyse_parametres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  analyse_id uuid NOT NULL REFERENCES public.sante_analyses(id),
  code text NOT NULL, libelle text NOT NULL, unite text,
  type text NOT NULL DEFAULT 'numerique' CHECK (type IN ('numerique','qualitatif','texte')),
  decimales int NOT NULL DEFAULT 1 CHECK (decimales BETWEEN 0 AND 4), ordre int NOT NULL DEFAULT 0,
  UNIQUE (analyse_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.sante_analyse_parametres TO authenticated;
GRANT ALL ON public.sante_analyse_parametres TO service_role;
ALTER TABLE public.sante_analyse_parametres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture parametres" ON public.sante_analyse_parametres FOR SELECT TO authenticated USING (public.is_structure_member(structure_id));
CREATE POLICY "Ajout parametres" ON public.sante_analyse_parametres FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Maj parametres" ON public.sante_analyse_parametres FOR UPDATE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));

CREATE TABLE public.sante_valeurs_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  parametre_id uuid NOT NULL REFERENCES public.sante_analyse_parametres(id),
  sexe text CHECK (sexe IN ('M','F')),
  age_min_jours int NOT NULL DEFAULT 0, age_max_jours int NOT NULL DEFAULT 54750,
  bas numeric, haut numeric, critique_bas numeric, critique_haut numeric
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sante_valeurs_reference TO authenticated;
GRANT ALL ON public.sante_valeurs_reference TO service_role;
ALTER TABLE public.sante_valeurs_reference ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture refs" ON public.sante_valeurs_reference FOR SELECT TO authenticated USING (public.is_structure_member(structure_id));
CREATE POLICY "Ajout refs" ON public.sante_valeurs_reference FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Maj refs" ON public.sante_valeurs_reference FOR UPDATE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Suppr refs" ON public.sante_valeurs_reference FOR DELETE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));

CREATE TABLE public.sante_demandes_labo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  numero text NOT NULL,
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  consultation_id uuid REFERENCES public.sante_consultations(id),
  prescripteur text, urgence boolean NOT NULL DEFAULT false, renseignements text,
  statut text NOT NULL DEFAULT 'enregistree' CHECK (statut IN ('enregistree','prelevee','recue','en_analyse','validee_technique','validee','rejetee')),
  motif_rejet text,
  preleve_le timestamptz, preleve_par uuid, recue_le timestamptz,
  validee_tech_le timestamptz, validee_tech_par uuid, validee_le timestamptz, validee_par uuid,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, numero)
);
CREATE INDEX idx_sante_demandes_struct ON public.sante_demandes_labo (structure_id, created_at DESC);
CREATE INDEX idx_sante_demandes_patient ON public.sante_demandes_labo (patient_id);
GRANT SELECT ON public.sante_demandes_labo TO authenticated;
GRANT ALL ON public.sante_demandes_labo TO service_role;
ALTER TABLE public.sante_demandes_labo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_demandes_labo FORCE ROW LEVEL SECURITY;
CREATE POLICY "Lecture demandes" ON public.sante_demandes_labo FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id,'sante_laboratoire') AND public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien','preleveur','secretaire','medecin']));

CREATE TABLE public.sante_demande_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  demande_id uuid NOT NULL REFERENCES public.sante_demandes_labo(id),
  analyse_id uuid NOT NULL REFERENCES public.sante_analyses(id),
  tarif numeric(14,0) NOT NULL DEFAULT 0,
  UNIQUE (demande_id, analyse_id)
);
GRANT SELECT ON public.sante_demande_analyses TO authenticated;
GRANT ALL ON public.sante_demande_analyses TO service_role;
ALTER TABLE public.sante_demande_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture demande analyses" ON public.sante_demande_analyses FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien','preleveur','secretaire','medecin']));

CREATE TABLE public.sante_resultats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  demande_id uuid NOT NULL REFERENCES public.sante_demandes_labo(id),
  parametre_id uuid NOT NULL REFERENCES public.sante_analyse_parametres(id),
  valeur_num numeric, valeur_texte text,
  drapeau text NOT NULL DEFAULT 'N' CHECK (drapeau IN ('N','H','L','HH','LL')),
  ref_bas numeric, ref_haut numeric,
  saisi_par uuid NOT NULL, saisi_le timestamptz NOT NULL DEFAULT now(),
  critique_acquitte_par uuid, critique_acquitte_le timestamptz,
  UNIQUE (demande_id, parametre_id)
);
GRANT SELECT ON public.sante_resultats TO authenticated;
GRANT ALL ON public.sante_resultats TO service_role;
ALTER TABLE public.sante_resultats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_resultats FORCE ROW LEVEL SECURITY;
CREATE POLICY "Lecture resultats" ON public.sante_resultats FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['biologiste','technicien','medecin']));

-- Transitions de statut strictes (même par appel direct)
CREATE OR REPLACE FUNCTION public.trg_sante_demande_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.statut = NEW.statut THEN
    IF OLD.statut IN ('validee','rejetee') THEN RAISE EXCEPTION 'Demande verrouillée'; END IF;
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.statut='enregistree' AND NEW.statut IN ('prelevee','rejetee')) OR
    (OLD.statut='prelevee' AND NEW.statut IN ('recue','rejetee')) OR
    (OLD.statut='recue' AND NEW.statut IN ('en_analyse','rejetee')) OR
    (OLD.statut='en_analyse' AND NEW.statut='validee_technique') OR
    (OLD.statut='validee_technique' AND NEW.statut IN ('validee','en_analyse'))
  ) THEN RAISE EXCEPTION 'Transition interdite : % → %', OLD.statut, NEW.statut; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sante_demande_transition BEFORE UPDATE ON public.sante_demandes_labo FOR EACH ROW EXECUTE FUNCTION public.trg_sante_demande_transition();

CREATE OR REPLACE FUNCTION public.trg_sante_resultat_verrou()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _st text;
BEGIN
  SELECT statut INTO _st FROM public.sante_demandes_labo WHERE id = COALESCE(NEW.demande_id, OLD.demande_id);
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Suppression de résultat interdite'; END IF;
  IF _st <> 'en_analyse' AND NOT (TG_OP='UPDATE' AND NEW.valeur_num IS NOT DISTINCT FROM OLD.valeur_num AND NEW.valeur_texte IS NOT DISTINCT FROM OLD.valeur_texte AND _st = 'validee_technique' AND false) THEN
    RAISE EXCEPTION 'Résultats verrouillés (statut %)', _st;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sante_resultat_verrou BEFORE INSERT OR UPDATE OR DELETE ON public.sante_resultats FOR EACH ROW EXECUTE FUNCTION public.trg_sante_resultat_verrou();

CREATE TRIGGER audit_sante_demandes AFTER INSERT OR UPDATE ON public.sante_demandes_labo FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();
CREATE TRIGGER audit_sante_resultats AFTER INSERT OR UPDATE ON public.sante_resultats FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();
CREATE TRIGGER audit_sante_certificats AFTER INSERT ON public.sante_certificats FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

-- RPC : création de demande (transactionnelle)
CREATE OR REPLACE FUNCTION public.sante_creer_demande_labo(_patient_id uuid, _analyses uuid[], _prescripteur text DEFAULT NULL, _urgence boolean DEFAULT false, _renseignements text DEFAULT NULL, _consultation_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _id uuid; _n int;
BEGIN
  SELECT structure_id INTO _s FROM public.sante_patients WHERE id = _patient_id AND statut = 'actif';
  IF _s IS NULL THEN RAISE EXCEPTION 'Patient introuvable'; END IF;
  IF NOT public.structure_module_actif(_s,'sante_laboratoire') THEN RAISE EXCEPTION 'Module laboratoire inactif'; END IF;
  IF NOT public.has_any_medical_role(_s, ARRAY['admin_structure','biologiste','secretaire','medecin','technicien']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(array_length(_analyses,1),0) = 0 THEN RAISE EXCEPTION 'Aucune analyse demandée'; END IF;
  SELECT count(*) INTO _n FROM public.sante_analyses WHERE id = ANY(_analyses) AND structure_id = _s AND actif;
  IF _n <> array_length(_analyses,1) THEN RAISE EXCEPTION 'Analyse invalide'; END IF;
  IF _consultation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sante_consultations WHERE id=_consultation_id AND patient_id=_patient_id) THEN RAISE EXCEPTION 'Consultation invalide'; END IF;
  INSERT INTO public.sante_demandes_labo(structure_id, numero, patient_id, consultation_id, prescripteur, urgence, renseignements)
  VALUES (_s, public.sante_prochain_numero(_s,'demande_labo','LAB'), _patient_id, _consultation_id, nullif(trim(_prescripteur),''), coalesce(_urgence,false), nullif(trim(_renseignements),''))
  RETURNING id INTO _id;
  INSERT INTO public.sante_demande_analyses(structure_id, demande_id, analyse_id, tarif)
  SELECT _s, _id, a.id, a.tarif FROM public.sante_analyses a WHERE a.id = ANY(_analyses);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_avancer_demande(_demande_id uuid, _statut text, _motif text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.sante_demandes_labo%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.sante_demandes_labo WHERE id = _demande_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF _statut = 'prelevee' AND NOT public.has_any_medical_role(d.structure_id, ARRAY['preleveur','technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _statut IN ('recue','en_analyse') AND NOT public.has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _statut = 'rejetee' THEN
    IF NOT public.has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
    IF coalesce(trim(_motif),'') = '' THEN RAISE EXCEPTION 'Motif de rejet obligatoire'; END IF;
  END IF;
  IF _statut NOT IN ('prelevee','recue','en_analyse','rejetee') THEN RAISE EXCEPTION 'Utilisez la validation'; END IF;
  UPDATE public.sante_demandes_labo SET statut = _statut,
    preleve_le = CASE WHEN _statut='prelevee' THEN now() ELSE preleve_le END,
    preleve_par = CASE WHEN _statut='prelevee' THEN auth.uid() ELSE preleve_par END,
    recue_le = CASE WHEN _statut='recue' THEN now() ELSE recue_le END,
    motif_rejet = CASE WHEN _statut='rejetee' THEN trim(_motif) ELSE motif_rejet END
  WHERE id = _demande_id;
END $$;

-- Saisie d'un résultat : drapeau calculé côté serveur selon sexe/âge
CREATE OR REPLACE FUNCTION public.sante_saisir_resultat(_demande_id uuid, _parametre_id uuid, _valeur_num numeric, _valeur_texte text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.sante_demandes_labo%ROWTYPE; p public.sante_patients%ROWTYPE; r public.sante_valeurs_reference%ROWTYPE; _age int; _f text := 'N';
BEGIN
  SELECT * INTO d FROM public.sante_demandes_labo WHERE id = _demande_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT public.has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sante_analyse_parametres ap JOIN public.sante_demande_analyses da ON da.analyse_id = ap.analyse_id WHERE ap.id=_parametre_id AND da.demande_id=_demande_id) THEN RAISE EXCEPTION 'Paramètre hors demande'; END IF;
  SELECT * INTO p FROM public.sante_patients WHERE id = d.patient_id;
  _age := CASE WHEN p.date_naissance IS NULL THEN 9000 ELSE (current_date - p.date_naissance) END;
  SELECT * INTO r FROM public.sante_valeurs_reference
    WHERE parametre_id = _parametre_id AND (sexe IS NULL OR sexe = p.sexe) AND _age BETWEEN age_min_jours AND age_max_jours
    ORDER BY (sexe IS NULL), (age_max_jours - age_min_jours) LIMIT 1;
  IF _valeur_num IS NOT NULL AND r.id IS NOT NULL THEN
    _f := CASE WHEN r.critique_bas IS NOT NULL AND _valeur_num < r.critique_bas THEN 'LL'
               WHEN r.critique_haut IS NOT NULL AND _valeur_num > r.critique_haut THEN 'HH'
               WHEN r.bas IS NOT NULL AND _valeur_num < r.bas THEN 'L'
               WHEN r.haut IS NOT NULL AND _valeur_num > r.haut THEN 'H' ELSE 'N' END;
  END IF;
  INSERT INTO public.sante_resultats(structure_id, demande_id, parametre_id, valeur_num, valeur_texte, drapeau, ref_bas, ref_haut, saisi_par)
  VALUES (d.structure_id, _demande_id, _parametre_id, _valeur_num, nullif(trim(_valeur_texte),''), _f, r.bas, r.haut, auth.uid())
  ON CONFLICT (demande_id, parametre_id) DO UPDATE SET valeur_num=EXCLUDED.valeur_num, valeur_texte=EXCLUDED.valeur_texte, drapeau=EXCLUDED.drapeau,
    ref_bas=EXCLUDED.ref_bas, ref_haut=EXCLUDED.ref_haut, saisi_par=EXCLUDED.saisi_par, saisi_le=now(), critique_acquitte_par=NULL, critique_acquitte_le=NULL;
  RETURN _f;
END $$;

CREATE OR REPLACE FUNCTION public.sante_acquitter_critique(_resultat_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.sante_resultats%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.sante_resultats WHERE id = _resultat_id;
  IF NOT FOUND OR r.drapeau NOT IN ('HH','LL') THEN RAISE EXCEPTION 'Aucune valeur critique'; END IF;
  IF NOT public.has_any_medical_role(r.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.sante_resultats SET critique_acquitte_par = auth.uid(), critique_acquitte_le = now() WHERE id = _resultat_id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_valider_demande(_demande_id uuid, _niveau text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.sante_demandes_labo%ROWTYPE; _manquants int; _crit int;
BEGIN
  SELECT * INTO d FROM public.sante_demandes_labo WHERE id = _demande_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF _niveau = 'technique' THEN
    IF NOT public.has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
    SELECT count(*) INTO _manquants FROM public.sante_analyse_parametres ap JOIN public.sante_demande_analyses da ON da.analyse_id=ap.analyse_id
      WHERE da.demande_id=_demande_id AND NOT EXISTS (SELECT 1 FROM public.sante_resultats r WHERE r.demande_id=_demande_id AND r.parametre_id=ap.id);
    IF _manquants > 0 THEN RAISE EXCEPTION '% résultat(s) manquant(s)', _manquants; END IF;
    SELECT count(*) INTO _crit FROM public.sante_resultats WHERE demande_id=_demande_id AND drapeau IN ('HH','LL') AND critique_acquitte_par IS NULL;
    IF _crit > 0 THEN RAISE EXCEPTION 'Valeur critique non acquittée'; END IF;
    IF EXISTS (SELECT 1 FROM public.sante_resultats WHERE demande_id=_demande_id AND saisi_par = auth.uid()) THEN RAISE EXCEPTION 'Le validateur doit être différent de la personne qui a saisi'; END IF;
    UPDATE public.sante_demandes_labo SET statut='validee_technique', validee_tech_le=now(), validee_tech_par=auth.uid() WHERE id=_demande_id;
  ELSIF _niveau = 'biologique' THEN
    IF NOT public.has_any_medical_role(d.structure_id, ARRAY['biologiste']) THEN RAISE EXCEPTION 'Seul un biologiste valide'; END IF;
    UPDATE public.sante_demandes_labo SET statut='validee', validee_le=now(), validee_par=auth.uid() WHERE id=_demande_id;
  ELSE RAISE EXCEPTION 'Niveau inconnu'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.sante_emettre_certificat(uuid,text,text,int), public.sante_creer_demande_labo(uuid,uuid[],text,boolean,text,uuid), public.sante_avancer_demande(uuid,text,text), public.sante_saisir_resultat(uuid,uuid,numeric,text), public.sante_acquitter_critique(uuid), public.sante_valider_demande(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sante_emettre_certificat(uuid,text,text,int), public.sante_creer_demande_labo(uuid,uuid[],text,boolean,text,uuid), public.sante_avancer_demande(uuid,text,text), public.sante_saisir_resultat(uuid,uuid,numeric,text), public.sante_acquitter_critique(uuid), public.sante_valider_demande(uuid,text) TO authenticated;