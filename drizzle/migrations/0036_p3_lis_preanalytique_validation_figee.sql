ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS prelev_identifiants text[];
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS prelev_site text;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS prelev_conditions jsonb;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS motif_rejet_code text;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS demande_origine_id uuid;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS grossesse boolean NOT NULL DEFAULT false;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS derogation boolean NOT NULL DEFAULT false;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS cr_hash text;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS cr_token text UNIQUE;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS echantillon_elimine_le timestamptz;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS derogation_validation_unique boolean NOT NULL DEFAULT false;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS conservation_echantillons_jours integer NOT NULL DEFAULT 7;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS habilitations_obligatoires boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sante_prelever(_demande_id uuid, _identifiants text[], _site text, _conditions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d sante_demandes_labo;
BEGIN
  SELECT * INTO d FROM sante_demandes_labo WHERE id = _demande_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT has_any_medical_role(d.structure_id, ARRAY['preleveur','technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(cardinality(_identifiants),0) < 2 THEN RAISE EXCEPTION 'Identification positive : au moins deux identifiants vérifiés (ex. nom + date de naissance)'; END IF;
  IF d.statut <> 'enregistree' THEN RAISE EXCEPTION 'Prélèvement impossible (statut %)', d.statut; END IF;
  UPDATE sante_demandes_labo SET statut='prelevee', preleve_le=now(), preleve_par=auth.uid(), prelev_identifiants=_identifiants, prelev_site=nullif(trim(_site),''), prelev_conditions=_conditions WHERE id=_demande_id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_rejeter_echantillon(_demande_id uuid, _code text, _commentaire text, _nouveau_prelevement boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d sante_demandes_labo; _new uuid; _an uuid[];
BEGIN
  SELECT * INTO d FROM sante_demandes_labo WHERE id = _demande_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _code NOT IN ('hemolyse','volume_insuffisant','tube_errone','etiquette_illisible','delai_depasse','coagule','autre') THEN RAISE EXCEPTION 'Motif de rejet codifié obligatoire'; END IF;
  IF d.statut NOT IN ('prelevee','recue') THEN RAISE EXCEPTION 'Rejet pré-analytique possible seulement avant l''analyse'; END IF;
  UPDATE sante_demandes_labo SET statut='rejetee', motif_rejet_code=_code, motif_rejet = _code || coalesce(' : ' || nullif(trim(_commentaire),''), '') WHERE id=_demande_id;
  IF coalesce(_nouveau_prelevement,false) THEN
    SELECT array_agg(analyse_id) INTO _an FROM sante_demande_analyses WHERE demande_id = _demande_id;
    _new := sante_creer_demande_labo(d.patient_id, _an, d.prescripteur, d.urgence, d.renseignements, d.consultation_id);
    UPDATE sante_demandes_labo SET demande_origine_id = _demande_id WHERE id = _new;
  END IF;
  RETURN _new;
END $$;

ALTER TABLE public.sante_resultats ADD COLUMN IF NOT EXISTS a_refaire boolean NOT NULL DEFAULT false;
ALTER TABLE public.sante_resultats ADD COLUMN IF NOT EXISTS motif_refaire text;
ALTER TABLE public.sante_resultats ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.sante_lots_reactifs(id);
ALTER TABLE public.sante_resultats ADD COLUMN IF NOT EXISTS libelle_fige text;
ALTER TABLE public.sante_resultats ADD COLUMN IF NOT EXISTS unite_fige text;
ALTER TABLE public.sante_resultats ADD COLUMN IF NOT EXISTS methode_fige text;
CREATE TABLE public.sante_resultats_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL, resultat_id uuid NOT NULL, demande_id uuid NOT NULL, parametre_id uuid NOT NULL,
  valeur_num numeric, valeur_texte text, drapeau text, saisi_par uuid, saisi_le timestamptz, motif text,
  remplace_le timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_resultats_historique TO authenticated;
GRANT ALL ON public.sante_resultats_historique TO service_role;
ALTER TABLE public.sante_resultats_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture historique resultats" ON public.sante_resultats_historique FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['biologiste','technicien']));
CREATE OR REPLACE FUNCTION public.trg_sante_resultat_historique()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.valeur_num IS DISTINCT FROM NEW.valeur_num) OR (OLD.valeur_texte IS DISTINCT FROM NEW.valeur_texte) THEN
    INSERT INTO sante_resultats_historique(structure_id, resultat_id, demande_id, parametre_id, valeur_num, valeur_texte, drapeau, saisi_par, saisi_le, motif)
    VALUES (OLD.structure_id, OLD.id, OLD.demande_id, OLD.parametre_id, OLD.valeur_num, OLD.valeur_texte, OLD.drapeau, OLD.saisi_par, OLD.saisi_le, coalesce(OLD.motif_refaire, CASE WHEN current_setting('sante.rectificatif', true)='on' THEN 'rectificatif' ELSE 'recontrôle' END));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sante_resultat_historique ON public.sante_resultats;
CREATE TRIGGER sante_resultat_historique AFTER UPDATE ON public.sante_resultats FOR EACH ROW EXECUTE FUNCTION public.trg_sante_resultat_historique();

CREATE OR REPLACE FUNCTION public.sante_refaire_resultat(_demande_id uuid, _parametre_id uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid;
BEGIN
  SELECT structure_id INTO _s FROM sante_demandes_labo WHERE id = _demande_id;
  IF NOT has_any_medical_role(_s, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(trim(_motif),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  UPDATE sante_resultats SET a_refaire = true, motif_refaire = trim(_motif) WHERE demande_id=_demande_id AND parametre_id=_parametre_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Résultat introuvable'; END IF;
END $$;

ALTER TABLE public.sante_valeurs_reference ADD COLUMN IF NOT EXISTS grossesse boolean;
ALTER TABLE public.sante_valeurs_reference ADD COLUMN IF NOT EXISTS methode text;
ALTER TABLE public.sante_analyse_parametres DROP CONSTRAINT IF EXISTS sante_analyse_parametres_type_check;
ALTER TABLE public.sante_analyse_parametres ADD CONSTRAINT sante_analyse_parametres_type_check CHECK (type IN ('numerique','qualitatif','texte','choix','calcule'));
ALTER TABLE public.sante_analyse_parametres ADD COLUMN IF NOT EXISTS choix text[];
ALTER TABLE public.sante_analyse_parametres ADD COLUMN IF NOT EXISTS formule text;
ALTER TABLE public.sante_analyse_parametres ADD COLUMN IF NOT EXISTS impossible_bas numeric;
ALTER TABLE public.sante_analyse_parametres ADD COLUMN IF NOT EXISTS impossible_haut numeric;
ALTER TABLE public.sante_analyse_parametres ADD COLUMN IF NOT EXISTS methode text;
ALTER TABLE public.sante_analyse_parametres ADD COLUMN IF NOT EXISTS cq_absent text NOT NULL DEFAULT 'ignorer' CHECK (cq_absent IN ('bloquer','avertir','ignorer'));

CREATE TABLE public.sante_profils (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  code text NOT NULL, libelle text NOT NULL, analyses uuid[] NOT NULL,
  UNIQUE (structure_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sante_profils TO authenticated;
GRANT ALL ON public.sante_profils TO service_role;
ALTER TABLE public.sante_profils ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture profils" ON public.sante_profils FOR SELECT TO authenticated USING (public.is_structure_member(structure_id));
CREATE POLICY "Ajout profils" ON public.sante_profils FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Maj profils" ON public.sante_profils FOR UPDATE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Suppr profils" ON public.sante_profils FOR DELETE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));

CREATE TABLE public.sante_habilitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, analyse_id uuid NOT NULL REFERENCES public.sante_analyses(id),
  valide_jusqu date, accorde_par uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, user_id, analyse_id)
);
GRANT SELECT, INSERT, DELETE ON public.sante_habilitations TO authenticated;
GRANT ALL ON public.sante_habilitations TO service_role;
ALTER TABLE public.sante_habilitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture habilitations" ON public.sante_habilitations FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));
CREATE POLICY "Gestion habilitations" ON public.sante_habilitations FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Retrait habilitations" ON public.sante_habilitations FOR DELETE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));

CREATE OR REPLACE FUNCTION public.sante_saisir_resultat_v2(_demande_id uuid, _parametre_id uuid, _valeur_num numeric, _valeur_texte text, _lot_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d sante_demandes_labo; p sante_patients; pa sante_analyse_parametres; r sante_valeurs_reference; _age int; _f text := 'N'; _st structures;
  c sante_analyse_parametres; _expr text; _code text; _v numeric; _ok boolean;
BEGIN
  SELECT * INTO d FROM sante_demandes_labo WHERE id = _demande_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT ap.* INTO pa FROM sante_analyse_parametres ap JOIN sante_demande_analyses da ON da.analyse_id = ap.analyse_id WHERE ap.id=_parametre_id AND da.demande_id=_demande_id;
  IF pa.id IS NULL THEN RAISE EXCEPTION 'Paramètre hors demande'; END IF;
  IF pa.type = 'calcule' THEN RAISE EXCEPTION 'Paramètre calculé automatiquement'; END IF;
  SELECT * INTO _st FROM structures WHERE id = d.structure_id;
  IF _st.habilitations_obligatoires AND NOT EXISTS (SELECT 1 FROM sante_habilitations h WHERE h.structure_id=d.structure_id AND h.user_id=auth.uid() AND h.analyse_id=pa.analyse_id AND (h.valide_jusqu IS NULL OR h.valide_jusqu >= current_date)) THEN
    RAISE EXCEPTION 'Vous n''êtes pas habilité(e) pour cette analyse';
  END IF;
  IF _valeur_num IS NOT NULL AND ((pa.impossible_bas IS NOT NULL AND _valeur_num < pa.impossible_bas) OR (pa.impossible_haut IS NOT NULL AND _valeur_num > pa.impossible_haut)) THEN
    RAISE EXCEPTION 'Valeur impossible pour % (% hors [% ; %]) : vérifiez la saisie (décimale ?)', pa.libelle, _valeur_num, pa.impossible_bas, pa.impossible_haut;
  END IF;
  IF pa.type = 'choix' AND _valeur_texte IS NOT NULL AND NOT (trim(_valeur_texte) = ANY(coalesce(pa.choix, '{}'))) THEN RAISE EXCEPTION 'Valeur hors liste de choix'; END IF;
  IF _lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sante_lots_reactifs WHERE id=_lot_id AND structure_id=d.structure_id) THEN RAISE EXCEPTION 'Lot inconnu'; END IF;
  IF _lot_id IS NOT NULL AND EXISTS (SELECT 1 FROM sante_lots_reactifs WHERE id=_lot_id AND peremption < current_date) THEN RAISE EXCEPTION 'Lot de réactif périmé'; END IF;
  SELECT * INTO p FROM sante_patients WHERE id = d.patient_id;
  _age := CASE WHEN p.date_naissance IS NULL THEN 9000 ELSE (current_date - p.date_naissance) END;
  SELECT * INTO r FROM sante_valeurs_reference
    WHERE parametre_id = _parametre_id AND (sexe IS NULL OR sexe = p.sexe) AND _age BETWEEN age_min_jours AND age_max_jours
      AND (grossesse IS NULL OR grossesse = d.grossesse) AND (methode IS NULL OR methode = pa.methode)
    ORDER BY (grossesse IS NULL), (methode IS NULL), (sexe IS NULL), (age_max_jours - age_min_jours) LIMIT 1;
  IF _valeur_num IS NOT NULL AND r.id IS NOT NULL THEN
    _f := CASE WHEN r.critique_bas IS NOT NULL AND _valeur_num < r.critique_bas THEN 'LL'
               WHEN r.critique_haut IS NOT NULL AND _valeur_num > r.critique_haut THEN 'HH'
               WHEN r.bas IS NOT NULL AND _valeur_num < r.bas THEN 'L'
               WHEN r.haut IS NOT NULL AND _valeur_num > r.haut THEN 'H' ELSE 'N' END;
  END IF;
  INSERT INTO sante_resultats(structure_id, demande_id, parametre_id, valeur_num, valeur_texte, drapeau, ref_bas, ref_haut, saisi_par, lot_id)
  VALUES (d.structure_id, _demande_id, _parametre_id, _valeur_num, nullif(trim(_valeur_texte),''), _f, r.bas, r.haut, auth.uid(), _lot_id)
  ON CONFLICT (demande_id, parametre_id) DO UPDATE SET valeur_num=EXCLUDED.valeur_num, valeur_texte=EXCLUDED.valeur_texte, drapeau=EXCLUDED.drapeau,
    ref_bas=EXCLUDED.ref_bas, ref_haut=EXCLUDED.ref_haut, saisi_par=EXCLUDED.saisi_par, saisi_le=now(), critique_acquitte_par=NULL, critique_acquitte_le=NULL,
    lot_id=coalesce(EXCLUDED.lot_id, sante_resultats.lot_id), a_refaire=false;
  FOR c IN SELECT ap.* FROM sante_analyse_parametres ap JOIN sante_demande_analyses da ON da.analyse_id = ap.analyse_id
           WHERE da.demande_id=_demande_id AND ap.type='calcule' AND ap.formule IS NOT NULL LOOP
    _expr := c.formule; _ok := true;
    FOR _code IN SELECT (regexp_matches(c.formule, '\{([A-Za-z0-9_]+)\}', 'g'))[1] LOOP
      SELECT r2.valeur_num INTO _v FROM sante_resultats r2 JOIN sante_analyse_parametres p2 ON p2.id=r2.parametre_id WHERE r2.demande_id=_demande_id AND p2.code=_code LIMIT 1;
      IF _v IS NULL THEN _ok := false; EXIT; END IF;
      _expr := replace(_expr, '{' || _code || '}', '(' || _v::text || ')');
    END LOOP;
    IF _ok AND _expr ~ '^[0-9.+\-*/() ]+$' THEN
      BEGIN
        EXECUTE 'SELECT round((' || _expr || ')::numeric, ' || coalesce(c.decimales,2) || ')' INTO _v;
        INSERT INTO sante_resultats(structure_id, demande_id, parametre_id, valeur_num, drapeau, saisi_par)
        VALUES (d.structure_id, _demande_id, c.id, _v, 'N', auth.uid())
        ON CONFLICT (demande_id, parametre_id) DO UPDATE SET valeur_num=EXCLUDED.valeur_num, saisi_le=now();
      EXCEPTION WHEN division_by_zero THEN NULL;
      END;
    END IF;
  END LOOP;
  RETURN _f;
END $$;

CREATE OR REPLACE FUNCTION public.sante_saisir_resultat(_demande_id uuid, _parametre_id uuid, _valeur_num numeric, _valeur_texte text DEFAULT NULL)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT sante_saisir_resultat_v2(_demande_id, _parametre_id, _valeur_num, _valeur_texte, NULL)
$$;

CREATE TABLE public.sante_micro_germes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL, demande_id uuid NOT NULL REFERENCES public.sante_demandes_labo(id),
  type_examen text NOT NULL DEFAULT 'culture' CHECK (type_examen IN ('culture','ecbu','hemoculture','coproculture','autre')),
  germe text NOT NULL, quantification text, commentaire text,
  statut text NOT NULL DEFAULT 'preliminaire' CHECK (statut IN ('preliminaire','definitif')),
  saisi_par uuid DEFAULT auth.uid(), saisi_le timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sante_antibiogrammes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL, germe_id uuid NOT NULL REFERENCES public.sante_micro_germes(id),
  antibiotique text NOT NULL, cmi text, interpretation text NOT NULL CHECK (interpretation IN ('S','I','R')),
  UNIQUE (germe_id, antibiotique)
);
GRANT SELECT ON public.sante_micro_germes, public.sante_antibiogrammes TO authenticated;
GRANT ALL ON public.sante_micro_germes, public.sante_antibiogrammes TO service_role;
ALTER TABLE public.sante_micro_germes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_antibiogrammes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture germes" ON public.sante_micro_germes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sante_demandes_labo d WHERE d.id = demande_id));
CREATE POLICY "Lecture antibiogrammes" ON public.sante_antibiogrammes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sante_micro_germes g WHERE g.id = germe_id));

CREATE OR REPLACE FUNCTION public.sante_saisir_germe(_demande_id uuid, _type text, _germe text, _quantification text, _commentaire text, _definitif boolean, _antibiogramme jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d sante_demandes_labo; _id uuid; _x jsonb;
BEGIN
  SELECT * INTO d FROM sante_demandes_labo WHERE id = _demande_id;
  IF d.id IS NULL OR NOT has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF d.statut <> 'en_analyse' THEN RAISE EXCEPTION 'Saisie possible seulement en cours d''analyse'; END IF;
  IF coalesce(trim(_germe),'') = '' THEN RAISE EXCEPTION 'Germe obligatoire'; END IF;
  INSERT INTO sante_micro_germes(structure_id, demande_id, type_examen, germe, quantification, commentaire, statut)
  VALUES (d.structure_id, _demande_id, coalesce(_type,'culture'), trim(_germe), _quantification, _commentaire, CASE WHEN _definitif THEN 'definitif' ELSE 'preliminaire' END) RETURNING id INTO _id;
  FOR _x IN SELECT * FROM jsonb_array_elements(coalesce(_antibiogramme,'[]'::jsonb)) LOOP
    INSERT INTO sante_antibiogrammes(structure_id, germe_id, antibiotique, cmi, interpretation) VALUES (d.structure_id, _id, trim(_x->>'antibiotique'), _x->>'cmi', upper(_x->>'interpretation'));
  END LOOP;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_germe_definitif(_germe_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g sante_micro_germes;
BEGIN
  SELECT * INTO g FROM sante_micro_germes WHERE id = _germe_id;
  IF g.id IS NULL OR NOT has_any_medical_role(g.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE sante_micro_germes SET statut='definitif' WHERE id=_germe_id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_valider_demande(_demande_id uuid, _niveau text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d sante_demandes_labo; _manquants int; _crit int; _derog boolean; _contenu jsonb;
BEGIN
  SELECT * INTO d FROM sante_demandes_labo WHERE id = _demande_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  SELECT derogation_validation_unique INTO _derog FROM structures WHERE id = d.structure_id;
  IF _niveau = 'technique' THEN
    IF NOT has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
    SELECT count(*) INTO _manquants FROM sante_analyse_parametres ap JOIN sante_demande_analyses da ON da.analyse_id=ap.analyse_id
      WHERE da.demande_id=_demande_id AND ap.type <> 'calcule' AND NOT EXISTS (SELECT 1 FROM sante_resultats r WHERE r.demande_id=_demande_id AND r.parametre_id=ap.id);
    IF _manquants > 0 THEN RAISE EXCEPTION '% résultat(s) manquant(s)', _manquants; END IF;
    IF EXISTS (SELECT 1 FROM sante_resultats WHERE demande_id=_demande_id AND a_refaire) THEN RAISE EXCEPTION 'Résultat(s) à refaire en attente'; END IF;
    IF EXISTS (SELECT 1 FROM sante_micro_germes WHERE demande_id=_demande_id AND statut='preliminaire') THEN RAISE EXCEPTION 'Résultat(s) de microbiologie encore préliminaire(s)'; END IF;
    SELECT count(*) INTO _crit FROM sante_resultats WHERE demande_id=_demande_id AND drapeau IN ('HH','LL') AND critique_acquitte_par IS NULL;
    IF _crit > 0 THEN RAISE EXCEPTION 'Valeur critique non acquittée'; END IF;
    IF sante_cq_bloquant(_demande_id) THEN RAISE EXCEPTION 'Contrôle qualité non conforme ou action corrective ouverte : validation bloquée'; END IF;
    IF NOT (_derog AND has_any_medical_role(d.structure_id, ARRAY['biologiste']))
       AND EXISTS (SELECT 1 FROM sante_resultats WHERE demande_id=_demande_id AND saisi_par = auth.uid()) THEN RAISE EXCEPTION 'Le validateur doit être différent de la personne qui a saisi'; END IF;
    UPDATE sante_demandes_labo SET statut='validee_technique', validee_tech_le=now(), validee_tech_par=auth.uid() WHERE id=_demande_id;
  ELSIF _niveau = 'biologique' THEN
    IF NOT has_any_medical_role(d.structure_id, ARRAY['biologiste']) THEN RAISE EXCEPTION 'Seul un biologiste valide'; END IF;
    IF d.statut <> 'validee_technique' THEN RAISE EXCEPTION 'Validation technique préalable requise'; END IF;
    IF NOT EXISTS (SELECT 1 FROM sante_praticiens WHERE structure_id=d.structure_id AND user_id=auth.uid() AND coalesce(trim(numero_ordre),'') <> '') THEN
      RAISE EXCEPTION 'Validation biologique : renseignez votre n° d''ordre sur votre fiche praticien';
    END IF;
    IF d.validee_tech_par = auth.uid() OR EXISTS (SELECT 1 FROM sante_resultats WHERE demande_id=_demande_id AND saisi_par=auth.uid()) THEN
      IF NOT _derog THEN RAISE EXCEPTION 'La validation biologique doit être faite par une autre personne que la validation technique'; END IF;
      UPDATE sante_demandes_labo SET derogation = true WHERE id=_demande_id;
      INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
      VALUES (d.structure_id, auth.uid(), 'derogation_validation_unique', 'sante_demandes_labo', _demande_id, jsonb_build_object('numero', d.numero));
    END IF;
    UPDATE sante_demandes_labo SET statut='validee', validee_le=now(), validee_par=auth.uid() WHERE id=_demande_id;
    PERFORM set_config('sante.rectificatif','on',true);
    UPDATE sante_resultats r SET libelle_fige = ap.libelle, unite_fige = ap.unite, methode_fige = ap.methode
      FROM sante_analyse_parametres ap WHERE ap.id = r.parametre_id AND r.demande_id = _demande_id;
    PERFORM set_config('sante.rectificatif','',true);
    SELECT jsonb_build_object('numero', d.numero, 'version', d.version, 'validee_par', auth.uid(),
      'resultats', (SELECT jsonb_agg(jsonb_build_object('p', libelle_fige, 'v', coalesce(valeur_num::text, valeur_texte), 'u', unite_fige, 'b', ref_bas, 'h', ref_haut) ORDER BY libelle_fige) FROM sante_resultats WHERE demande_id=_demande_id),
      'germes', (SELECT jsonb_agg(jsonb_build_object('g', germe, 'ab', (SELECT jsonb_agg(jsonb_build_object(antibiotique, interpretation) ORDER BY antibiotique) FROM sante_antibiogrammes a WHERE a.germe_id=g.id)) ORDER BY germe) FROM sante_micro_germes g WHERE demande_id=_demande_id))
      INTO _contenu;
    UPDATE sante_demandes_labo SET cr_hash = encode(extensions.digest(_contenu::text, 'sha256'), 'hex'),
      cr_token = coalesce(cr_token, encode(extensions.gen_random_bytes(16), 'hex')) WHERE id=_demande_id;
  ELSE RAISE EXCEPTION 'Niveau inconnu'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sante_verifier_cr(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN d.id IS NULL THEN jsonb_build_object('authentique', false)
    ELSE jsonb_build_object('authentique', true, 'numero', d.numero, 'structure', s.nom, 'validee_le', d.validee_le, 'version', d.version,
      'rectifie', d.version > 1, 'empreinte', d.cr_hash) END
  FROM (SELECT 1) x LEFT JOIN sante_demandes_labo d ON d.cr_token = _token AND d.statut='validee' AND _token ~ '^[0-9a-f]{32}$'
  LEFT JOIN structures s ON s.id = d.structure_id
$$;
GRANT EXECUTE ON FUNCTION public.sante_verifier_cr(text) TO anon, authenticated;

ALTER TABLE public.sante_rectificatifs ADD COLUMN IF NOT EXISTS traitement_deja_prescrit boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.sante_rectifier_resultat_v2(_demande_id uuid, _parametre_id uuid, _valeur_num numeric, _valeur_texte text, _motif text, _traitement_deja_prescrit boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v int; d sante_demandes_labo; _ent uuid; _u uuid;
BEGIN
  _v := sante_rectifier_resultat(_demande_id, _parametre_id, _valeur_num, _valeur_texte, _motif);
  UPDATE sante_rectificatifs SET traitement_deja_prescrit = coalesce(_traitement_deja_prescrit,false) WHERE demande_id=_demande_id AND parametre_id=_parametre_id AND version=_v;
  SELECT * INTO d FROM sante_demandes_labo WHERE id=_demande_id;
  SELECT entreprise_id INTO _ent FROM structures WHERE id=d.structure_id;
  SELECT pr.user_id INTO _u FROM sante_consultations c JOIN sante_praticiens pr ON pr.id=c.praticien_id WHERE c.id=d.consultation_id;
  IF _u IS NULL THEN _u := d.created_by; END IF;
  IF _ent IS NOT NULL AND _u IS NOT NULL THEN
    INSERT INTO notifications(entreprise_id, user_id, type, titre, message, meta)
    VALUES (_ent, _u, 'rectificatif_labo', 'Compte rendu rectifié', 'Le compte rendu ' || d.numero || ' a été rectifié (version ' || _v || '). ' ||
      CASE WHEN _traitement_deja_prescrit THEN 'Un traitement a déjà été prescrit : réévaluez-le.' ELSE '' END, jsonb_build_object('demande_id', _demande_id));
  END IF;
  UPDATE sante_demandes_labo SET cr_hash = encode(extensions.digest((coalesce(cr_hash,'') || ':' || _v)::text, 'sha256'), 'hex') WHERE id=_demande_id;
  RETURN _v;
END $$;
REVOKE EXECUTE ON FUNCTION public.sante_rectifier_resultat(uuid,uuid,numeric,text,text) FROM authenticated;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['sante_prelever(uuid,text[],text,jsonb)','sante_rejeter_echantillon(uuid,text,text,boolean)','sante_refaire_resultat(uuid,uuid,text)',
    'sante_saisir_resultat_v2(uuid,uuid,numeric,text,uuid)','sante_saisir_resultat(uuid,uuid,numeric,text)','sante_saisir_germe(uuid,text,text,text,text,boolean,jsonb)',
    'sante_germe_definitif(uuid)','sante_valider_demande(uuid,text)','sante_rectifier_resultat_v2(uuid,uuid,numeric,text,text,boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  REVOKE EXECUTE ON FUNCTION public.trg_sante_resultat_historique() FROM PUBLIC, anon, authenticated;
END $$;