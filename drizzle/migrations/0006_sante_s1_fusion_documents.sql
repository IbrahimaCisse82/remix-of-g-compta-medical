CREATE TABLE public.sante_fusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  patient_conserve uuid NOT NULL REFERENCES public.sante_patients(id),
  patient_fusionne uuid NOT NULL REFERENCES public.sante_patients(id),
  motif text NOT NULL, fusionne_par uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_fusions TO authenticated;
GRANT ALL ON public.sante_fusions TO service_role;
ALTER TABLE public.sante_fusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture fusions" ON public.sante_fusions FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['medecin','secretaire','admin_structure']));

CREATE OR REPLACE FUNCTION public.sante_fusionner_patients(_conserve uuid, _fusionne uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s1 uuid; _s2 uuid;
BEGIN
  SELECT structure_id INTO _s1 FROM public.sante_patients WHERE id = _conserve AND statut = 'actif';
  SELECT structure_id INTO _s2 FROM public.sante_patients WHERE id = _fusionne AND statut = 'actif';
  IF _s1 IS NULL OR _s2 IS NULL OR _s1 <> _s2 OR _conserve = _fusionne THEN RAISE EXCEPTION 'Fusion impossible'; END IF;
  IF NOT public.has_any_medical_role(_s1, ARRAY['medecin','secretaire']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  UPDATE public.sante_patient_assurances SET patient_id = _conserve WHERE patient_id = _fusionne;
  UPDATE public.sante_antecedents SET patient_id = _conserve WHERE patient_id = _fusionne;
  UPDATE public.sante_consentements SET patient_id = _conserve WHERE patient_id = _fusionne;
  UPDATE public.sante_patients SET statut = 'fusionne', fusionne_dans = _conserve WHERE id = _fusionne;
  INSERT INTO public.sante_fusions(structure_id, patient_conserve, patient_fusionne, motif, fusionne_par) VALUES (_s1, _conserve, _fusionne, trim(_motif), auth.uid());
END $$;

CREATE TABLE public.sante_documents_patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  nom text NOT NULL, categorie text NOT NULL DEFAULT 'autre', storage_path text NOT NULL UNIQUE,
  mime_type text, taille_octets bigint, uploaded_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sante_documents_patient TO authenticated;
GRANT ALL ON public.sante_documents_patient TO service_role;
ALTER TABLE public.sante_documents_patient ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture documents patient" ON public.sante_documents_patient FOR SELECT TO authenticated USING (public.can_access_clinique(patient_id));
CREATE POLICY "Ajout documents patient" ON public.sante_documents_patient FOR INSERT TO authenticated
  WITH CHECK (public.can_access_patient(patient_id) AND structure_id = (SELECT p.structure_id FROM public.sante_patients p WHERE p.id = patient_id));
CREATE TRIGGER trg_audit_sante_documents AFTER INSERT OR UPDATE OR DELETE ON public.sante_documents_patient FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

CREATE OR REPLACE FUNCTION public.sante_storage_patient(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN RETURN (string_to_array(_name, '/'))[2]::uuid; EXCEPTION WHEN others THEN RETURN NULL; END $$;

CREATE POLICY "sante_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sante-documents' AND public.can_access_clinique(public.sante_storage_patient(name)));
CREATE POLICY "sante_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sante-documents' AND public.can_access_patient(public.sante_storage_patient(name)));

REVOKE EXECUTE ON FUNCTION public.sante_fusionner_patients(uuid,uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sante_fusionner_patients(uuid,uuid,text) TO authenticated;