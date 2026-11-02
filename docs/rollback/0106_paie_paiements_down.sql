-- Retour de 0106 : supprime les paiements de paie serveur. Préalable : annuler (contre-passer) les paiements passés si besoin ;
-- leurs écritures restent au journal.
DO $$
DECLARE d text := pg_get_functiondef('public.fn_contrepasser_ecriture'::regproc);
  bloc text := E'\n' ||
    '  IF coalesce(current_setting(''app.reglement_annulation'', true), '''') <> ''1'' AND EXISTS (SELECT 1 FROM public.paie_paiements WHERE ecriture_id = _ecriture_id) THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Ecriture de paiement de paie : annulez le paiement depuis l''''ecran Paie'';' || E'\n' ||
    '  END IF;' || E'\n' ||
    '  IF e.journal_code = ''PA'' AND e.piece LIKE ''PAIE-%'' AND EXISTS (SELECT 1 FROM public.paie_paiements WHERE entreprise_id = e.entreprise_id' || E'\n' ||
    '     AND periode = substr(e.piece, 6) AND annule_le IS NULL) THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Paie % deja payee (en tout ou partie) : annulez d''''abord ses paiements'', substr(e.piece, 6);' || E'\n' ||
    '  END IF;';
BEGIN
  d := replace(d, bloc, '');
  IF position('paie_paiements' in d) > 0 THEN RAISE EXCEPTION 'Retrait incomplet de fn_contrepasser_ecriture'; END IF;
  EXECUTE d;
END $$;
DROP FUNCTION IF EXISTS public.fn_annuler_paiement_paie(uuid, text);
DROP FUNCTION IF EXISTS public.fn_payer_paie(uuid, text, text, date, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.fn_paie_restes(uuid, text);
DROP FUNCTION IF EXISTS public.paie_comptes_nature(text);
DROP TABLE IF EXISTS public.paie_paiements;
