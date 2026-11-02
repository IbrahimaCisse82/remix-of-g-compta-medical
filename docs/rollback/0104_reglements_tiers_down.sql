-- Retour de 0104 : supprime règlements serveur et gardes ; rétablit fn_contrepasser_ecriture de 0094.
-- Les écritures de règlement déjà passées restent au journal ; montant_paye des factures d'achat est conservé ;
-- la colonne factures.montant_paye est supprimée (données de paiement des ventes perdues : exporter avant si besoin).
DROP TRIGGER IF EXISTS factures_paiement_guard ON public.factures;
DROP TRIGGER IF EXISTS factures_achat_paiement_guard ON public.factures_achat;
DROP FUNCTION IF EXISTS public.factures_paiement_guard();
DROP FUNCTION IF EXISTS public.fn_annuler_reglement_tiers(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_imputer_acompte_tiers(uuid, uuid, numeric, date);
DROP FUNCTION IF EXISTS public.fn_regler_tiers(uuid, text, uuid, date, text, text, text, jsonb, numeric);
DROP FUNCTION IF EXISTS public.reglement_maj_facture(text, uuid, numeric);
DROP FUNCTION IF EXISTS public.reglement_lettrer(uuid[]);
DROP FUNCTION IF EXISTS public.reglement_compte_tiers(text, uuid);
DROP TABLE IF EXISTS public.reglements_tiers_imputations;
DROP TABLE IF EXISTS public.reglements_tiers;
ALTER TABLE public.factures DROP COLUMN IF EXISTS montant_paye;
CREATE OR REPLACE FUNCTION public.fn_contrepasser_ecriture(_ecriture_id uuid, _motif text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.ecritures%ROWTYPE; v_lignes jsonb; v_new uuid; v_date date;
BEGIN
  SELECT * INTO e FROM public.ecritures WHERE id = _ecriture_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ecriture introuvable'; END IF;
  IF NOT public.can_write_entreprise(e.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF e.contrepasse_par IS NOT NULL THEN RAISE EXCEPTION 'Ecriture deja contre-passee'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif d''extourne obligatoire'; END IF;

  SELECT GREATEST(e.date_ecriture, LEAST(CURRENT_DATE, x.date_fin)) INTO v_date
    FROM public.exercices x WHERE x.id = e.exercice_id;

  SELECT jsonb_agg(jsonb_build_object('compte', compte, 'intitule', intitule,
           'libelle', 'EXTOURNE ' || COALESCE(libelle,''), 'debit', credit, 'credit', debit)
         ORDER BY ordre)
    INTO v_lignes FROM public.ecriture_lignes WHERE ecriture_id = _ecriture_id;

  v_new := public.fn_creer_ecriture(e.entreprise_id, e.exercice_id, e.journal_code, COALESCE(v_date, CURRENT_DATE),
    'EXTOURNE ' || e.numero || ' — ' || _motif, v_lignes, NULL, 'validee', 'contrepassation');

  UPDATE public.ecritures SET contrepasse_par = v_new, motif_annulation = _motif WHERE id = _ecriture_id;
  UPDATE public.ecritures SET contrepassation_de = _ecriture_id WHERE id = v_new;

  INSERT INTO public.journal_audit (entreprise_id, exercice_id, action, old_data, new_data, user_id)
  VALUES (e.entreprise_id, e.exercice_id, 'CONTREPASSATION',
    jsonb_build_object('ecriture_id', _ecriture_id, 'numero', e.numero),
    jsonb_build_object('ecriture_id', v_new, 'motif', _motif), auth.uid());
  RETURN v_new;
END; $function$;
