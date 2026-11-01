-- Compte rendu : nom et n° d'ordre du biologiste signataire (01/11/2026).
-- Constat (test visuel de la validation à plusieurs) : le compte rendu définitif portait « Signature électronique
-- du biologiste » sans nom ni n° d'ordre. Les techniciens et préleveurs, qui impriment aussi les comptes rendus,
-- ne peuvent pas lire les fiches praticiens : le nom ne peut donc pas être lu au moment de l'impression.
-- Correction additive : le nom et le n° d'ordre sont figés sur la demande au moment de la validation biologique
-- (comme les libellés et unités des résultats), puis repris tels quels à chaque impression. Un rectificatif est
-- signé par le biologiste qui rectifie.
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS signataire_nom text;
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS signataire_ordre text;

CREATE OR REPLACE FUNCTION public.sante_valider_demande(_demande_id uuid, _niveau text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d sante_demandes_labo; _manquants int; _crit int; _derog boolean; _contenu jsonb; _derog_utilisee boolean := false;
  _sig sante_praticiens;
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
    SELECT * INTO _sig FROM sante_praticiens WHERE structure_id=d.structure_id AND user_id=auth.uid() AND coalesce(trim(numero_ordre),'') <> '' LIMIT 1;
    IF _sig.id IS NULL THEN
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
      signataire_nom = _sig.nom, signataire_ordre = trim(_sig.numero_ordre),
      cr_hash = encode(extensions.digest(_contenu::text, 'sha256'), 'hex'),
      cr_token = coalesce(cr_token, encode(extensions.gen_random_bytes(16), 'hex'))
    WHERE id=_demande_id;
  ELSE RAISE EXCEPTION 'Niveau inconnu'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.sante_rectifier_resultat_v2(_demande_id uuid, _parametre_id uuid, _valeur_num numeric, _valeur_texte text, _motif text, _traitement_deja_prescrit boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _v int; d sante_demandes_labo; _ent uuid; _u uuid; _sig sante_praticiens;
BEGIN
  SELECT * INTO d FROM sante_demandes_labo WHERE id=_demande_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT public.mfa_conforme() OR NOT public.has_any_medical_role(d.structure_id, ARRAY['biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  _v := public.sante_rectifier_resultat(_demande_id, _parametre_id, _valeur_num, _valeur_texte, _motif);
  UPDATE sante_rectificatifs SET traitement_deja_prescrit = coalesce(_traitement_deja_prescrit,false) WHERE demande_id=_demande_id AND parametre_id=_parametre_id AND version=_v;
  SELECT entreprise_id INTO _ent FROM structures WHERE id=d.structure_id;
  SELECT pr.user_id INTO _u FROM sante_consultations c JOIN sante_praticiens pr ON pr.id=c.praticien_id WHERE c.id=d.consultation_id;
  IF _u IS NULL THEN _u := d.created_by; END IF;
  IF _ent IS NOT NULL AND _u IS NOT NULL THEN
    INSERT INTO notifications(entreprise_id, user_id, type, titre, message, meta)
    VALUES (_ent, _u, 'rectificatif_labo', 'Compte rendu rectifié', 'Le compte rendu ' || d.numero || ' a été rectifié (version ' || _v || '). ' ||
      CASE WHEN _traitement_deja_prescrit THEN 'Un traitement a déjà été prescrit : réévaluez-le.' ELSE '' END, jsonb_build_object('demande_id', _demande_id));
  END IF;
  PERFORM set_config('sante.rectificatif','on',true);
  -- La version rectifiée est signée par le biologiste qui rectifie (fiche avec n° d'ordre) ; à défaut, signataire inchangé.
  SELECT * INTO _sig FROM sante_praticiens WHERE structure_id=d.structure_id AND user_id=auth.uid() AND coalesce(trim(numero_ordre),'') <> '' LIMIT 1;
  UPDATE sante_demandes_labo SET cr_hash = encode(extensions.digest((coalesce(cr_hash,'') || ':' || _v)::text, 'sha256'), 'hex'),
    signataire_nom = coalesce(_sig.nom, signataire_nom), signataire_ordre = coalesce(trim(_sig.numero_ordre), signataire_ordre)
  WHERE id=_demande_id;
  PERFORM set_config('sante.rectificatif','',true);
  RETURN _v;
END $function$;

-- Demandes déjà validées : signataire retrouvé depuis la fiche praticien du valideur, quand elle existe.
-- Une demande validée est verrouillée ; le drapeau « rectificatif », local à la transaction de migration, autorise
-- ce seul complément (le contenu signé et son empreinte ne changent pas).
SELECT set_config('sante.rectificatif', 'on', true);
UPDATE public.sante_demandes_labo d SET signataire_nom = p.nom, signataire_ordre = nullif(trim(p.numero_ordre), '')
  FROM public.sante_praticiens p
 WHERE d.statut = 'validee' AND d.signataire_nom IS NULL AND d.validee_par IS NOT NULL
   AND p.structure_id = d.structure_id AND p.user_id = d.validee_par;
SELECT set_config('sante.rectificatif', '', true);
