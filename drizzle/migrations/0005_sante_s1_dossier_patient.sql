CREATE OR REPLACE FUNCTION public.has_any_medical_role(_structure_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.structure_memberships m JOIN public.medical_user_roles r ON r.membership_id = m.id
    WHERE m.structure_id = _structure_id AND m.user_id = auth.uid() AND m.statut = 'actif' AND r.role::text = ANY(_roles))
$$;

CREATE TABLE public.sante_patient_sequences (
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  annee int NOT NULL, dernier bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (structure_id, annee)
);
GRANT ALL ON public.sante_patient_sequences TO service_role;
ALTER TABLE public.sante_patient_sequences ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sante_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE RESTRICT,
  numero_dossier text NOT NULL,
  nom text NOT NULL, prenoms text NOT NULL,
  sexe text NOT NULL CHECK (sexe IN ('M','F')),
  date_naissance date,
  lieu_naissance text, telephone text, email text, adresse text, profession text,
  contact_urgence_nom text, contact_urgence_tel text,
  statut text NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','fusionne','archive')),
  fusionne_dans uuid REFERENCES public.sante_patients(id),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, numero_dossier)
);
CREATE INDEX idx_sante_patients_search ON public.sante_patients (structure_id, lower(nom), lower(prenoms));
CREATE INDEX idx_sante_patients_tel ON public.sante_patients (structure_id, telephone);
GRANT SELECT, UPDATE ON public.sante_patients TO authenticated;
GRANT ALL ON public.sante_patients TO service_role;
ALTER TABLE public.sante_patients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sante_patients p WHERE p.id = _patient_id
    AND public.structure_module_actif(p.structure_id, 'sante_patients')
    AND public.has_any_medical_role(p.structure_id, ARRAY['medecin','biologiste','technicien','preleveur','secretaire','caissier']))
$$;
CREATE OR REPLACE FUNCTION public.can_access_clinique(_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sante_patients p WHERE p.id = _patient_id
    AND public.structure_module_actif(p.structure_id, 'sante_patients')
    AND public.has_any_medical_role(p.structure_id, ARRAY['medecin','biologiste']))
$$;

CREATE POLICY "Lecture patients habilitée" ON public.sante_patients FOR SELECT TO authenticated USING (public.can_access_patient(id));
CREATE POLICY "Mise à jour identité" ON public.sante_patients FOR UPDATE TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['medecin','secretaire']) AND public.structure_module_actif(structure_id,'sante_patients'))
  WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['medecin','secretaire']));
CREATE TRIGGER trg_sante_patients_touch BEFORE UPDATE ON public.sante_patients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.sante_patient_assurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id) ON DELETE CASCADE,
  organisme text NOT NULL, numero_adherent text, taux_couverture numeric(5,2) CHECK (taux_couverture BETWEEN 0 AND 100),
  plafond numeric(14,0), date_debut date, date_fin date, ayant_droit text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sante_patient_assurances TO authenticated;
GRANT ALL ON public.sante_patient_assurances TO service_role;
ALTER TABLE public.sante_patient_assurances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture assurances" ON public.sante_patient_assurances FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY "Écriture assurances" ON public.sante_patient_assurances FOR INSERT TO authenticated WITH CHECK (public.can_access_patient(patient_id));
CREATE POLICY "Maj assurances" ON public.sante_patient_assurances FOR UPDATE TO authenticated USING (public.can_access_patient(patient_id));

CREATE TABLE public.sante_antecedents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('allergie','medical','chirurgical','familial','traitement')),
  libelle text NOT NULL, details text, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sante_antecedents TO authenticated;
GRANT ALL ON public.sante_antecedents TO service_role;
ALTER TABLE public.sante_antecedents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture antécédents cliniciens" ON public.sante_antecedents FOR SELECT TO authenticated USING (public.can_access_clinique(patient_id));
CREATE POLICY "Ajout antécédents cliniciens" ON public.sante_antecedents FOR INSERT TO authenticated WITH CHECK (public.can_access_clinique(patient_id));

CREATE TABLE public.sante_consentements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id) ON DELETE CASCADE,
  type text NOT NULL, version_texte text NOT NULL, accorde boolean NOT NULL,
  preuve text, recueilli_par uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sante_consentements TO authenticated;
GRANT ALL ON public.sante_consentements TO service_role;
ALTER TABLE public.sante_consentements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture consentements" ON public.sante_consentements FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));
CREATE POLICY "Ajout consentements" ON public.sante_consentements FOR INSERT TO authenticated WITH CHECK (public.can_access_patient(patient_id));

CREATE OR REPLACE FUNCTION public.audit_sante_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid;
BEGIN
  IF TG_TABLE_NAME = 'sante_patients' THEN _sid := COALESCE(NEW.structure_id, OLD.structure_id);
  ELSE SELECT structure_id INTO _sid FROM public.sante_patients WHERE id = COALESCE(NEW.patient_id, OLD.patient_id); END IF;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (_sid, auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP <> 'INSERT' THEN jsonb_build_object('id', OLD.id) END,
    CASE WHEN TG_OP <> 'DELETE' THEN jsonb_build_object('id', NEW.id) END);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_audit_sante_patients AFTER INSERT OR UPDATE OR DELETE ON public.sante_patients FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();
CREATE TRIGGER trg_audit_sante_assurances AFTER INSERT OR UPDATE OR DELETE ON public.sante_patient_assurances FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();
CREATE TRIGGER trg_audit_sante_antecedents AFTER INSERT OR UPDATE OR DELETE ON public.sante_antecedents FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();
CREATE TRIGGER trg_audit_sante_consentements AFTER INSERT OR UPDATE OR DELETE ON public.sante_consentements FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

CREATE OR REPLACE FUNCTION public.sante_doublons_patient(_structure_id uuid, _nom text, _prenoms text, _date_naissance date, _telephone text)
RETURNS TABLE(id uuid, numero_dossier text, nom text, prenoms text, date_naissance date, telephone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.numero_dossier, p.nom, p.prenoms, p.date_naissance, p.telephone FROM public.sante_patients p
  WHERE p.structure_id = _structure_id AND p.statut = 'actif'
    AND public.has_any_medical_role(_structure_id, ARRAY['medecin','biologiste','technicien','preleveur','secretaire','caissier'])
    AND ((lower(p.nom) = lower(trim(_nom)) AND lower(p.prenoms) = lower(trim(_prenoms)) AND p.date_naissance IS NOT DISTINCT FROM _date_naissance)
      OR (nullif(trim(_telephone),'') IS NOT NULL AND p.telephone = trim(_telephone) AND lower(p.nom) = lower(trim(_nom))))
  LIMIT 5
$$;

CREATE OR REPLACE FUNCTION public.sante_creer_patient(_structure_id uuid, _nom text, _prenoms text, _sexe text, _date_naissance date DEFAULT NULL,
  _telephone text DEFAULT NULL, _adresse text DEFAULT NULL, _contact_urgence_nom text DEFAULT NULL, _contact_urgence_tel text DEFAULT NULL,
  _consentement boolean DEFAULT false, _ignorer_doublons boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _seq bigint; _an int := extract(year FROM now())::int;
BEGIN
  IF NOT public.structure_module_actif(_structure_id, 'sante_patients') THEN RAISE EXCEPTION 'Module Dossier patient inactif'; END IF;
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['medecin','secretaire','biologiste','preleveur']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF char_length(trim(_nom)) < 2 OR char_length(trim(_prenoms)) < 1 THEN RAISE EXCEPTION 'Nom et prénoms obligatoires'; END IF;
  IF _date_naissance IS NOT NULL AND _date_naissance > current_date THEN RAISE EXCEPTION 'Date de naissance invalide'; END IF;
  IF NOT _ignorer_doublons AND EXISTS (SELECT 1 FROM public.sante_doublons_patient(_structure_id, _nom, _prenoms, _date_naissance, _telephone)) THEN
    RAISE EXCEPTION 'DOUBLON_POSSIBLE';
  END IF;
  INSERT INTO public.sante_patient_sequences(structure_id, annee, dernier) VALUES (_structure_id, _an, 1)
  ON CONFLICT (structure_id, annee) DO UPDATE SET dernier = public.sante_patient_sequences.dernier + 1 RETURNING dernier INTO _seq;
  INSERT INTO public.sante_patients(structure_id, numero_dossier, nom, prenoms, sexe, date_naissance, telephone, adresse, contact_urgence_nom, contact_urgence_tel, created_by)
  VALUES (_structure_id, 'P' || _an || '-' || lpad(_seq::text, 6, '0'), upper(trim(_nom)), initcap(trim(_prenoms)), _sexe, _date_naissance,
    nullif(trim(_telephone),''), nullif(trim(_adresse),''), nullif(trim(_contact_urgence_nom),''), nullif(trim(_contact_urgence_tel),''), auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.sante_consentements(patient_id, type, version_texte, accorde, preuve)
  VALUES (_id, 'traitement_donnees', 'v1-2026', _consentement, 'recueil oral à l''accueil');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_rechercher_patients(_structure_id uuid, _q text DEFAULT '', _limit int DEFAULT 25, _offset int DEFAULT 0)
RETURNS TABLE(id uuid, numero_dossier text, nom text, prenoms text, sexe text, date_naissance date, telephone text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.numero_dossier, p.nom, p.prenoms, p.sexe, p.date_naissance, p.telephone, count(*) OVER()
  FROM public.sante_patients p
  WHERE p.structure_id = _structure_id AND p.statut = 'actif'
    AND public.structure_module_actif(_structure_id, 'sante_patients')
    AND public.has_any_medical_role(_structure_id, ARRAY['medecin','biologiste','technicien','preleveur','secretaire','caissier'])
    AND (coalesce(trim(_q),'') = '' OR lower(p.nom) LIKE lower(trim(_q)) || '%' OR lower(p.prenoms) LIKE lower(trim(_q)) || '%'
         OR p.numero_dossier ILIKE trim(_q) || '%' OR p.telephone LIKE trim(_q) || '%')
  ORDER BY p.nom, p.prenoms
  LIMIT least(greatest(_limit,1),100) OFFSET greatest(_offset,0)
$$;

CREATE OR REPLACE FUNCTION public.sante_ouvrir_dossier(_patient_id uuid, _ecran text DEFAULT 'fiche')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid;
BEGIN
  IF NOT public.can_access_patient(_patient_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT structure_id INTO _sid FROM public.sante_patients WHERE id = _patient_id;
  INSERT INTO public.medical_access_log(structure_id, user_id, patient_id, ecran) VALUES (_sid, auth.uid(), _patient_id, left(_ecran, 40));
END $$;

REVOKE EXECUTE ON FUNCTION public.has_any_medical_role(uuid,text[]), public.can_access_patient(uuid), public.can_access_clinique(uuid),
  public.sante_doublons_patient(uuid,text,text,date,text), public.sante_creer_patient(uuid,text,text,text,date,text,text,text,text,boolean,boolean),
  public.sante_rechercher_patients(uuid,text,int,int), public.sante_ouvrir_dossier(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_any_medical_role(uuid,text[]), public.can_access_patient(uuid), public.can_access_clinique(uuid),
  public.sante_doublons_patient(uuid,text,text,date,text), public.sante_creer_patient(uuid,text,text,text,date,text,text,text,text,boolean,boolean),
  public.sante_rechercher_patients(uuid,text,int,int), public.sante_ouvrir_dossier(uuid,text) TO authenticated;