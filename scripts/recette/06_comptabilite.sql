-- Phase 8 : comptabilité SYSCOHADA. Contrôles d'intégrité (lecture seule), saisies par les comptables, cas d'erreur. TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '8';
CREATE OR REPLACE FUNCTION recette.eid(_c text) RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT entreprise_id FROM recette.structures WHERE cle = _c $f$;
CREATE OR REPLACE FUNCTION recette.exo(_c text, _annee int) RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT id FROM public.exercices WHERE entreprise_id = recette.eid(_c) AND annee = _annee $f$;
GRANT EXECUTE ON FUNCTION recette.eid(text), recette.exo(text, int) TO authenticated;

-- 1. Contrôles d'intégrité sur l'activité générée (administrateur de la base, lecture seule).
DO $d$ DECLARE s text; _n numeric; _m numeric; _t text; BEGIN
  SELECT count(*) INTO _n FROM public.ecritures WHERE entreprise_id IN (SELECT entreprise_id FROM recette.structures) AND total_debit <> total_credit;
  PERFORM recette.noter('8','Comptabilité',NULL,'Toutes les écritures sont équilibrées (en-tête)','0 écriture déséquilibrée', _n || ' écriture(s) déséquilibrée(s)', _n = 0, 'CPT-02', NULL, 'critique');
  SELECT count(*) INTO _n FROM (SELECT e.id FROM public.ecritures e JOIN public.ecriture_lignes l ON l.ecriture_id = e.id WHERE e.entreprise_id IN (SELECT entreprise_id FROM recette.structures)
     GROUP BY e.id, e.total_debit, e.total_credit HAVING sum(l.debit) <> sum(l.credit) OR sum(l.debit) <> e.total_debit) z;
  PERFORM recette.noter('8','Comptabilité',NULL,'Lignes cohérentes avec l''en-tête (Σ débit = Σ crédit = total)','0 écart', _n || ' écart(s)', _n = 0, 'CPT-02', NULL, 'critique');
  SELECT count(*) INTO _n FROM public.sante_compta_evenements WHERE structure_id IN (SELECT structure_id FROM recette.structures) AND statut <> 'comptabilise';
  PERFORM recette.noter('8','Comptabilité',NULL,'File comptable : aucun événement en attente ou en erreur','0', _n::text, _n = 0, 'CPT-03', NULL, 'majeure');
  SELECT count(*) INTO _n FROM public.sante_factures f WHERE f.structure_id IN (SELECT structure_id FROM recette.structures)
     AND NOT EXISTS (SELECT 1 FROM public.sante_compta_evenements e WHERE e.source_id = f.id);
  PERFORM recette.noter('8','Comptabilité',NULL,'Chaque facture et avoir a son événement comptable','0 facture sans événement', _n || ' sans événement', _n = 0, 'CPT-01', NULL, 'critique');
  SELECT count(*) INTO _n FROM public.sante_encaissements x WHERE x.structure_id IN (SELECT structure_id FROM recette.structures)
     AND NOT EXISTS (SELECT 1 FROM public.sante_compta_evenements e WHERE e.source_id = x.id);
  PERFORM recette.noter('8','Comptabilité',NULL,'Chaque encaissement a son événement comptable','0 encaissement sans événement', _n || ' sans événement', _n = 0, 'CPT-01', NULL, 'critique');
  SELECT count(*) INTO _n FROM (SELECT source_type, source_id FROM public.sante_compta_evenements GROUP BY 1,2 HAVING count(*) > 1) z;
  PERFORM recette.noter('8','Comptabilité',NULL,'Aucun événement comptable en double (même source)','0 doublon', _n || ' doublon(s)', _n = 0, 'CPT-03', NULL, 'critique');
  SELECT count(*) INTO _n FROM (SELECT ecriture_id FROM public.sante_compta_evenements WHERE ecriture_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) z;
  PERFORM recette.noter('8','Comptabilité',NULL,'Une écriture par événement (pas de double comptabilisation)','0', _n::text, _n = 0, 'CPT-03', NULL, 'critique');
  FOREACH s IN ARRAY ARRAY['A','B','C'] LOOP
    -- Ventes : Σ factures − Σ avoirs (hors TVA, structures exonérées) = Σ crédits nets des comptes 706.
    SELECT coalesce(sum(total), 0) INTO _n FROM public.sante_factures WHERE structure_id = recette.sid(s);
    SELECT coalesce(sum(l.credit - l.debit), 0) INTO _m FROM public.ecriture_lignes l WHERE l.entreprise_id = recette.eid(s) AND l.compte LIKE '706%';
    PERFORM recette.noter('8','Comptabilité',NULL,'Structure ' || s || ' : chiffre d''affaires facturé = ventes comptabilisées (706)','Égalité', 'Factures ' || _n || ' F ; comptes 706 ' || _m || ' F', _n = _m, 'CPT-02', NULL, 'critique');
    SELECT coalesce(sum(montant), 0) INTO _n FROM public.sante_encaissements WHERE structure_id = recette.sid(s) AND mode <> 'organisme';
    SELECT coalesce(sum(l.debit), 0) INTO _m FROM public.ecriture_lignes l JOIN public.ecritures e ON e.id = l.ecriture_id
      WHERE l.entreprise_id = recette.eid(s) AND e.journal_code IN ('CA','BQ') AND (l.compte LIKE '5%');
    PERFORM recette.noter('8','Comptabilité',NULL,'Structure ' || s || ' : encaissements patients = débits de trésorerie (classe 5) des journaux caisse et banque','Égalité ou écart expliqué',
      'Encaissements ' || _n || ' F ; débits classe 5 (CA, BQ) ' || _m || ' F', _n <= _m, 'CPT-01', NULL, 'majeure');
    SELECT string_agg(DISTINCT l.compte, ',' ORDER BY l.compte) INTO _t FROM public.ecriture_lignes l WHERE l.entreprise_id = recette.eid(s) AND l.compte LIKE '706%';
    PERFORM recette.noter('8','Comptabilité',NULL,'Structure ' || s || ' : comptes de produits utilisés','Sous-comptes 7061x de la catégorie', coalesce(_t, 'aucun'), _t ~ '7061', 'CPT-02', NULL, 'majeure');
    SELECT count(*) INTO _n FROM public.ecriture_lignes l WHERE l.entreprise_id = recette.eid(s) AND NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.entreprise_id = l.entreprise_id AND p.numero = l.compte);
    PERFORM recette.noter('8','Comptabilité',NULL,'Structure ' || s || ' : toutes les lignes portent un compte du plan du dossier','0 compte inconnu', _n || ' ligne(s) sur compte absent du plan', _n = 0, 'CPT-10', NULL, 'majeure');
  END LOOP;
END $d$;

-- 2. Rejeu de la file comptable : aucun doublon créé.
DO $d$ DECLARE _avant bigint; _apres bigint; BEGIN
  SELECT count(*) INTO _avant FROM public.ecritures WHERE entreprise_id IN (SELECT entreprise_id FROM recette.structures);
  PERFORM recette.essai('8','Comptabilité','A-compta','Rejeu manuel de la file comptable de A','Accepté','ok', $$SELECT left(public.sante_rejouer_outbox(recette.sid('A'))::text, 80)$$, 'CPT-03', 'majeure');
  SELECT count(*) INTO _apres FROM public.ecritures WHERE entreprise_id IN (SELECT entreprise_id FROM recette.structures);
  PERFORM recette.noter('8','Comptabilité','A-compta','Le rejeu ne crée aucune écriture en double','Même nombre d''écritures', _avant || ' → ' || _apres, _avant = _apres, 'CPT-03', NULL, 'critique');
END $d$;

-- 3. Saisies manuelles et cas d'erreur.
SELECT recette.essai('8','Comptabilité','A-compta','Écriture déséquilibrée refusée','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-06-30', 'Déséquilibrée (TEST)',
     '[{"compte":"601100","debit":1000},{"compte":"401100","credit":900}]', 'PJ-1', 'brouillon', 'saisie')::text$$, 'CPT-11', 'critique');
SELECT recette.essai('8','Comptabilité','A-compta','Journal inconnu refusé','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'ZZ', DATE '2026-06-30', 'Journal inconnu', '[{"compte":"601100","debit":1000},{"compte":"401100","credit":1000}]', 'PJ-2', 'brouillon', 'saisie')::text$$, 'CPT-11', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Saisie manuelle sans pièce justificative refusée','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-06-30', 'Sans pièce', '[{"compte":"601100","debit":1000},{"compte":"401100","credit":1000}]', NULL, 'brouillon', 'saisie')::text$$, 'CPT-11', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Compte de résultat (13x) interdit hors clôture','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-06-30', 'Résultat forcé', '[{"compte":"131000","debit":1000},{"compte":"521000","credit":1000}]', 'PJ-3', 'brouillon', 'saisie')::text$$, 'CPT-11', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Écriture sur un compte absent du plan','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-06-30', 'Compte inexistant', '[{"compte":"999999","debit":1000},{"compte":"401100","credit":1000}]', 'PJ-4', 'brouillon', 'saisie')::text$$, 'CPT-11', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Écriture datée hors de l''exercice (2025 dans l''exercice 2026)','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2025-03-15', 'Hors exercice', '[{"compte":"601100","debit":1000},{"compte":"401100","credit":1000}]', 'PJ-5', 'brouillon', 'saisie')::text$$, 'CPT-17', 'majeure');
SELECT recette.essai('8','Comptabilité','A-lecteur','Un lecteur tente de saisir une écriture','Refus','refus',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'OD', DATE '2026-06-30', 'Lecteur', '[{"compte":"601100","debit":1000},{"compte":"401100","credit":1000}]', 'PJ-6', 'brouillon', 'saisie')::text$$, 'CPT-11', 'critique');
SELECT recette.essai('8','Comptabilité','A-compta','Saisie d''un achat fournisseur (journal des achats)','Écriture créée','ok',
  $$SELECT public.fn_creer_ecriture(recette.eid('A'), recette.exo('A', 2026), 'AC', DATE '2026-06-30', 'Achat de consommables (TEST)', '[{"compte":"604100","debit":250000},{"compte":"401100","credit":250000}]', 'FA-TEST-1', 'brouillon', 'saisie')::text$$, 'CPT-11', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Validation de l''écriture d''achat','Validée','ok',
  $$SELECT public.fn_valider_ecriture((SELECT id FROM public.ecritures WHERE entreprise_id = recette.eid('A') AND piece = 'FA-TEST-1' ORDER BY created_at DESC LIMIT 1))::text$$, 'CPT-11', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Contrepassation d''une écriture validée (correction tracée)','Contrepassation créée','ok',
  $$SELECT public.fn_contrepasser_ecriture((SELECT id FROM public.ecritures WHERE entreprise_id = recette.eid('A') AND piece = 'FA-TEST-1' AND statut = 'validee' ORDER BY created_at LIMIT 1), 'Erreur de compte (TEST)')::text$$, 'CPT-11', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Balance générale équilibrée (fonction de l''application)','Σ débit = Σ crédit','ok',
  $$SELECT CASE WHEN sum(coalesce((b->>'total_debit')::numeric, (b->>'debit')::numeric, 0)) = sum(coalesce((b->>'total_credit')::numeric, (b->>'credit')::numeric, 0)) THEN 'équilibrée ' || count(*) || ' comptes' END
     FROM (SELECT to_jsonb(x) b FROM public.fn_balance(recette.eid('A'), recette.exo('A', 2026)) x) z$$, 'CPT-12', 'critique');
SELECT recette.essai('8','Comptabilité','A-compta','Contrôle des écarts de balance','Aucun écart','vide',
  $$SELECT count(*)::text FROM public.fn_balance_ecarts(recette.eid('A'), recette.exo('A', 2026))$$, 'CPT-12', 'critique');
