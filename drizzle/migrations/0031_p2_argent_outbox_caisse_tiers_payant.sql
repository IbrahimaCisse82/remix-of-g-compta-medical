-- ========== Paramètres ==========
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS facturation_labo_moment text NOT NULL DEFAULT 'enregistrement';
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS compta_panne_simulee boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.structures.compta_panne_simulee IS 'Test de résilience : force l''échec de la comptabilisation (outbox) ; jamais activé en exploitation';

CREATE TABLE public.sante_comptes_parametres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  cle text NOT NULL,
  compte text NOT NULL CHECK (compte ~ '^[0-9A-Z]{2,12}$'),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, cle)
);
GRANT SELECT ON public.sante_comptes_parametres TO authenticated;
GRANT ALL ON public.sante_comptes_parametres TO service_role;
ALTER TABLE public.sante_comptes_parametres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture comptes parametres" ON public.sante_comptes_parametres FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','comptable','caissier','tiers_payant']));

CREATE OR REPLACE FUNCTION public.sante_compte_defaut(_cle text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _cle
    WHEN 'patients' THEN '4111' WHEN 'organismes' THEN '4114' WHEN 'produits' THEN '706'
    WHEN 'especes' THEN '571' WHEN 'mobile_money' THEN '5215' WHEN 'carte' THEN '521'
    WHEN 'cheques_a_encaisser' THEN '513' WHEN 'banque' THEN '521'
    WHEN 'ecart_caisse_perte' THEN '658' WHEN 'ecart_caisse_gain' THEN '758' WHEN 'perte_creance' THEN '651'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.sante_compte(_structure_id uuid, _cle text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT compte FROM sante_comptes_parametres WHERE structure_id = _structure_id AND cle = _cle), sante_compte_defaut(_cle))
$$;

CREATE OR REPLACE FUNCTION public.sante_compte_tresorerie(_structure_id uuid, _mode text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sante_compte(_structure_id, CASE
    WHEN _mode = 'especes' THEN 'especes'
    WHEN _mode IN ('wave','orange_money','free_money','wizall') THEN 'mobile_money'
    WHEN _mode = 'carte' THEN 'carte'
    WHEN _mode = 'cheque' THEN 'cheques_a_encaisser'
    ELSE 'banque' END)
$$;

CREATE OR REPLACE FUNCTION public.sante_definir_compte(_structure_id uuid, _cle text, _compte text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable']) THEN RAISE EXCEPTION 'Réservé à l''administrateur ou au comptable'; END IF;
  IF sante_compte_defaut(_cle) IS NULL THEN RAISE EXCEPTION 'Clé inconnue'; END IF;
  INSERT INTO sante_comptes_parametres(structure_id, cle, compte) VALUES (_structure_id, _cle, trim(_compte))
  ON CONFLICT (structure_id, cle) DO UPDATE SET compte = EXCLUDED.compte, updated_by = auth.uid(), updated_at = now();
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'parametre_compte', 'sante_comptes_parametres', _structure_id, jsonb_build_object('cle', _cle, 'compte', _compte));
END $$;

CREATE TABLE public.sante_organismes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  nom text NOT NULL,
  type text NOT NULL DEFAULT 'ipm' CHECK (type IN ('ipm','assurance','mutuelle','entreprise','autre')),
  compte_auxiliaire text,
  bascule_patient_autorisee boolean NOT NULL DEFAULT false,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, nom)
);
GRANT SELECT, INSERT, UPDATE ON public.sante_organismes TO authenticated;
GRANT ALL ON public.sante_organismes TO service_role;
ALTER TABLE public.sante_organismes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture organismes" ON public.sante_organismes FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','comptable','caissier','secretaire','tiers_payant']));
CREATE POLICY "Ajout organismes" ON public.sante_organismes FOR INSERT TO authenticated
  WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','tiers_payant']));
CREATE POLICY "Maj organismes" ON public.sante_organismes FOR UPDATE TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','tiers_payant']));
INSERT INTO public.sante_organismes(structure_id, nom)
SELECT DISTINCT f.structure_id, f.organisme FROM public.sante_factures f WHERE f.organisme IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sante_aux_organisme(_structure_id uuid, _nom text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT compte_auxiliaire FROM sante_organismes WHERE structure_id=_structure_id AND nom=_nom), _nom)
$$;

CREATE TABLE public.sante_compta_evenements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  journal text NOT NULL,
  date_piece date NOT NULL,
  libelle text NOT NULL,
  piece text,
  lignes jsonb NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','comptabilise','en_erreur')),
  tentatives integer NOT NULL DEFAULT 0,
  derniere_erreur text,
  ecriture_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  traite_le timestamptz,
  UNIQUE (source_type, source_id)
);
CREATE INDEX sante_compta_evt_statut ON public.sante_compta_evenements(structure_id, statut);
GRANT SELECT ON public.sante_compta_evenements TO authenticated;
GRANT ALL ON public.sante_compta_evenements TO service_role;
ALTER TABLE public.sante_compta_evenements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture outbox" ON public.sante_compta_evenements FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','comptable','caissier']));

CREATE OR REPLACE FUNCTION public.sante_traiter_evenement(_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e sante_compta_evenements; _ent uuid; _panne boolean; _exe uuid; _ecr uuid; _propres jsonb;
BEGIN
  SELECT * INTO e FROM sante_compta_evenements WHERE id = _id FOR UPDATE;
  IF e.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF e.statut = 'comptabilise' THEN RETURN 'deja'; END IF;
  BEGIN
    SELECT entreprise_id, compta_panne_simulee INTO _ent, _panne FROM structures WHERE id = e.structure_id;
    IF _panne THEN RAISE EXCEPTION 'Panne simulée du module comptable'; END IF;
    IF _ent IS NULL THEN RAISE EXCEPTION 'Structure non reliée à une entreprise comptable'; END IF;
    SELECT id INTO _exe FROM exercices WHERE entreprise_id = _ent AND statut = 'en_cours' AND e.date_piece BETWEEN date_debut AND date_fin ORDER BY annee DESC LIMIT 1;
    IF _exe IS NULL THEN RAISE EXCEPTION 'Aucun exercice ouvert à cette date'; END IF;
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO _propres FROM jsonb_array_elements(e.lignes) x
      WHERE coalesce((x->>'debit')::numeric,0) <> 0 OR coalesce((x->>'credit')::numeric,0) <> 0;
    PERFORM set_config('app.sante_compta','1',true);
    _ecr := fn_creer_ecriture(_ent, _exe, e.journal, e.date_piece, e.libelle, _propres, e.piece, 'validee', 'sante');
    PERFORM set_config('app.sante_compta','',true);
    UPDATE sante_compta_evenements SET statut='comptabilise', ecriture_id=_ecr, tentatives=tentatives+1, derniere_erreur=NULL, traite_le=now() WHERE id = _id;
    RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.sante_compta','',true);
    UPDATE sante_compta_evenements SET statut='en_erreur', tentatives=tentatives+1, derniere_erreur=left(SQLERRM,300), traite_le=now() WHERE id = _id;
    RETURN 'erreur';
  END;
END $$;
REVOKE ALL ON FUNCTION public.sante_traiter_evenement(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sante_comptabiliser(_structure_id uuid, _type text, _source uuid, _journal text, _date date, _libelle text, _piece text, _lignes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO sante_compta_evenements(structure_id, source_type, source_id, journal, date_piece, libelle, piece, lignes)
  VALUES (_structure_id, _type, _source, _journal, _date, _libelle, _piece, _lignes)
  ON CONFLICT (source_type, source_id) DO NOTHING RETURNING id INTO _id;
  IF _id IS NOT NULL THEN PERFORM sante_traiter_evenement(_id); END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sante_comptabiliser(uuid,text,uuid,text,date,text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sante_rejouer_outbox(_structure_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _n int := 0;
BEGIN
  IF _structure_id IS NULL OR NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable']) THEN RAISE EXCEPTION 'Réservé à l''administrateur ou au comptable'; END IF;
  FOR r IN SELECT id FROM sante_compta_evenements WHERE structure_id = _structure_id AND statut <> 'comptabilise' ORDER BY created_at LOOP
    IF sante_traiter_evenement(r.id) = 'ok' THEN _n := _n + 1; END IF;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.sante_rejouer_outbox(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_rejouer_outbox(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_rejouer_outbox_auto()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _n int := 0;
BEGIN
  FOR r IN SELECT id FROM sante_compta_evenements WHERE statut <> 'comptabilise' AND tentatives < 50 ORDER BY created_at LIMIT 500 LOOP
    IF sante_traiter_evenement(r.id) = 'ok' THEN _n := _n + 1; END IF;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.sante_rejouer_outbox_auto() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('sante-rejeu-outbox', '35 * * * *', 'select public.sante_rejouer_outbox_auto()');

CREATE OR REPLACE FUNCTION public.fn_cloturer_exercice(_exercice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent uuid; v_n int;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Cloture reservee a l''administrateur'; END IF;
  SELECT count(*) INTO v_n FROM public.sante_compta_evenements e JOIN public.structures s ON s.id = e.structure_id
    WHERE s.entreprise_id = v_ent AND e.statut <> 'comptabilise';
  IF v_n > 0 THEN RAISE EXCEPTION 'Cloture impossible : % ecriture(s) sante en attente de comptabilisation', v_n; END IF;
  PERFORM set_config('app.exercice_ok','1',true);
  UPDATE public.exercices SET statut = 'cloture' WHERE id = _exercice_id;
  PERFORM set_config('app.exercice_ok','',true);
END $$;

CREATE OR REPLACE FUNCTION public.trg_sante_facture_compta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _net numeric; _s int; _l jsonb; d text; c text;
BEGIN
  _net := NEW.total - coalesce(NEW.remise,0);
  _s := CASE WHEN NEW.type = 'avoir' THEN -1 ELSE 1 END;
  d := CASE WHEN _s=1 THEN 'debit' ELSE 'credit' END; c := CASE WHEN _s=1 THEN 'credit' ELSE 'debit' END;
  _l := jsonb_build_array(
    jsonb_build_object('compte', sante_compte(NEW.structure_id,'patients'), 'intitule','Patients','libelle',NEW.numero, d, abs(NEW.part_patient)),
    jsonb_build_object('compte', sante_compte(NEW.structure_id,'organismes'), 'intitule','Organismes tiers-payant','libelle',NEW.numero, d, abs(NEW.part_organisme),
      'compte_auxiliaire', sante_aux_organisme(NEW.structure_id, NEW.organisme), 'auxiliaire_libelle', NEW.organisme),
    jsonb_build_object('compte', sante_compte(NEW.structure_id,'produits'), 'intitule','Prestations de services','libelle',NEW.numero, c, abs(_net)));
  PERFORM sante_comptabiliser(NEW.structure_id, NEW.type, NEW.id, 'VT', NEW.created_at::date,
    CASE WHEN _s=1 THEN 'Facture santé ' ELSE 'Avoir santé ' END || NEW.numero, NEW.numero, _l);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sante_encaissement_compta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f sante_factures; _tresor text;
BEGIN
  IF NEW.mode = 'organisme' THEN RETURN NEW; END IF;
  SELECT * INTO _f FROM sante_factures WHERE id = NEW.facture_id;
  _tresor := sante_compte_tresorerie(NEW.structure_id, NEW.mode);
  PERFORM sante_comptabiliser(NEW.structure_id, 'encaissement', NEW.id, CASE WHEN NEW.mode='especes' THEN 'CA' ELSE 'BQ' END, NEW.created_at::date,
    'Encaissement ' || _f.numero || ' (' || NEW.mode || ')', _f.numero,
    jsonb_build_array(
      jsonb_build_object('compte', _tresor, 'intitule', 'Trésorerie', 'debit', NEW.montant),
      jsonb_build_object('compte', sante_compte(NEW.structure_id,'patients'), 'intitule', 'Patients', 'credit', NEW.montant)));
  RETURN NEW;
END $$;

CREATE TABLE public.sante_facturation_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('consultation','demande_analyse')),
  source_id uuid NOT NULL,
  facture_id uuid NOT NULL REFERENCES public.sante_factures(id),
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sante_facturation_source_unique ON public.sante_facturation_sources(source_type, source_id) WHERE actif;
GRANT SELECT ON public.sante_facturation_sources TO authenticated;
GRANT ALL ON public.sante_facturation_sources TO service_role;
ALTER TABLE public.sante_facturation_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture sources" ON public.sante_facturation_sources FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','secretaire']));

INSERT INTO public.sante_facturation_sources(structure_id, source_type, source_id, facture_id)
SELECT DISTINCT ON (f.consultation_id) f.structure_id, 'consultation', f.consultation_id, f.id FROM public.sante_factures f
 WHERE f.consultation_id IS NOT NULL AND f.type='facture' AND NOT f.annulee ORDER BY f.consultation_id, f.created_at;
INSERT INTO public.sante_facturation_sources(structure_id, source_type, source_id, facture_id)
SELECT DISTINCT ON (da.id) f.structure_id, 'demande_analyse', da.id, f.id FROM public.sante_factures f JOIN public.sante_demande_analyses da ON da.demande_id = f.demande_id
 WHERE f.type='facture' AND NOT f.annulee ORDER BY da.id, f.created_at;

CREATE OR REPLACE FUNCTION public.sante_creer_facture_interne(_patient_id uuid, _lignes jsonb, _assurance_id uuid, _remise numeric, _motif_remise text, _consultation_id uuid, _demande_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _total numeric := 0; _l jsonb; _id uuid; _org text; _taux numeric := 0; _plafond numeric; _po numeric := 0; _net numeric;
BEGIN
  SELECT structure_id INTO _s FROM sante_patients WHERE id = _patient_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'Patient introuvable'; END IF;
  IF jsonb_typeof(_lignes) <> 'array' OR jsonb_array_length(_lignes) = 0 THEN RAISE EXCEPTION 'Au moins une ligne est requise'; END IF;
  IF coalesce(_remise,0) < 0 THEN RAISE EXCEPTION 'Remise invalide'; END IF;
  FOR _l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    IF (_l->>'prix_unitaire')::numeric < 0 OR coalesce((_l->>'quantite')::numeric,1) <= 0 THEN RAISE EXCEPTION 'Ligne invalide'; END IF;
    _total := _total + round(coalesce((_l->>'quantite')::numeric,1) * (_l->>'prix_unitaire')::numeric);
  END LOOP;
  IF coalesce(_remise,0) > _total THEN RAISE EXCEPTION 'Remise supérieure au total'; END IF;
  _net := _total - coalesce(_remise,0);
  IF _assurance_id IS NOT NULL THEN
    SELECT organisme, taux_couverture, plafond INTO _org, _taux, _plafond FROM sante_patient_assurances
      WHERE id = _assurance_id AND patient_id = _patient_id AND (date_fin IS NULL OR date_fin >= current_date) AND (date_debut IS NULL OR date_debut <= current_date);
    IF _org IS NULL THEN RAISE EXCEPTION 'Prise en charge invalide ou expirée'; END IF;
    _po := round(_net * coalesce(_taux,0) / 100);
    IF _plafond IS NOT NULL AND _po > _plafond THEN _po := _plafond; END IF;
    INSERT INTO sante_organismes(structure_id, nom) VALUES (_s, _org) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO sante_factures(structure_id, numero, patient_id, consultation_id, demande_id, organisme, taux_couverture, total, remise, motif_remise, part_organisme, part_patient, statut_tiers)
  VALUES (_s, sante_prochain_numero(_s,'facture','FAC'), _patient_id, _consultation_id, _demande_id, _org, coalesce(_taux,0), _total, coalesce(_remise,0), _motif_remise, _po, _net - _po, CASE WHEN _po > 0 THEN 'a_facturer' ELSE 'sans' END)
  RETURNING id INTO _id;
  INSERT INTO sante_facture_lignes(facture_id, structure_id, libelle, code, quantite, prix_unitaire, montant)
  SELECT _id, _s, x->>'libelle', x->>'code', coalesce((x->>'quantite')::numeric,1), (x->>'prix_unitaire')::numeric, round(coalesce((x->>'quantite')::numeric,1)*(x->>'prix_unitaire')::numeric)
  FROM jsonb_array_elements(_lignes) x;
  BEGIN
    IF _consultation_id IS NOT NULL THEN
      INSERT INTO sante_facturation_sources(structure_id, source_type, source_id, facture_id) VALUES (_s, 'consultation', _consultation_id, _id);
    END IF;
    IF _demande_id IS NOT NULL THEN
      INSERT INTO sante_facturation_sources(structure_id, source_type, source_id, facture_id)
      SELECT _s, 'demande_analyse', da.id, _id FROM sante_demande_analyses da WHERE da.demande_id = _demande_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Déjà facturé : cet acte ou cette analyse figure sur une facture active';
  END;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_creer_facture_interne(uuid,jsonb,uuid,numeric,text,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sante_creer_facture(_patient_id uuid, _lignes jsonb, _assurance_id uuid DEFAULT NULL, _remise numeric DEFAULT 0, _motif_remise text DEFAULT NULL, _consultation_id uuid DEFAULT NULL, _demande_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid;
BEGIN
  SELECT structure_id INTO _s FROM sante_patients WHERE id = _patient_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'Patient introuvable'; END IF;
  IF NOT has_any_medical_role(_s, ARRAY['admin_structure','secretaire','caissier','medecin','biologiste']) THEN RAISE EXCEPTION 'Droit insuffisant pour facturer'; END IF;
  IF coalesce(_remise,0) > 0 THEN
    IF NOT has_any_medical_role(_s, ARRAY['admin_structure']) THEN RAISE EXCEPTION 'Seul l''administrateur peut accorder une remise'; END IF;
    IF coalesce(trim(_motif_remise),'') = '' THEN RAISE EXCEPTION 'Motif de remise obligatoire'; END IF;
  END IF;
  RETURN sante_creer_facture_interne(_patient_id, _lignes, _assurance_id, _remise, _motif_remise, _consultation_id, _demande_id);
END $$;

CREATE OR REPLACE FUNCTION public.sante_creer_demande_labo(_patient_id uuid, _analyses uuid[], _prescripteur text DEFAULT NULL, _urgence boolean DEFAULT false, _renseignements text DEFAULT NULL, _consultation_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _id uuid; _n int; _l jsonb;
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
  IF (SELECT facturation_labo_moment FROM structures WHERE id = _s) = 'enregistrement' THEN
    SELECT jsonb_agg(jsonb_build_object('code', a.code, 'libelle', a.libelle, 'prix_unitaire', coalesce(da.tarif, a.tarif, 0), 'quantite', 1)) INTO _l
      FROM sante_demande_analyses da JOIN sante_analyses a ON a.id = da.analyse_id WHERE da.demande_id = _id;
    PERFORM sante_creer_facture_interne(_patient_id, _l, sante_assurance_active(_patient_id), 0, NULL, NULL, _id);
  END IF;
  RETURN _id;
END $$;

CREATE TABLE public.sante_remboursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  facture_id uuid NOT NULL REFERENCES public.sante_factures(id),
  avoir_id uuid NOT NULL REFERENCES public.sante_factures(id),
  montant numeric NOT NULL CHECK (montant > 0),
  motif text NOT NULL,
  statut text NOT NULL DEFAULT 'demande' CHECK (statut IN ('demande','approuve','refuse','paye')),
  demande_par uuid DEFAULT auth.uid(),
  approuve_par uuid, approuve_le timestamptz, motif_decision text,
  mode text, session_id uuid REFERENCES public.sante_sessions_caisse(id), paye_par uuid, paye_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_remboursements TO authenticated;
GRANT ALL ON public.sante_remboursements TO service_role;
ALTER TABLE public.sante_remboursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture remboursements" ON public.sante_remboursements FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','comptable']));

CREATE OR REPLACE FUNCTION public.sante_annuler_facture_interne(_facture_id uuid, _motif text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f sante_factures; _id uuid; _enc numeric; _org numeric;
BEGIN
  SELECT * INTO _f FROM sante_factures WHERE id = _facture_id FOR UPDATE;
  IF _f.id IS NULL OR _f.type <> 'facture' OR _f.annulee THEN RAISE EXCEPTION 'Facture non annulable'; END IF;
  SELECT coalesce(sum(montant) FILTER (WHERE mode <> 'organisme'),0), coalesce(sum(montant) FILTER (WHERE mode = 'organisme'),0)
    INTO _enc, _org FROM sante_encaissements WHERE facture_id = _facture_id;
  IF _org > 0 THEN RAISE EXCEPTION 'Un règlement d''organisme est imputé sur cette facture : régularisez d''abord avec l''organisme'; END IF;
  UPDATE sante_factures SET annulee = true WHERE id = _facture_id;
  INSERT INTO sante_factures(structure_id, numero, type, facture_origine_id, patient_id, organisme, taux_couverture, total, remise, motif_remise, part_organisme, part_patient)
  VALUES (_f.structure_id, sante_prochain_numero(_f.structure_id,'avoir','AV'), 'avoir', _f.id, _f.patient_id, _f.organisme, _f.taux_couverture, -_f.total, -_f.remise, _motif, -_f.part_organisme, -_f.part_patient)
  RETURNING id INTO _id;
  UPDATE sante_facturation_sources SET actif = false WHERE facture_id = _facture_id;
  IF _enc > 0 THEN
    INSERT INTO sante_remboursements(structure_id, facture_id, avoir_id, montant, motif) VALUES (_f.structure_id, _f.id, _id, _enc, _motif);
  END IF;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_annuler_facture_interne(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_sante_facture_auto_labo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l jsonb; _st structures; _f uuid;
BEGIN
  SELECT * INTO _st FROM structures WHERE id = NEW.structure_id;
  IF NEW.statut = 'validee' AND OLD.statut <> 'validee' AND _st.facturation_auto AND _st.facturation_labo_moment = 'validation'
     AND NOT EXISTS (SELECT 1 FROM sante_factures WHERE demande_id = NEW.id AND type = 'facture' AND NOT annulee) THEN
    SELECT jsonb_agg(jsonb_build_object('code', a.code, 'libelle', a.libelle, 'prix_unitaire', coalesce(da.tarif, a.tarif), 'quantite', 1)) INTO _l
      FROM sante_demande_analyses da JOIN sante_analyses a ON a.id = da.analyse_id WHERE da.demande_id = NEW.id;
    IF _l IS NOT NULL THEN
      PERFORM sante_creer_facture_interne(NEW.patient_id, _l, sante_assurance_active(NEW.patient_id), 0, NULL, NULL, NEW.id);
    END IF;
  END IF;
  IF NEW.statut = 'rejetee' AND OLD.statut <> 'rejetee' THEN
    FOR _f IN SELECT id FROM sante_factures WHERE demande_id = NEW.id AND type = 'facture' AND NOT annulee LOOP
      PERFORM sante_annuler_facture_interne(_f, 'Demande rejetée : ' || coalesce(NEW.motif_rejet, ''));
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sante_annuler_facture(_facture_id uuid, _motif text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid;
BEGIN
  SELECT structure_id INTO _s FROM sante_factures WHERE id = _facture_id;
  IF _s IS NULL OR NOT has_any_medical_role(_s, ARRAY['admin_structure']) THEN RAISE EXCEPTION 'Seul l''administrateur peut annuler'; END IF;
  IF coalesce(trim(_motif),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  RETURN sante_annuler_facture_interne(_facture_id, trim(_motif));
END $$;

CREATE OR REPLACE FUNCTION public.sante_decider_remboursement(_id uuid, _approuver boolean, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r sante_remboursements;
BEGIN
  SELECT * INTO r FROM sante_remboursements WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT is_structure_admin(r.structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF r.statut <> 'demande' THEN RAISE EXCEPTION 'Déjà traité'; END IF;
  IF coalesce(trim(_motif),'') = '' THEN RAISE EXCEPTION 'Motif de décision obligatoire'; END IF;
  UPDATE sante_remboursements SET statut = CASE WHEN _approuver THEN 'approuve' ELSE 'refuse' END, approuve_par = auth.uid(), approuve_le = now(), motif_decision = trim(_motif) WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_payer_remboursement(_id uuid, _mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r sante_remboursements; _sess uuid; _num text;
BEGIN
  SELECT * INTO r FROM sante_remboursements WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT has_any_medical_role(r.structure_id, ARRAY['admin_structure','caissier']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF r.statut <> 'approuve' THEN RAISE EXCEPTION 'Remboursement non approuvé'; END IF;
  IF _mode NOT IN ('especes','wave','orange_money','free_money','wizall','cheque','virement') THEN RAISE EXCEPTION 'Mode invalide'; END IF;
  IF _mode = 'especes' THEN
    SELECT id INTO _sess FROM sante_sessions_caisse WHERE structure_id = r.structure_id AND caissier = auth.uid() AND fermee_le IS NULL;
    IF _sess IS NULL THEN RAISE EXCEPTION 'Ouvrez d''abord votre caisse'; END IF;
  END IF;
  UPDATE sante_remboursements SET statut='paye', mode=_mode, session_id=_sess, paye_par=auth.uid(), paye_le=now() WHERE id = _id;
  SELECT numero INTO _num FROM sante_factures WHERE id = r.avoir_id;
  PERFORM sante_comptabiliser(r.structure_id, 'remboursement', r.id, CASE WHEN _mode='especes' THEN 'CA' ELSE 'BQ' END, current_date,
    'Remboursement ' || _num, _num, jsonb_build_array(
      jsonb_build_object('compte', sante_compte(r.structure_id,'patients'), 'intitule','Patients', 'debit', r.montant),
      jsonb_build_object('compte', CASE WHEN _mode='cheque' THEN sante_compte(r.structure_id,'banque') ELSE sante_compte_tresorerie(r.structure_id,_mode) END, 'intitule','Trésorerie', 'credit', r.montant)));
END $$;

CREATE OR REPLACE FUNCTION public.sante_rapport_caisse(_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s sante_sessions_caisse;
BEGIN
  SELECT * INTO s FROM sante_sessions_caisse WHERE id = _session_id;
  IF s.id IS NULL OR NOT (s.caissier = auth.uid() OR has_any_medical_role(s.structure_id, ARRAY['admin_structure','comptable'])) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN jsonb_build_object('session', to_jsonb(s),
    'par_mode', (SELECT coalesce(jsonb_object_agg(mode, total),'{}') FROM (SELECT mode, sum(montant) total FROM sante_encaissements WHERE session_id=_session_id GROUP BY mode) x),
    'nb_encaissements', (SELECT count(*) FROM sante_encaissements WHERE session_id=_session_id),
    'remboursements_especes', (SELECT coalesce(sum(montant),0) FROM sante_remboursements WHERE session_id=_session_id AND mode='especes'));
END $$;

CREATE OR REPLACE FUNCTION public.sante_fermer_caisse(_session_id uuid, _compte numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r sante_sessions_caisse; _att numeric; _ecart numeric;
BEGIN
  SELECT * INTO _r FROM sante_sessions_caisse WHERE id = _session_id AND caissier = auth.uid() AND fermee_le IS NULL FOR UPDATE;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Session introuvable ou déjà fermée'; END IF;
  IF _compte IS NULL OR _compte < 0 THEN RAISE EXCEPTION 'Montant compté invalide'; END IF;
  SELECT _r.fond_initial + coalesce((SELECT sum(montant) FROM sante_encaissements WHERE session_id = _session_id AND mode = 'especes'),0)
       - coalesce((SELECT sum(montant) FROM sante_remboursements WHERE session_id = _session_id AND mode = 'especes'),0) INTO _att;
  _ecart := _compte - _att;
  PERFORM set_config('sante.caisse_fermeture','on',true);
  UPDATE sante_sessions_caisse SET fermee_le = now(), montant_compte = _compte, montant_attendu = _att, ecart = _ecart WHERE id = _session_id;
  PERFORM set_config('sante.caisse_fermeture','',true);
  IF _ecart <> 0 THEN
    PERFORM sante_comptabiliser(_r.structure_id, 'ecart_caisse', _session_id, 'CA', current_date, 'Écart de caisse ' || to_char(now(),'DD/MM/YYYY'), NULL,
      CASE WHEN _ecart < 0 THEN jsonb_build_array(
        jsonb_build_object('compte', sante_compte(_r.structure_id,'ecart_caisse_perte'), 'intitule','Écart de caisse (manquant)', 'debit', abs(_ecart)),
        jsonb_build_object('compte', sante_compte(_r.structure_id,'especes'), 'intitule','Caisse', 'credit', abs(_ecart)))
      ELSE jsonb_build_array(
        jsonb_build_object('compte', sante_compte(_r.structure_id,'especes'), 'intitule','Caisse', 'debit', _ecart),
        jsonb_build_object('compte', sante_compte(_r.structure_id,'ecart_caisse_gain'), 'intitule','Écart de caisse (excédent)', 'credit', _ecart)) END);
  END IF;
  RETURN _ecart;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sante_caisse_verrou()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Session de caisse non supprimable'; END IF;
  IF OLD.fermee_le IS NOT NULL THEN RAISE EXCEPTION 'Session de caisse clôturée : verrouillée'; END IF;
  IF NEW.fermee_le IS NOT NULL AND coalesce(current_setting('sante.caisse_fermeture', true),'') <> 'on' THEN RAISE EXCEPTION 'Utilisez la clôture de caisse'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sante_caisse_verrou ON public.sante_sessions_caisse;
CREATE TRIGGER sante_caisse_verrou BEFORE UPDATE OR DELETE ON public.sante_sessions_caisse FOR EACH ROW EXECUTE FUNCTION public.trg_sante_caisse_verrou();

CREATE TABLE public.sante_remises_cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  date_remise date NOT NULL DEFAULT current_date,
  montant numeric NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sante_remise_cheque_lignes (
  remise_id uuid NOT NULL REFERENCES public.sante_remises_cheques(id),
  encaissement_id uuid NOT NULL UNIQUE REFERENCES public.sante_encaissements(id),
  structure_id uuid NOT NULL
);
GRANT SELECT ON public.sante_remises_cheques, public.sante_remise_cheque_lignes TO authenticated;
GRANT ALL ON public.sante_remises_cheques, public.sante_remise_cheque_lignes TO service_role;
ALTER TABLE public.sante_remises_cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_remise_cheque_lignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture remises" ON public.sante_remises_cheques FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','comptable']));
CREATE POLICY "Lecture remise lignes" ON public.sante_remise_cheque_lignes FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','comptable']));

CREATE OR REPLACE FUNCTION public.sante_remettre_cheques(_structure_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _m numeric;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','caissier']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  SELECT coalesce(sum(e.montant),0) INTO _m FROM sante_encaissements e WHERE e.structure_id=_structure_id AND e.mode='cheque'
    AND NOT EXISTS (SELECT 1 FROM sante_remise_cheque_lignes l WHERE l.encaissement_id=e.id);
  IF _m = 0 THEN RAISE EXCEPTION 'Aucun chèque à remettre'; END IF;
  INSERT INTO sante_remises_cheques(structure_id, montant) VALUES (_structure_id, _m) RETURNING id INTO _id;
  INSERT INTO sante_remise_cheque_lignes(remise_id, encaissement_id, structure_id)
  SELECT _id, e.id, _structure_id FROM sante_encaissements e WHERE e.structure_id=_structure_id AND e.mode='cheque'
    AND NOT EXISTS (SELECT 1 FROM sante_remise_cheque_lignes l WHERE l.encaissement_id=e.id);
  PERFORM sante_comptabiliser(_structure_id, 'remise_cheques', _id, 'BQ', current_date, 'Remise de chèques en banque', NULL, jsonb_build_array(
    jsonb_build_object('compte', sante_compte(_structure_id,'banque'), 'intitule','Banque', 'debit', _m),
    jsonb_build_object('compte', sante_compte(_structure_id,'cheques_a_encaisser'), 'intitule','Chèques à encaisser', 'credit', _m)));
  RETURN _id;
END $$;

CREATE TABLE public.sante_reglements_organisme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  organisme text NOT NULL,
  date_reglement date NOT NULL DEFAULT current_date,
  montant numeric NOT NULL CHECK (montant > 0),
  mode text NOT NULL,
  reference text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sante_reglement_imputations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reglement_id uuid NOT NULL REFERENCES public.sante_reglements_organisme(id),
  structure_id uuid NOT NULL,
  facture_id uuid NOT NULL REFERENCES public.sante_factures(id),
  montant numeric NOT NULL CHECK (montant > 0)
);
CREATE TABLE public.sante_tiers_rejets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL,
  facture_id uuid NOT NULL REFERENCES public.sante_factures(id),
  type text NOT NULL CHECK (type IN ('administratif','non_prise_en_charge','perte')),
  motif text NOT NULL,
  montant numeric NOT NULL DEFAULT 0,
  avoir_id uuid, facture_bascule_id uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_reglements_organisme, public.sante_reglement_imputations, public.sante_tiers_rejets TO authenticated;
GRANT ALL ON public.sante_reglements_organisme, public.sante_reglement_imputations, public.sante_tiers_rejets TO service_role;
ALTER TABLE public.sante_reglements_organisme ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_reglement_imputations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_tiers_rejets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture reglements" ON public.sante_reglements_organisme FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']));
CREATE POLICY "Lecture imputations" ON public.sante_reglement_imputations FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']));
CREATE POLICY "Lecture rejets" ON public.sante_tiers_rejets FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']));

CREATE OR REPLACE FUNCTION public.sante_reste_organisme(_facture_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.part_organisme
    - coalesce((SELECT sum(montant) FROM sante_reglement_imputations WHERE facture_id = f.id),0)
    - coalesce((SELECT sum(montant) FROM sante_tiers_rejets WHERE facture_id = f.id AND type IN ('non_prise_en_charge','perte')),0)
  FROM sante_factures f WHERE f.id = _facture_id
$$;

CREATE OR REPLACE FUNCTION public.sante_imputer_reglement(_structure_id uuid, _organisme text, _montant numeric, _mode text, _reference text, _imputations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _x jsonb; _f sante_factures; _somme numeric := 0; _m numeric; _l jsonb := '[]'::jsonb; _aux text;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF _montant IS NULL OR _montant <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF _mode NOT IN ('virement','cheque','especes','wave','orange_money','free_money','wizall','carte') THEN RAISE EXCEPTION 'Mode invalide'; END IF;
  IF jsonb_typeof(_imputations) <> 'array' OR jsonb_array_length(_imputations) = 0 THEN RAISE EXCEPTION 'Ventilation obligatoire : indiquez les factures réglées'; END IF;
  FOR _x IN SELECT * FROM jsonb_array_elements(_imputations) LOOP _somme := _somme + round((_x->>'montant')::numeric); END LOOP;
  IF _somme <> round(_montant) THEN RAISE EXCEPTION 'La ventilation (%) doit égaler le montant du règlement (%)', _somme, round(_montant); END IF;
  INSERT INTO sante_reglements_organisme(structure_id, organisme, montant, mode, reference) VALUES (_structure_id, _organisme, round(_montant), _mode, _reference) RETURNING id INTO _id;
  _aux := sante_aux_organisme(_structure_id, _organisme);
  FOR _x IN SELECT * FROM jsonb_array_elements(_imputations) LOOP
    SELECT * INTO _f FROM sante_factures WHERE id = (_x->>'facture_id')::uuid FOR UPDATE;
    _m := round((_x->>'montant')::numeric);
    IF _f.id IS NULL OR _f.structure_id <> _structure_id OR _f.organisme IS DISTINCT FROM _organisme OR _f.type <> 'facture' OR _f.annulee THEN RAISE EXCEPTION 'Facture invalide pour cet organisme'; END IF;
    IF _m <= 0 OR _m > sante_reste_organisme(_f.id) THEN RAISE EXCEPTION 'Imputation supérieure au reste dû par l''organisme sur %', _f.numero; END IF;
    INSERT INTO sante_reglement_imputations(reglement_id, structure_id, facture_id, montant) VALUES (_id, _structure_id, _f.id, _m);
    INSERT INTO sante_encaissements(structure_id, facture_id, mode, montant, reference) VALUES (_structure_id, _f.id, 'organisme', _m, 'REG ' || coalesce(_reference, ''));
    IF sante_reste_organisme(_f.id) = 0 THEN UPDATE sante_factures SET statut_tiers = 'paye' WHERE id = _f.id; END IF;
    _l := _l || jsonb_build_array(jsonb_build_object('compte', sante_compte(_structure_id,'organismes'), 'intitule','Organismes tiers-payant', 'libelle', _f.numero,
      'credit', _m, 'compte_auxiliaire', _aux, 'auxiliaire_libelle', _organisme));
  END LOOP;
  _l := jsonb_build_array(jsonb_build_object('compte', sante_compte_tresorerie(_structure_id, _mode), 'intitule','Trésorerie', 'debit', round(_montant))) || _l;
  PERFORM sante_comptabiliser(_structure_id, 'reglement_organisme', _id, CASE WHEN _mode='especes' THEN 'CA' ELSE 'BQ' END, current_date,
    'Règlement ' || _organisme || coalesce(' ' || _reference, ''), _reference, _l);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_rejet_tiers(_facture_id uuid, _type text, _motif text, _montant numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f sante_factures; _id uuid; _m numeric; _av uuid; _fb uuid;
BEGIN
  SELECT * INTO _f FROM sante_factures WHERE id = _facture_id FOR UPDATE;
  IF _f.id IS NULL OR _f.type <> 'facture' OR _f.annulee OR _f.part_organisme = 0 THEN RAISE EXCEPTION 'Aucune part organisme'; END IF;
  IF NOT has_any_medical_role(_f.structure_id, ARRAY['admin_structure','tiers_payant']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF char_length(trim(coalesce(_motif,''))) < 5 THEN RAISE EXCEPTION 'Motif de rejet obligatoire'; END IF;
  IF _type = 'administratif' THEN
    INSERT INTO sante_tiers_rejets(structure_id, facture_id, type, motif) VALUES (_f.structure_id, _f.id, _type, trim(_motif)) RETURNING id INTO _id;
    UPDATE sante_factures SET statut_tiers = 'rejete' WHERE id = _f.id;
    RETURN _id;
  END IF;
  _m := round(coalesce(_montant, sante_reste_organisme(_f.id)));
  IF _m <= 0 OR _m > sante_reste_organisme(_f.id) THEN RAISE EXCEPTION 'Montant supérieur au reste dû par l''organisme'; END IF;
  IF _type = 'non_prise_en_charge' THEN
    IF NOT coalesce((SELECT bascule_patient_autorisee FROM sante_organismes WHERE structure_id=_f.structure_id AND nom=_f.organisme), false) THEN
      RAISE EXCEPTION 'La convention de cet organisme n''autorise pas la bascule au patient';
    END IF;
    INSERT INTO sante_factures(structure_id, numero, type, facture_origine_id, patient_id, organisme, taux_couverture, total, remise, motif_remise, part_organisme, part_patient, statut_tiers)
    VALUES (_f.structure_id, sante_prochain_numero(_f.structure_id,'avoir','AV'), 'avoir', _f.id, _f.patient_id, _f.organisme, _f.taux_couverture, -_m, 0, 'Non-prise en charge : ' || trim(_motif), -_m, 0, 'sans') RETURNING id INTO _av;
    INSERT INTO sante_factures(structure_id, numero, type, facture_origine_id, patient_id, total, remise, motif_remise, part_organisme, part_patient, statut_tiers)
    VALUES (_f.structure_id, sante_prochain_numero(_f.structure_id,'facture','FAC'), 'facture', _f.id, _f.patient_id, _m, 0, NULL, 0, _m, 'sans') RETURNING id INTO _fb;
    INSERT INTO sante_facture_lignes(facture_id, structure_id, libelle, code, quantite, prix_unitaire, montant)
    VALUES (_fb, _f.structure_id, 'Part non prise en charge (facture ' || _f.numero || ')', NULL, 1, _m, _m);
    INSERT INTO sante_tiers_rejets(structure_id, facture_id, type, motif, montant, avoir_id, facture_bascule_id) VALUES (_f.structure_id, _f.id, _type, trim(_motif), _m, _av, _fb) RETURNING id INTO _id;
  ELSIF _type = 'perte' THEN
    INSERT INTO sante_tiers_rejets(structure_id, facture_id, type, motif, montant) VALUES (_f.structure_id, _f.id, _type, trim(_motif), _m) RETURNING id INTO _id;
    PERFORM sante_comptabiliser(_f.structure_id, 'perte_creance', _id, 'OD', current_date, 'Perte sur créance ' || _f.numero, _f.numero, jsonb_build_array(
      jsonb_build_object('compte', sante_compte(_f.structure_id,'perte_creance'), 'intitule','Pertes sur créances', 'debit', _m),
      jsonb_build_object('compte', sante_compte(_f.structure_id,'organismes'), 'intitule','Organismes tiers-payant', 'credit', _m,
        'compte_auxiliaire', sante_aux_organisme(_f.structure_id, _f.organisme), 'auxiliaire_libelle', _f.organisme)));
  ELSE RAISE EXCEPTION 'Type de rejet inconnu';
  END IF;
  IF sante_reste_organisme(_f.id) = 0 THEN UPDATE sante_factures SET statut_tiers = 'paye' WHERE id = _f.id; END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_statut_tiers(_facture_id uuid, _statut text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f sante_factures;
BEGIN
  SELECT * INTO _f FROM sante_factures WHERE id = _facture_id FOR UPDATE;
  IF _f.id IS NULL OR _f.part_organisme = 0 OR _f.annulee THEN RAISE EXCEPTION 'Aucune part organisme'; END IF;
  IF NOT has_any_medical_role(_f.structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF _statut = 'paye' THEN
    PERFORM sante_imputer_reglement(_f.structure_id, _f.organisme, sante_reste_organisme(_f.id), 'virement', 'Règlement ' || _f.numero,
      jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'montant', sante_reste_organisme(_f.id))));
    RETURN;
  END IF;
  IF NOT ((_f.statut_tiers='a_facturer' AND _statut='envoye') OR (_f.statut_tiers='rejete' AND _statut='envoye')) THEN
    RAISE EXCEPTION 'Transition interdite (% → %)', _f.statut_tiers, _statut; END IF;
  UPDATE sante_factures SET statut_tiers = _statut, envoye_tiers_le = now() WHERE id = _facture_id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_outbox_resume(_structure_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable','caissier']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN jsonb_build_object(
    'en_attente', (SELECT count(*) FROM sante_compta_evenements WHERE structure_id=_structure_id AND statut='en_attente'),
    'en_erreur', (SELECT count(*) FROM sante_compta_evenements WHERE structure_id=_structure_id AND statut='en_erreur'),
    'comptabilise', (SELECT count(*) FROM sante_compta_evenements WHERE structure_id=_structure_id AND statut='comptabilise'));
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['sante_definir_compte(uuid,text,text)','sante_annuler_facture(uuid,text)','sante_decider_remboursement(uuid,boolean,text)',
    'sante_payer_remboursement(uuid,text)','sante_rapport_caisse(uuid)','sante_fermer_caisse(uuid,numeric)','sante_remettre_cheques(uuid)',
    'sante_imputer_reglement(uuid,text,numeric,text,text,jsonb)','sante_rejet_tiers(uuid,text,text,numeric)','sante_statut_tiers(uuid,text)',
    'sante_outbox_resume(uuid)','sante_reste_organisme(uuid)','sante_creer_facture(uuid,jsonb,uuid,numeric,text,uuid,uuid)',
    'sante_creer_demande_labo(uuid,uuid[],text,boolean,text,uuid)','sante_compte(uuid,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  REVOKE EXECUTE ON FUNCTION public.trg_sante_caisse_verrou() FROM PUBLIC, anon, authenticated;
END $$;