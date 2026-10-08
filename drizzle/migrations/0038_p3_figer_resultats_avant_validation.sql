CREATE OR REPLACE FUNCTION public.trg_sante_resultat_verrou()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE _st text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Suppression de résultat interdite'; END IF;
  SELECT statut INTO _st FROM public.sante_demandes_labo WHERE id = NEW.demande_id;
  IF coalesce(current_setting('sante.rectificatif', true),'') = 'on' AND _st = 'validee' THEN RETURN NEW; END IF;
  -- Gel des libellés/unités/méthodes au moment de la validation biologique : seules ces colonnes peuvent changer
  IF TG_OP = 'UPDATE' AND coalesce(current_setting('sante.figer', true),'') = 'on' AND _st = 'validee_technique'
     AND (to_jsonb(NEW) - 'libelle_fige' - 'unite_fige' - 'methode_fige') = (to_jsonb(OLD) - 'libelle_fige' - 'unite_fige' - 'methode_fige') THEN RETURN NEW; END IF;
  IF _st <> 'en_analyse' THEN RAISE EXCEPTION 'Résultats verrouillés (statut %)', _st; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sante_valider_demande(_demande_id uuid, _niveau text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d sante_demandes_labo; _manquants int; _crit int; _derog boolean; _contenu jsonb; _derog_utilisee boolean := false;
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
      _derog_utilisee := true;
      INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
      VALUES (d.structure_id, auth.uid(), 'derogation_validation_unique', 'sante_demandes_labo', _demande_id, jsonb_build_object('numero', d.numero));
    END IF;
    PERFORM set_config('sante.figer','on',true);
    UPDATE sante_resultats r SET libelle_fige = ap.libelle, unite_fige = ap.unite, methode_fige = ap.methode
      FROM sante_analyse_parametres ap WHERE ap.id = r.parametre_id AND r.demande_id = _demande_id;
    PERFORM set_config('sante.figer','',true);
    SELECT jsonb_build_object('numero', d.numero, 'version', d.version, 'validee_par', auth.uid(),
      'resultats', (SELECT jsonb_agg(jsonb_build_object('p', libelle_fige, 'v', coalesce(valeur_num::text, valeur_texte), 'u', unite_fige, 'b', ref_bas, 'h', ref_haut) ORDER BY libelle_fige) FROM sante_resultats WHERE demande_id=_demande_id),
      'germes', (SELECT jsonb_agg(jsonb_build_object('g', germe, 'ab', (SELECT jsonb_agg(jsonb_build_object(antibiotique, interpretation) ORDER BY antibiotique) FROM sante_antibiogrammes a WHERE a.germe_id=g.id)) ORDER BY germe) FROM sante_micro_germes g WHERE demande_id=_demande_id))
      INTO _contenu;
    UPDATE sante_demandes_labo SET statut='validee', validee_le=now(), validee_par=auth.uid(),
      derogation = derogation OR _derog_utilisee,
      cr_hash = encode(extensions.digest(_contenu::text, 'sha256'), 'hex'),
      cr_token = coalesce(cr_token, encode(extensions.gen_random_bytes(16), 'hex'))
    WHERE id=_demande_id;
  ELSE RAISE EXCEPTION 'Niveau inconnu'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.sante_valider_demande(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_valider_demande(uuid,text) TO authenticated;