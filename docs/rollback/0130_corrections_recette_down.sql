-- Retour de 0130 : rétablit les définitions antérieures (relevées sur la base TEST, identique à la production) et
-- retire le contrôle des périodes d'exercice. Aucune donnée n'est touchée.
-- Attention : rétablir les droits de lecture de mv_balance rouvre la faille A-012 (balance lisible sans connexion).
GRANT SELECT ON public.mv_balance TO anon, authenticated;

DROP TRIGGER IF EXISTS exercices_periode_garde ON public.exercices;
DROP FUNCTION IF EXISTS public.exercices_periode_garde();

CREATE OR REPLACE FUNCTION public.sante_compte_defaut(_cle text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE _cle
    WHEN 'patients' THEN '4111' WHEN 'organismes' THEN '4114' WHEN 'produits' THEN '706'
    WHEN 'produits_consultation' THEN '70611' WHEN 'produits_acte' THEN '70612' WHEN 'produits_analyses' THEN '70613'
    WHEN 'produits_medicaments' THEN '7011' WHEN 'produits_autres' THEN '70618'
    WHEN 'tva_collectee' THEN '4431'
    WHEN 'especes' THEN '571' WHEN 'mobile_money' THEN '552' WHEN 'carte' THEN '521'
    WHEN 'cheques_a_encaisser' THEN '513' WHEN 'banque' THEN '521'
    WHEN 'ecart_caisse_perte' THEN '658' WHEN 'ecart_caisse_gain' THEN '758' WHEN 'perte_creance' THEN '651'
    WHEN 'dotation_provision' THEN '6594' WHEN 'provision_creance' THEN '4914'
    WHEN 'honoraires_praticiens' THEN '6324' WHEN 'praticiens' THEN '4011' WHEN 'retenue_source' THEN '4478'
    ELSE NULL END
$function$;

CREATE OR REPLACE FUNCTION public.syscohada_garde_ligne()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.ecritures%ROWTYPE;
BEGIN
 SELECT * INTO e FROM public.ecritures WHERE id=NEW.ecriture_id;
 IF NOT FOUND OR NEW.entreprise_id IS DISTINCT FROM e.entreprise_id OR NEW.exercice_id IS DISTINCT FROM e.exercice_id THEN RAISE EXCEPTION 'Ligne hors entreprise ou exercice'; END IF;
 IF NEW.debit IS NULL OR NEW.credit IS NULL OR NEW.debit::text IN ('NaN','Infinity','-Infinity') OR NEW.credit::text IN ('NaN','Infinity','-Infinity') OR NEW.debit<0 OR NEW.credit<0 OR (NEW.debit>0 AND NEW.credit>0) OR NEW.debit<>round(NEW.debit) OR NEW.credit<>round(NEW.credit) THEN RAISE EXCEPTION 'Montants FCFA entiers, positifs et sur un seul côté requis'; END IF;
 IF NEW.compte ~ '^(20|6811|1374)' THEN RAISE EXCEPTION 'Compte supprimé du SYSCOHADA révisé : %',NEW.compte; END IF;
 IF EXISTS(SELECT 1 FROM public.plan_comptable WHERE entreprise_id=NEW.entreprise_id AND numero=NEW.compte AND NOT actif) THEN RAISE EXCEPTION 'Compte désactivé'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sante_statut_tiers(_facture_id uuid, _statut text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF (_f.statut_tiers IN ('a_facturer','rejete') AND _statut='envoye') THEN
    UPDATE sante_factures SET statut_tiers = 'envoye', envoye_tiers_le = now() WHERE id = _facture_id;
  ELSIF (_f.statut_tiers='envoye' AND _statut='rejete') THEN
    UPDATE sante_factures SET statut_tiers = 'rejete' WHERE id = _facture_id;
  ELSE
    RAISE EXCEPTION 'Transition interdite (% → %)', _f.statut_tiers, _statut;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.sante_imputer_reglement(_structure_id uuid, _organisme text, _montant numeric, _mode text, _reference text, _imputations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.sante_importer_reglements(_structure_id uuid, _lignes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x jsonb; fid uuid; org text; ref text; mode_p text; m numeric; d date; cle text; empreinte text; ancien public.sante_reglements_organisme; rid uuid; ids jsonb='[]'::jsonb; ajoutes integer=0; existants integer=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.mfa_conforme() OR NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF jsonb_typeof(_lignes) IS DISTINCT FROM 'array' OR jsonb_array_length(_lignes)=0 OR jsonb_array_length(_lignes)>500 THEN RAISE EXCEPTION 'Relevé invalide (1 à 500 lignes)'; END IF;
 PERFORM 1 FROM public.structures WHERE id=_structure_id FOR UPDATE;
 FOR x IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
  IF x->>'confirme' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Chaque correspondance doit être confirmée'; END IF;
  fid=(x->>'facture_id')::uuid; org=btrim(x->>'organisme'); ref=btrim(x->>'reference'); mode_p=x->>'mode'; m=(x->>'montant')::numeric; d=(x->>'date')::date;
  IF fid IS NULL OR org IS NULL OR org='' OR ref IS NULL OR ref='' OR d IS NULL OR d>current_date OR m IS NULL OR m::text IN ('NaN','Infinity','-Infinity') OR m<=0 OR m<>trunc(m) OR m>9007199254740991 THEN RAISE EXCEPTION 'Date, référence ou montant FCFA invalide'; END IF;
  cle=md5(jsonb_build_array(org,ref,d,fid)::text); empreinte=md5(jsonb_build_array(org,ref,d,fid,m,mode_p)::text);
  SELECT * INTO ancien FROM public.sante_reglements_organisme WHERE structure_id=_structure_id AND import_cle=cle;
  IF ancien.id IS NOT NULL THEN
   IF ancien.import_empreinte IS DISTINCT FROM empreinte THEN RAISE EXCEPTION 'Cette référence a déjà été importée avec des valeurs différentes'; END IF;
   rid=ancien.id; existants=existants+1;
  ELSE
   rid=public.sante_imputer_reglement(_structure_id,org,m,mode_p,ref,jsonb_build_array(jsonb_build_object('facture_id',fid,'montant',m)));
   UPDATE public.sante_reglements_organisme SET import_cle=cle,import_empreinte=empreinte,date_reglement=d WHERE id=rid;
   ajoutes=ajoutes+1;
  END IF;
  ids=ids||jsonb_build_array(rid);
 END LOOP;
 RETURN jsonb_build_object('ajoutes',ajoutes,'existants',existants,'ids',ids);
END $function$;

CREATE OR REPLACE FUNCTION public.sante_tableau_bord(_structure_id uuid, _debut date, _fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d timestamptz := _debut; f timestamptz := _fin + 1; jours int := greatest(1, (_fin - _debut) + 1); r jsonb;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable','biologiste','medecin']) THEN
    RAISE EXCEPTION 'Droit insuffisant'; END IF;
  SELECT jsonb_build_object(
    'praticiens', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'nom'),'[]') FROM (
      SELECT jsonb_build_object('nom', p.nom, 'specialite', p.specialite,
        'rdv', count(rv.id),
        'honores', count(rv.id) FILTER (WHERE rv.statut IN ('termine','en_cours','arrive')),
        'absents', count(rv.id) FILTER (WHERE rv.statut = 'absent'),
        'occupation', round(100.0 * coalesce(sum(rv.duree_min) FILTER (WHERE rv.statut <> 'annule'),0) / (jours * 480), 1),
        'attente_min', round(avg(extract(epoch FROM (c.created_at - rv.arrive_le))/60) FILTER (WHERE rv.arrive_le IS NOT NULL AND c.created_at > rv.arrive_le))::numeric
      ) x
      FROM sante_praticiens p
      LEFT JOIN sante_rendez_vous rv ON rv.praticien_id = p.id AND rv.debut >= d AND rv.debut < f
      LEFT JOIN sante_consultations c ON c.rdv_id = rv.id
      WHERE p.structure_id = _structure_id GROUP BY p.id) s),
    'attente_moyenne_min', (SELECT round(avg(extract(epoch FROM (c.created_at - rv.arrive_le))/60))
      FROM sante_rendez_vous rv JOIN sante_consultations c ON c.rdv_id = rv.id
      WHERE rv.structure_id = _structure_id AND rv.debut >= d AND rv.debut < f AND rv.arrive_le IS NOT NULL AND c.created_at > rv.arrive_le),
    'ca_actes', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'montant')::numeric DESC),'[]') FROM (
      SELECT jsonb_build_object('libelle', l.libelle, 'nombre', sum(l.quantite), 'montant', sum(CASE WHEN fa.type='avoir' THEN -abs(l.montant) ELSE l.montant END)) x
      FROM sante_facture_lignes l JOIN sante_factures fa ON fa.id = l.facture_id
      WHERE fa.structure_id = _structure_id AND fa.created_at >= d AND fa.created_at < f GROUP BY l.libelle LIMIT 30) s),
    'ca_specialites', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
      SELECT jsonb_build_object('specialite', coalesce(CASE WHEN fa.demande_id IS NOT NULL THEN 'Laboratoire' END, p.specialite, 'Non précisée'), 'montant', sum(CASE WHEN fa.type='avoir' THEN -abs(fa.total) ELSE fa.total END)) x
      FROM sante_factures fa LEFT JOIN sante_consultations c ON c.id = fa.consultation_id LEFT JOIN sante_praticiens p ON p.id = c.praticien_id
      WHERE fa.structure_id = _structure_id AND fa.created_at >= d AND fa.created_at < f
      GROUP BY coalesce(CASE WHEN fa.demande_id IS NOT NULL THEN 'Laboratoire' END, p.specialite, 'Non précisée')) s),
    'labo', (SELECT jsonb_build_object(
        'demandes', count(*),
        'validees', count(*) FILTER (WHERE validee_le IS NOT NULL),
        'urgentes', count(*) FILTER (WHERE urgence),
        'tat_total_h', round((avg(extract(epoch FROM (validee_le - created_at))/3600) FILTER (WHERE validee_le IS NOT NULL))::numeric, 1),
        'tat_analytique_h', round((avg(extract(epoch FROM (validee_le - recue_le))/3600) FILTER (WHERE validee_le IS NOT NULL AND recue_le IS NOT NULL))::numeric, 1),
        'tat_urgent_h', round((avg(extract(epoch FROM (validee_le - created_at))/3600) FILTER (WHERE validee_le IS NOT NULL AND urgence))::numeric, 1))
      FROM sante_demandes_labo WHERE structure_id = _structure_id AND created_at >= d AND created_at < f),
    'techniciens', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'resultats')::int DESC),'[]') FROM (
      SELECT jsonb_build_object('nom', coalesce(pr.full_name, pr.email, 'Inconnu'), 'resultats', count(*), 'demandes', count(DISTINCT rs.demande_id)) x
      FROM sante_resultats rs LEFT JOIN profiles pr ON pr.id = rs.saisi_par
      WHERE rs.structure_id = _structure_id AND rs.saisi_le >= d AND rs.saisi_le < f GROUP BY pr.id, pr.full_name, pr.email) s),
    'tiers', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'creances')::numeric DESC),'[]') FROM (
      SELECT jsonb_build_object('organisme', fa.organisme,
        'factures', count(*), 'delai_envoi_jours', round(avg(extract(epoch FROM (fa.envoye_tiers_le - fa.created_at))/86400)::numeric, 1),
        'montant', sum(fa.part_organisme),
        'paye', coalesce(sum(fa.part_organisme) FILTER (WHERE fa.statut_tiers='paye'),0),
        'creances', coalesce(sum(fa.part_organisme) FILTER (WHERE fa.statut_tiers IN ('a_facturer','envoye')),0),
        'rejets', count(*) FILTER (WHERE fa.statut_tiers='rejete'),
        'taux_rejet', round(100.0 * count(*) FILTER (WHERE fa.statut_tiers='rejete') / nullif(count(*) FILTER (WHERE fa.statut_tiers <> 'a_facturer'),0), 1),
        'delai_jours', round(avg(extract(epoch FROM (e.created_at - coalesce(fa.envoye_tiers_le, fa.created_at)))/86400)::numeric, 1)) x
      FROM sante_factures fa
      LEFT JOIN LATERAL (SELECT min(created_at) created_at FROM sante_encaissements WHERE facture_id = fa.id AND mode = 'organisme') e ON true
      WHERE fa.structure_id = _structure_id AND fa.part_organisme > 0 AND NOT fa.annulee AND fa.created_at >= d AND fa.created_at < f
      GROUP BY fa.organisme) s)
  ) INTO r;
  RETURN r;
END $function$;
