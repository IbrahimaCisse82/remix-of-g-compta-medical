-- P4 — 1) Correctif fusion en deux temps : les fonctions 0044 écrivaient dans
--         medical_audit_log(entite, entite_id, details), colonnes inexistantes.
--         Toute proposition/confirmation/annulation échouait donc à l'exécution
--         (constaté le 21/10/2026 : 0 ligne dans sante_fusions). On réécrit les
--         trois fonctions à l'identique, seul l'audit change de colonnes.
--      2) Consentement complet signé à l'écran : texte intégral versionné,
--         signataire (patient ou représentant), signature manuscrite + empreinte.

-- ───────────────────────────── 1) Fusion ─────────────────────────────
CREATE OR REPLACE FUNCTION public.sante_proposer_fusion(_conserve uuid, _fusionne uuid, _motif text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.sante_patients%ROWTYPE; f public.sante_patients%ROWTYPE; _id uuid;
BEGIN
  SELECT * INTO c FROM public.sante_patients WHERE id = _conserve AND statut = 'actif';
  SELECT * INTO f FROM public.sante_patients WHERE id = _fusionne AND statut = 'actif';
  IF c.id IS NULL OR f.id IS NULL OR c.structure_id <> f.structure_id OR _conserve = _fusionne THEN RAISE EXCEPTION 'Fusion impossible'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['medecin','secretaire']) THEN RAISE EXCEPTION 'Accès refusé : la fusion de dossiers est réservée aux rôles Médecin et Secrétaire.'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif obligatoire (5 caractères minimum)'; END IF;
  IF c.sexe IS NOT NULL AND f.sexe IS NOT NULL AND c.sexe <> f.sexe THEN RAISE EXCEPTION 'Fusion refusée : sexe différent entre les deux dossiers'; END IF;
  IF c.date_naissance IS NOT NULL AND f.date_naissance IS NOT NULL AND c.date_naissance <> f.date_naissance THEN RAISE EXCEPTION 'Fusion refusée : dates de naissance différentes'; END IF;
  IF EXISTS (SELECT 1 FROM public.sante_fusions WHERE statut = 'proposee' AND (patient_conserve IN (_conserve,_fusionne) OR patient_fusionne IN (_conserve,_fusionne))) THEN RAISE EXCEPTION 'Une fusion est déjà en attente pour l''un de ces dossiers'; END IF;
  INSERT INTO public.sante_fusions(structure_id, patient_conserve, patient_fusionne, motif, fusionne_par)
  VALUES (c.structure_id, _conserve, _fusionne, trim(_motif), auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (c.structure_id, auth.uid(), 'fusion_proposee', 'sante_fusions', _id, jsonb_build_object('conserve', _conserve, 'fusionne', _fusionne, 'motif', trim(_motif)));
  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.sante_confirmer_fusion(_fusion_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f public.sante_fusions%ROWTYPE; _snap jsonb;
BEGIN
  SELECT * INTO f FROM public.sante_fusions WHERE id = _fusion_id AND statut = 'proposee';
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition de fusion introuvable ou déjà traitée'; END IF;
  IF NOT public.has_any_medical_role(f.structure_id, ARRAY['medecin','secretaire']) THEN RAISE EXCEPTION 'Accès refusé : la confirmation de fusion est réservée aux rôles Médecin et Secrétaire.'; END IF;
  IF f.fusionne_par = auth.uid() THEN RAISE EXCEPTION 'La confirmation doit être faite par une personne différente du proposant'; END IF;
  IF f.created_at < now() - interval '7 days' THEN RAISE EXCEPTION 'Proposition expirée (7 jours) : refaites une proposition'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sante_patients WHERE id = f.patient_conserve AND statut = 'actif')
     OR NOT EXISTS (SELECT 1 FROM public.sante_patients WHERE id = f.patient_fusionne AND statut = 'actif') THEN RAISE EXCEPTION 'Fusion impossible : un dossier a changé de statut'; END IF;
  SELECT jsonb_build_object(
    'assurances', coalesce((SELECT jsonb_agg(id) FROM public.sante_patient_assurances WHERE patient_id = f.patient_fusionne), '[]'::jsonb),
    'antecedents', coalesce((SELECT jsonb_agg(id) FROM public.sante_antecedents WHERE patient_id = f.patient_fusionne), '[]'::jsonb),
    'consentements', coalesce((SELECT jsonb_agg(id) FROM public.sante_consentements WHERE patient_id = f.patient_fusionne), '[]'::jsonb)
  ) INTO _snap;
  UPDATE public.sante_patient_assurances SET patient_id = f.patient_conserve WHERE patient_id = f.patient_fusionne;
  UPDATE public.sante_antecedents SET patient_id = f.patient_conserve WHERE patient_id = f.patient_fusionne;
  UPDATE public.sante_consentements SET patient_id = f.patient_conserve WHERE patient_id = f.patient_fusionne;
  UPDATE public.sante_patients SET statut = 'fusionne', fusionne_dans = f.patient_conserve WHERE id = f.patient_fusionne;
  UPDATE public.sante_fusions SET statut = 'confirmee', confirme_par = auth.uid(), confirme_le = now(), snapshot = _snap WHERE id = _fusion_id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (f.structure_id, auth.uid(), 'fusion_confirmee', 'sante_fusions', _fusion_id, jsonb_build_object('conserve', f.patient_conserve, 'fusionne', f.patient_fusionne, 'deplaces', _snap));
END $function$;

CREATE OR REPLACE FUNCTION public.sante_annuler_fusion(_fusion_id uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f public.sante_fusions%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.sante_fusions WHERE id = _fusion_id AND statut = 'confirmee';
  IF NOT FOUND THEN RAISE EXCEPTION 'Fusion confirmée introuvable (ou déjà annulée)'; END IF;
  IF NOT public.has_any_medical_role(f.structure_id, ARRAY['admin_structure']) THEN RAISE EXCEPTION 'Annulation réservée à l''administrateur de la structure'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 10 THEN RAISE EXCEPTION 'Motif d''annulation obligatoire (10 caractères minimum)'; END IF;
  UPDATE public.sante_patient_assurances SET patient_id = f.patient_fusionne WHERE id IN (SELECT (jsonb_array_elements_text(f.snapshot->'assurances'))::uuid);
  UPDATE public.sante_antecedents SET patient_id = f.patient_fusionne WHERE id IN (SELECT (jsonb_array_elements_text(f.snapshot->'antecedents'))::uuid);
  UPDATE public.sante_consentements SET patient_id = f.patient_fusionne WHERE id IN (SELECT (jsonb_array_elements_text(f.snapshot->'consentements'))::uuid);
  UPDATE public.sante_patients SET statut = 'actif', fusionne_dans = NULL WHERE id = f.patient_fusionne;
  UPDATE public.sante_fusions SET statut = 'annulee', annule_par = auth.uid(), annule_le = now(), motif_annulation = trim(_motif) WHERE id = _fusion_id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (f.structure_id, auth.uid(), 'fusion_annulee', 'sante_fusions', _fusion_id, jsonb_build_object('conserve', f.patient_conserve, 'fusionne', f.patient_fusionne, 'motif', trim(_motif)));
END $function$;

-- ─────────────────── 2) Consentement complet signé ───────────────────
ALTER TABLE public.sante_consentements ADD COLUMN IF NOT EXISTS signataire_nom text;
ALTER TABLE public.sante_consentements ADD COLUMN IF NOT EXISTS signataire_qualite text
  CHECK (signataire_qualite IS NULL OR signataire_qualite IN ('patient','representant_legal','parent','tuteur'));
ALTER TABLE public.sante_consentements ADD COLUMN IF NOT EXISTS signature_png text;
ALTER TABLE public.sante_consentements ADD COLUMN IF NOT EXISTS signature_sha256 text;
ALTER TABLE public.sante_consentements ADD COLUMN IF NOT EXISTS texte_sha256 text;

-- Enregistrement signé : seule voie pour un consentement signé (append-only, comme la table).
CREATE OR REPLACE FUNCTION public.sante_signer_consentement(
  _patient_id uuid, _type text, _version text, _texte text, _accorde boolean,
  _signataire_nom text, _signataire_qualite text, _signature_png text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _sid uuid; _id uuid; _sig_hash text; _txt_hash text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  SELECT structure_id INTO _sid FROM public.sante_patients WHERE id = _patient_id AND statut = 'actif';
  IF _sid IS NULL THEN RAISE EXCEPTION 'Dossier patient introuvable ou fusionné'; END IF;
  IF NOT public.has_any_medical_role(_sid, ARRAY['medecin','secretaire','biologiste','preleveur']) THEN
    RAISE EXCEPTION 'Accès refusé : le recueil du consentement est réservé aux rôles Médecin, Secrétaire, Biologiste et Préleveur.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes avant de recueillir un consentement.'; END IF;
  IF NOT public.structure_module_actif(_sid,'sante_patients') THEN RAISE EXCEPTION 'Module Dossier patient inactif : contactez votre administrateur pour son activation.'; END IF;
  IF _type IS NULL OR _type NOT IN ('traitement_donnees','soins','partage_tiers_payant','portail_sms') THEN RAISE EXCEPTION 'Type de consentement inconnu'; END IF;
  IF _version IS NULL OR length(trim(_version)) < 2 THEN RAISE EXCEPTION 'Version du texte obligatoire'; END IF;
  IF _texte IS NULL OR length(trim(_texte)) < 50 THEN RAISE EXCEPTION 'Texte intégral du consentement obligatoire'; END IF;
  IF _signataire_nom IS NULL OR length(trim(_signataire_nom)) < 2 THEN RAISE EXCEPTION 'Nom du signataire obligatoire'; END IF;
  IF _signataire_qualite IS NULL OR _signataire_qualite NOT IN ('patient','representant_legal','parent','tuteur') THEN RAISE EXCEPTION 'Qualité du signataire invalide'; END IF;
  IF _signature_png IS NULL OR _signature_png NOT LIKE 'data:image/png;base64,%' THEN RAISE EXCEPTION 'Signature manuscrite obligatoire'; END IF;
  IF length(_signature_png) > 300000 THEN RAISE EXCEPTION 'Signature trop volumineuse'; END IF;
  _sig_hash := encode(extensions.digest(_signature_png, 'sha256'), 'hex');
  _txt_hash := encode(extensions.digest(_texte, 'sha256'), 'hex');
  INSERT INTO public.sante_consentements(patient_id, type, version_texte, accorde, texte, preuve, recueilli_par,
                                         signataire_nom, signataire_qualite, signature_png, signature_sha256, texte_sha256)
  VALUES (_patient_id, _type, trim(_version), _accorde, _texte,
          'signature manuscrite à l''écran · texte sha256:' || left(_txt_hash, 16), auth.uid(),
          trim(_signataire_nom), _signataire_qualite, _signature_png, _sig_hash, _txt_hash)
  RETURNING id INTO _id;
  RETURN _id;
END $function$;
REVOKE ALL ON FUNCTION public.sante_signer_consentement(uuid,text,text,text,boolean,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_signer_consentement(uuid,text,text,text,boolean,text,text,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.sante_signer_consentement(uuid,text,text,text,boolean,text,text,text) IS
  'P4 : consentement complet signé à l''écran (texte intégral + empreintes SHA-256 du texte et de la signature). Append-only : un retrait est un nouvel enregistrement accorde=false.';
