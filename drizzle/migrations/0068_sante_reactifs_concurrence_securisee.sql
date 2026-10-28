CREATE OR REPLACE FUNCTION public.sante_mouvement_reactif(_reactif_id uuid, _type text, _quantite numeric, _numero_lot text DEFAULT NULL, _peremption date DEFAULT NULL, _lot_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.sante_reactifs%ROWTYPE; l public.sante_lots_reactifs%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.sante_reactifs WHERE id=_reactif_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Réactif introuvable'; END IF;
 IF NOT public.mfa_conforme() OR NOT public.has_any_medical_role(r.structure_id, ARRAY['biologiste','technicien']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF NOT r.actif THEN RAISE EXCEPTION 'Réactif désactivé'; END IF;
 IF _quantite IS NULL OR _quantite::text IN ('NaN','Infinity','-Infinity') OR _quantite<=0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
 IF _type='reception' THEN
  IF coalesce(trim(_numero_lot),'')='' OR _peremption IS NULL THEN RAISE EXCEPTION 'N° de lot et péremption obligatoires'; END IF;
  INSERT INTO public.sante_lots_reactifs(structure_id,reactif_id,numero_lot,peremption,quantite_recue,quantite_restante)
  VALUES(r.structure_id,r.id,trim(_numero_lot),_peremption,_quantite,_quantite);
 ELSIF _type='consommation' THEN
  SELECT * INTO l FROM public.sante_lots_reactifs WHERE id=_lot_id AND reactif_id=r.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot introuvable'; END IF;
  IF l.peremption<current_date THEN RAISE EXCEPTION 'Lot périmé : utilisation interdite'; END IF;
  IF l.quantite_restante<_quantite THEN RAISE EXCEPTION 'Stock insuffisant'; END IF;
  UPDATE public.sante_lots_reactifs SET quantite_restante=quantite_restante-_quantite WHERE id=l.id;
 ELSE RAISE EXCEPTION 'Type inconnu'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.sante_mouvement_reactif(uuid,text,numeric,text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_mouvement_reactif(uuid,text,numeric,text,date,uuid) TO authenticated;