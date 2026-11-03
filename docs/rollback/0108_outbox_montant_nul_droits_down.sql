-- Retour de 0108 : rétablit le traitement d'outbox sans cas « montant nul » et les droits d'exécution d'origine.
DO $$
DECLARE d text := pg_get_functiondef('public.sante_traiter_evenement'::regproc);
  bloc text := '    IF jsonb_array_length(_propres) = 0 THEN' || E'\n' ||
    '      UPDATE sante_compta_evenements SET statut=''comptabilise'', ecriture_id=NULL, tentatives=tentatives+1,' || E'\n' ||
    '        derniere_erreur=''Montant nul : aucune écriture comptable'', traite_le=now() WHERE id = _id;' || E'\n' ||
    '      RETURN ''sans_objet'';' || E'\n' ||
    '    END IF;' || E'\n';
BEGIN
  IF position(bloc in d) > 0 THEN EXECUTE replace(d, bloc, ''); END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.sante_aux_organisme(uuid, text), public.sante_categorie_code(uuid, text),
  public.sante_compte_tresorerie(uuid, text), public.sante_duree_conservation(uuid, text) TO PUBLIC;
DO $$
DECLARE d text := pg_get_functiondef('public.sante_dispenser'::regproc);
BEGIN
  IF position('_montant := round(_q * coalesce(a.prix_achat_moyen, 0));' in d) > 0 THEN
    EXECUTE replace(d, '_montant := round(_q * coalesce(a.prix_achat_moyen, 0));', '_montant := round(_q * coalesce(a.prix_achat_moyen, 0), 2);');
  END IF;
END $$;
