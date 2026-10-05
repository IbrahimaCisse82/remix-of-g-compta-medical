ALTER TABLE public.sante_factures ADD COLUMN IF NOT EXISTS envoye_tiers_le timestamptz;
DO $$ DECLARE s text; BEGIN
  s := pg_get_functiondef('public.sante_statut_tiers(uuid,text)'::regprocedure);
  s := replace(s, 'UPDATE sante_factures SET statut_tiers = _statut WHERE id = _facture_id;',
    'UPDATE sante_factures SET statut_tiers = _statut, envoye_tiers_le = CASE WHEN _statut = ''envoye'' THEN now() ELSE envoye_tiers_le END WHERE id = _facture_id;');
  EXECUTE s;
  s := pg_get_functiondef('public.sante_tableau_bord(uuid,date,date)'::regprocedure);
  s := replace(s, '(e.created_at - fa.created_at)', '(e.created_at - coalesce(fa.envoye_tiers_le, fa.created_at))');
  s := replace(s, '''factures'', count(*),', '''factures'', count(*), ''delai_envoi_jours'', round(avg(extract(epoch FROM (fa.envoye_tiers_le - fa.created_at))/86400)::numeric, 1),');
  EXECUTE s;
END $$;