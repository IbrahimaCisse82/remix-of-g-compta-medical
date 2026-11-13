-- Phase 12 : contre-tests après application de la migration 0130 (branche fix/recette-anomalies) sur la base TEST.
-- Chaque scénario en échec est rejoué à l'identique ; puis non-régression des parcours voisins. TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
  IF public.sante_compte_defaut('provision_creance') <> '4912' THEN RAISE EXCEPTION 'Migration 0130 non appliquée'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '12';

-- A-012
DO $d$ DECLARE _r text; _n bigint; BEGIN
  _r := recette.anon_sql('SELECT count(*)::text FROM public.mv_balance');
  PERFORM recette.noter('12','Sécurité','anon','Contre-test A-012 : lecture anonyme de mv_balance','Refus', _r, _r LIKE 'REFUSÉ%', 'SEC-01', 'A-012', 'critique');
  SELECT count(*) INTO _n FROM recette.balayage('X-externe') WHERE n > 0 AND NOT tbl = ANY(recette.references_publiques());
  PERFORM recette.noter('12','Sécurité','X-externe','Contre-test A-012 : balayage complet d''un compte sans structure','0 table', _n || ' table(s)', _n = 0, 'SEC-02', 'A-012', 'critique');
  SELECT count(*) INTO _n FROM recette.balayage('A-admin', 'A') WHERE n > 0;
  PERFORM recette.noter('12','Sécurité','A-admin','Contre-test A-012 : balayage croisé A → B, C','0 table', _n || ' table(s)', _n = 0, 'SEC-02', 'A-012', 'critique');
END $d$;
SELECT recette.essai('12','Comptabilité','A-compta','Non-régression A-012 : la balance de l''application (fn_balance) reste disponible','Accepté','ok',
  $$SELECT count(*)::text || ' comptes' FROM public.fn_balance(recette.eid('A'), recette.exo('A', 2026))$$, 'CPT-12', 'critique');

-- A-007
SELECT recette.essai('12','Comptabilité','A-compta','Contre-test A-007 : saisie manuelle sur un compte absent du plan','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-06-30', 'Compte inexistant', '[{"compte":"999999","debit":1000},{"compte":"4011","credit":1000}]', 'PJ-CT-1', 'brouillon', 'saisie')::text$$, 'CPT-10', 'majeure');
SELECT recette.essai('12','Comptabilité','A-compta','Non-régression A-007 : saisie manuelle sur des comptes du plan','Accepté','ok',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-06-30', 'Contre-test plan (TEST)', '[{"compte":"6222","debit":1000},{"compte":"4011","credit":1000}]', 'PJ-CT-2', 'brouillon', 'saisie')::text$$, 'CPT-11', 'majeure');
DO $d$ DECLARE _f uuid; _n0 bigint; _n1 bigint; _err text; BEGIN
  -- Les écritures automatiques (sous-comptes créés à la demande) ne sont pas bloquées : un encaissement de A est comptabilisé.
  SELECT count(*) INTO _n0 FROM public.sante_compta_evenements WHERE structure_id = recette.sid('A') AND statut = 'comptabilise';
  SELECT f.id INTO _f FROM public.sante_factures f WHERE f.structure_id = recette.sid('A') AND f.type = 'facture' AND NOT f.annulee
     AND f.part_patient > coalesce((SELECT sum(montant) FROM public.sante_encaissements e WHERE e.facture_id = f.id), 0) LIMIT 1;
  BEGIN
    IF _f IS NOT NULL THEN PERFORM recette.encaisser('A', _f); END IF;
  EXCEPTION WHEN OTHERS THEN _err := SQLERRM; END;
  SELECT count(*) INTO _n1 FROM public.sante_compta_evenements WHERE structure_id = recette.sid('A') AND statut = 'comptabilise';
  PERFORM recette.noter('12','Comptabilité','A-caisse','Non-régression A-007 : un encaissement santé reste comptabilisé automatiquement','+1 événement comptabilisé',
    coalesce('erreur : ' || _err, '+' || (_n1 - _n0)) || CASE WHEN _f IS NULL THEN ' (aucune facture à encaisser)' ELSE '' END, _err IS NULL AND (_f IS NULL OR _n1 > _n0), 'CPT-01', NULL, 'critique');
  PERFORM recette.noter('12','Comptabilité',NULL,'Contre-test A-007 : compte de provision des créances douteuses','4912 (présent au plan)',
    public.sante_compte_defaut('provision_creance') || CASE WHEN EXISTS (SELECT 1 FROM public.plan_comptable WHERE entreprise_id = recette.eid('B') AND numero = public.sante_compte_defaut('provision_creance')) THEN ' (présent au plan de B)' ELSE ' (absent du plan de B)' END,
    public.sante_compte_defaut('provision_creance') = '4912' AND EXISTS (SELECT 1 FROM public.plan_comptable WHERE entreprise_id = recette.eid('B') AND numero = '4912'), 'CPT-10', 'A-007', 'majeure');
END $d$;

-- A-009
SELECT recette.essai('12','Comptabilité','C-compta','Contre-test A-009 : exercice chevauchant 2026','Refus','refus',
  $$INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) VALUES (recette.eid('C'), 2028, DATE '2026-06-01', DATE '2027-05-31', 'en_cours') RETURNING annee::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('12','Comptabilité','C-compta','Contre-test A-009 : second exercice 2026','Refus','refus',
  $$INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) VALUES (recette.eid('C'), 2026, DATE '2026-01-01', DATE '2026-12-31', 'en_cours') RETURNING annee::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('12','Comptabilité','C-compta','Contre-test A-009 : fin avant début','Refus','refus',
  $$INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) VALUES (recette.eid('C'), 2031, DATE '2031-12-31', DATE '2031-01-01', 'en_cours') RETURNING annee::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('12','Comptabilité','B-admin','Non-régression A-009 : ouverture d''un exercice 2027 contigu','Accepté','ok',
  $$WITH x AS (INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) SELECT recette.eid('B'), 2027, DATE '2027-01-01', DATE '2027-12-31', 'en_cours'
     WHERE NOT EXISTS (SELECT 1 FROM public.exercices WHERE entreprise_id = recette.eid('B') AND annee = 2027) RETURNING annee) SELECT coalesce((SELECT annee::text FROM x), 'déjà ouvert')$$, 'CPT-17', 'majeure');
SELECT recette.essai('12','Comptabilité','C-admin','Non-régression A-009 : réouverture puis clôture de 2025 (exercice suivant existant)','Accepté','ok',
  $$SELECT coalesce(public.fn_rouvrir_exercice(recette.exo('C', 2025), 'Contre-test 0130 (TEST)')::text, '') || (public.fn_cloturer_exercice(recette.exo('C', 2025))->>'resultat')$$, 'CPT-17', 'majeure');

-- A-006
SELECT recette.essai('12','Tiers payant','A-caisse','Contre-test A-006 : le caissier déclare « payée » la part organisme sans relevé','Refus','refus',
  $$SELECT coalesce(public.sante_statut_tiers((SELECT id FROM public.sante_factures WHERE structure_id = recette.sid('A') AND part_organisme > 0 AND statut_tiers IN ('a_facturer','envoye') AND NOT annulee LIMIT 1), 'paye')::text, 'ok')$$, 'TP-05', 'majeure');
SELECT recette.essai('12','Tiers payant','A-caisse','Non-régression A-006 : envoi à l''organisme toujours possible','Accepté','ok',
  $$SELECT coalesce(public.sante_statut_tiers((SELECT id FROM public.sante_factures WHERE structure_id = recette.sid('A') AND part_organisme > 0 AND statut_tiers IN ('a_facturer','rejete') AND NOT annulee LIMIT 1), 'envoye')::text, 'envoyé')$$, 'TP-03', 'majeure');

-- A-010
DO $d$ DECLARE _f record; _r text; _date date; BEGIN
  SELECT f.id, f.organisme INTO _f FROM public.sante_factures f WHERE f.structure_id = recette.sid('B') AND f.type = 'facture' AND NOT f.annulee AND f.organisme IS NOT NULL
     AND public.sante_reste_organisme(f.id) >= 1000 ORDER BY f.created_at LIMIT 1;
  INSERT INTO recette.fichiers (nom, contenu) VALUES ('import_reglements_contre_test', jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'organisme', _f.organisme,
    'reference', 'REL-CT-0130', 'mode', 'virement', 'montant', 500, 'date', current_date - 3, 'confirme', 'true'))) ON CONFLICT (nom) DO UPDATE SET contenu = excluded.contenu;
  _r := recette.essai('12','Import règlements','B-tp','Contre-test A-010 : import d''un règlement daté de J-3','Accepté','ok',
    $$SELECT (public.sante_importer_reglements(recette.sid('B'), recette.fichier('import_reglements_contre_test')) - 'ids')::text$$, 'TP-05', 'majeure');
  SELECT date_piece INTO _date FROM public.sante_compta_evenements WHERE structure_id = recette.sid('B') AND source_type = 'reglement_organisme' AND piece = 'REL-CT-0130';
  PERFORM recette.noter('12','Import règlements',NULL,'Contre-test A-010 : écriture de banque datée du jour du règlement', (current_date - 3)::text, coalesce(_date::text, 'aucune'), _date = current_date - 3, 'CPT-01', 'A-010', 'mineure');
END $d$;

-- A-011
DO $d$ DECLARE _t jsonb; _ok boolean; BEGIN
  PERFORM recette.agir('B-admin');
  _t := public.sante_tableau_bord(recette.sid('B'), DATE '2026-01-01', DATE '2026-12-31');
  PERFORM recette.sortir();
  SELECT bool_and((x->>'libelle') IN (SELECT l.libelle FROM public.sante_facture_lignes l JOIN public.sante_factures f ON f.id = l.facture_id
           WHERE f.structure_id = recette.sid('B') AND f.created_at >= DATE '2026-01-01' AND f.created_at < DATE '2027-01-01'
           GROUP BY l.libelle ORDER BY sum(CASE WHEN f.type = 'avoir' THEN -abs(l.montant) ELSE l.montant END) DESC, l.libelle LIMIT 30))
    INTO _ok FROM jsonb_array_elements(_t->'ca_actes') x;
  PERFORM recette.noter('12','Tableau de bord','B-admin','Contre-test A-011 : palmarès = les 30 premiers par montant','oui',
    jsonb_array_length(_t->'ca_actes') || ' libellés ; premiers par montant : ' || CASE WHEN _ok THEN 'oui' ELSE 'non' END, coalesce(_ok, false), 'TDB-01', 'A-011', 'mineure');
END $d$;

-- Essai bloqué de la phase 5 (erreur de rédaction) : rejoué correctement.
DELETE FROM recette.resultats WHERE phase = '5' AND statut = 'bloque';
SELECT recette.essai('5','Habilitations','A-compta','Contrôle positif : le comptable peut créer une écriture brouillon (annulée ensuite)','Accepté','vide',
  $$SELECT CASE WHEN public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-06-30', 'Contrôle positif', '[{"compte":"6222","debit":1000},{"compte":"4011","credit":1000}]', 'PJ-POS', 'brouillon', 'saisie') IS NOT NULL THEN '' END$$, 'SEC-03', 'majeure');

UPDATE recette.resultats SET anomalie = 'A-006' WHERE phase = '12' AND scenario LIKE 'Contre-test A-006%';
UPDATE recette.resultats SET anomalie = 'A-007' WHERE phase = '12' AND scenario LIKE 'Contre-test A-007%';
UPDATE recette.resultats SET anomalie = 'A-009' WHERE phase = '12' AND scenario LIKE 'Contre-test A-009%';

-- Statut des anomalies : « corrigée en TEST » seulement si tous leurs contre-tests passent.
UPDATE recette.anomalies a SET statut = 'corrigée en TEST (PR, non fusionnée)'
 WHERE a.code IN ('A-006','A-007','A-009','A-010','A-011','A-012')
   AND EXISTS (SELECT 1 FROM recette.resultats r WHERE r.phase = '12' AND r.anomalie = a.code)
   AND NOT EXISTS (SELECT 1 FROM recette.resultats r WHERE r.phase = '12' AND r.anomalie = a.code AND r.statut <> 'reussi');
UPDATE recette.anomalies SET statut = 'corrigée (PR, non rejouable en TEST : fonction serveur non déployée)' WHERE code = 'A-008';
