-- ===== P1.1 Cloisonnement comptable / clinique =====
ALTER TYPE public.medical_role ADD VALUE IF NOT EXISTS 'tiers_payant';

-- Lignes de facture (libellés d'actes/analyses = données de santé) : plus de comptable ni lecteur
DROP POLICY IF EXISTS "Lecture lignes" ON public.sante_facture_lignes;
CREATE POLICY "Lecture lignes" ON public.sante_facture_lignes FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','caissier','medecin','biologiste','tiers_payant']));

DROP POLICY IF EXISTS "Lecture facturation" ON public.sante_factures;
CREATE POLICY "Lecture facturation" ON public.sante_factures FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','caissier','comptable','lecteur','medecin','biologiste','tiers_payant']));

-- Identité patient : accessible au rôle tiers_payant (bordereaux nominatifs), jamais au comptable/lecteur
CREATE OR REPLACE FUNCTION public.can_access_patient(_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sante_patients p WHERE p.id = _patient_id
    AND public.structure_module_actif(p.structure_id, 'sante_patients')
    AND public.has_any_medical_role(p.structure_id, ARRAY['medecin','biologiste','technicien','preleveur','secretaire','caissier','tiers_payant']))
$$;

DROP POLICY IF EXISTS "Lecture assurances" ON public.sante_patient_assurances;
CREATE POLICY "Lecture assurances" ON public.sante_patient_assurances FOR SELECT TO authenticated USING (public.can_access_patient(patient_id));

-- Écritures santé : aucune identité patient (seulement numéros de facture / dossier)
CREATE OR REPLACE FUNCTION public.trg_sante_facture_compta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _net numeric; _s int; _l jsonb;
BEGIN
  _net := NEW.total - coalesce(NEW.remise,0);
  _s := CASE WHEN NEW.type = 'avoir' THEN -1 ELSE 1 END;
  _l := jsonb_build_array(
    jsonb_build_object('compte','4111','intitule','Patients','libelle',NEW.numero,
      CASE WHEN _s=1 THEN 'debit' ELSE 'credit' END, abs(NEW.part_patient)),
    jsonb_build_object('compte','4114','intitule','Organismes tiers-payant','libelle',NEW.numero,
      CASE WHEN _s=1 THEN 'debit' ELSE 'credit' END, abs(NEW.part_organisme),
      'compte_auxiliaire', NEW.organisme, 'auxiliaire_libelle', NEW.organisme),
    jsonb_build_object('compte','706','intitule','Prestations de services','libelle',NEW.numero,
      CASE WHEN _s=1 THEN 'credit' ELSE 'debit' END, abs(_net)));
  PERFORM sante_comptabiliser(NEW.structure_id, NEW.type, NEW.id, 'VT', NEW.created_at::date,
    CASE WHEN _s=1 THEN 'Facture santé ' ELSE 'Avoir santé ' END || NEW.numero, NEW.numero, _l);
  RETURN NEW;
END $$;

-- Vue agrégée pour la comptabilité : montants par catégorie, sans patient ni libellé d'acte
CREATE OR REPLACE FUNCTION public.sante_ventes_par_categorie(_structure_id uuid, _debut date, _fin date)
RETURNS TABLE(categorie text, nb_lignes bigint, montant numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable','lecteur','caissier','tiers_payant']) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN QUERY
  SELECT CASE WHEN EXISTS (SELECT 1 FROM sante_analyses a WHERE a.structure_id=_structure_id AND a.code=l.code) THEN 'Analyses de laboratoire'
              WHEN EXISTS (SELECT 1 FROM sante_actes a WHERE a.structure_id=_structure_id AND a.code=l.code) THEN 'Consultations et actes'
              ELSE 'Autres prestations' END,
         count(*), sum(CASE WHEN f.type='avoir' THEN -abs(l.montant) ELSE l.montant END)
  FROM sante_facture_lignes l JOIN sante_factures f ON f.id = l.facture_id
  WHERE f.structure_id = _structure_id AND f.created_at::date BETWEEN _debut AND _fin
  GROUP BY 1 ORDER BY 1;
END $$;
REVOKE ALL ON FUNCTION public.sante_ventes_par_categorie(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_ventes_par_categorie(uuid,date,date) TO authenticated;

-- ===== P1.2 Besoin d'en connaître =====
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS acces_tous_dossiers boolean NOT NULL DEFAULT false;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS bris_glace_seuil_semaine integer NOT NULL DEFAULT 3;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS bris_glace_renouvellements_max integer NOT NULL DEFAULT 2;

-- Relation de soin : RDV avec un praticien lié au médecin, consultation menée/créée, demande prescrite
CREATE OR REPLACE FUNCTION public.sante_relation_soin(_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sante_rendez_vous r JOIN sante_praticiens pr ON pr.id = r.praticien_id
                 WHERE r.patient_id = _patient_id AND pr.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM sante_consultations c LEFT JOIN sante_praticiens pr ON pr.id = c.praticien_id
                 WHERE c.patient_id = _patient_id AND (c.created_by = auth.uid() OR pr.user_id = auth.uid()))
      OR EXISTS (SELECT 1 FROM sante_demandes_labo d WHERE d.patient_id = _patient_id AND d.created_by = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.sante_relation_soin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_relation_soin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_clinique(_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sante_patients p JOIN public.structures s ON s.id = p.structure_id
    WHERE p.id = _patient_id
    AND public.structure_module_actif(p.structure_id, 'sante_patients')
    AND (
      (public.has_any_medical_role(p.structure_id, ARRAY['medecin']) AND (s.acces_tous_dossiers OR public.sante_relation_soin(p.id)))
      OR (public.has_any_medical_role(p.structure_id, ARRAY['biologiste'])
          AND EXISTS (SELECT 1 FROM public.sante_demandes_labo d WHERE d.patient_id = p.id))
      OR EXISTS (SELECT 1 FROM public.sante_bris_glace b WHERE b.patient_id = p.id AND b.user_id = auth.uid() AND b.expire_le > now()
        AND public.is_structure_member(p.structure_id))))
$$;

DROP POLICY IF EXISTS "Lecture consultations" ON public.sante_consultations;
CREATE POLICY "Lecture consultations" ON public.sante_consultations FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id, 'sante_clinique') AND public.can_access_clinique(patient_id));
DROP POLICY IF EXISTS "Maj consultation brouillon" ON public.sante_consultations;
CREATE POLICY "Maj consultation brouillon" ON public.sante_consultations FOR UPDATE TO authenticated
  USING (statut = 'brouillon' AND public.has_any_medical_role(structure_id, ARRAY['medecin']) AND public.can_access_clinique(patient_id));

DROP POLICY IF EXISTS "Lecture ordonnances" ON public.sante_ordonnances;
CREATE POLICY "Lecture ordonnances" ON public.sante_ordonnances FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id, 'sante_clinique') AND public.can_access_clinique(patient_id));

DROP POLICY IF EXISTS "Lecture certificats" ON public.sante_certificats;
CREATE POLICY "Lecture certificats" ON public.sante_certificats FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['medecin']) AND public.can_access_clinique(patient_id));

-- Laboratoire : biologiste/technicien/préleveur = périmètre labo ; médecin = ses patients ; secrétaire exclue (renseignements cliniques)
DROP POLICY IF EXISTS "Lecture demandes" ON public.sante_demandes_labo;
CREATE POLICY "Lecture demandes" ON public.sante_demandes_labo FOR SELECT TO authenticated
  USING (public.structure_module_actif(structure_id, 'sante_laboratoire') AND (
    public.has_any_medical_role(structure_id, ARRAY['biologiste','technicien','preleveur'])
    OR (public.has_any_medical_role(structure_id, ARRAY['medecin']) AND public.can_access_clinique(patient_id))));

DROP POLICY IF EXISTS "Lecture demande analyses" ON public.sante_demande_analyses;
CREATE POLICY "Lecture demande analyses" ON public.sante_demande_analyses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sante_demandes_labo d WHERE d.id = demande_id));

DROP POLICY IF EXISTS "Lecture resultats" ON public.sante_resultats;
CREATE POLICY "Lecture resultats" ON public.sante_resultats FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['biologiste','technicien'])
    OR EXISTS (SELECT 1 FROM public.sante_demandes_labo d WHERE d.id = demande_id AND public.has_any_medical_role(d.structure_id, ARRAY['medecin']) AND public.can_access_clinique(d.patient_id)));

CREATE OR REPLACE FUNCTION public.sante_config_acces(_structure_id uuid, _tous boolean, _seuil integer, _renouv integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF _seuil < 1 OR _renouv < 0 THEN RAISE EXCEPTION 'Valeurs invalides'; END IF;
  UPDATE structures SET acces_tous_dossiers = coalesce(_tous,false), bris_glace_seuil_semaine = _seuil, bris_glace_renouvellements_max = _renouv WHERE id = _structure_id;
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, details)
  VALUES (_structure_id, auth.uid(), 'config_acces', 'structures', _structure_id, jsonb_build_object('acces_tous_dossiers', _tous, 'seuil', _seuil, 'renouvellements', _renouv));
END $$;
REVOKE ALL ON FUNCTION public.sante_config_acces(uuid,boolean,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_config_acces(uuid,boolean,integer,integer) TO authenticated;

-- ===== P1.3 Bris de glace durci =====
ALTER TABLE public.sante_bris_glace ADD COLUMN IF NOT EXISTS motif_code text;
ALTER TABLE public.sante_bris_glace ADD COLUMN IF NOT EXISTS commentaire_revue text;
ALTER TABLE public.sante_bris_glace ADD COLUMN IF NOT EXISTS escalade_le timestamptz;

DROP FUNCTION IF EXISTS public.sante_bris_de_glace(uuid, text, text);
CREATE OR REPLACE FUNCTION public.sante_bris_de_glace(_patient_id uuid, _motif text, _motif_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _ent uuid; _id uuid; _st structures; _renouv int; _semaine int;
BEGIN
  SELECT structure_id INTO _s FROM sante_patients WHERE id = _patient_id;
  IF _s IS NULL OR NOT is_structure_member(_s) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _motif_code IS NULL OR _motif_code NOT IN ('urgence_vitale','patient_inconscient','continuite_soins','demande_patient','autre') THEN
    RAISE EXCEPTION 'Motif codé obligatoire';
  END IF;
  IF char_length(trim(coalesce(_motif,''))) < 20 THEN RAISE EXCEPTION 'Justification obligatoire (20 caractères minimum)'; END IF;
  SELECT * INTO _st FROM structures WHERE id = _s;
  SELECT count(*) INTO _renouv FROM sante_bris_glace WHERE user_id = auth.uid() AND patient_id = _patient_id AND created_at > now() - interval '24 hours';
  IF _renouv > _st.bris_glace_renouvellements_max THEN RAISE EXCEPTION 'Renouvellement plafonné : % accès d''urgence sur ce dossier en 24 h', _renouv; END IF;
  INSERT INTO sante_bris_glace(structure_id, patient_id, user_id, motif, motif_code) VALUES (_s, _patient_id, auth.uid(), trim(_motif), _motif_code) RETURNING id INTO _id;
  INSERT INTO medical_access_log(structure_id, user_id, patient_id, ecran, motif) VALUES (_s, auth.uid(), _patient_id, 'bris_de_glace', _motif_code || ' : ' || trim(_motif));
  SELECT count(*) INTO _semaine FROM sante_bris_glace WHERE user_id = auth.uid() AND structure_id = _s AND created_at > now() - interval '7 days';
  _ent := _st.entreprise_id;
  IF _ent IS NOT NULL THEN
    INSERT INTO notifications(entreprise_id, user_id, type, titre, message, lien, meta)
    SELECT _ent, m.user_id, 'bris_de_glace',
      CASE WHEN _semaine > _st.bris_glace_seuil_semaine THEN 'ALERTE : accès d''urgence répétés' ELSE 'Accès d''urgence à un dossier patient' END,
      CASE WHEN _semaine > _st.bris_glace_seuil_semaine THEN 'Un utilisateur a dépassé le seuil hebdomadaire (' || _semaine || ' accès). Revue requise sous 72 h.'
           ELSE 'Un accès d''urgence a été ouvert (1 h). Revue requise sous 72 h.' END,
      NULL, jsonb_build_object('bris_glace_id', _id, 'acces_semaine', _semaine)
    FROM structure_memberships m JOIN medical_user_roles r ON r.membership_id = m.id
    WHERE m.structure_id = _s AND m.statut = 'actif' AND r.role = 'admin_structure' AND m.user_id <> auth.uid();
  END IF;
  RETURN _id;
END $$;
-- L'ancienne signature (motif libre 10 car.) est retirée aux clients
REVOKE EXECUTE ON FUNCTION public.sante_bris_de_glace(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sante_bris_de_glace(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_bris_de_glace(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.sante_revoir_bris_glace(uuid, text);
CREATE OR REPLACE FUNCTION public.sante_revoir_bris_glace(_id uuid, _commentaire text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b sante_bris_glace;
BEGIN
  SELECT * INTO b FROM sante_bris_glace WHERE id = _id;
  IF b.id IS NULL OR NOT is_structure_admin(b.structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF b.user_id = auth.uid() THEN RAISE EXCEPTION 'La revue doit être faite par un autre administrateur que l''utilisateur concerné'; END IF;
  IF b.revu_le IS NOT NULL THEN RAISE EXCEPTION 'Déjà revu'; END IF;
  IF char_length(trim(coalesce(_commentaire,''))) < 5 THEN RAISE EXCEPTION 'Commentaire de revue obligatoire'; END IF;
  UPDATE sante_bris_glace SET revu_le = now(), revu_par = auth.uid(), commentaire_revue = trim(_commentaire), expire_le = least(expire_le, now()) WHERE id = _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.sante_revoir_bris_glace(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sante_revoir_bris_glace(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_revoir_bris_glace(uuid, text) TO authenticated;

-- Escalade : accès non revus après 72 h -> notification à tous les admins (horaire)
CREATE OR REPLACE FUNCTION public.sante_escalader_bris_glace()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; _n int := 0;
BEGIN
  FOR b IN SELECT bg.*, s.entreprise_id FROM sante_bris_glace bg JOIN structures s ON s.id = bg.structure_id
           WHERE bg.revu_le IS NULL AND bg.escalade_le IS NULL AND bg.created_at < now() - interval '72 hours' LOOP
    IF b.entreprise_id IS NOT NULL THEN
      INSERT INTO notifications(entreprise_id, user_id, type, titre, message, meta)
      SELECT b.entreprise_id, m.user_id, 'bris_de_glace', 'ESCALADE : accès d''urgence non revu sous 72 h',
        'Un accès d''urgence ouvert le ' || to_char(b.created_at, 'DD/MM/YYYY HH24:MI') || ' n''a pas été revu.', jsonb_build_object('bris_glace_id', b.id)
      FROM structure_memberships m JOIN medical_user_roles r ON r.membership_id = m.id
      WHERE m.structure_id = b.structure_id AND m.statut = 'actif' AND r.role = 'admin_structure';
    END IF;
    UPDATE sante_bris_glace SET escalade_le = now() WHERE id = b.id;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.sante_escalader_bris_glace() FROM PUBLIC, anon, authenticated;

-- ===== P1.4 Conformité technique =====
ALTER TABLE public.sante_consentements ADD COLUMN IF NOT EXISTS texte text;

ALTER TABLE public.sante_violations ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'detectee';
ALTER TABLE public.sante_violations ADD COLUMN IF NOT EXISTS qualification text;
ALTER TABLE public.sante_violations ADD COLUMN IF NOT EXISTS gravite text;
ALTER TABLE public.sante_violations ADD COLUMN IF NOT EXISTS echeance_notification timestamptz;
ALTER TABLE public.sante_violations ADD COLUMN IF NOT EXISTS qualifiee_le timestamptz;
ALTER TABLE public.sante_violations ADD COLUMN IF NOT EXISTS cloturee_le timestamptz;
ALTER TABLE public.sante_violations ADD COLUMN IF NOT EXISTS conclusion text;
UPDATE public.sante_violations SET echeance_notification = detectee_le + interval '72 hours' WHERE echeance_notification IS NULL;
UPDATE public.sante_violations SET statut = 'notifiee' WHERE notifiee_cdp_le IS NOT NULL AND statut = 'detectee';

CREATE OR REPLACE FUNCTION public.sante_avancer_violation(_id uuid, _statut text, _texte text, _gravite text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v sante_violations;
BEGIN
  SELECT * INTO v FROM sante_violations WHERE id = _id;
  IF v.id IS NULL OR NOT is_structure_admin(v.structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF NOT ((v.statut='detectee' AND _statut='qualifiee') OR (v.statut='qualifiee' AND _statut IN ('notifiee','cloturee')) OR (v.statut='notifiee' AND _statut='cloturee')) THEN
    RAISE EXCEPTION 'Étape interdite : % → %', v.statut, _statut;
  END IF;
  IF coalesce(trim(_texte),'') = '' THEN RAISE EXCEPTION 'Texte obligatoire'; END IF;
  UPDATE sante_violations SET statut = _statut,
    qualification = CASE WHEN _statut='qualifiee' THEN trim(_texte) ELSE qualification END,
    gravite = CASE WHEN _statut='qualifiee' THEN _gravite ELSE gravite END,
    qualifiee_le = CASE WHEN _statut='qualifiee' THEN now() ELSE qualifiee_le END,
    notifiee_cdp_le = CASE WHEN _statut='notifiee' THEN now() ELSE notifiee_cdp_le END,
    mesures = CASE WHEN _statut='notifiee' THEN coalesce(mesures,'') || E'\nNotification : ' || trim(_texte) ELSE mesures END,
    cloturee_le = CASE WHEN _statut='cloturee' THEN now() ELSE cloturee_le END,
    conclusion = CASE WHEN _statut='cloturee' THEN trim(_texte) ELSE conclusion END
  WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_avancer_violation(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_avancer_violation(uuid,text,text,text) TO authenticated;

-- Conservation par type de document (valeur par défaut 20 ans, À CONFIRMER par le juriste)
CREATE TABLE IF NOT EXISTS public.sante_conservation_regles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  type_document text NOT NULL,
  duree_annees integer NOT NULL DEFAULT 20 CHECK (duree_annees BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, type_document)
);
GRANT SELECT ON public.sante_conservation_regles TO authenticated;
GRANT ALL ON public.sante_conservation_regles TO service_role;
ALTER TABLE public.sante_conservation_regles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins lisent conservation" ON public.sante_conservation_regles FOR SELECT TO authenticated USING (public.is_structure_admin(structure_id));

CREATE OR REPLACE FUNCTION public.sante_duree_conservation(_structure_id uuid, _type text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT duree_annees FROM sante_conservation_regles WHERE structure_id=_structure_id AND type_document=coalesce(_type,'autre')),
                  (SELECT duree_annees FROM sante_conservation_regles WHERE structure_id=_structure_id AND type_document='defaut'), 20)
$$;

CREATE OR REPLACE FUNCTION public.sante_config_conservation(_structure_id uuid, _type text, _annees integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  INSERT INTO sante_conservation_regles(structure_id, type_document, duree_annees) VALUES (_structure_id, trim(_type), _annees)
  ON CONFLICT (structure_id, type_document) DO UPDATE SET duree_annees = EXCLUDED.duree_annees, updated_at = now();
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, details)
  VALUES (_structure_id, auth.uid(), 'config_conservation', 'sante_conservation_regles', _structure_id, jsonb_build_object('type', _type, 'annees', _annees));
END $$;
REVOKE ALL ON FUNCTION public.sante_config_conservation(uuid,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_config_conservation(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_sante_document_conservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('sante.purge', true),'') = 'on' THEN RETURN OLD; END IF;
  IF OLD.created_at + make_interval(years => sante_duree_conservation(OLD.structure_id, OLD.type)) > now() THEN
    RAISE EXCEPTION 'Suppression interdite avant la fin de la durée de conservation';
  END IF;
  RAISE EXCEPTION 'Suppression uniquement par la purge contrôlée';
END $$;
DROP TRIGGER IF EXISTS sante_document_conservation ON public.sante_documents_patient;
CREATE TRIGGER sante_document_conservation BEFORE DELETE ON public.sante_documents_patient
  FOR EACH ROW EXECUTE FUNCTION public.trg_sante_document_conservation();
REVOKE EXECUTE ON FUNCTION public.trg_sante_document_conservation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sante_purger_documents_echus(_structure_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  PERFORM set_config('sante.purge','on',true);
  WITH d AS (DELETE FROM sante_documents_patient WHERE structure_id = _structure_id
     AND created_at + make_interval(years => sante_duree_conservation(structure_id, type)) <= now() RETURNING id)
  SELECT count(*) INTO _n FROM d;
  PERFORM set_config('sante.purge','',true);
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, details)
  VALUES (_structure_id, auth.uid(), 'purge_conservation', 'sante_documents_patient', _structure_id, jsonb_build_object('documents_purges', _n));
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.sante_purger_documents_echus(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_purger_documents_echus(uuid) TO authenticated;

-- Droit d'accès : export complet tracé du dossier
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
    'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object('nom', d.nom, 'type', d.type, 'created_at', d.created_at)),'[]') FROM sante_documents_patient d WHERE d.patient_id=_patient_id),
    'acces', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', l.created_at, 'ecran', l.ecran, 'motif', l.motif)),'[]') FROM medical_access_log l WHERE l.patient_id=_patient_id)
  ) INTO _r;
  INSERT INTO medical_access_log(structure_id, user_id, patient_id, ecran, motif) VALUES (_s, auth.uid(), _patient_id, 'export_droit_acces', 'Export du dossier (droit d''accès)');
  RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.sante_export_dossier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_export_dossier(uuid) TO authenticated;