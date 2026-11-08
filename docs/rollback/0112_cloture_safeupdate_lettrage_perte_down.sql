-- Retour de 0112 (déconseillé : rétablit les deux anomalies).
DO $$
DECLARE d text := pg_get_functiondef('public.fn_cloturer_exercice'::regproc);
BEGIN
  d := replace(replace(d, 'DELETE FROM _cloture_detail WHERE true;', 'DELETE FROM _cloture_detail;'), 'DELETE FROM _cloture_soldes WHERE true;', 'DELETE FROM _cloture_soldes;');
  EXECUTE d;
  d := pg_get_functiondef('public.sante_rejet_tiers'::regproc);
  EXECUTE replace(d, $a$'intitule','Organismes tiers-payant', 'libelle', _f.numero, 'credit', _m,$a$, $a$'intitule','Organismes tiers-payant', 'credit', _m,$a$);
END $$;
CREATE OR REPLACE FUNCTION public.sante_lettrer_facture(_facture_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE f sante_factures; _compte text; _code text; _ecrs uuid[]; _n int := 0;
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
  INSERT INTO lettrage(entreprise_id, exercice_id, compte, code_lettrage, journal_entry_id, montant, date_lettrage)
  SELECT j.entreprise_id, j.exercice_id, j.compte, _code, j.id, coalesce(nullif(j.debit,0), -j.credit), current_date
  FROM journal j WHERE j.ecriture_id = ANY(_ecrs) AND j.compte = _compte AND j.libelle = f.numero
    AND NOT EXISTS (SELECT 1 FROM lettrage l WHERE l.journal_entry_id = j.id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $function$;
