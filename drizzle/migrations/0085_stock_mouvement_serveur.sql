-- Mouvement de stock calculé et enregistré côté serveur (31/10/2026).
-- Avant : la page Stocks calculait la nouvelle quantité et le CUMP dans le navigateur à partir de la quantité
-- affichée, puis écrasait l'article. Une délivrance en consultation (sante_dispenser) faite entre-temps était
-- effacée. Ici, l'article est verrouillé, le calcul reprend exactement les règles de src/lib/stocks.ts
-- (CUMP à l'entrée, sortie au CUMP et refusée si stock insuffisant, inventaire = constat, ajustement au CUMP),
-- puis le mouvement et l'article sont écrits dans la même transaction. Ajout uniquement.
CREATE OR REPLACE FUNCTION public.stock_enregistrer_mouvement(_article_id uuid, _type text, _quantite numeric, _prix_unitaire numeric,
  _date date, _reference text DEFAULT NULL, _notes text DEFAULT NULL, _exercice_id uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a public.articles%ROWTYPE; _qa numeric; _ca numeric; _q numeric; _c numeric; _m numeric; _pu numeric; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  SELECT * INTO a FROM public.articles WHERE id = _article_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Article introuvable'; END IF;
  IF NOT coalesce(public.can_write_entreprise(a.entreprise_id), false) THEN
    RAISE EXCEPTION 'Accès refusé : mouvements de stock réservés à l''administrateur et au comptable du dossier.';
  END IF;
  IF _type NOT IN ('entree','sortie','inventaire','ajustement') THEN RAISE EXCEPTION 'Type de mouvement invalide'; END IF;
  IF _quantite IS NULL OR NOT (_quantite > 0) OR _quantite > 1e9 THEN RAISE EXCEPTION 'Quantité > 0 requise'; END IF;
  IF _prix_unitaire IS NOT NULL AND (_prix_unitaire < 0 OR _prix_unitaire > 1e12) THEN RAISE EXCEPTION 'Prix unitaire invalide'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Date du mouvement obligatoire'; END IF;
  _qa := coalesce(a.quantite_stock, 0); _ca := coalesce(a.prix_achat_moyen, 0); _pu := coalesce(_prix_unitaire, 0);
  IF _type = 'entree' THEN
    _q := _qa + _quantite;
    _c := round(CASE WHEN _q > 0 THEN (_qa * _ca + _quantite * _pu) / _q ELSE _pu END, 4);
    _m := round(_quantite * _pu, 2);
  ELSIF _type = 'sortie' THEN
    IF _quantite > _qa THEN RAISE EXCEPTION 'Stock insuffisant pour % : % % disponible(s)', a.designation, trim_scale(_qa), a.unite; END IF;
    _q := _qa - _quantite; _c := round(_ca, 4); _pu := _ca; _m := round(_quantite * _ca, 2);
  ELSIF _type = 'inventaire' THEN
    _q := _quantite; _c := round(CASE WHEN _pu > 0 THEN _pu ELSE _ca END, 4); _pu := _c; _m := round(_q * _c, 2);
  ELSE
    _q := _qa + _quantite; _c := round(_ca, 4); _pu := _ca; _m := round(_quantite * _ca, 2);
  END IF;
  INSERT INTO public.mouvements_stock(entreprise_id, exercice_id, article_id, date_mvt, type_mvt, reference, quantite, prix_unitaire, montant, cump_apres, qte_apres, notes)
  VALUES (a.entreprise_id, _exercice_id, a.id, _date, _type, nullif(trim(_reference), ''), _quantite, _pu, _m, _c, _q, nullif(trim(_notes), ''))
  RETURNING id INTO _id;
  UPDATE public.articles SET quantite_stock = _q, prix_achat_moyen = _c, updated_at = now() WHERE id = a.id;
  RETURN jsonb_build_object('mouvement_id', _id, 'qte_avant', _qa, 'cump_avant', _ca, 'qte_apres', _q, 'cump_apres', _c, 'montant', _m, 'prix_unitaire', _pu);
END $function$;
REVOKE ALL ON FUNCTION public.stock_enregistrer_mouvement(uuid, text, numeric, numeric, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_enregistrer_mouvement(uuid, text, numeric, numeric, date, text, text, uuid) TO authenticated;
