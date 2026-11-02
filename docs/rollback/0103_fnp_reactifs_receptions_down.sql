-- Retour de 0103 : supprime FNP et lien réactifs ; rétablit fn_receptionner_commande de 0102.
-- Les lots de réactifs déjà créés par des réceptions sont conservés (stock réel du laboratoire).
-- Les écritures FNP déjà passées restent au journal : les contre-passer avant, si nécessaire.
DROP FUNCTION IF EXISTS public.fn_constater_fnp(uuid);
DROP FUNCTION IF EXISTS public.fn_extourner_fnp(uuid);
DROP FUNCTION IF EXISTS public.fn_receptions_non_facturees(uuid);
DROP TRIGGER IF EXISTS commandes_lignes_reactif_controle ON public.commandes_achat_lignes;
DROP FUNCTION IF EXISTS public.commandes_lignes_reactif_controle();
CREATE OR REPLACE FUNCTION public.fn_receptionner_commande(_commande_id uuid, _date date, _bon_livraison text, _exercice_id uuid, _lignes jsonb, _notes text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.commandes_achat%ROWTYPE; frn public.fournisseurs%ROWTYPE; cl public.commandes_achat_lignes%ROWTYPE; x jsonb;
  v_rec uuid; v_num text; v_n int; v_q numeric; v_deja numeric; v_coef numeric; v_pu numeric; v_mvt jsonb; v_nb_stock int := 0;
BEGIN
  SELECT * INTO c FROM public.commandes_achat WHERE id = _commande_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF NOT public.can_write_entreprise(c.entreprise_id) THEN RAISE EXCEPTION 'Reception reservee a l''administrateur et au comptable'; END IF;
  IF c.statut NOT IN ('envoyee', 'partielle') THEN RAISE EXCEPTION 'Commande % au statut % : reception impossible', c.numero, c.statut; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Date de reception obligatoire'; END IF;
  IF _lignes IS NULL OR jsonb_array_length(_lignes) = 0 THEN RAISE EXCEPTION 'Aucune quantite recue'; END IF;
  SELECT * INTO frn FROM public.fournisseurs WHERE id = c.fournisseur_id;
  SELECT count(*) + 1 INTO v_n FROM public.receptions_achat WHERE entreprise_id = c.entreprise_id;
  v_num := 'BR-' || to_char(_date, 'YYYY') || '-' || lpad(v_n::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.receptions_achat WHERE entreprise_id = c.entreprise_id AND numero = v_num) LOOP
    v_n := v_n + 1; v_num := 'BR-' || to_char(_date, 'YYYY') || '-' || lpad(v_n::text, 4, '0');
  END LOOP;
  INSERT INTO public.receptions_achat (entreprise_id, commande_id, numero, date_reception, bon_livraison, notes)
  VALUES (c.entreprise_id, c.id, v_num, _date, nullif(trim(_bon_livraison), ''), _notes) RETURNING id INTO v_rec;
  v_coef := least(greatest(coalesce(public.sante_coef_tva_deductible(c.entreprise_id), 1), 0), 1);
  FOR x IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    v_q := coalesce((x->>'quantite')::numeric, 0);
    IF v_q = 0 THEN CONTINUE; END IF;
    IF v_q < 0 THEN RAISE EXCEPTION 'Quantite negative'; END IF;
    SELECT * INTO cl FROM public.commandes_achat_lignes WHERE id = (x->>'commande_ligne_id')::uuid AND commande_id = c.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ligne de commande introuvable'; END IF;
    SELECT recue INTO v_deja FROM public.commande_ligne_quantites(cl.id);
    IF v_deja + v_q > cl.quantite THEN
      RAISE EXCEPTION '« % » : % recu(s) en plus des % deja recu(s), pour % commande(s)', cl.designation, v_q, v_deja, cl.quantite;
    END IF;
    INSERT INTO public.receptions_achat_lignes (reception_id, commande_ligne_id, quantite, lot, peremption)
    VALUES (v_rec, cl.id, v_q, nullif(trim(x->>'lot'), ''), nullif(x->>'peremption', '')::date);
    IF cl.nature = 'stock' THEN
      IF cl.article_id IS NULL THEN RAISE EXCEPTION '« % » : article de stock manquant sur la commande', cl.designation; END IF;
      -- Coût d'entrée : prix commandé + TVA non récupérable (structure exonérée ou au prorata).
      v_pu := round(cl.prix_unitaire * (1 + cl.taux_tva / 100 * (1 - v_coef)), 4);
      v_mvt := public.stock_mouvement_comptabilise(cl.article_id, 'entree', v_q, v_pu, _date, _exercice_id, v_num,
        'Reception ' || v_num || ' — commande ' || c.numero || ' — ' || frn.raison_sociale
        || coalesce(' — lot ' || nullif(trim(x->>'lot'), ''), '') || coalesce(' — peremption ' || nullif(x->>'peremption', ''), ''));
      UPDATE public.receptions_achat_lignes SET mouvement_stock_id = (v_mvt->>'mouvement_id')::uuid
        WHERE reception_id = v_rec AND commande_ligne_id = cl.id AND mouvement_stock_id IS NULL;
      v_nb_stock := v_nb_stock + 1;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.receptions_achat_lignes WHERE reception_id = v_rec) THEN RAISE EXCEPTION 'Aucune quantite recue'; END IF;
  RETURN jsonb_build_object('reception', v_rec, 'numero', v_num, 'entrees_stock', v_nb_stock, 'statut', public.commande_achat_maj_statut(c.id));
END $function$;
ALTER TABLE public.receptions_achat_lignes DROP COLUMN IF EXISTS lot_reactif_id;
DROP INDEX IF EXISTS public.commandes_achat_lignes_reactif_idx;
ALTER TABLE public.commandes_achat_lignes DROP COLUMN IF EXISTS reactif_id;
