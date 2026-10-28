CREATE OR REPLACE FUNCTION public.sante_encaisser(_facture_id uuid, _mode text, _montant numeric, _reference text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _f public.sante_factures; _deja numeric; _sess uuid; _id uuid;
BEGIN
 SELECT * INTO _f FROM public.sante_factures WHERE id=_facture_id FOR UPDATE;
 IF _f.id IS NULL OR _f.type<>'facture' THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
 IF _f.annulee THEN RAISE EXCEPTION 'Facture annulée'; END IF;
 IF NOT public.mfa_conforme() OR NOT public.has_any_medical_role(_f.structure_id,ARRAY['admin_structure','caissier','secretaire']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
 IF _mode='organisme' THEN RAISE EXCEPTION 'Utilisez le règlement tiers-payant'; END IF;
 IF _montant IS NULL OR _montant::text IN ('NaN','Infinity','-Infinity') OR _montant<=0 OR _montant<>trunc(_montant) THEN RAISE EXCEPTION 'Montant encaissé FCFA entier positif obligatoire'; END IF;
 SELECT coalesce(sum(montant),0) INTO _deja FROM public.sante_encaissements WHERE facture_id=_facture_id AND mode<>'organisme';
 IF _deja+_montant>_f.part_patient THEN RAISE EXCEPTION 'Montant supérieur au reste dû (%)',_f.part_patient-_deja; END IF;
 SELECT id INTO _sess FROM public.sante_sessions_caisse WHERE structure_id=_f.structure_id AND caissier=auth.uid() AND fermee_le IS NULL FOR UPDATE;
 IF _sess IS NULL THEN RAISE EXCEPTION 'Ouvrez d''abord votre caisse'; END IF;
 INSERT INTO public.sante_encaissements(structure_id,facture_id,session_id,mode,montant,reference) VALUES(_f.structure_id,_facture_id,_sess,_mode,_montant,_reference) RETURNING id INTO _id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_encaisser(uuid,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_encaisser(uuid,text,numeric,text) TO authenticated;