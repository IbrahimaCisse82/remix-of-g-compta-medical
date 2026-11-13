-- Phase 8 (suite) : correction d'un critère, volume de saisies, lettrage, balance, clôture et à-nouveaux. TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
-- Critère trop strict de 06 : un règlement d'organisme est comptabilisé par un événement « reglement_organisme » (source = le règlement, pas l'encaissement).
DELETE FROM recette.resultats WHERE phase = '8' AND scenario = 'Chaque encaissement a son événement comptable';
-- Faux succès de 06 (colonnes md/mc lues sous d'autres noms : 0 = 0) : retiré, refait ci-dessous après le volume.
DELETE FROM recette.resultats WHERE phase = '8' AND scenario = 'Balance générale équilibrée (fonction de l''application)';
DO $d$ DECLARE _n bigint; _m bigint; BEGIN
  SELECT count(*) INTO _n FROM public.sante_encaissements x WHERE x.structure_id IN (SELECT structure_id FROM recette.structures) AND x.mode <> 'organisme'
     AND NOT EXISTS (SELECT 1 FROM public.sante_compta_evenements e WHERE e.source_id = x.id);
  PERFORM recette.noter('8','Comptabilité',NULL,'Chaque encaissement patient a son événement comptable','0', _n || ' sans événement', _n = 0, 'CPT-01', NULL, 'critique');
  SELECT count(*) INTO _n FROM public.sante_encaissements x WHERE x.structure_id IN (SELECT structure_id FROM recette.structures) AND x.mode = 'organisme';
  SELECT count(*) INTO _m FROM public.sante_encaissements x WHERE x.structure_id IN (SELECT structure_id FROM recette.structures) AND x.mode = 'organisme'
     AND EXISTS (SELECT 1 FROM public.sante_compta_evenements e WHERE e.source_type = 'reglement_organisme' AND e.structure_id = x.structure_id AND e.piece = replace(x.reference, 'REG ', ''));
  PERFORM recette.noter('8','Comptabilité',NULL,'Chaque règlement d''organisme a son écriture de banque (événement reglement_organisme)', _n || ' règlement(s) comptabilisé(s)', _m || ' / ' || _n, _n = _m, 'CPT-01', NULL, 'critique');
END $d$;

-- Volume : saisies manuelles validées dans les journaux AC, BQ, PA, OD et CA (comptes du plan du dossier uniquement).
CREATE OR REPLACE FUNCTION recette.gen_ecritures(_s text, _n int) RETURNS int LANGUAGE plpgsql AS $f$
DECLARE k int; i int; _base int; _ok int := 0; _d date; _m numeric; _j text; _l jsonb; _lib text; _e uuid := recette.eid(_s); _x uuid := recette.exo(_s, 2026);
BEGIN
  SELECT count(*) INTO _base FROM public.ecritures WHERE entreprise_id = _e AND piece LIKE 'RT-' || _s || '-%';
  FOR k IN 1.._n LOOP
    i := _base + k;
    _d := DATE '2026-01-02' + (random() * 313)::int;
    _m := (5 + floor(random() * 400)) * 500;
    CASE i % 6
      WHEN 0 THEN _j := 'AC'; _lib := 'Achat de consommables médicaux (TEST)'; _l := jsonb_build_array(jsonb_build_object('compte','6041','debit',_m), jsonb_build_object('compte','4011','credit',_m));
      WHEN 1 THEN _j := 'BQ'; _lib := 'Règlement fournisseur (TEST)'; _l := jsonb_build_array(jsonb_build_object('compte','4011','debit',_m), jsonb_build_object('compte','521','credit',_m));
      WHEN 2 THEN _j := 'PA'; _lib := 'Salaire du personnel (TEST)'; _l := jsonb_build_array(jsonb_build_object('compte','6411','debit',_m * 4), jsonb_build_object('compte','4211','credit',_m * 4));
      WHEN 3 THEN _j := 'BQ'; _lib := 'Paiement des salaires (TEST)'; _l := jsonb_build_array(jsonb_build_object('compte','4211','debit',_m * 4), jsonb_build_object('compte','521','credit',_m * 4));
      WHEN 4 THEN _j := 'OD'; _lib := 'Loyer et charges locatives (TEST)'; _l := jsonb_build_array(jsonb_build_object('compte','6222','debit',_m), jsonb_build_object('compte','4011','credit',_m));
      ELSE        _j := 'CA'; _lib := 'Frais bancaires et petits achats (TEST)'; _l := jsonb_build_array(jsonb_build_object('compte','6052','debit',_m), jsonb_build_object('compte','571','credit',_m));
    END CASE;
    BEGIN
      PERFORM public.fn_creer_ecriture(_e, _x, _j, _d, _lib, _l, 'RT-' || _s || '-' || _j || '-' || i, CASE WHEN i % 10 = 0 THEN 'brouillon' ELSE 'validee' END, 'saisie');
      _ok := _ok + 1;
    EXCEPTION WHEN OTHERS THEN
      IF coalesce(current_setting('recette.gen_err', true), '') = '' THEN PERFORM set_config('recette.gen_err', left(SQLERRM, 200) || ' [' || _j || ' ' || _d || ']', false); END IF;
    END;
  END LOOP;
  RETURN _ok;
END $f$;
GRANT EXECUTE ON FUNCTION recette.gen_ecritures(text, int) TO authenticated;

-- Le volume est lancé par lots (une transaction par lot de 325 : chaque sous-transaction garde un verrou jusqu'à la fin) puis contrôlé par 08_volume.sql.

-- Lettrage d'un compte fournisseur : facture et règlement de même montant.
DO $d$ DECLARE _a uuid; _b uuid; _c uuid; _r text; BEGIN
  SELECT j.id INTO _a FROM public.journal j JOIN public.ecritures e ON e.id = j.ecriture_id
   WHERE e.entreprise_id = recette.eid('A') AND e.journal_code = 'AC' AND j.compte = '4011' AND j.credit = 100000 AND e.statut = 'validee' LIMIT 1;
  IF _a IS NULL THEN
    PERFORM recette.agir('A-compta');
    PERFORM public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'AC', DATE '2026-09-01', 'Facture fournisseur à lettrer (TEST)', '[{"compte":"6041","debit":100000},{"compte":"4011","credit":100000}]', 'LET-FA-1', 'validee', 'saisie');
    PERFORM public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'BQ', DATE '2026-09-15', 'Règlement à lettrer (TEST)', '[{"compte":"4011","debit":100000},{"compte":"521","credit":100000}]', 'LET-BQ-1', 'validee', 'saisie');
    PERFORM public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'BQ', DATE '2026-09-16', 'Acompte partiel (TEST)', '[{"compte":"4011","debit":40000},{"compte":"521","credit":40000}]', 'LET-BQ-2', 'validee', 'saisie');
    PERFORM recette.sortir();
  END IF;
  SELECT j.id INTO _a FROM public.journal j WHERE j.entreprise_id = recette.eid('A') AND j.piece = 'LET-FA-1' AND j.compte = '4011';
  SELECT j.id INTO _b FROM public.journal j WHERE j.entreprise_id = recette.eid('A') AND j.piece = 'LET-BQ-1' AND j.compte = '4011';
  SELECT j.id INTO _c FROM public.journal j WHERE j.entreprise_id = recette.eid('A') AND j.piece = 'LET-BQ-2' AND j.compte = '4011';
  INSERT INTO recette.ids VALUES ('let_a', _a), ('let_b', _b), ('let_c', _c) ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
END $d$;
SELECT recette.essai('8','Comptabilité','X-externe','Un compte extérieur au dossier lettre des lignes du dossier A','Refus (0 ou erreur)','vide',
  $$SELECT public.reglement_lettrer(ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_b')])::text$$, 'CPT-14', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Lettrage refusé si les montants ne se soldent pas (100 000 contre 40 000)','0 (refus)','egal:0',
  $$SELECT public.reglement_lettrer(ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_c')])::text$$, 'CPT-14', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Lettrage d''une facture fournisseur et de son règlement','1 (lettré)','egal:1',
  $$SELECT public.reglement_lettrer(ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_b')])::text$$, 'CPT-14', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Une ligne déjà lettrée ne peut pas l''être une seconde fois','0 (refus)','egal:0',
  $$SELECT public.reglement_lettrer(ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_b')])::text$$, 'CPT-14', 'majeure');

-- Clôture : exercice 2025 de C (activité d'ouverture), clôture par l'administrateur, à-nouveaux dans 2026, réouverture tracée.
DO $d$ BEGIN
  IF recette.exo('C', 2025) IS NULL THEN
    PERFORM recette.agir('C-compta');
    INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) VALUES (recette.eid('C'), 2025, DATE '2025-01-01', DATE '2025-12-31', 'en_cours');
    PERFORM public.fn_creer_ecriture(recette.eid('C'), recette.exo('C', 2025), 'BQ', DATE '2025-01-05', 'Apport en capital (TEST)', '[{"compte":"521","debit":5000000},{"compte":"1013","credit":5000000}]', 'CL25-1', 'validee', 'saisie');
    PERFORM public.fn_creer_ecriture(recette.eid('C'), recette.exo('C', 2025), 'AC', DATE '2025-03-10', 'Achats de l''exercice (TEST)', '[{"compte":"6041","debit":1200000},{"compte":"4011","credit":1200000}]', 'CL25-2', 'validee', 'saisie');
    PERFORM public.fn_creer_ecriture(recette.eid('C'), recette.exo('C', 2025), 'BQ', DATE '2025-04-10', 'Règlement partiel fournisseur (TEST)', '[{"compte":"4011","debit":800000},{"compte":"521","credit":800000}]', 'CL25-3', 'validee', 'saisie');
    PERFORM public.fn_creer_ecriture(recette.eid('C'), recette.exo('C', 2025), 'VT', DATE '2025-06-30', 'Ventes de l''exercice (TEST)', '[{"compte":"4111","debit":2000000},{"compte":"7011","credit":2000000}]', 'CL25-4', 'validee', 'saisie');
    PERFORM public.fn_creer_ecriture(recette.eid('C'), recette.exo('C', 2025), 'BQ', DATE '2025-09-30', 'Encaissement clients (TEST)', '[{"compte":"521","debit":1500000},{"compte":"4111","credit":1500000}]', 'CL25-5', 'validee', 'saisie');
    PERFORM public.fn_creer_ecriture(recette.eid('C'), recette.exo('C', 2025), 'OD', DATE '2025-12-20', 'Écriture en brouillon non validée (TEST)', '[{"compte":"6052","debit":30000},{"compte":"571","credit":30000}]', 'CL25-6', 'brouillon', 'saisie');
    PERFORM recette.sortir();
  END IF;
END $d$;
SELECT recette.essai('8','Comptabilité','C-compta','Le comptable tente de clôturer l''exercice 2025','Refus (réservé à l''administrateur)','refus',
  $$SELECT public.fn_cloturer_exercice(recette.exo('C', 2025))::text$$, 'CPT-17', 'critique');
SELECT recette.essai('8','Comptabilité','C-admin','Clôture de l''exercice 2025 par l''administrateur','Résultat 800 000 F (bénéfice), à-nouveaux dans 2026','ok',
  $$SELECT public.fn_cloturer_exercice(recette.exo('C', 2025))::text$$, 'CPT-17', 'critique');
DO $d$ DECLARE _an uuid; _l jsonb; _d numeric; _c numeric; BEGIN
  SELECT id INTO _an FROM public.ecritures WHERE exercice_id = recette.exo('C', 2026) AND piece = 'AN-CLOTURE-2025' AND contrepasse_par IS NULL AND coalesce(origine,'') <> 'contrepassation' ORDER BY created_at DESC LIMIT 1;
  SELECT jsonb_object_agg(compte, s), sum(debit), sum(credit) INTO _l, _d, _c FROM (SELECT compte, sum(debit - credit) s, sum(debit) debit, sum(credit) credit FROM public.ecriture_lignes WHERE ecriture_id = _an GROUP BY compte) z;
  PERFORM recette.noter('8','Comptabilité',NULL,'À-nouveaux 2026 : comptes de bilan reportés, résultat en 1301, brouillon exclu',
    '521 +5 700 000 ; 1013 −5 000 000 ; 4011 −400 000 ; 4111 +500 000 ; 1301 −800 000 ; équilibré',
    coalesce(_l::text, 'aucune écriture d''à-nouveaux') || ' ; Σ ' || coalesce(_d, 0) || ' / ' || coalesce(_c, 0),
    _l IS NOT NULL AND (_l->>'521')::numeric = 5700000 AND (_l->>'1013')::numeric = -5000000 AND (_l->>'4011')::numeric = -400000
      AND (_l->>'4111')::numeric = 500000 AND (_l->>'1301')::numeric = -800000 AND _d = _c AND NOT (_l ? '6041') AND NOT (_l ? '7011'), 'CPT-17', NULL, 'critique');
END $d$;
SELECT recette.essai('8','Comptabilité','C-compta','Saisie dans l''exercice clôturé 2025','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('C'), recette.exo('C', 2025), 'OD', DATE '2025-12-31', 'Après clôture', '[{"compte":"6052","debit":1000},{"compte":"571","credit":1000}]', 'CL25-X', 'brouillon', 'saisie')::text$$, 'CPT-17', 'critique');
SELECT recette.essai('8','Comptabilité','C-compta','Validation d''un brouillon d''un exercice clôturé','Refus','refus',
  $$SELECT public.fn_valider_ecriture((SELECT id FROM public.ecritures WHERE entreprise_id = recette.eid('C') AND piece = 'CL25-6'))::text$$, 'CPT-17', 'critique');
SELECT recette.essai('8','Comptabilité','C-admin','Seconde clôture du même exercice','Refus','refus',
  $$SELECT public.fn_cloturer_exercice(recette.exo('C', 2025))::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('8','Comptabilité','C-admin','Réouverture sans motif','Refus','refus',
  $$SELECT public.fn_rouvrir_exercice(recette.exo('C', 2025), '')::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('8','Comptabilité','C-compta','Réouverture par le comptable','Refus','refus',
  $$SELECT public.fn_rouvrir_exercice(recette.exo('C', 2025), 'Correction demandée par la recette')::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('8','Comptabilité','C-admin','Réouverture motivée : les à-nouveaux sont contre-passés','Exercice rouvert, AN contre-passés','ok',
  $$SELECT public.fn_rouvrir_exercice(recette.exo('C', 2025), 'Correction demandée par la recette (TEST)')::text || (SELECT statut FROM public.exercices WHERE id = recette.exo('C', 2025))$$, 'CPT-17', 'majeure');
DO $d$ DECLARE _n numeric; BEGIN
  SELECT coalesce(sum(l.debit - l.credit) FILTER (WHERE l.compte = '521'), 0) INTO _n FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
   WHERE e.exercice_id = recette.exo('C', 2026) AND e.journal_code = 'AN';
  PERFORM recette.noter('8','Comptabilité',NULL,'Après réouverture : l''effet net des à-nouveaux 2026 est nul','0 sur 521', _n::text, _n = 0, 'CPT-17', NULL, 'majeure');
END $d$;
SELECT recette.essai('8','Comptabilité','C-admin','Nouvelle clôture après réouverture','Accepté, résultat 800 000 F','ok',
  $$SELECT public.fn_cloturer_exercice(recette.exo('C', 2025))::text$$, 'CPT-17', 'majeure');
DO $d$ DECLARE _n bigint; BEGIN
  SELECT count(*) INTO _n FROM public.cloture_logs WHERE exercice_id = recette.exo('C', 2025);
  PERFORM recette.noter('8','Comptabilité',NULL,'Journal de clôture : clôture, réouverture et nouvelle clôture tracées','3 entrées', _n || ' entrée(s)', _n = 3, 'CPT-17', NULL, 'majeure');
END $d$;
SELECT recette.essai('8','Comptabilité','C-compta','Ouverture d''un exercice 2027 par le comptable','Accepté','ok',
  $$WITH x AS (INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) SELECT recette.eid('C'), 2027, DATE '2027-01-01', DATE '2027-12-31', 'en_cours'
     WHERE NOT EXISTS (SELECT 1 FROM public.exercices WHERE entreprise_id = recette.eid('C') AND annee = 2027) RETURNING annee) SELECT coalesce((SELECT annee::text FROM x), 'déjà ouvert')$$, 'CPT-17', 'mineure');
SELECT recette.essai('8','Comptabilité','C-compta','Exercice chevauchant 2026 refusé','Refus','refus',
  $$INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) VALUES (recette.eid('C'), 2028, DATE '2026-06-01', DATE '2027-05-31', 'en_cours') RETURNING annee::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Le comptable de A ouvre un exercice dans le dossier de C','Refus','refus',
  $$INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) VALUES (recette.eid('C'), 2030, DATE '2030-01-01', DATE '2030-12-31', 'en_cours') RETURNING annee::text$$, 'CPT-17', 'critique');
