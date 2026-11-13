-- Phase 10 : rétrocessions, plannings et primes de garde, réactifs, stock et délivrance, tableau de bord. TEST uniquement.
-- Paramètres contractuels fictifs de la recette (pas des taux fiscaux) : rétrocession 50 % au Dr Fall (TEST), forfait garde 15 000 F, astreinte 7 500 F.
-- Le taux de retenue à la source des praticiens n'est pas modifié (valeur du paramétrage, aucun taux inventé).
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '10';
DO $d$ BEGIN
  INSERT INTO recette.ids SELECT 'prat_fall', id FROM public.sante_praticiens WHERE structure_id = recette.sid('A') AND user_id = recette.uid('A-med-1') ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
  INSERT INTO recette.ids SELECT 'prat_ndiaye', id FROM public.sante_praticiens WHERE structure_id = recette.sid('A') AND user_id = recette.uid('A-med-2') ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
END $d$;
CREATE OR REPLACE FUNCTION recette.rid(_c text) RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT id FROM recette.ids WHERE cle = _c $f$;
GRANT EXECUTE ON FUNCTION recette.rid(text) TO authenticated;

-- A. Rétrocessions.
SELECT recette.essai('10','Rétrocessions','A-secr','Une secrétaire paramètre le taux de rétrocession','Refus','refus',
  $$INSERT INTO public.sante_retrocession_regles (structure_id, praticien_id, categorie, taux, actif) VALUES (recette.sid('A'), recette.rid('prat_fall'), 'toutes', 90, true) RETURNING taux::text$$, 'RET-01', 'majeure');
SELECT recette.essai('10','Rétrocessions','A-admin','Paramétrage d''un taux de rétrocession (50 %, toutes catégories)','Accepté','ok',
  $$INSERT INTO public.sante_retrocession_regles (structure_id, praticien_id, categorie, taux, actif) SELECT recette.sid('A'), recette.rid('prat_fall'), 'toutes', 50, true
     WHERE NOT EXISTS (SELECT 1 FROM public.sante_retrocession_regles WHERE praticien_id = recette.rid('prat_fall') AND categorie = 'toutes') RETURNING taux::text$$, 'RET-01', 'majeure');
SELECT recette.essai('10','Rétrocessions','A-med-2','Un autre praticien consulte la rétrocession du Dr Fall','Refus','refus',
  $$SELECT public.sante_calcul_retrocession(recette.rid('prat_fall'), DATE '2026-01-01', DATE '2026-12-31')::text$$, 'RET-02', 'critique');
SELECT recette.essai('10','Rétrocessions','A-caisse','Le caissier consulte une rétrocession','Refus','refus',
  $$SELECT public.sante_calcul_retrocession(recette.rid('prat_fall'), DATE '2026-01-01', DATE '2026-12-31')::text$$, 'RET-02', 'majeure');
SELECT recette.essai('10','Rétrocessions','A-med-1','Le praticien consulte sa propre rétrocession','Accepté','ok',
  $$SELECT (public.sante_calcul_retrocession(recette.rid('prat_fall'), DATE '2026-01-01', DATE '2026-12-31')->>'montant_brut')$$, 'RET-02', 'majeure');
SELECT recette.essai('10','Rétrocessions','A-admin','Période de plus d''un an refusée','Refus','refus',
  $$SELECT public.sante_calcul_retrocession(recette.rid('prat_fall'), DATE '2025-01-01', DATE '2026-12-31')::text$$, 'RET-02', 'mineure');
DO $d$ DECLARE _c jsonb; _base numeric; _attendu numeric; BEGIN
  PERFORM recette.agir('A-admin');
  _c := public.sante_calcul_retrocession(recette.rid('prat_fall'), DATE '2026-01-01', DATE '2026-12-31');
  PERFORM recette.sortir();
  -- Recalcul indépendant : HT net des factures du praticien sur l'année (hors lignes médicaments), moins les avoirs au prorata.
  SELECT round(coalesce(sum(CASE WHEN f.type = 'facture' THEN 1 ELSE -1 END * (l.montant - l.montant_tva)
           * CASE WHEN o.ht > 0 THEN greatest(o.total - o.montant_tva, 0) / o.ht ELSE 1 END
           * CASE WHEN f.type = 'avoir' THEN least(abs(f.total) / nullif(o.total, 0), 1) ELSE 1 END), 0))
    INTO _base
    FROM public.sante_factures f
    JOIN LATERAL (SELECT coalesce(f.facture_origine_id, f.id) oid) k ON true
    JOIN LATERAL (SELECT x.total, x.montant_tva, (SELECT coalesce(sum(m.montant - m.montant_tva), 0) FROM public.sante_facture_lignes m WHERE m.facture_id = x.id) ht FROM public.sante_factures x WHERE x.id = k.oid) o ON true
    JOIN public.sante_facture_lignes l ON l.facture_id = k.oid AND coalesce(l.categorie, 'autres') <> 'medicaments'
   WHERE f.structure_id = recette.sid('A') AND NOT f.annulee AND f.type IN ('facture','avoir')
     AND (SELECT praticien_id FROM public.sante_factures WHERE id = k.oid) = recette.rid('prat_fall')
     AND (f.created_at AT TIME ZONE 'Africa/Dakar')::date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31';
  _attendu := round(_base * 50 / 100);
  PERFORM recette.noter('10','Rétrocessions',NULL,'Calcul : base = HT net facturé par le praticien (avoirs déduits), brut = 50 % de la base',
    'Base ' || _base || ' F ; brut ' || _attendu || ' F', 'Base ' || (_c->>'base') || ' F ; brut ' || (_c->>'montant_brut') || ' F ; retenue ' || (_c->>'retenue') || ' F ; ' || (_c->>'nb_factures') || ' factures, ' || (_c->>'nb_avoirs') || ' avoirs',
    abs((_c->>'base')::numeric - _base) <= 1 AND (_c->>'montant_brut')::numeric = round((_c->>'base')::numeric * 50 / 100), 'RET-02', NULL, 'critique');
END $d$;
SELECT recette.essai('10','Rétrocessions','A-compta','Le comptable valide un relevé de rétrocession','Refus (administrateur)','refus',
  $$SELECT public.sante_valider_retrocession(recette.rid('prat_fall'), DATE '2026-11-01', DATE '2026-11-13')::text$$, 'RET-03', 'majeure');
DO $d$ DECLARE _r text; BEGIN
  _r := recette.essai('10','Rétrocessions','A-admin','Validation du relevé de novembre 2026 (1er au 13)','Relevé créé et comptabilisé','ok',
    $$SELECT coalesce((SELECT id::text FROM public.sante_retrocessions WHERE praticien_id = recette.rid('prat_fall') AND periode_debut = DATE '2026-11-01' AND statut <> 'annulee'),
                      public.sante_valider_retrocession(recette.rid('prat_fall'), DATE '2026-11-01', DATE '2026-11-13')::text)$$, 'RET-03', 'majeure');
  INSERT INTO recette.ids SELECT 'retro_nov', id FROM public.sante_retrocessions WHERE praticien_id = recette.rid('prat_fall') AND periode_debut = DATE '2026-11-01' AND statut <> 'annulee'
    ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
END $d$;
SELECT recette.essai('10','Rétrocessions','A-admin','Second relevé chevauchant la même période','Refus','refus',
  $$SELECT public.sante_valider_retrocession(recette.rid('prat_fall'), DATE '2026-11-10', DATE '2026-11-20')::text$$, 'RET-03', 'critique');
DO $d$ DECLARE _l jsonb; _r record; BEGIN
  SELECT * INTO _r FROM public.sante_retrocessions WHERE id = recette.rid('retro_nov');
  SELECT jsonb_object_agg(l.compte, l.debit - l.credit) INTO _l FROM public.sante_compta_evenements e JOIN public.ecriture_lignes l ON l.ecriture_id = e.ecriture_id
   WHERE e.source_type = 'retrocession' AND e.source_id = _r.id;
  PERFORM recette.noter('10','Rétrocessions',NULL,'Écriture du relevé : honoraires au débit (6324), praticien au crédit (4011)',
    coalesce('6324 +' || _r.montant_brut || ' ; 4011 −' || _r.montant_net, 'relevé absent'), coalesce(_l::text, 'aucune écriture'),
    coalesce((_l->>'6324')::numeric = _r.montant_brut AND (_l->>'4011')::numeric = -_r.montant_net, false), 'RET-03', NULL, 'critique');
END $d$;
SELECT recette.essai('10','Rétrocessions','A-caisse','Le caissier paie une rétrocession','Refus','refus',
  $$SELECT public.sante_payer_retrocession(recette.rid('retro_nov'), 'especes')::text$$, 'RET-04', 'majeure');
SELECT recette.essai('10','Rétrocessions','A-compta','Paiement par virement sans référence','Refus','refus',
  $$SELECT public.sante_payer_retrocession(recette.rid('retro_nov'), 'virement', '')::text$$, 'RET-04', 'mineure');
SELECT recette.essai('10','Rétrocessions','A-compta','Paiement du relevé par virement','Payé','ok',
  $$SELECT coalesce(public.sante_payer_retrocession(recette.rid('retro_nov'), 'virement', 'VIR-RET-TEST-1')::text, 'payé')$$, 'RET-04', 'majeure');
SELECT recette.essai('10','Rétrocessions','A-compta','Second paiement du même relevé','Refus','refus',
  $$SELECT public.sante_payer_retrocession(recette.rid('retro_nov'), 'virement', 'VIR-RET-TEST-2')::text$$, 'RET-04', 'critique');
SELECT recette.essai('10','Rétrocessions','A-admin','Annulation d''un relevé déjà payé','Refus','refus',
  $$SELECT public.sante_annuler_retrocession(recette.rid('retro_nov'), 'Erreur de période (TEST)')::text$$, 'RET-04', 'majeure');

-- B. Plannings et primes de garde.
DO $d$ DECLARE _e uuid; _m uuid; BEGIN
  PERFORM recette.agir('A-compta');
  INSERT INTO public.employees (entreprise_id, matricule, prenom, nom, salaire_base, sursalaire, actif)
  SELECT recette.eid('A'), 'EMP-TEST-1', 'Ndèye', 'Infirmière (TEST)', 250000, 0, true
   WHERE NOT EXISTS (SELECT 1 FROM public.employees WHERE entreprise_id = recette.eid('A') AND matricule = 'EMP-TEST-1');
  PERFORM recette.sortir();
  SELECT id INTO _e FROM public.employees WHERE entreprise_id = recette.eid('A') AND matricule = 'EMP-TEST-1';
  SELECT id INTO _m FROM public.structure_memberships WHERE structure_id = recette.sid('A') AND user_id = recette.uid('A-med-1');
  INSERT INTO recette.ids VALUES ('emp1', _e), ('memb_fall', _m) ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
  PERFORM recette.agir('A-admin');
  INSERT INTO public.sante_personnel_parametres (structure_id, forfait_garde, forfait_astreinte) VALUES (recette.sid('A'), 15000, 7500)
    ON CONFLICT (structure_id) DO UPDATE SET forfait_garde = 15000, forfait_astreinte = 7500;
  IF NOT EXISTS (SELECT 1 FROM public.sante_plannings WHERE structure_id = recette.sid('A') AND note LIKE 'RECETTE%') THEN
    INSERT INTO public.sante_plannings (structure_id, employee_id, type, debut, fin, statut, note)
    SELECT recette.sid('A'), _e, t, ts, ts + interval '12 hours', 'prevu', 'RECETTE ' || t
      FROM (VALUES ('garde', TIMESTAMPTZ '2026-10-03 20:00+00'), ('garde', TIMESTAMPTZ '2026-10-10 20:00+00'), ('garde', TIMESTAMPTZ '2026-10-17 20:00+00'),
                   ('astreinte', TIMESTAMPTZ '2026-10-05 20:00+00'), ('astreinte', TIMESTAMPTZ '2026-10-12 20:00+00'), ('garde', TIMESTAMPTZ '2026-09-20 20:00+00')) v(t, ts);
    INSERT INTO public.sante_plannings (structure_id, membership_id, type, debut, fin, statut, note)
    VALUES (recette.sid('A'), _m, 'poste', now() + interval '3 days', now() + interval '3 days 8 hours', 'prevu', 'RECETTE futur');
  END IF;
  PERFORM recette.sortir();
END $d$;
SELECT recette.essai('10','Plannings','A-secr','Une secrétaire crée un créneau','Refus','refus',
  $$INSERT INTO public.sante_plannings (structure_id, membership_id, type, debut, fin, statut) VALUES (recette.sid('A'), recette.rid('memb_fall'), 'poste', now(), now() + interval '1 hour', 'prevu') RETURNING id::text$$, 'PLN-01', 'majeure');
SELECT recette.essai('10','Plannings','A-admin','Créneau de plus de 31 jours','Refus','refus',
  $$INSERT INTO public.sante_plannings (structure_id, membership_id, type, debut, fin, statut) VALUES (recette.sid('A'), recette.rid('memb_fall'), 'conge', now(), now() + interval '40 days', 'prevu') RETURNING id::text$$, 'PLN-01', 'mineure');
SELECT recette.essai('10','Plannings','A-admin','Validation d''un créneau non terminé','Refus','refus',
  $$SELECT public.sante_valider_creneaux(ARRAY(SELECT id FROM public.sante_plannings WHERE structure_id = recette.sid('A') AND note = 'RECETTE futur'))::text$$, 'PLN-02', 'majeure');
SELECT recette.essai('10','Plannings','A-compta','Le comptable valide des créneaux','Refus (administrateur)','refus',
  $$SELECT public.sante_valider_creneaux(ARRAY(SELECT id FROM public.sante_plannings WHERE structure_id = recette.sid('A') AND note LIKE 'RECETTE garde%'))::text$$, 'PLN-02', 'majeure');
SELECT recette.essai('10','Plannings','A-admin','Validation des 6 gardes et astreintes effectuées','6 créneaux validés','egal:6',
  $$SELECT public.sante_valider_creneaux(ARRAY(SELECT id FROM public.sante_plannings WHERE structure_id = recette.sid('A') AND note IN ('RECETTE garde','RECETTE astreinte') AND statut = 'prevu'))::text$$, 'PLN-02', 'majeure');
SELECT recette.essai('10','Plannings','A-compta','Primes de garde d''octobre 2026 pour la paie','3 gardes, 2 astreintes, 60 000 F','egal:3/2/60000',
  $$SELECT gardes || '/' || astreintes || '/' || trim_scale(montant) FROM public.sante_primes_gardes_paie(recette.eid('A'), 2026, 10) WHERE employee_id = recette.rid('emp1')$$, 'PLN-03', 'critique');
SELECT recette.essai('10','Plannings','A-compta','La garde de septembre n''entre pas dans octobre','1 garde en septembre','egal:1/0/15000',
  $$SELECT gardes || '/' || astreintes || '/' || trim_scale(montant) FROM public.sante_primes_gardes_paie(recette.eid('A'), 2026, 9) WHERE employee_id = recette.rid('emp1')$$, 'PLN-03', 'majeure');
SELECT recette.essai('10','Plannings','A-caisse','Le caissier lit les primes de la paie','Refus','refus',
  $$SELECT count(*)::text FROM public.sante_primes_gardes_paie(recette.eid('A'), 2026, 10)$$, 'PLN-03', 'majeure');
SELECT recette.essai('10','Plannings','A-admin','Modification d''un créneau déjà validé','Refus (verrou)','refus',
  $$UPDATE public.sante_plannings SET fin = fin + interval '6 hours' WHERE structure_id = recette.sid('A') AND note = 'RECETTE garde' AND statut = 'effectue' RETURNING id::text$$, 'PLN-02', 'majeure');

-- C. Réactifs de laboratoire (B).
DO $d$ BEGIN
  PERFORM recette.agir('B-bio-1');
  INSERT INTO public.sante_reactifs (structure_id, nom, unite, seuil_alerte, actif)
  SELECT recette.sid('B'), 'Réactif glycémie (TEST)', 'test', 50, true WHERE NOT EXISTS (SELECT 1 FROM public.sante_reactifs WHERE structure_id = recette.sid('B') AND nom = 'Réactif glycémie (TEST)');
  PERFORM recette.sortir();
  INSERT INTO recette.ids SELECT 'reactif1', id FROM public.sante_reactifs WHERE structure_id = recette.sid('B') AND nom = 'Réactif glycémie (TEST)' ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
END $d$;
SELECT recette.essai('10','Réactifs','B-caisse','Le caissier enregistre une réception de réactif','Refus','refus',
  $$SELECT coalesce(public.sante_mouvement_reactif(recette.rid('reactif1'), 'reception', 100, 'LOT-X', current_date + 200)::text, 'ok')$$, 'STK-03', 'majeure');
SELECT recette.essai('10','Réactifs','B-tech-1','Réception sans numéro de lot','Refus','refus',
  $$SELECT coalesce(public.sante_mouvement_reactif(recette.rid('reactif1'), 'reception', 100, '', current_date + 200)::text, 'ok')$$, 'STK-03', 'majeure');
DO $d$ DECLARE _r text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sante_lots_reactifs WHERE reactif_id = recette.rid('reactif1')) THEN
    _r := recette.essai('10','Réactifs','B-tech-1','Réception de 200 tests (lot valide)','Accepté','ok',
      $$SELECT coalesce(public.sante_mouvement_reactif(recette.rid('reactif1'), 'reception', 200, 'LOT-TEST-A', current_date + 200)::text, 'ok')$$, 'STK-03', 'majeure');
    _r := recette.essai('10','Réactifs','B-tech-1','Réception d''un lot déjà périmé (traçabilité)','Accepté ou refusé, mais jamais consommable','ok',
      $$SELECT coalesce(public.sante_mouvement_reactif(recette.rid('reactif1'), 'reception', 20, 'LOT-TEST-PERIME', current_date - 1)::text, 'ok')$$, 'STK-03', 'mineure');
  END IF;
  INSERT INTO recette.ids SELECT 'lotA', id FROM public.sante_lots_reactifs WHERE reactif_id = recette.rid('reactif1') AND numero_lot = 'LOT-TEST-A' ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
  INSERT INTO recette.ids SELECT 'lotP', id FROM public.sante_lots_reactifs WHERE reactif_id = recette.rid('reactif1') AND numero_lot = 'LOT-TEST-PERIME' ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
END $d$;
SELECT recette.essai('10','Réactifs','B-tech-1','Consommation sur le lot périmé','Refus','refus',
  $$SELECT coalesce(public.sante_mouvement_reactif(recette.rid('reactif1'), 'consommation', 1, NULL, NULL, recette.rid('lotP'))::text, 'ok')$$, 'STK-03', 'critique');
SELECT recette.essai('10','Réactifs','B-tech-1','Consommation supérieure au stock du lot','Refus','refus',
  $$SELECT coalesce(public.sante_mouvement_reactif(recette.rid('reactif1'), 'consommation', 500, NULL, NULL, recette.rid('lotA'))::text, 'ok')$$, 'STK-03', 'majeure');
SELECT recette.essai('10','Réactifs','B-tech-1','Consommation de 160 tests','Stock du lot 40','egal:40',
  $$SELECT coalesce(public.sante_mouvement_reactif(recette.rid('reactif1'), 'consommation', 160, NULL, NULL, recette.rid('lotA'))::text, '') || (SELECT (quantite_restante - 160)::int::text FROM public.sante_lots_reactifs WHERE id = recette.rid('lotA'))$$, 'STK-03', 'majeure');
SELECT recette.essai('10','Réactifs','B-bio-1','Alerte de stock : réactif sous son seuil (40 < 50)','Réactif signalé','ok',
  $$SELECT CASE WHEN public.sante_alertes_stock(recette.sid('B'))::text LIKE '%Réactif glycémie (TEST)%' THEN 'signalé' END$$, 'STK-04', 'majeure');

-- D. Stock et délivrance de médicaments (A).
DO $d$ BEGIN
  PERFORM recette.agir('A-compta');
  INSERT INTO public.articles (entreprise_id, code, designation, unite, actif, quantite_stock, prix_achat_moyen, stock_minimum)
  SELECT recette.eid('A'), 'MED-TEST-1', 'Paracétamol 500 mg (TEST)', 'boîte', true, 0, 0, 10
   WHERE NOT EXISTS (SELECT 1 FROM public.articles WHERE entreprise_id = recette.eid('A') AND code = 'MED-TEST-1');
  PERFORM recette.sortir();
  INSERT INTO recette.ids SELECT 'art1', id FROM public.articles WHERE entreprise_id = recette.eid('A') AND code = 'MED-TEST-1' ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
  INSERT INTO recette.ids SELECT 'consult_fall', c.id FROM public.sante_consultations c WHERE c.structure_id = recette.sid('A') AND c.praticien_id = recette.rid('prat_fall') ORDER BY c.created_at DESC LIMIT 1
    ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
END $d$;
SELECT recette.essai('10','Stock','A-caisse','Le caissier enregistre une entrée de stock','Refus','refus',
  $$SELECT public.stock_enregistrer_mouvement(recette.rid('art1'), 'entree', 100, 500, current_date, 'BL-X')::text$$, 'STK-01', 'majeure');
SELECT recette.essai('10','Stock','A-compta','Entrée de 100 boîtes à 500 F','Stock 100, CUMP 500','ok',
  $$SELECT CASE WHEN (SELECT quantite_stock FROM public.articles WHERE id = recette.rid('art1')) >= 100 THEN 'déjà en stock' ELSE public.stock_enregistrer_mouvement(recette.rid('art1'), 'entree', 100, 500, current_date, 'BL-TEST-1')::text END$$, 'STK-01', 'majeure');
SELECT recette.essai('10','Stock','A-caisse','Le caissier délivre un médicament','Refus','refus',
  $$SELECT public.sante_dispenser(recette.rid('consult_fall'), jsonb_build_array(jsonb_build_object('article_id', recette.rid('art1'), 'quantite', 1)))::text$$, 'STK-02', 'majeure');
SELECT recette.essai('10','Stock','A-med-1','Délivrance supérieure au stock','Refus','refus',
  $$SELECT public.sante_dispenser(recette.rid('consult_fall'), jsonb_build_array(jsonb_build_object('article_id', recette.rid('art1'), 'quantite', 100000)))::text$$, 'STK-02', 'majeure');
SELECT recette.essai('10','Stock','A-med-1','Quantité négative','Refus','refus',
  $$SELECT public.sante_dispenser(recette.rid('consult_fall'), jsonb_build_array(jsonb_build_object('article_id', recette.rid('art1'), 'quantite', -2)))::text$$, 'STK-02', 'majeure');
DO $d$ DECLARE _q0 numeric; _q1 numeric; _r text; BEGIN
  SELECT quantite_stock INTO _q0 FROM public.articles WHERE id = recette.rid('art1');
  _r := recette.essai('10','Stock','A-med-1','Délivrance de 3 boîtes au patient de la consultation','1 ligne délivrée','egal:1',
    $$SELECT public.sante_dispenser(recette.rid('consult_fall'), jsonb_build_array(jsonb_build_object('article_id', recette.rid('art1'), 'quantite', 3)))::text$$, 'STK-02', 'majeure');
  SELECT quantite_stock INTO _q1 FROM public.articles WHERE id = recette.rid('art1');
  PERFORM recette.noter('10','Stock',NULL,'Le stock baisse de 3 et la sortie est valorisée au CUMP','−3', (_q1 - _q0)::text, _q0 - _q1 = 3, 'STK-02', NULL, 'critique');
END $d$;
SELECT recette.essai('10','Stock','B-secr','Délivrance depuis une structure sans module clinique (B)','Refus','refus',
  $$SELECT public.sante_dispenser(recette.rid('consult_fall'), jsonb_build_array(jsonb_build_object('article_id', recette.rid('art1'), 'quantite', 1)))::text$$, 'SEC-02', 'critique');

-- E. Tableau de bord.
SELECT recette.essai('10','Tableau de bord','A-caisse','Le caissier ouvre le tableau de bord','Refus','refus',
  $$SELECT left(public.sante_tableau_bord(recette.sid('A'), DATE '2026-01-01', DATE '2026-12-31')::text, 10)$$, 'TDB-01', 'mineure');
DO $d$ DECLARE _s text; _t jsonb; _ca numeric; _ca_db numeric; _l numeric; _l_db numeric; _cle text; BEGIN
  FOREACH _s IN ARRAY ARRAY['A','B'] LOOP
    _cle := _s || '-admin';
    PERFORM recette.agir(_cle);
    _t := public.sante_tableau_bord(recette.sid(_s), DATE '2026-01-01', DATE '2026-12-31');
    PERFORM recette.sortir();
    SELECT coalesce(sum((x->>'montant')::numeric), 0) INTO _ca FROM jsonb_array_elements(_t->'ca_specialites') x;
    SELECT coalesce(sum(CASE WHEN type = 'avoir' THEN -abs(total) ELSE total END), 0) INTO _ca_db FROM public.sante_factures WHERE structure_id = recette.sid(_s) AND created_at >= DATE '2026-01-01' AND created_at < DATE '2027-01-01';
    PERFORM recette.noter('10','Tableau de bord',_cle,'Structure ' || _s || ' : chiffre d''affaires par spécialité = factures − avoirs de la période', _ca_db || ' F', _ca || ' F', _ca = _ca_db, 'TDB-01', NULL, 'majeure');
    SELECT coalesce(sum((x->>'montant')::numeric), 0), jsonb_array_length(_t->'ca_actes') INTO _l, _l_db FROM jsonb_array_elements(_t->'ca_actes') x;
    SELECT count(DISTINCT l.libelle) INTO _ca_db FROM public.sante_facture_lignes l JOIN public.sante_factures f ON f.id = l.facture_id WHERE f.structure_id = recette.sid(_s) AND f.created_at >= DATE '2026-01-01' AND f.created_at < DATE '2027-01-01';
    PERFORM recette.noter('10','Tableau de bord',_cle,'Structure ' || _s || ' : palmarès des actes = les 30 premiers par montant',
      'Les ' || least(_ca_db, 30) || ' libellés au plus fort montant (sur ' || _ca_db || ')',
      _l_db || ' libellés renvoyés ; premiers par montant : ' || (SELECT CASE WHEN bool_and(ok) THEN 'oui' ELSE 'non' END FROM (
        SELECT (x->>'libelle') IN (SELECT l.libelle FROM public.sante_facture_lignes l JOIN public.sante_factures f ON f.id = l.facture_id
              WHERE f.structure_id = recette.sid(_s) AND f.created_at >= DATE '2026-01-01' AND f.created_at < DATE '2027-01-01'
              GROUP BY l.libelle ORDER BY sum(CASE WHEN f.type = 'avoir' THEN -abs(l.montant) ELSE l.montant END) DESC LIMIT 30) ok
          FROM jsonb_array_elements(_t->'ca_actes') x) z),
      (SELECT bool_and(ok) FROM (
        SELECT (x->>'libelle') IN (SELECT l.libelle FROM public.sante_facture_lignes l JOIN public.sante_factures f ON f.id = l.facture_id
              WHERE f.structure_id = recette.sid(_s) AND f.created_at >= DATE '2026-01-01' AND f.created_at < DATE '2027-01-01'
              GROUP BY l.libelle ORDER BY sum(CASE WHEN f.type = 'avoir' THEN -abs(l.montant) ELSE l.montant END) DESC LIMIT 30) ok
          FROM jsonb_array_elements(_t->'ca_actes') x) z), 'TDB-01', NULL, 'mineure');
    IF _s = 'B' THEN
      SELECT count(*) INTO _l_db FROM public.sante_demandes_labo WHERE structure_id = recette.sid('B') AND created_at >= DATE '2026-01-01' AND created_at < DATE '2027-01-01';
      PERFORM recette.noter('10','Tableau de bord',_cle,'Structure B : nombre de demandes de laboratoire', _l_db::text, coalesce(_t->'labo'->>'demandes', 'absent'), (_t->'labo'->>'demandes')::numeric = _l_db, 'TDB-01', NULL, 'majeure');
    END IF;
  END LOOP;
END $d$;
