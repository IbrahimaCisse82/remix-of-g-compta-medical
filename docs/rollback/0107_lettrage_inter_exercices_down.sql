-- Retour de 0107 : rétablit exactement les versions de 0104/0105 (remplacements inverses).
-- Les à-nouveaux détaillés déjà passés restent valides (même solde par compte) ; les lettrages existants sont conservés.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.lettrage_controle'::regproc);
  IF position($a$count(DISTINCT j.compte) + greatest(count(DISTINCT j.compte_auxiliaire) - 1, 0)$a$ in d) > 0 THEN d := replace(d, $a$count(DISTINCT j.compte) + greatest(count(DISTINCT j.compte_auxiliaire) - 1, 0)$a$, $a$count(DISTINCT j.compte || '|' || coalesce(j.compte_auxiliaire, ''))$a$); EXECUTE d; END IF;
  d := pg_get_functiondef('public.reglement_lettrer'::regproc);
  IF position($a$(SELECT count(DISTINCT compte) + greatest(count(DISTINCT compte_auxiliaire) - 1, 0) FROM public.journal WHERE id = ANY(_ids)) <> 1$a$ in d) > 0 THEN d := replace(d, $a$(SELECT count(DISTINCT compte) + greatest(count(DISTINCT compte_auxiliaire) - 1, 0) FROM public.journal WHERE id = ANY(_ids)) <> 1$a$, $a$(SELECT count(DISTINCT compte || '|' || coalesce(compte_auxiliaire, '')) FROM public.journal WHERE id = ANY(_ids)) <> 1$a$); EXECUTE d; END IF;
  d := pg_get_functiondef('public.fn_cloturer_exercice'::regproc);
  IF position($a$  -- Comptes de tiers 40/41 : une ligne d'à-nouveau par ligne non lettrée (hors écritures contre-passées), pièce et tiers conservés.
  CREATE TEMP TABLE IF NOT EXISTS _cloture_detail (compte text, intitule text, libelle text, aux text, aux_lib text, solde numeric) ON COMMIT DROP;
  DELETE FROM _cloture_detail;
  INSERT INTO _cloture_detail
  SELECT j.compte, j.intitule, 'A-nouveau ' || x.annee || ' — ' || coalesce(j.piece, '') || ' — ' || coalesce(j.libelle, ''),
         j.compte_auxiliaire, j.auxiliaire_libelle, round(j.debit - j.credit, 2)
    FROM public.journal j LEFT JOIN public.ecritures e ON e.id = j.ecriture_id
   WHERE j.exercice_id = _exercice_id AND j.compte ~ '^4[01]'
     AND (j.ecriture_id IS NULL OR (e.statut = 'validee' AND e.contrepasse_par IS NULL AND coalesce(e.origine, '') <> 'contrepassation'))
     AND round(j.debit - j.credit, 2) <> 0
     AND NOT EXISTS (SELECT 1 FROM public.lettrage l WHERE l.journal_entry_id = j.id)
     AND EXISTS (SELECT 1 FROM _cloture_soldes s WHERE s.compte = j.compte AND s.solde <> 0);
  -- Écart éventuel (lettrages incomplets, écritures hors journal) : ligne de solde non détaillé, pour reporter le solde exact.
  INSERT INTO _cloture_detail
  SELECT s.compte, s.intitule, 'A-nouveau ' || x.annee || ' — solde non détaillé', NULL, NULL,
         s.solde - coalesce((SELECT sum(dd.solde) FROM _cloture_detail dd WHERE dd.compte = s.compte), 0)
    FROM _cloture_soldes s
   WHERE s.compte ~ '^4[01]' AND s.solde <> 0
     AND s.solde - coalesce((SELECT sum(dd.solde) FROM _cloture_detail dd WHERE dd.compte = s.compte), 0) <> 0;
  SELECT jsonb_agg(l ORDER BY l->>'compte', l->>'libelle') INTO v_lignes FROM (
    SELECT jsonb_build_object('compte', compte, 'intitule', coalesce(intitule, ''), 'libelle', 'A-nouveau ' || x.annee,
      'debit', greatest(solde, 0), 'credit', greatest(-solde, 0)) AS l
      FROM _cloture_soldes WHERE compte ~ '^[1-5]' AND compte !~ '^4[01]' AND solde <> 0
    UNION ALL
    SELECT jsonb_build_object('compte', compte, 'intitule', coalesce(intitule, ''), 'libelle', libelle, 'compte_auxiliaire', aux, 'auxiliaire_libelle', aux_lib,
      'debit', greatest(solde, 0), 'credit', greatest(-solde, 0))
      FROM _cloture_detail WHERE solde <> 0
  ) q;$a$ in d) > 0 THEN d := replace(d, $a$  -- Comptes de tiers 40/41 : une ligne d'à-nouveau par ligne non lettrée (hors écritures contre-passées), pièce et tiers conservés.
  CREATE TEMP TABLE IF NOT EXISTS _cloture_detail (compte text, intitule text, libelle text, aux text, aux_lib text, solde numeric) ON COMMIT DROP;
  DELETE FROM _cloture_detail;
  INSERT INTO _cloture_detail
  SELECT j.compte, j.intitule, 'A-nouveau ' || x.annee || ' — ' || coalesce(j.piece, '') || ' — ' || coalesce(j.libelle, ''),
         j.compte_auxiliaire, j.auxiliaire_libelle, round(j.debit - j.credit, 2)
    FROM public.journal j LEFT JOIN public.ecritures e ON e.id = j.ecriture_id
   WHERE j.exercice_id = _exercice_id AND j.compte ~ '^4[01]'
     AND (j.ecriture_id IS NULL OR (e.statut = 'validee' AND e.contrepasse_par IS NULL AND coalesce(e.origine, '') <> 'contrepassation'))
     AND round(j.debit - j.credit, 2) <> 0
     AND NOT EXISTS (SELECT 1 FROM public.lettrage l WHERE l.journal_entry_id = j.id)
     AND EXISTS (SELECT 1 FROM _cloture_soldes s WHERE s.compte = j.compte AND s.solde <> 0);
  -- Écart éventuel (lettrages incomplets, écritures hors journal) : ligne de solde non détaillé, pour reporter le solde exact.
  INSERT INTO _cloture_detail
  SELECT s.compte, s.intitule, 'A-nouveau ' || x.annee || ' — solde non détaillé', NULL, NULL,
         s.solde - coalesce((SELECT sum(dd.solde) FROM _cloture_detail dd WHERE dd.compte = s.compte), 0)
    FROM _cloture_soldes s
   WHERE s.compte ~ '^4[01]' AND s.solde <> 0
     AND s.solde - coalesce((SELECT sum(dd.solde) FROM _cloture_detail dd WHERE dd.compte = s.compte), 0) <> 0;
  SELECT jsonb_agg(l ORDER BY l->>'compte', l->>'libelle') INTO v_lignes FROM (
    SELECT jsonb_build_object('compte', compte, 'intitule', coalesce(intitule, ''), 'libelle', 'A-nouveau ' || x.annee,
      'debit', greatest(solde, 0), 'credit', greatest(-solde, 0)) AS l
      FROM _cloture_soldes WHERE compte ~ '^[1-5]' AND compte !~ '^4[01]' AND solde <> 0
    UNION ALL
    SELECT jsonb_build_object('compte', compte, 'intitule', coalesce(intitule, ''), 'libelle', libelle, 'compte_auxiliaire', aux, 'auxiliaire_libelle', aux_lib,
      'debit', greatest(solde, 0), 'credit', greatest(-solde, 0))
      FROM _cloture_detail WHERE solde <> 0
  ) q;$a$, $a$  SELECT jsonb_agg(jsonb_build_object('compte', compte, 'intitule', coalesce(intitule, ''), 'libelle', 'A-nouveau ' || x.annee,
      'debit', greatest(solde, 0), 'credit', greatest(-solde, 0)) ORDER BY compte)
    INTO v_lignes FROM _cloture_soldes WHERE compte ~ '^[1-5]' AND solde <> 0;$a$); EXECUTE d; END IF;
  d := pg_get_functiondef('public.reglement_maj_facture'::regproc);
  IF position($a$  SELECT array_agg(i.journal_id) INTO v_ids FROM public.reglements_tiers_imputations i
   WHERE (i.facture_achat_id = _facture_id OR i.facture_id = _facture_id) AND i.annule_le IS NULL;
  IF v_fl IS NOT NULL AND public.reglement_lettrer(v_ids || v_fl) = 1 THEN RETURN 1; END IF;
  -- Facture d'un exercice antérieur : à-nouveaux détaillés de la facture et de ses règlements antérieurs + règlements de l'exercice.
  DECLARE v_ex uuid; v_an_ids uuid[]; v_cur uuid[];
  BEGIN
    SELECT j.exercice_id INTO v_ex FROM public.journal j WHERE j.id = ANY(v_ids) ORDER BY j.date_ecriture DESC, j.created_at DESC LIMIT 1;
    IF v_ex IS NULL THEN RETURN 0; END IF;
    SELECT array_agg(j.id) INTO v_an_ids FROM public.journal j JOIN public.ecritures e ON e.id = j.ecriture_id
     WHERE j.entreprise_id = v_ent AND j.exercice_id = v_ex AND j.journal_code = 'AN' AND j.compte = t.compte
       AND e.contrepasse_par IS NULL AND coalesce(e.origine, '') <> 'contrepassation'
       AND (j.libelle LIKE 'A-nouveau % — ' || v_piece || ' — %' OR j.libelle LIKE 'A-nouveau % facture ' || v_piece OR j.libelle LIKE 'A-nouveau % avoir ' || v_piece)
       AND NOT EXISTS (SELECT 1 FROM public.lettrage l WHERE l.journal_entry_id = j.id);
    IF v_an_ids IS NULL THEN RETURN 0; END IF;
    SELECT array_agg(j.id) INTO v_cur FROM public.journal j WHERE j.id = ANY(v_ids) AND j.exercice_id = v_ex;
    RETURN public.reglement_lettrer(v_an_ids || v_cur);
  END;$a$ in d) > 0 THEN d := replace(d, $a$  SELECT array_agg(i.journal_id) INTO v_ids FROM public.reglements_tiers_imputations i
   WHERE (i.facture_achat_id = _facture_id OR i.facture_id = _facture_id) AND i.annule_le IS NULL;
  IF v_fl IS NOT NULL AND public.reglement_lettrer(v_ids || v_fl) = 1 THEN RETURN 1; END IF;
  -- Facture d'un exercice antérieur : à-nouveaux détaillés de la facture et de ses règlements antérieurs + règlements de l'exercice.
  DECLARE v_ex uuid; v_an_ids uuid[]; v_cur uuid[];
  BEGIN
    SELECT j.exercice_id INTO v_ex FROM public.journal j WHERE j.id = ANY(v_ids) ORDER BY j.date_ecriture DESC, j.created_at DESC LIMIT 1;
    IF v_ex IS NULL THEN RETURN 0; END IF;
    SELECT array_agg(j.id) INTO v_an_ids FROM public.journal j JOIN public.ecritures e ON e.id = j.ecriture_id
     WHERE j.entreprise_id = v_ent AND j.exercice_id = v_ex AND j.journal_code = 'AN' AND j.compte = t.compte
       AND e.contrepasse_par IS NULL AND coalesce(e.origine, '') <> 'contrepassation'
       AND (j.libelle LIKE 'A-nouveau % — ' || v_piece || ' — %' OR j.libelle LIKE 'A-nouveau % facture ' || v_piece OR j.libelle LIKE 'A-nouveau % avoir ' || v_piece)
       AND NOT EXISTS (SELECT 1 FROM public.lettrage l WHERE l.journal_entry_id = j.id);
    IF v_an_ids IS NULL THEN RETURN 0; END IF;
    SELECT array_agg(j.id) INTO v_cur FROM public.journal j WHERE j.id = ANY(v_ids) AND j.exercice_id = v_ex;
    RETURN public.reglement_lettrer(v_an_ids || v_cur);
  END;$a$, $a$  IF v_fl IS NULL THEN RETURN 0; END IF;
  SELECT array_agg(i.journal_id) INTO v_ids FROM public.reglements_tiers_imputations i
   WHERE (i.facture_achat_id = _facture_id OR i.facture_id = _facture_id) AND i.annule_le IS NULL;
  RETURN public.reglement_lettrer(v_ids || v_fl);$a$); EXECUTE d; END IF;
END $$;
