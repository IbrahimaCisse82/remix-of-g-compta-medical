CREATE OR REPLACE FUNCTION public.trg_sante_facture_immuable()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Une facture ne peut pas être supprimée'; END IF;
  IF (to_jsonb(NEW) - 'annulee' - 'statut_tiers' - 'envoye_tiers_le') <> (to_jsonb(OLD) - 'annulee' - 'statut_tiers' - 'envoye_tiers_le') THEN RAISE EXCEPTION 'Facture immuable : émettez un avoir'; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sante_statut_tiers(_facture_id uuid, _statut text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _f sante_factures;
BEGIN
  SELECT * INTO _f FROM sante_factures WHERE id = _facture_id FOR UPDATE;
  IF _f.id IS NULL OR _f.part_organisme = 0 OR _f.annulee THEN RAISE EXCEPTION 'Aucune part organisme'; END IF;
  IF NOT has_any_medical_role(_f.structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF _statut = 'paye' THEN
    PERFORM sante_imputer_reglement(_f.structure_id, _f.organisme, sante_reste_organisme(_f.id), 'virement', 'Règlement ' || _f.numero,
      jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'montant', sante_reste_organisme(_f.id))));
    RETURN;
  END IF;
  IF (_f.statut_tiers IN ('a_facturer','rejete') AND _statut='envoye') THEN
    UPDATE sante_factures SET statut_tiers = 'envoye', envoye_tiers_le = now() WHERE id = _facture_id;
  ELSIF (_f.statut_tiers='envoye' AND _statut='rejete') THEN
    UPDATE sante_factures SET statut_tiers = 'rejete' WHERE id = _facture_id;
  ELSE
    RAISE EXCEPTION 'Transition interdite (% → %)', _f.statut_tiers, _statut;
  END IF;
END $function$;