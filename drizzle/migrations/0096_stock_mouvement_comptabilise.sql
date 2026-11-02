-- Stocks : mouvement et écriture indissociables, inventaire à zéro, historique protégé (02/11/2026).
-- Constats (recette Stocks) :
--  1. le mouvement était enregistré par stock_enregistrer_mouvement, puis l'écriture 3XX/603X passée par le
--     navigateur : une écriture refusée (date hors exercice, coupure) laissait stock et comptabilité divergents ;
--  2. un inventaire constatant un stock épuisé (quantité 0) était refusé (« Quantité > 0 requise ») ;
--  3. la quantité et le CUMP d'un article se modifiaient directement depuis la fiche, sans mouvement ni écriture ;
--  4. supprimer un article effaçait en cascade tout l'historique de ses mouvements.
-- Corrections :
--  - stock_enregistrer_mouvement accepte un inventaire à 0 ;
--  - nouvelle fonction stock_mouvement_comptabilise : contrôle exercice/date, mouvement puis écriture OD
--    (fn_creer_ecriture) dans la même transaction ; tout échec annule l'ensemble ;
--  - trigger articles, pour les seules requêtes directes de l'application (rôle authenticated ; les fonctions
--    serveur stock_enregistrer_mouvement et sante_dispenser ne sont pas concernées) : quantité et CUMP non
--    modifiables dès qu'un mouvement existe ; suppression refusée si l'article a des mouvements (le désactiver),
--    sauf suppression du dossier lui-même.
CREATE OR REPLACE FUNCTION public.stock_enregistrer_mouvement(_article_id uuid, _type text, _quantite numeric, _prix_unitaire numeric, _date date, _reference text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _exercice_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF _quantite IS NULL OR _quantite > 1e9 OR _quantite < 0 OR (_quantite = 0 AND _type <> 'inventaire') THEN
    RAISE EXCEPTION 'Quantité > 0 requise';
  END IF;
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

CREATE OR REPLACE FUNCTION public.stock_mouvement_comptabilise(_article_id uuid, _type text, _quantite numeric, _prix_unitaire numeric, _date date, _exercice_id uuid, _reference text DEFAULT NULL::text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a public.articles%ROWTYPE; x public.exercices%ROWTYPE; r jsonb; v numeric; m numeric; entree boolean;
  _lib text; _ecr uuid; _lignes jsonb;
BEGIN
  SELECT * INTO a FROM public.articles WHERE id = _article_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Article introuvable'; END IF;
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id AND entreprise_id = a.entreprise_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable pour ce dossier'; END IF;
  IF _date IS NULL OR _date < x.date_debut OR _date > x.date_fin THEN
    RAISE EXCEPTION 'Date % hors de l''exercice % : ouvrez l''exercice concerné', _date, x.annee;
  END IF;
  r := public.stock_enregistrer_mouvement(_article_id, _type, _quantite, _prix_unitaire, _date, _reference, _notes, _exercice_id);
  v := round((r->>'qte_apres')::numeric * (r->>'cump_apres')::numeric - (r->>'qte_avant')::numeric * (r->>'cump_avant')::numeric, 2);
  m := abs(v);
  IF m > 0 THEN
    entree := CASE _type WHEN 'entree' THEN true WHEN 'sortie' THEN false ELSE v > 0 END;
    _lib := 'Mouvement stock ' || a.code || ' — ' || _type;
    _lignes := jsonb_build_array(
      jsonb_build_object('compte', a.compte_stock, 'intitule', 'Stock ' || a.designation, 'libelle', _lib,
        'debit', CASE WHEN entree THEN m ELSE 0 END, 'credit', CASE WHEN entree THEN 0 ELSE m END),
      jsonb_build_object('compte', a.compte_variation, 'intitule', 'Variation de stocks ' || a.designation, 'libelle', _lib,
        'debit', CASE WHEN entree THEN 0 ELSE m END, 'credit', CASE WHEN entree THEN m ELSE 0 END));
    _ecr := public.fn_creer_ecriture(a.entreprise_id, _exercice_id, 'OD', _date, _lib, _lignes,
      coalesce(nullif(trim(_reference), ''), 'STK-' || a.code || '-' || to_char(_date, 'YYYYMMDD')), 'validee', 'stock');
  END IF;
  RETURN r || jsonb_build_object('ecriture_id', _ecr, 'variation', v);
END $function$;

REVOKE ALL ON FUNCTION public.stock_mouvement_comptabilise(uuid, text, numeric, numeric, date, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_mouvement_comptabilise(uuid, text, numeric, numeric, date, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.articles_stock_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.mouvements_stock WHERE article_id = OLD.id)
       AND EXISTS (SELECT 1 FROM public.entreprises WHERE id = OLD.entreprise_id) THEN
      RAISE EXCEPTION 'Article avec mouvements de stock : désactivez-le, il ne peut pas être supprimé';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.quantite_stock IS DISTINCT FROM OLD.quantite_stock OR NEW.prix_achat_moyen IS DISTINCT FROM OLD.prix_achat_moyen)
     AND EXISTS (SELECT 1 FROM public.mouvements_stock WHERE article_id = OLD.id) THEN
    RAISE EXCEPTION 'Quantité et coût moyen se modifient par un mouvement de stock (inventaire, entrée, sortie)';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_articles_stock_guard ON public.articles;
CREATE TRIGGER trg_articles_stock_guard BEFORE UPDATE OR DELETE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_stock_guard();
