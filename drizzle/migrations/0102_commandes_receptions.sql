-- Achats : bons de commande, réceptions et rapprochement avec la facture (02/11/2026).
-- Chaîne : commande (brouillon → envoyée) → réceptions partielles ou totales → facture rapprochée → soldée.
--  - La réception fait entrer le stock (lignes « stock ») au prix commandé, TVA non récupérable comprise, avec
--    l'écriture 3XX/603X : la quantité est disponible dès la livraison (délivrance en consultation, inventaire).
--  - La facture rattachée à une commande ne peut porter, par ligne, que sur des quantités reçues et non encore
--    facturées ; ses lignes « stock » rattachées ne refont pas l'entrée en stock (déjà passée à la réception).
--  - Réceptions et commandes envoyées ne se modifient que par les fonctions serveur.
CREATE TABLE IF NOT EXISTS public.commandes_achat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE RESTRICT,
  numero text NOT NULL,
  date_commande date NOT NULL DEFAULT current_date,
  date_livraison_prevue date,
  objet text,
  notes text,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoyee', 'partielle', 'recue', 'soldee', 'annulee')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entreprise_id, numero)
);
CREATE TABLE IF NOT EXISTS public.commandes_achat_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes_achat(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  designation text NOT NULL,
  nature text NOT NULL DEFAULT 'charge' CHECK (nature IN ('charge', 'stock', 'immobilisation')),
  article_id uuid REFERENCES public.articles(id) ON DELETE RESTRICT,
  compte_charge text NOT NULL DEFAULT '605',
  quantite numeric NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric NOT NULL DEFAULT 0 CHECK (prix_unitaire >= 0),
  taux_tva numeric NOT NULL DEFAULT 18 CHECK (taux_tva >= 0),
  duree_annees numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.receptions_achat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  commande_id uuid NOT NULL REFERENCES public.commandes_achat(id) ON DELETE RESTRICT,
  numero text NOT NULL,
  date_reception date NOT NULL,
  bon_livraison text,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entreprise_id, numero)
);
CREATE TABLE IF NOT EXISTS public.receptions_achat_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id uuid NOT NULL REFERENCES public.receptions_achat(id) ON DELETE CASCADE,
  commande_ligne_id uuid NOT NULL REFERENCES public.commandes_achat_lignes(id) ON DELETE RESTRICT,
  quantite numeric NOT NULL CHECK (quantite > 0),
  lot text,
  peremption date,
  mouvement_stock_id uuid REFERENCES public.mouvements_stock(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.factures_achat ADD COLUMN IF NOT EXISTS commande_id uuid REFERENCES public.commandes_achat(id) ON DELETE RESTRICT;
ALTER TABLE public.factures_achat_lignes ADD COLUMN IF NOT EXISTS commande_ligne_id uuid REFERENCES public.commandes_achat_lignes(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_cmd_lignes_cmd ON public.commandes_achat_lignes(commande_id);
CREATE INDEX IF NOT EXISTS idx_rec_lignes_cl ON public.receptions_achat_lignes(commande_ligne_id);
CREATE INDEX IF NOT EXISTS idx_fact_lignes_cl ON public.factures_achat_lignes(commande_ligne_id);

ALTER TABLE public.commandes_achat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes_achat_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receptions_achat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receptions_achat_lignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY commandes_achat_sel ON public.commandes_achat FOR SELECT TO authenticated USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY commandes_achat_ins ON public.commandes_achat FOR INSERT TO authenticated WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY commandes_achat_upd ON public.commandes_achat FOR UPDATE TO authenticated USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY commandes_achat_del ON public.commandes_achat FOR DELETE TO authenticated USING (public.can_write_entreprise(entreprise_id));
CREATE POLICY commandes_achat_mfa ON public.commandes_achat AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
CREATE POLICY commandes_achat_lignes_sel ON public.commandes_achat_lignes FOR SELECT TO authenticated
  USING (commande_id IN (SELECT id FROM public.commandes_achat WHERE entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid()))));
CREATE POLICY commandes_achat_lignes_mut ON public.commandes_achat_lignes FOR ALL TO authenticated
  USING (commande_id IN (SELECT id FROM public.commandes_achat c WHERE public.can_write_entreprise(c.entreprise_id)))
  WITH CHECK (commande_id IN (SELECT id FROM public.commandes_achat c WHERE public.can_write_entreprise(c.entreprise_id)));
CREATE POLICY commandes_achat_lignes_mfa ON public.commandes_achat_lignes AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
-- Réceptions : lecture seule pour l'application ; écriture par fn_receptionner_commande.
CREATE POLICY receptions_achat_sel ON public.receptions_achat FOR SELECT TO authenticated USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY receptions_achat_lignes_sel ON public.receptions_achat_lignes FOR SELECT TO authenticated
  USING (reception_id IN (SELECT id FROM public.receptions_achat WHERE entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid()))));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commandes_achat, public.commandes_achat_lignes TO authenticated;
GRANT SELECT ON public.receptions_achat, public.receptions_achat_lignes TO authenticated;

-- Commande : seules les commandes en brouillon se modifient librement ; ensuite, seuls statut et notes (fonctions serveur).
CREATE OR REPLACE FUNCTION public.commandes_achat_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE st text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'commandes_achat' THEN
    IF TG_OP = 'UPDATE' AND OLD.statut <> 'brouillon' THEN
      IF NEW.statut = 'annulee' AND OLD.statut = 'envoyee' AND (to_jsonb(NEW) - ARRAY['statut','notes','updated_at']) = (to_jsonb(OLD) - ARRAY['statut','notes','updated_at']) THEN RETURN NEW; END IF;
      IF (to_jsonb(NEW) - ARRAY['notes','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['notes','updated_at']) THEN
        RAISE EXCEPTION 'Commande % envoyee : seules les notes se modifient (annulation possible tant que rien n''est recu)', OLD.numero;
      END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.statut NOT IN ('brouillon', 'envoyee') THEN
      RAISE EXCEPTION 'Statut % reserve aux receptions et factures', NEW.statut;
    ELSIF TG_OP = 'DELETE' AND OLD.statut <> 'brouillon' THEN
      RAISE EXCEPTION 'Commande % envoyee : annulez-la plutot que de la supprimer', OLD.numero;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT statut INTO st FROM public.commandes_achat WHERE id = COALESCE(NEW.commande_id, OLD.commande_id);
  IF st IS DISTINCT FROM 'brouillon' AND st IS NOT NULL THEN RAISE EXCEPTION 'Commande envoyee : ses lignes ne sont plus modifiables'; END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
DROP TRIGGER IF EXISTS trg_commandes_achat_guard ON public.commandes_achat;
CREATE TRIGGER trg_commandes_achat_guard BEFORE UPDATE OR DELETE ON public.commandes_achat FOR EACH ROW EXECUTE FUNCTION public.commandes_achat_guard();
DROP TRIGGER IF EXISTS trg_commandes_achat_lignes_guard ON public.commandes_achat_lignes;
CREATE TRIGGER trg_commandes_achat_lignes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.commandes_achat_lignes FOR EACH ROW EXECUTE FUNCTION public.commandes_achat_guard();

-- Quantités reçues et facturées d'une ligne de commande (factures comptabilisées seulement).
CREATE OR REPLACE FUNCTION public.commande_ligne_quantites(_ligne_id uuid)
 RETURNS TABLE(recue numeric, facturee numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT sum(quantite) FROM public.receptions_achat_lignes WHERE commande_ligne_id = _ligne_id), 0),
         coalesce((SELECT sum(fl.quantite) FROM public.factures_achat_lignes fl JOIN public.factures_achat f ON f.id = fl.facture_id
                   WHERE fl.commande_ligne_id = _ligne_id AND f.comptabilisee AND f.statut <> 'annulee'), 0);
$function$;

CREATE OR REPLACE FUNCTION public.commande_achat_maj_statut(_commande_id uuid)
 RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.commandes_achat%ROWTYPE; v_cmd numeric; v_rec numeric; v_fac numeric; st text;
BEGIN
  SELECT * INTO c FROM public.commandes_achat WHERE id = _commande_id;
  IF c.statut IN ('brouillon', 'annulee') THEN RETURN c.statut; END IF;
  SELECT sum(l.quantite), sum(least(q.recue, l.quantite)), sum(least(q.facturee, l.quantite)) INTO v_cmd, v_rec, v_fac
    FROM public.commandes_achat_lignes l CROSS JOIN LATERAL public.commande_ligne_quantites(l.id) q WHERE l.commande_id = c.id;
  st := CASE WHEN v_fac >= v_cmd THEN 'soldee' WHEN v_rec >= v_cmd THEN 'recue' WHEN v_rec > 0 THEN 'partielle' ELSE 'envoyee' END;
  UPDATE public.commandes_achat SET statut = st, updated_at = now() WHERE id = c.id AND statut IS DISTINCT FROM st;
  RETURN st;
END $function$;

-- Réception : _lignes = [{commande_ligne_id, quantite, lot, peremption}]
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
REVOKE ALL ON FUNCTION public.fn_receptionner_commande(uuid, date, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_receptionner_commande(uuid, date, text, uuid, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.commande_achat_maj_statut(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commande_ligne_quantites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commande_ligne_quantites(uuid) TO authenticated;

-- Comptabilisation de facture : rapprochement avec la commande (quantités reçues), pas de seconde entrée en stock.
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
  v_nb_stock int := 0; v_nb_immo int := 0; v_frn_compte text; v_nature text; cl public.commandes_achat_lignes%ROWTYPE; v_recue numeric; v_fact numeric;
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
    -- Rapprochement : une ligne rattachée à une commande ne facture que du reçu non encore facturé.
    IF l.commande_ligne_id IS NOT NULL THEN
      SELECT * INTO cl FROM public.commandes_achat_lignes WHERE id = l.commande_ligne_id;
      IF NOT FOUND OR cl.commande_id IS DISTINCT FROM f.commande_id THEN RAISE EXCEPTION 'Ligne « % » : ligne de commande d''une autre commande', l.designation; END IF;
      IF l.nature IS DISTINCT FROM cl.nature OR l.article_id IS DISTINCT FROM cl.article_id THEN
        RAISE EXCEPTION 'Ligne « % » : nature ou article differents de la commande', l.designation;
      END IF;
      SELECT recue, facturee INTO v_recue, v_fact FROM public.commande_ligne_quantites(cl.id);
      IF l.quantite > v_recue - v_fact THEN
        RAISE EXCEPTION 'Ligne « % » : % facture(s) pour % recu(s) non encore facture(s)', l.designation, l.quantite, v_recue - v_fact;
      END IF;
    END IF;
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
    IF v_nature = 'stock' AND l.commande_ligne_id IS NOT NULL THEN
      NULL;  -- entrée en stock déjà passée à la réception
    ELSIF v_nature = 'stock' THEN
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
  IF f.commande_id IS NOT NULL THEN PERFORM public.commande_achat_maj_statut(f.commande_id); END IF;
  RETURN jsonb_build_object('ecriture', v_ecr, 'ttc', round(v_total, 2), 'entrees_stock', v_nb_stock, 'immobilisations', v_nb_immo);
END $function$;

