-- Factures d'achat : ventilation automatique charge / stock / immobilisation (02/11/2026).
-- Constat : chaque ligne ne portait qu'un compte saisi à la main ; une ligne de stock (60x) n'entrait pas en stock
-- et une ligne d'immobilisation (2x) ne créait pas de fiche (ni plan d'amortissement, ni dotation) : double saisie
-- dans les modules Stocks et Immobilisations, avec risque d'oubli ou de doublon. La comptabilisation se faisait
-- côté navigateur (double clic : deux écritures) et une facture comptabilisée restait modifiable.
-- Corrections :
--  - nature de ligne (charge, stock, immobilisation), article pour une ligne de stock, durée et date de mise en
--    service pour une immobilisation ;
--  - fn_comptabiliser_facture_achat : en une transaction, écriture AC (coût = HT + TVA non récupérable au prorata
--    de la structure ; TVA 4451 immobilisations / 4452 achats ; fournisseur au crédit), entrée en stock au CUMP
--    avec son écriture 3XX/603X (stock_mouvement_comptabilise), fiche d'immobilisation créée (plan
--    d'amortissement), facture marquée comptabilisée ;
--  - facture comptabilisée et ses lignes non modifiables ni supprimables par requête directe (règlements permis).
ALTER TABLE public.factures_achat_lignes
  ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'charge',
  ADD COLUMN IF NOT EXISTS article_id uuid REFERENCES public.articles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS duree_annees numeric,
  ADD COLUMN IF NOT EXISTS date_mise_service date,
  ADD COLUMN IF NOT EXISTS immobilisation_id uuid REFERENCES public.immobilisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mouvement_stock_id uuid REFERENCES public.mouvements_stock(id) ON DELETE SET NULL;
ALTER TABLE public.factures_achat_lignes DROP CONSTRAINT IF EXISTS factures_achat_lignes_nature_check;
ALTER TABLE public.factures_achat_lignes ADD CONSTRAINT factures_achat_lignes_nature_check CHECK (nature IN ('charge', 'stock', 'immobilisation'));

CREATE OR REPLACE FUNCTION public.fn_comptabiliser_facture_achat(_facture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.factures_achat%ROWTYPE; frn public.fournisseurs%ROWTYPE; l public.factures_achat_lignes%ROWTYPE; a public.articles%ROWTYPE;
  v_coef numeric; v_ht numeric; v_tvab numeric; v_ded numeric; v_cout numeric; v_compte text; v_tva_compte text;
  v_debits jsonb := '{}'::jsonb; v_tva jsonb := '{}'::jsonb; v_lignes jsonb := '[]'::jsonb; k text; v numeric;
  v_total numeric := 0; v_total_ht numeric := 0; v_total_tva numeric := 0; v_ecr uuid; v_imm uuid; v_mvt jsonb;
  v_nb_stock int := 0; v_nb_immo int := 0; v_frn_compte text; v_nature text;
BEGIN
  SELECT * INTO f FROM public.factures_achat WHERE id = _facture_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF NOT public.can_write_entreprise(f.entreprise_id) THEN RAISE EXCEPTION 'Comptabilisation reservee a l''administrateur et au comptable'; END IF;
  IF f.comptabilisee THEN RAISE EXCEPTION 'Facture % deja comptabilisee', f.numero_interne; END IF;
  IF f.statut = 'annulee' THEN RAISE EXCEPTION 'Facture annulee'; END IF;
  SELECT * INTO frn FROM public.fournisseurs WHERE id = f.fournisseur_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fournisseur introuvable'; END IF;
  v_frn_compte := frn.compte_tiers || left(regexp_replace(frn.code, '\D', '', 'g'), 4);
  v_coef := coalesce(public.sante_coef_tva_deductible(f.entreprise_id), 1);
  IF NOT EXISTS (SELECT 1 FROM public.factures_achat_lignes WHERE facture_id = f.id) THEN RAISE EXCEPTION 'Facture sans ligne'; END IF;

  -- 1. Écriture AC : débits par compte (HT + TVA non récupérable), TVA récupérable par nature, fournisseur.
  FOR l IN SELECT * FROM public.factures_achat_lignes WHERE facture_id = f.id ORDER BY ordre LOOP
    IF NOT (l.quantite > 0) OR l.prix_unitaire < 0 OR l.taux_tva < 0 THEN RAISE EXCEPTION 'Ligne « % » : quantite, prix ou TVA invalide', l.designation; END IF;
    v_ht := round(l.quantite * l.prix_unitaire, 2);
    v_tvab := round(v_ht * l.taux_tva / 100, 2);
    v_ded := round(v_tvab * least(greatest(v_coef, 0), 1), 2);
    v_cout := v_ht + (v_tvab - v_ded);
    IF l.nature = 'stock' THEN
      SELECT * INTO a FROM public.articles WHERE id = l.article_id AND entreprise_id = f.entreprise_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Ligne « % » : article de stock a choisir', l.designation; END IF;
      v_compte := coalesce(nullif(a.compte_achat, ''), '601');
    ELSIF l.nature = 'immobilisation' THEN
      v_compte := l.compte_charge;
      IF v_compte !~ '^2[1-7]' THEN RAISE EXCEPTION 'Ligne « % » : compte d''immobilisation (21 a 27) attendu, % saisi', l.designation, v_compte; END IF;
    ELSE
      v_compte := l.compte_charge;
      IF v_compte ~ '^2' THEN RAISE EXCEPTION 'Ligne « % » : compte % d''immobilisation, choisissez la nature Immobilisation', l.designation, v_compte; END IF;
      IF v_compte ~ '^3' THEN RAISE EXCEPTION 'Ligne « % » : compte % de stock, choisissez la nature Stock et l''article', l.designation, v_compte; END IF;
      IF v_compte !~ '^[1-8][0-9]{2,}$' THEN RAISE EXCEPTION 'Ligne « % » : compte % invalide', l.designation, v_compte; END IF;
    END IF;
    v_debits := jsonb_set(v_debits, ARRAY[v_compte], to_jsonb(coalesce((v_debits->>v_compte)::numeric, 0) + v_cout));
    IF v_ded > 0 THEN
      v_tva_compte := CASE WHEN l.nature = 'immobilisation' THEN '4451' ELSE '4452' END;
      v_tva := jsonb_set(v_tva, ARRAY[v_tva_compte], to_jsonb(coalesce((v_tva->>v_tva_compte)::numeric, 0) + v_ded));
    END IF;
    v_total_ht := v_total_ht + v_cout; v_total_tva := v_total_tva + v_ded;
  END LOOP;
  FOR k, v IN SELECT key, value::numeric FROM jsonb_each_text(v_debits) LOOP
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', k, 'intitule', 'Achat ' || k,
      'libelle', 'Achat ' || frn.raison_sociale || ' — ' || f.numero_interne, 'debit', v, 'credit', 0));
    v_total := v_total + v;
  END LOOP;
  FOR k, v IN SELECT key, value::numeric FROM jsonb_each_text(v_tva) LOOP
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', k,
      'intitule', CASE k WHEN '4451' THEN 'TVA récupérable sur immobilisations' ELSE 'TVA récupérable sur achats' END,
      'libelle', 'TVA deductible — ' || f.numero_interne, 'debit', v, 'credit', 0));
    v_total := v_total + v;
  END LOOP;
  v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', v_frn_compte, 'intitule', 'Fournisseur ' || frn.raison_sociale,
    'libelle', 'Facture ' || frn.raison_sociale || ' — ' || f.numero_interne, 'debit', 0, 'credit', v_total,
    'compte_auxiliaire', frn.code, 'auxiliaire_libelle', frn.raison_sociale));
  v_ecr := public.fn_creer_ecriture(f.entreprise_id, f.exercice_id, 'AC', f.date_facture,
    'Facture ' || frn.raison_sociale || ' ' || coalesce(f.numero_fournisseur, f.numero_interne), v_lignes, f.numero_interne, 'validee', 'facture_achat');

  -- 2. Effets sur les modules : entrée en stock et fiche d'immobilisation.
  FOR l IN SELECT * FROM public.factures_achat_lignes WHERE facture_id = f.id ORDER BY ordre LOOP
    v_ht := round(l.quantite * l.prix_unitaire, 2);
    v_tvab := round(v_ht * l.taux_tva / 100, 2);
    v_ded := round(v_tvab * least(greatest(v_coef, 0), 1), 2);
    v_cout := v_ht + (v_tvab - v_ded);
    v_nature := l.nature;
    IF v_nature = 'stock' THEN
      v_mvt := public.stock_mouvement_comptabilise(l.article_id, 'entree', l.quantite, round(v_cout / l.quantite, 4), f.date_facture,
        f.exercice_id, f.numero_interne, 'Facture ' || frn.raison_sociale || ' ' || coalesce(f.numero_fournisseur, f.numero_interne));
      UPDATE public.factures_achat_lignes SET mouvement_stock_id = (v_mvt->>'mouvement_id')::uuid WHERE id = l.id;
      v_nb_stock := v_nb_stock + 1;
    ELSIF v_nature = 'immobilisation' THEN
      INSERT INTO public.immobilisations (entreprise_id, code, libelle, categorie, compte_immo, compte_amort, compte_dotation,
        date_acquisition, date_mise_service, valeur_origine, valeur_residuelle, duree_annees, mode_amortissement, statut, notes)
      VALUES (f.entreprise_id, f.numero_interne || '-' || (l.ordre + 1), l.designation,
        CASE WHEN l.compte_charge ~ '^21' THEN 'incorporelle' WHEN l.compte_charge ~ '^2[67]' THEN 'financiere' ELSE 'corporelle' END,
        l.compte_charge, '28' || substr(l.compte_charge, 2),
        CASE WHEN l.compte_charge ~ '^21' THEN '6812' WHEN l.compte_charge ~ '^2[67]' THEN '6972' ELSE '6813' END,
        f.date_facture, coalesce(l.date_mise_service, f.date_facture), v_cout, 0, greatest(coalesce(l.duree_annees, 5), 1), 'lineaire', 'actif',
        'Facture ' || frn.raison_sociale || ' ' || coalesce(f.numero_fournisseur, f.numero_interne) || ' (' || f.numero_interne || ')')
      RETURNING id INTO v_imm;
      UPDATE public.factures_achat_lignes SET immobilisation_id = v_imm WHERE id = l.id;
      v_nb_immo := v_nb_immo + 1;
    END IF;
  END LOOP;

  UPDATE public.factures_achat SET comptabilisee = true, piece_journal = f.numero_interne,
    statut = CASE WHEN statut = 'brouillon' THEN 'validee' ELSE statut END,
    total_ht = round(v_total_ht, 2), total_tva = round(v_total_tva, 2), total_ttc = round(v_total, 2)
  WHERE id = f.id;
  RETURN jsonb_build_object('ecriture', v_ecr, 'ttc', round(v_total, 2), 'entrees_stock', v_nb_stock, 'immobilisations', v_nb_immo);
END $function$;
REVOKE ALL ON FUNCTION public.fn_comptabiliser_facture_achat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_comptabiliser_facture_achat(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.factures_achat_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE compta boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'factures_achat' THEN
    IF NOT OLD.comptabilisee THEN RETURN COALESCE(NEW, OLD); END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Facture % comptabilisee : contre-passez l''ecriture, elle ne peut pas etre supprimee', OLD.numero_interne; END IF;
    -- Seuls le suivi des règlements, le statut et les notes évoluent après comptabilisation.
    IF (to_jsonb(NEW) - ARRAY['montant_paye', 'statut', 'notes', 'updated_at', 'date_echeance'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['montant_paye', 'statut', 'notes', 'updated_at', 'date_echeance']) THEN
      RAISE EXCEPTION 'Facture % comptabilisee : montants, lignes et dates ne sont plus modifiables', OLD.numero_interne;
    END IF;
    RETURN NEW;
  END IF;
  SELECT comptabilisee INTO compta FROM public.factures_achat WHERE id = COALESCE(NEW.facture_id, OLD.facture_id);
  IF coalesce(compta, false) THEN RAISE EXCEPTION 'Facture comptabilisee : ses lignes ne sont plus modifiables'; END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
DROP TRIGGER IF EXISTS trg_factures_achat_guard ON public.factures_achat;
CREATE TRIGGER trg_factures_achat_guard BEFORE UPDATE OR DELETE ON public.factures_achat FOR EACH ROW EXECUTE FUNCTION public.factures_achat_guard();
DROP TRIGGER IF EXISTS trg_factures_achat_lignes_guard ON public.factures_achat_lignes;
CREATE TRIGGER trg_factures_achat_lignes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.factures_achat_lignes FOR EACH ROW EXECUTE FUNCTION public.factures_achat_guard();
