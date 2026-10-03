
CREATE TABLE public.sante_sessions_caisse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  caissier uuid NOT NULL DEFAULT auth.uid(),
  ouverte_le timestamptz NOT NULL DEFAULT now(),
  fond_initial numeric NOT NULL DEFAULT 0 CHECK (fond_initial >= 0),
  fermee_le timestamptz,
  montant_compte numeric,
  montant_attendu numeric,
  ecart numeric
);
CREATE UNIQUE INDEX sante_caisse_une_ouverte ON public.sante_sessions_caisse(structure_id, caissier) WHERE fermee_le IS NULL;

CREATE TABLE public.sante_factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  numero text NOT NULL,
  type text NOT NULL DEFAULT 'facture' CHECK (type IN ('facture','avoir')),
  facture_origine_id uuid REFERENCES public.sante_factures(id),
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  consultation_id uuid REFERENCES public.sante_consultations(id),
  demande_id uuid REFERENCES public.sante_demandes_labo(id),
  organisme text,
  taux_couverture numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL,
  remise numeric NOT NULL DEFAULT 0,
  motif_remise text,
  part_organisme numeric NOT NULL DEFAULT 0,
  part_patient numeric NOT NULL,
  statut_tiers text NOT NULL DEFAULT 'sans' CHECK (statut_tiers IN ('sans','a_facturer','envoye','paye','rejete')),
  annulee boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, numero)
);
CREATE INDEX ON public.sante_factures(structure_id, created_at DESC);
CREATE INDEX ON public.sante_factures(patient_id);

CREATE TABLE public.sante_facture_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES public.sante_factures(id) ON DELETE CASCADE,
  structure_id uuid NOT NULL,
  libelle text NOT NULL,
  code text,
  quantite numeric NOT NULL DEFAULT 1,
  prix_unitaire numeric NOT NULL,
  montant numeric NOT NULL
);

CREATE TABLE public.sante_encaissements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  facture_id uuid NOT NULL REFERENCES public.sante_factures(id),
  session_id uuid REFERENCES public.sante_sessions_caisse(id),
  mode text NOT NULL CHECK (mode IN ('especes','wave','orange_money','free_money','wizall','carte','cheque','virement','organisme')),
  montant numeric NOT NULL CHECK (montant > 0),
  reference text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sante_encaissements(facture_id);

GRANT SELECT ON public.sante_sessions_caisse, public.sante_factures, public.sante_facture_lignes, public.sante_encaissements TO authenticated;
GRANT ALL ON public.sante_sessions_caisse, public.sante_factures, public.sante_facture_lignes, public.sante_encaissements TO service_role;

ALTER TABLE public.sante_sessions_caisse ENABLE ROW LEVEL SECURITY; ALTER TABLE public.sante_sessions_caisse FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sante_factures ENABLE ROW LEVEL SECURITY; ALTER TABLE public.sante_factures FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sante_facture_lignes ENABLE ROW LEVEL SECURITY; ALTER TABLE public.sante_facture_lignes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sante_encaissements ENABLE ROW LEVEL SECURITY; ALTER TABLE public.sante_encaissements FORCE ROW LEVEL SECURITY;

CREATE POLICY "Lecture facturation" ON public.sante_factures FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','caissier','comptable','lecteur','medecin','biologiste']));
CREATE POLICY "Lecture lignes" ON public.sante_facture_lignes FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','caissier','comptable','lecteur','medecin','biologiste']));
CREATE POLICY "Lecture encaissements" ON public.sante_encaissements FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','caissier','comptable','lecteur']));
CREATE POLICY "Lecture caisse" ON public.sante_sessions_caisse FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','comptable']));

-- Création de facture (immuable ensuite)
CREATE OR REPLACE FUNCTION public.sante_creer_facture(_patient_id uuid, _lignes jsonb, _assurance_id uuid DEFAULT NULL, _remise numeric DEFAULT 0, _motif_remise text DEFAULT NULL, _consultation_id uuid DEFAULT NULL, _demande_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _total numeric := 0; _l jsonb; _id uuid; _org text; _taux numeric := 0; _plafond numeric; _po numeric := 0; _net numeric;
BEGIN
  SELECT structure_id INTO _s FROM sante_patients WHERE id = _patient_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'Patient introuvable'; END IF;
  IF NOT has_any_medical_role(_s, ARRAY['admin_structure','secretaire','caissier','medecin','biologiste']) THEN RAISE EXCEPTION 'Droit insuffisant pour facturer'; END IF;
  IF jsonb_typeof(_lignes) <> 'array' OR jsonb_array_length(_lignes) = 0 THEN RAISE EXCEPTION 'Au moins une ligne est requise'; END IF;
  IF coalesce(_remise,0) < 0 THEN RAISE EXCEPTION 'Remise invalide'; END IF;
  IF coalesce(_remise,0) > 0 THEN
    IF NOT has_any_medical_role(_s, ARRAY['admin_structure']) THEN RAISE EXCEPTION 'Seul l''administrateur peut accorder une remise'; END IF;
    IF coalesce(trim(_motif_remise),'') = '' THEN RAISE EXCEPTION 'Motif de remise obligatoire'; END IF;
  END IF;
  FOR _l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    IF (_l->>'prix_unitaire')::numeric < 0 OR coalesce((_l->>'quantite')::numeric,1) <= 0 THEN RAISE EXCEPTION 'Ligne invalide'; END IF;
    _total := _total + round(coalesce((_l->>'quantite')::numeric,1) * (_l->>'prix_unitaire')::numeric);
  END LOOP;
  IF _remise > _total THEN RAISE EXCEPTION 'Remise supérieure au total'; END IF;
  _net := _total - coalesce(_remise,0);
  IF _assurance_id IS NOT NULL THEN
    SELECT organisme, taux_couverture, plafond INTO _org, _taux, _plafond FROM sante_patient_assurances
      WHERE id = _assurance_id AND patient_id = _patient_id AND (date_fin IS NULL OR date_fin >= current_date) AND (date_debut IS NULL OR date_debut <= current_date);
    IF _org IS NULL THEN RAISE EXCEPTION 'Prise en charge invalide ou expirée'; END IF;
    _po := round(_net * coalesce(_taux,0) / 100);
    IF _plafond IS NOT NULL AND _po > _plafond THEN _po := _plafond; END IF;
  END IF;
  INSERT INTO sante_factures(structure_id, numero, patient_id, consultation_id, demande_id, organisme, taux_couverture, total, remise, motif_remise, part_organisme, part_patient, statut_tiers)
  VALUES (_s, sante_prochain_numero(_s,'facture','FAC'), _patient_id, _consultation_id, _demande_id, _org, coalesce(_taux,0), _total, coalesce(_remise,0), _motif_remise, _po, _net - _po, CASE WHEN _po > 0 THEN 'a_facturer' ELSE 'sans' END)
  RETURNING id INTO _id;
  INSERT INTO sante_facture_lignes(facture_id, structure_id, libelle, code, quantite, prix_unitaire, montant)
  SELECT _id, _s, x->>'libelle', x->>'code', coalesce((x->>'quantite')::numeric,1), (x->>'prix_unitaire')::numeric, round(coalesce((x->>'quantite')::numeric,1)*(x->>'prix_unitaire')::numeric)
  FROM jsonb_array_elements(_lignes) x;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_ouvrir_caisse(_structure_id uuid, _fond numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','caissier','secretaire']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  INSERT INTO sante_sessions_caisse(structure_id, fond_initial) VALUES (_structure_id, coalesce(_fond,0)) RETURNING id INTO _id;
  RETURN _id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Une caisse est déjà ouverte';
END $$;

CREATE OR REPLACE FUNCTION public.sante_fermer_caisse(_session_id uuid, _compte numeric) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r sante_sessions_caisse; _att numeric; BEGIN
  SELECT * INTO _r FROM sante_sessions_caisse WHERE id = _session_id AND caissier = auth.uid() AND fermee_le IS NULL;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Session introuvable ou déjà fermée'; END IF;
  SELECT _r.fond_initial + coalesce(sum(montant),0) INTO _att FROM sante_encaissements WHERE session_id = _session_id AND mode = 'especes';
  UPDATE sante_sessions_caisse SET fermee_le = now(), montant_compte = _compte, montant_attendu = _att, ecart = _compte - _att WHERE id = _session_id;
  RETURN _compte - _att;
END $$;

CREATE OR REPLACE FUNCTION public.sante_encaisser(_facture_id uuid, _mode text, _montant numeric, _reference text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f sante_factures; _deja numeric; _sess uuid; _id uuid; BEGIN
  SELECT * INTO _f FROM sante_factures WHERE id = _facture_id FOR UPDATE;
  IF _f.id IS NULL OR _f.type <> 'facture' THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF _f.annulee THEN RAISE EXCEPTION 'Facture annulée'; END IF;
  IF NOT has_any_medical_role(_f.structure_id, ARRAY['admin_structure','caissier','secretaire']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF _mode = 'organisme' THEN RAISE EXCEPTION 'Utilisez le règlement tiers-payant'; END IF;
  SELECT coalesce(sum(montant),0) INTO _deja FROM sante_encaissements WHERE facture_id = _facture_id AND mode <> 'organisme';
  IF _montant <= 0 OR _deja + _montant > _f.part_patient THEN RAISE EXCEPTION 'Montant supérieur au reste dû (%)', _f.part_patient - _deja; END IF;
  SELECT id INTO _sess FROM sante_sessions_caisse WHERE structure_id = _f.structure_id AND caissier = auth.uid() AND fermee_le IS NULL;
  IF _sess IS NULL THEN RAISE EXCEPTION 'Ouvrez d''abord votre caisse'; END IF;
  INSERT INTO sante_encaissements(structure_id, facture_id, session_id, mode, montant, reference) VALUES (_f.structure_id, _facture_id, _sess, _mode, round(_montant), _reference) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_statut_tiers(_facture_id uuid, _statut text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f sante_factures; BEGIN
  SELECT * INTO _f FROM sante_factures WHERE id = _facture_id FOR UPDATE;
  IF _f.id IS NULL OR _f.part_organisme = 0 OR _f.annulee THEN RAISE EXCEPTION 'Aucune part organisme'; END IF;
  IF NOT has_any_medical_role(_f.structure_id, ARRAY['admin_structure','caissier','comptable']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF NOT ((_f.statut_tiers='a_facturer' AND _statut='envoye') OR (_f.statut_tiers='envoye' AND _statut IN ('paye','rejete')) OR (_f.statut_tiers='rejete' AND _statut='envoye')) THEN
    RAISE EXCEPTION 'Transition interdite (% → %)', _f.statut_tiers, _statut; END IF;
  UPDATE sante_factures SET statut_tiers = _statut WHERE id = _facture_id;
  IF _statut = 'paye' THEN INSERT INTO sante_encaissements(structure_id, facture_id, mode, montant, reference) VALUES (_f.structure_id, _facture_id, 'organisme', _f.part_organisme, _f.organisme); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sante_annuler_facture(_facture_id uuid, _motif text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f sante_factures; _id uuid; BEGIN
  SELECT * INTO _f FROM sante_factures WHERE id = _facture_id FOR UPDATE;
  IF _f.id IS NULL OR _f.type <> 'facture' OR _f.annulee THEN RAISE EXCEPTION 'Facture non annulable'; END IF;
  IF NOT has_any_medical_role(_f.structure_id, ARRAY['admin_structure']) THEN RAISE EXCEPTION 'Seul l''administrateur peut annuler'; END IF;
  IF coalesce(trim(_motif),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  IF EXISTS (SELECT 1 FROM sante_encaissements WHERE facture_id = _facture_id) THEN RAISE EXCEPTION 'Facture déjà encaissée : remboursez avant annulation'; END IF;
  UPDATE sante_factures SET annulee = true WHERE id = _facture_id;
  INSERT INTO sante_factures(structure_id, numero, type, facture_origine_id, patient_id, organisme, taux_couverture, total, remise, motif_remise, part_organisme, part_patient)
  VALUES (_f.structure_id, sante_prochain_numero(_f.structure_id,'avoir','AV'), 'avoir', _f.id, _f.patient_id, _f.organisme, _f.taux_couverture, -_f.total, -_f.remise, _motif, -_f.part_organisme, -_f.part_patient)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Immuabilité : seules les colonnes annulee / statut_tiers évoluent, via les fonctions
CREATE OR REPLACE FUNCTION public.trg_sante_facture_immuable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Une facture ne peut pas être supprimée'; END IF;
  IF (to_jsonb(NEW) - 'annulee' - 'statut_tiers') <> (to_jsonb(OLD) - 'annulee' - 'statut_tiers') THEN RAISE EXCEPTION 'Facture immuable : émettez un avoir'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sante_factures_immuable BEFORE UPDATE OR DELETE ON public.sante_factures FOR EACH ROW EXECUTE FUNCTION public.trg_sante_facture_immuable();
CREATE OR REPLACE FUNCTION public.trg_sante_immuable_simple() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Enregistrement immuable'; END $$;
CREATE TRIGGER sante_lignes_immuable BEFORE UPDATE OR DELETE ON public.sante_facture_lignes FOR EACH ROW EXECUTE FUNCTION public.trg_sante_immuable_simple();
CREATE TRIGGER sante_enc_immuable BEFORE UPDATE OR DELETE ON public.sante_encaissements FOR EACH ROW EXECUTE FUNCTION public.trg_sante_immuable_simple();

CREATE TRIGGER audit_sante_factures AFTER INSERT OR UPDATE ON public.sante_factures FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();
CREATE TRIGGER audit_sante_encaissements AFTER INSERT ON public.sante_encaissements FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

REVOKE EXECUTE ON FUNCTION public.sante_creer_facture(uuid,jsonb,uuid,numeric,text,uuid,uuid), public.sante_ouvrir_caisse(uuid,numeric), public.sante_fermer_caisse(uuid,numeric), public.sante_encaisser(uuid,text,numeric,text), public.sante_statut_tiers(uuid,text), public.sante_annuler_facture(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_creer_facture(uuid,jsonb,uuid,numeric,text,uuid,uuid), public.sante_ouvrir_caisse(uuid,numeric), public.sante_fermer_caisse(uuid,numeric), public.sante_encaisser(uuid,text,numeric,text), public.sante_statut_tiers(uuid,text), public.sante_annuler_facture(uuid,text) TO authenticated;
