ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS facturation_auto boolean NOT NULL DEFAULT false;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS acte_consultation_code text;

CREATE TABLE public.sante_bris_glace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  user_id uuid NOT NULL,
  motif text NOT NULL,
  expire_le timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  revu_le timestamptz,
  revu_par uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_bris_glace TO authenticated;
GRANT ALL ON public.sante_bris_glace TO service_role;
ALTER TABLE public.sante_bris_glace ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin ou auteur lit bris de glace" ON public.sante_bris_glace FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_structure_admin(structure_id));

CREATE OR REPLACE FUNCTION public.can_access_clinique(_patient_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sante_patients p WHERE p.id = _patient_id
    AND public.structure_module_actif(p.structure_id, 'sante_patients')
    AND (public.has_any_medical_role(p.structure_id, ARRAY['medecin','biologiste'])
      OR EXISTS (SELECT 1 FROM public.sante_bris_glace b WHERE b.patient_id = p.id AND b.user_id = auth.uid() AND b.expire_le > now()
        AND public.is_structure_member(p.structure_id))))
$$;

CREATE OR REPLACE FUNCTION public.sante_bris_de_glace(_patient_id uuid, _motif text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _ent uuid; _id uuid;
BEGIN
  SELECT structure_id INTO _s FROM sante_patients WHERE id = _patient_id;
  IF _s IS NULL OR NOT is_structure_member(_s) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF char_length(trim(coalesce(_motif,''))) < 10 THEN RAISE EXCEPTION 'Motif d''urgence obligatoire (10 caractères minimum)'; END IF;
  INSERT INTO sante_bris_glace(structure_id, patient_id, user_id, motif) VALUES (_s, _patient_id, auth.uid(), trim(_motif)) RETURNING id INTO _id;
  INSERT INTO medical_access_log(structure_id, user_id, patient_id, ecran, motif) VALUES (_s, auth.uid(), _patient_id, 'bris_de_glace', trim(_motif));
  SELECT entreprise_id INTO _ent FROM structures WHERE id = _s;
  IF _ent IS NOT NULL THEN
    INSERT INTO notifications(entreprise_id, user_id, type, titre, message, lien, meta)
    SELECT _ent, m.user_id, 'bris_de_glace', 'Accès d''urgence à un dossier patient',
      'Un accès d''urgence a été ouvert (1 h). À revoir dans le journal des accès.', NULL, jsonb_build_object('bris_glace_id', _id)
    FROM structure_memberships m JOIN medical_user_roles r ON r.membership_id = m.id
    WHERE m.structure_id = _s AND m.statut = 'actif' AND r.role = 'admin_structure' AND m.user_id <> auth.uid();
  END IF;
  RETURN _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.sante_bris_de_glace(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_bris_de_glace(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_revoir_bris_glace(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid;
BEGIN
  SELECT structure_id INTO _s FROM sante_bris_glace WHERE id = _id;
  IF _s IS NULL OR NOT is_structure_admin(_s) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  UPDATE sante_bris_glace SET revu_le = now(), revu_par = auth.uid(), expire_le = least(expire_le, now()) WHERE id = _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.sante_revoir_bris_glace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_revoir_bris_glace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_config_facturation(_structure_id uuid, _auto boolean, _acte_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF _acte_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sante_actes WHERE structure_id = _structure_id AND code = _acte_code AND actif) THEN RAISE EXCEPTION 'Acte inconnu'; END IF;
  UPDATE structures SET facturation_auto = _auto, acte_consultation_code = _acte_code WHERE id = _structure_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.sante_config_facturation(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_config_facturation(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_assurance_active(_patient_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM sante_patient_assurances WHERE patient_id = _patient_id
    AND (date_fin IS NULL OR date_fin >= current_date) AND (date_debut IS NULL OR date_debut <= current_date)
  ORDER BY taux_couverture DESC LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.sante_assurance_active(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_sante_facture_auto_consult() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _st structures; _a sante_actes;
BEGIN
  IF NEW.statut = 'cloturee' AND OLD.statut <> 'cloturee' THEN
    SELECT * INTO _st FROM structures WHERE id = NEW.structure_id;
    IF _st.facturation_auto AND _st.acte_consultation_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sante_factures WHERE consultation_id = NEW.id AND type = 'facture' AND NOT annulee) THEN
      SELECT * INTO _a FROM sante_actes WHERE structure_id = NEW.structure_id AND code = _st.acte_consultation_code AND actif;
      IF _a.id IS NOT NULL THEN
        PERFORM sante_creer_facture(NEW.patient_id, jsonb_build_array(jsonb_build_object('code', _a.code, 'libelle', _a.libelle, 'prix_unitaire', _a.tarif, 'quantite', 1)),
          sante_assurance_active(NEW.patient_id), 0, NULL, NEW.id, NULL);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sante_facture_auto_consult AFTER UPDATE OF statut ON public.sante_consultations FOR EACH ROW EXECUTE FUNCTION public.trg_sante_facture_auto_consult();

CREATE OR REPLACE FUNCTION public.trg_sante_facture_auto_labo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l jsonb;
BEGIN
  IF NEW.statut = 'validee' AND OLD.statut <> 'validee'
     AND (SELECT facturation_auto FROM structures WHERE id = NEW.structure_id)
     AND NOT EXISTS (SELECT 1 FROM sante_factures WHERE demande_id = NEW.id AND type = 'facture' AND NOT annulee) THEN
    SELECT jsonb_agg(jsonb_build_object('code', a.code, 'libelle', a.libelle, 'prix_unitaire', coalesce(da.tarif, a.tarif), 'quantite', 1)) INTO _l
      FROM sante_demande_analyses da JOIN sante_analyses a ON a.id = da.analyse_id WHERE da.demande_id = NEW.id;
    IF _l IS NOT NULL THEN
      PERFORM sante_creer_facture(NEW.patient_id, _l, sante_assurance_active(NEW.patient_id), 0, NULL, NULL, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sante_facture_auto_labo AFTER UPDATE OF statut ON public.sante_demandes_labo FOR EACH ROW EXECUTE FUNCTION public.trg_sante_facture_auto_labo();
REVOKE EXECUTE ON FUNCTION public.trg_sante_facture_auto_consult() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sante_facture_auto_labo() FROM PUBLIC, anon, authenticated;