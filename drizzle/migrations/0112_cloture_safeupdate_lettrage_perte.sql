-- 0112 — Deux anomalies révélées par les tests de sécurité sur la base de test (08/11/2026).
-- 1. Clôture d'exercice impossible depuis l'application : fn_cloturer_exercice vide ses tables temporaires par
--    « DELETE FROM … ; » sans condition, refusé par l'extension safeupdate de l'API (« DELETE requires a WHERE
--    clause »). Introduit par 0107. Condition explicite ajoutée.
-- 2. Rejet « perte » d'une facture tiers-payant annulé à la validation : la ligne 4114 de la perte n'avait pas le
--    numéro de facture en libellé, le lettrage automatique (sante_lettrer_facture) l'omettait, le groupe lettré
--    n'était pas soldé et le contrôle différé du lettrage annulait toute l'opération.
--    → la ligne de perte porte le numéro de facture ; le lettrage reprend aussi les lignes des écritures de perte ;
--      il ne lettre qu'un ensemble soldé (sinon il s'abstient, sans faire échouer le règlement ou le rejet).
-- Retour : docs/rollback/0112_cloture_safeupdate_lettrage_perte_down.sql
DO $$
DECLARE d text := pg_get_functiondef('public.fn_cloturer_exercice'::regproc);
BEGIN
  IF position('DELETE FROM _cloture_detail;' in d) > 0 THEN d := replace(d, 'DELETE FROM _cloture_detail;', 'DELETE FROM _cloture_detail WHERE true;'); END IF;
  IF position('DELETE FROM _cloture_soldes;' in d) > 0 THEN d := replace(d, 'DELETE FROM _cloture_soldes;', 'DELETE FROM _cloture_soldes WHERE true;'); END IF;
  EXECUTE d;
END $$;

DO $$
DECLARE d text := pg_get_functiondef('public.sante_rejet_tiers'::regproc);
  a text := $a$'intitule','Organismes tiers-payant', 'credit', _m,$a$;
  b text := $a$'intitule','Organismes tiers-payant', 'libelle', _f.numero, 'credit', _m,$a$;
BEGIN
  IF position(b in d) > 0 THEN RETURN; END IF;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'sante_rejet_tiers : ancre introuvable'; END IF;
  EXECUTE replace(d, a, b);
END $$;

CREATE OR REPLACE FUNCTION public.sante_lettrer_facture(_facture_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f sante_factures; _compte text; _code text; _ecrs uuid[]; _pertes uuid[]; _n int := 0;
BEGIN
  SELECT * INTO f FROM sante_factures WHERE id = _facture_id;
  IF f.id IS NULL OR sante_reste_organisme(f.id) <> 0 OR f.part_organisme = 0 THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM sante_compta_evenements e WHERE e.statut <> 'comptabilise' AND (
      (e.source_type='facture' AND e.source_id=f.id)
      OR (e.source_type='reglement_organisme' AND e.source_id IN (SELECT reglement_id FROM sante_reglement_imputations WHERE facture_id=f.id))
      OR (e.source_type='perte_creance' AND e.source_id IN (SELECT id FROM sante_tiers_rejets WHERE facture_id=f.id)))) THEN RETURN 0; END IF;
  _compte := sante_compte(f.structure_id, 'organismes');
  _code := 'S' || right(replace(f.numero,'-',''), 9);
  SELECT array_agg(ecriture_id) INTO _ecrs FROM sante_compta_evenements e WHERE e.statut='comptabilise' AND (
      (e.source_type='facture' AND e.source_id=f.id)
      OR (e.source_type='reglement_organisme' AND e.source_id IN (SELECT reglement_id FROM sante_reglement_imputations WHERE facture_id=f.id))
      OR (e.source_type='perte_creance' AND e.source_id IN (SELECT id FROM sante_tiers_rejets WHERE facture_id=f.id)));
  SELECT array_agg(ecriture_id) INTO _pertes FROM sante_compta_evenements e WHERE e.statut='comptabilise'
    AND e.source_type='perte_creance' AND e.source_id IN (SELECT id FROM sante_tiers_rejets WHERE facture_id=f.id);
  CREATE TEMP TABLE IF NOT EXISTS _lettrage_facture (id uuid, entreprise_id uuid, exercice_id uuid, compte text, montant numeric) ON COMMIT DROP;
  DELETE FROM _lettrage_facture WHERE true;
  INSERT INTO _lettrage_facture
  SELECT j.id, j.entreprise_id, j.exercice_id, j.compte, coalesce(nullif(j.debit,0), -j.credit)
  FROM journal j WHERE j.ecriture_id = ANY(_ecrs) AND j.compte = _compte
    AND (j.libelle = f.numero OR j.ecriture_id = ANY(coalesce(_pertes, '{}')))
    AND NOT EXISTS (SELECT 1 FROM lettrage l WHERE l.journal_entry_id = j.id);
  -- Ne lettrer qu'un ensemble soldé : sinon s'abstenir (le contrôle différé ferait échouer l'opération appelante).
  IF NOT EXISTS (SELECT 1 FROM _lettrage_facture) OR (SELECT round(sum(montant), 2) FROM _lettrage_facture) <> 0 THEN RETURN 0; END IF;
  INSERT INTO lettrage(entreprise_id, exercice_id, compte, code_lettrage, journal_entry_id, montant, date_lettrage)
  SELECT entreprise_id, exercice_id, compte, _code, id, montant, current_date FROM _lettrage_facture;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $function$;
