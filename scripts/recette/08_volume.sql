-- Phase 8 : contrôle du volume de saisies manuelles et de la balance. Lots lancés avant (4 × recette.gen_ecritures(s, 325) par structure). TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '8' AND (scenario LIKE '%saisies manuelles%' OR scenario LIKE '%après volume%' OR scenario LIKE '%resynchronisation%' OR scenario LIKE 'Resynchronisation%');
DO $d$ DECLARE _s text; _n bigint; _b bigint; BEGIN
  FOREACH _s IN ARRAY ARRAY['A','B','C'] LOOP
    SELECT count(*), count(*) FILTER (WHERE statut = 'brouillon') INTO _n, _b FROM public.ecritures WHERE entreprise_id = recette.eid(_s) AND piece LIKE 'RT-' || _s || '-%';
    PERFORM recette.noter('8','Comptabilité',CASE _s WHEN 'B' THEN 'B-admin' ELSE _s || '-compta' END,'Structure ' || _s || ' : 1 300 saisies manuelles (AC, BQ, PA, OD, CA ; 10 % en brouillon)',
      '1300 écritures dont 130 brouillons', _n || ' écritures dont ' || _b || ' brouillons', _n = 1300 AND _b = 130, 'CPT-11', NULL, 'majeure');
  END LOOP;
END $d$;

-- Balance après volume : équilibre global, puis balance stockée (double tenue) resynchronisée par l'outil de l'application.
DO $d$ DECLARE _s text; _d numeric; _c numeric; BEGIN
  FOREACH _s IN ARRAY ARRAY['A','B','C'] LOOP
    SELECT sum(l.debit), sum(l.credit) INTO _d, _c FROM public.ecriture_lignes l WHERE l.entreprise_id = recette.eid(_s);
    PERFORM recette.noter('8','Comptabilité',NULL,'Structure ' || _s || ' : Σ débits = Σ crédits sur toutes les lignes après volume','Égalité', _d || ' / ' || _c, _d = _c, 'CPT-12', NULL, 'critique');
  END LOOP;
END $d$;
SELECT recette.essai('8','Comptabilité','A-compta','Balance de l''application (fn_balance) équilibrée après volume','Σ débit = Σ crédit','ok',
  $$SELECT CASE WHEN sum(coalesce((b->>'md')::numeric, 0)) = sum(coalesce((b->>'mc')::numeric, 0)) AND sum((b->>'md')::numeric) > 0 THEN 'équilibrée : ' || count(*) || ' comptes, ' || sum((b->>'md')::numeric) || ' F' END
     FROM (SELECT to_jsonb(x) b FROM public.fn_balance(recette.eid('A'), recette.exo('A', 2026)) x) z$$, 'CPT-12', 'critique');
SELECT recette.essai('8','Comptabilité','A-compta','Resynchronisation de la balance stockée (outil Contrôle de balance)','Accepté','ok',
  $$SELECT public.fn_resync_balance(recette.eid('A'), recette.exo('A', 2026))::text$$, 'CPT-12', 'majeure');
SELECT recette.essai('8','Comptabilité','A-compta','Après resynchronisation : plus aucun écart balance stockée / calculée','Aucun écart','egal:0',
  $$SELECT count(*)::text FROM public.fn_balance_ecarts(recette.eid('A'), recette.exo('A', 2026))$$, 'CPT-12', 'majeure');

