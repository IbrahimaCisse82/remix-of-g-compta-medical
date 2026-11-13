-- Reprise des essais sensibles aux contrôles différés (déclenchés au COMMIT) après correction du harnais. TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '8' AND scenario IN ('Lettrage non soldé (100 000 contre 40 000) refusé par la base', 'Modification directe d''une ligne validée (API)');
SELECT recette.essai('8','Comptabilité','A-compta','Lettrage non soldé (100 000 contre 40 000) refusé par la base','Refus','refus',
  $$SELECT recette.lettrer('RX3', ARRAY[(SELECT id FROM recette.ids WHERE cle='let_a'), (SELECT id FROM recette.ids WHERE cle='let_c')])$$, 'CPT-14', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Lettrage d''une seule ligne refusé','Refus','refus',
  $$SELECT recette.lettrer('RX4', ARRAY[(SELECT id FROM recette.ids WHERE cle='let_c')])$$, 'CPT-14', 'mineure');
SELECT recette.essai('8','Comptabilité','C-compta','Modification directe d''une ligne validée (API)','Aucune ligne modifiée','vide',
  $$UPDATE public.ecriture_lignes SET debit = debit + 1 WHERE ecriture_id = (SELECT id FROM public.ecritures WHERE entreprise_id = recette.eid('C') AND piece = 'CL25-2') AND debit > 0 RETURNING 'modifiée'$$, 'CPT-11', 'critique');
SELECT recette.essai('8','Comptabilité','A-compta','Suppression directe d''une écriture validée (API)','Aucune écriture supprimée','vide',
  $$DELETE FROM public.ecritures WHERE entreprise_id = recette.eid('A') AND piece = 'RT-A-BQ-1' RETURNING 'supprimée'$$, 'CPT-11', 'critique');
SELECT recette.essai('8','Comptabilité','A-compta','Insertion directe d''une écriture déséquilibrée (API, hors fonction)','Refus au COMMIT','refus',
  $$WITH e AS (INSERT INTO public.ecritures (entreprise_id, exercice_id, journal_code, date_ecriture, libelle, piece, statut, origine, total_debit, total_credit)
     VALUES (recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-07-01', 'Directe (TEST)', 'DIR-1', 'brouillon', 'saisie', 1000, 1000) RETURNING id)
     SELECT id::text FROM e$$, 'CPT-11', 'critique');
