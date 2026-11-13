-- Phase 8 (reprise) : le lettrage passe par la table lettrage (comme l'écran), la clôture exige l'absence de brouillon. TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
-- Essais 07 rédigés contre une fonction interne non exposée (reglement_lettrer) ou faussés par l'échec de la clôture : retirés et refaits.
DELETE FROM recette.resultats WHERE phase = '8' AND (scenario LIKE '%lettr%' OR scenario IN (
  'Clôture de l''exercice 2025 par l''administrateur', 'À-nouveaux 2026 : comptes de bilan reportés, résultat en 1301, brouillon exclu',
  'Saisie dans l''exercice clôturé 2025', 'Validation d''un brouillon d''un exercice clôturé', 'Seconde clôture du même exercice',
  'Réouverture motivée : les à-nouveaux sont contre-passés', 'Après réouverture : l''effet net des à-nouveaux 2026 est nul',
  'Nouvelle clôture après réouverture', 'Journal de clôture : clôture, réouverture et nouvelle clôture tracées'));

CREATE OR REPLACE FUNCTION recette.lettrer(_code text, _ids uuid[]) RETURNS text LANGUAGE sql AS $f$
  WITH x AS (INSERT INTO public.lettrage (entreprise_id, exercice_id, compte, code_lettrage, journal_entry_id, montant, date_lettrage)
    SELECT j.entreprise_id, j.exercice_id, j.compte, _code, j.id, j.debit - j.credit, current_date FROM public.journal j WHERE j.id = ANY(_ids) RETURNING 1)
  SELECT count(*)::text FROM x
$f$;
GRANT EXECUTE ON FUNCTION recette.lettrer(text, uuid[]) TO authenticated;
SELECT recette.essai('8','Comptabilité','X-externe','Un compte extérieur au dossier lettre des lignes du dossier A','Refus','vide',
  $$SELECT recette.lettrer('RX1', ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_b')])$$, 'CPT-14', 'critique');
SELECT recette.essai('8','Comptabilité','A-lecteur','Un lecteur du dossier lettre des lignes','Refus','refus',
  $$SELECT recette.lettrer('RX2', ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_b')])$$, 'CPT-14', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Lettrage non soldé (100 000 contre 40 000) refusé par la base','Refus','refus',
  $$SELECT recette.lettrer('RX3', ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_c')])$$, 'CPT-14', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Lettrage d''une facture fournisseur et de son règlement','2 lignes lettrées','egal:2',
  $$SELECT recette.lettrer('R0001', ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_b')])$$, 'CPT-14', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Une ligne déjà lettrée ne peut pas l''être une seconde fois','Refus','refus',
  $$SELECT recette.lettrer('R0002', ARRAY[(SELECT id FROM recette.ids WHERE cle='let_b'), (SELECT id FROM recette.ids WHERE cle='let_a')])$$, 'CPT-14', 'majeure');

-- Clôture : refusée tant qu'un brouillon existe (contrôle de l'application), puis brouillon validé et clôture.
SELECT recette.essai('8','Comptabilité','C-admin','Clôture refusée tant qu''une écriture de l''exercice est en brouillon','Refus','refus',
  $$SELECT public.fn_cloturer_exercice(recette.exo('C', 2025))::text$$, 'CPT-17', 'critique');
SELECT recette.essai('8','Comptabilité','C-compta','Validation du brouillon de 2025 avant clôture','Validée','ok',
  $$SELECT coalesce(public.fn_valider_ecriture((SELECT id FROM public.ecritures WHERE entreprise_id = recette.eid('C') AND piece = 'CL25-6'))::text, '') || (SELECT statut FROM public.ecritures WHERE entreprise_id = recette.eid('C') AND piece = 'CL25-6')$$, 'CPT-11', 'majeure');
SELECT recette.essai('8','Comptabilité','C-admin','Clôture de l''exercice 2025 par l''administrateur','Résultat 770 000 F (bénéfice), à-nouveaux dans 2026','ok',
  $$SELECT public.fn_cloturer_exercice(recette.exo('C', 2025))::text$$, 'CPT-17', 'critique');
CREATE OR REPLACE FUNCTION recette.controle_an(_scenario text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE _an uuid; _l jsonb; _d numeric; _c numeric; BEGIN
  SELECT id INTO _an FROM public.ecritures WHERE exercice_id = recette.exo('C', 2026) AND piece = 'AN-CLOTURE-2025' AND contrepasse_par IS NULL AND coalesce(origine,'') <> 'contrepassation' ORDER BY created_at DESC LIMIT 1;
  SELECT jsonb_object_agg(compte, s), sum(debit), sum(credit) INTO _l, _d, _c FROM (SELECT compte, sum(debit - credit) s, sum(debit) debit, sum(credit) credit FROM public.ecriture_lignes WHERE ecriture_id = _an GROUP BY compte) z;
  PERFORM recette.noter('8','Comptabilité',NULL,_scenario,
    '521 +5 700 000 ; 571 −30 000 ; 1013 −5 000 000 ; 4011 −400 000 ; 4111 +500 000 ; 1301 −770 000 ; aucun compte de gestion ; équilibré',
    coalesce(_l::text, 'aucune écriture d''à-nouveaux') || ' ; Σ ' || coalesce(_d, 0) || ' / ' || coalesce(_c, 0),
    _l IS NOT NULL AND (_l->>'521')::numeric = 5700000 AND (_l->>'571')::numeric = -30000 AND (_l->>'1013')::numeric = -5000000 AND (_l->>'4011')::numeric = -400000
      AND (_l->>'4111')::numeric = 500000 AND (_l->>'1301')::numeric = -770000 AND _d = _c AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(_l) k WHERE k ~ '^[6-8]'), 'CPT-17', NULL, 'critique');
END $f$;
SELECT recette.controle_an('À-nouveaux 2026 : comptes de bilan reportés, résultat en 1301');
SELECT recette.essai('8','Comptabilité','C-compta','Saisie dans l''exercice clôturé 2025','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('C'), recette.exo('C', 2025), 'OD', DATE '2025-12-31', 'Après clôture', '[{"compte":"6052","debit":1000},{"compte":"571","credit":1000}]', 'CL25-X', 'brouillon', 'saisie')::text$$, 'CPT-17', 'critique');
SELECT recette.essai('8','Comptabilité','C-compta','Contre-passation d''une écriture de l''exercice clôturé','Refus','refus',
  $$SELECT public.fn_contrepasser_ecriture((SELECT id FROM public.ecritures WHERE entreprise_id = recette.eid('C') AND piece = 'CL25-2'), 'Après clôture (TEST)')::text$$, 'CPT-17', 'critique');
SELECT recette.essai('8','Comptabilité','C-compta','Modification directe d''une ligne validée (API)','Refus','refus',
  $$UPDATE public.ecriture_lignes SET debit = debit + 1 WHERE ecriture_id = (SELECT id FROM public.ecritures WHERE entreprise_id = recette.eid('C') AND piece = 'CL25-2') AND debit > 0 RETURNING 'modifiée'$$, 'CPT-11', 'critique');
SELECT recette.essai('8','Comptabilité','C-admin','Seconde clôture du même exercice','Refus','refus',
  $$SELECT public.fn_cloturer_exercice(recette.exo('C', 2025))::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('8','Comptabilité','C-admin','Réouverture motivée : les à-nouveaux sont contre-passés','Exercice rouvert','ok',
  $$SELECT coalesce(public.fn_rouvrir_exercice(recette.exo('C', 2025), 'Correction demandée par la recette (TEST)')::text, '') || (SELECT statut FROM public.exercices WHERE id = recette.exo('C', 2025))$$, 'CPT-17', 'majeure');
DO $d$ DECLARE _n numeric; BEGIN
  SELECT coalesce(sum(l.debit - l.credit) FILTER (WHERE l.compte = '521'), 0) INTO _n FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
   WHERE e.exercice_id = recette.exo('C', 2026) AND e.journal_code = 'AN';
  PERFORM recette.noter('8','Comptabilité',NULL,'Après réouverture : l''effet net des à-nouveaux 2026 est nul (contre-passation)','0 sur 521', _n::text, _n = 0, 'CPT-17', NULL, 'majeure');
END $d$;
SELECT recette.essai('8','Comptabilité','C-admin','Nouvelle clôture après réouverture','Accepté','ok',
  $$SELECT public.fn_cloturer_exercice(recette.exo('C', 2025))::text$$, 'CPT-17', 'majeure');
SELECT recette.controle_an('Après nouvelle clôture : à-nouveaux 2026 en vigueur identiques');
DO $d$ DECLARE _n bigint; BEGIN
  SELECT count(*) INTO _n FROM public.cloture_logs WHERE exercice_id = recette.exo('C', 2025);
  PERFORM recette.noter('8','Comptabilité',NULL,'Journal de clôture : clôture, réouverture et nouvelle clôture tracées','3 entrées', _n || ' entrée(s)', _n = 3, 'CPT-17', NULL, 'majeure');
END $d$;
SELECT recette.essai('8','Comptabilité','C-compta','Second exercice 2026 en double dans le dossier C','Refus','refus',
  $$INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) VALUES (recette.eid('C'), 2026, DATE '2026-01-01', DATE '2026-12-31', 'en_cours') RETURNING annee::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('8','Comptabilité','C-compta','Exercice aux dates incohérentes (fin avant début)','Refus','refus',
  $$INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut) VALUES (recette.eid('C'), 2031, DATE '2031-12-31', DATE '2031-01-01', 'en_cours') RETURNING annee::text$$, 'CPT-17', 'majeure');

-- Anomalies constatées en phase 8.
INSERT INTO recette.anomalies (code, titre, module, criticite, reproduction, cause, correction, statut)
SELECT * FROM (VALUES
 ('A-007','Écriture acceptée sur un compte absent du plan du dossier ; la provision santé utilise le compte 4914, absent du plan','Comptabilité','majeure',
  'fn_creer_ecriture(… [{"compte":"999999",…}]) est accepté (rejoué dans une transaction annulée). Le rejet d''un organisme comptabilise la provision au crédit de 4914 (dossier B).',
  'Le serveur ne contrôle que les comptes désactivés (syscohada_garde_ligne) ; l''écran limite le choix au plan. sante_compte_defaut(''provision_creance'') renvoie 4914 alors que le plan SYSCOHADA du dossier ne contient que 4911 et 4912 sous 491.',
  'Refuser côté serveur tout compte absent du plan du dossier ; remplacer 4914 par 4912 (Créances douteuses) dans sante_compte_defaut, migration additive + reclassement par OD tracée.','ouverte'),
 ('A-008','Balance stockée (double tenue) non alimentée par les écritures automatiques ; le portail client lit cette table','Comptabilité','majeure',
  'Après l''activité santé, fn_balance_ecarts signale 10 comptes en écart pour A (table balance vide). fn_resync_balance les supprime. supabase/functions/portail-public lit la table balance pour le bilan et le résultat.',
  'La table balance n''est mise à jour que par l''écran de saisie (appliquerDeltaBalance) ; les écritures des modules santé, des clôtures et des imports ne la touchent pas. Les écrans utilisent fn_balance, mais pas le portail.',
  'Faire lire fn_balance (ou mv_balance) par le portail ; resynchroniser la table par tâche planifiée tant que la double tenue est conservée, puis la retirer.','ouverte'),
 ('A-009','Exercices chevauchants ou en double acceptés','Comptabilité','majeure',
  'En tant que comptable : INSERT dans exercices d''un exercice 2028 couvrant 2026-06-01 → 2027-05-31, alors que 2026 existe (rejoué dans une transaction annulée).',
  'Aucune contrainte d''unicité (entreprise, année) ni d''exclusion sur les périodes ; la création passe par une insertion directe.',
  'Contrainte d''exclusion sur daterange(date_debut, date_fin) par entreprise, contrôle date_fin > date_debut et année = année de fin ; vérifier l''absence de doublons en production avant de l''appliquer.','ouverte')
) v(code, titre, module, criticite, reproduction, cause, correction, statut)
WHERE NOT EXISTS (SELECT 1 FROM recette.anomalies a WHERE a.code = v.code);
UPDATE recette.resultats SET anomalie = 'A-007' WHERE phase = '8' AND scenario IN ('Écriture sur un compte absent du plan', 'Structure B : toutes les lignes portent un compte du plan du dossier');
UPDATE recette.resultats SET anomalie = 'A-008' WHERE phase = '8' AND scenario = 'Contrôle des écarts de balance';
UPDATE recette.resultats SET anomalie = 'A-009' WHERE phase = '8' AND scenario LIKE 'Exercice chevauchant%';
