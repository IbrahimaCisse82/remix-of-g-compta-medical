CREATE OR REPLACE FUNCTION public.sante_config_acces(_structure_id uuid, _tous boolean, _seuil integer, _renouv integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF _seuil < 1 OR _renouv < 0 THEN RAISE EXCEPTION 'Valeurs invalides'; END IF;
  UPDATE structures SET acces_tous_dossiers = coalesce(_tous,false), bris_glace_seuil_semaine = _seuil, bris_glace_renouvellements_max = _renouv WHERE id = _structure_id;
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'config_acces', 'structures', _structure_id, jsonb_build_object('acces_tous_dossiers', _tous, 'seuil', _seuil, 'renouvellements', _renouv));
END $$;

CREATE OR REPLACE FUNCTION public.sante_config_conservation(_structure_id uuid, _type text, _annees integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  INSERT INTO sante_conservation_regles(structure_id, type_document, duree_annees) VALUES (_structure_id, trim(_type), _annees)
  ON CONFLICT (structure_id, type_document) DO UPDATE SET duree_annees = EXCLUDED.duree_annees, updated_at = now();
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'config_conservation', 'sante_conservation_regles', _structure_id, jsonb_build_object('type', _type, 'annees', _annees));
END $$;

CREATE OR REPLACE FUNCTION public.trg_sante_document_conservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('sante.purge', true),'') = 'on' THEN RETURN OLD; END IF;
  IF OLD.created_at + make_interval(years => sante_duree_conservation(OLD.structure_id, OLD.categorie)) > now() THEN
    RAISE EXCEPTION 'Suppression interdite avant la fin de la durée de conservation';
  END IF;
  RAISE EXCEPTION 'Suppression uniquement par la purge contrôlée';
END $$;

CREATE OR REPLACE FUNCTION public.sante_purger_documents_echus(_structure_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  PERFORM set_config('sante.purge','on',true);
  WITH d AS (DELETE FROM sante_documents_patient WHERE structure_id = _structure_id
     AND created_at + make_interval(years => sante_duree_conservation(structure_id, categorie)) <= now() RETURNING id)
  SELECT count(*) INTO _n FROM d;
  PERFORM set_config('sante.purge','',true);
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'purge_conservation', 'sante_documents_patient', _structure_id, jsonb_build_object('documents_purges', _n));
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.sante_export_dossier(_patient_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _r jsonb;
BEGIN
  SELECT structure_id INTO _s FROM sante_patients WHERE id = _patient_id;
  IF _s IS NULL OR NOT (is_structure_admin(_s) OR (has_any_medical_role(_s, ARRAY['medecin']) AND can_access_clinique(_patient_id))) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  SELECT jsonb_build_object(
    'genere_le', now(), 'genere_par', auth.uid(),
    'patient', (SELECT to_jsonb(p) FROM sante_patients p WHERE p.id=_patient_id),
    'assurances', (SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM sante_patient_assurances a WHERE a.patient_id=_patient_id),
    'consentements', (SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM sante_consentements c WHERE c.patient_id=_patient_id),
    'antecedents', (SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM sante_antecedents a WHERE a.patient_id=_patient_id),
    'consultations', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at),'[]') FROM sante_consultations c WHERE c.patient_id=_patient_id),
    'constantes', (SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM sante_constantes c WHERE c.patient_id=_patient_id),
    'ordonnances', (SELECT coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('lignes',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') FROM sante_ordonnance_lignes l WHERE l.ordonnance_id=o.id))),'[]') FROM sante_ordonnances o WHERE o.patient_id=_patient_id),
    'certificats', (SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM sante_certificats c WHERE c.patient_id=_patient_id),
    'demandes_labo', (SELECT coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('resultats',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM sante_resultats r WHERE r.demande_id=d.id))),'[]') FROM sante_demandes_labo d WHERE d.patient_id=_patient_id),
    'factures', (SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') FROM sante_factures f WHERE f.patient_id=_patient_id),
    'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object('nom', d.nom, 'categorie', d.categorie, 'created_at', d.created_at)),'[]') FROM sante_documents_patient d WHERE d.patient_id=_patient_id),
    'acces', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', l.created_at, 'ecran', l.ecran, 'motif', l.motif)),'[]') FROM medical_access_log l WHERE l.patient_id=_patient_id)
  ) INTO _r;
  INSERT INTO medical_access_log(structure_id, user_id, patient_id, ecran, motif) VALUES (_s, auth.uid(), _patient_id, 'export_droit_acces', 'Export du dossier (droit d''accès)');
  RETURN _r;
END $$;

SELECT cron.schedule('sante-escalade-bris-glace', '15 * * * *', 'select public.sante_escalader_bris_glace()');