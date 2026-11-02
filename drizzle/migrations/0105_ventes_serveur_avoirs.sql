-- 0105 — Comptabilisation des ventes côté serveur et avoirs clients / fournisseurs.
-- * fn_comptabiliser_facture_vente : écriture VT en une transaction (411 + chiffres du code client, compte auxiliaire = code),
--   totaux recalculés depuis les lignes ; facture comptabilisée figée (garde).
-- * Avoirs (type_document = 'avoir') sur factures et factures_achat : écriture inverse ; imputation sur factures du même tiers
--   dans un règlement (compensation pure sans trésorerie = journal OD) ou remboursement.
-- Additive (colonnes nullables / par défaut, fonctions) ; fn_regler_tiers, reglement_maj_facture, reglement_compte_tiers,
-- fn_comptabiliser_facture_achat et fn_imputer_acompte_tiers remplacées. Retour : docs/rollback/0105_ventes_serveur_avoirs_down.sql

ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS type_document text NOT NULL DEFAULT 'facture';
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS facture_origine_id uuid REFERENCES public.factures(id) ON DELETE RESTRICT;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS piece_journal text;
ALTER TABLE public.factures_achat ADD COLUMN IF NOT EXISTS type_document text NOT NULL DEFAULT 'facture';
ALTER TABLE public.factures_achat ADD COLUMN IF NOT EXISTS facture_origine_id uuid REFERENCES public.factures_achat(id) ON DELETE RESTRICT;
DO $$ BEGIN
  ALTER TABLE public.factures ADD CONSTRAINT factures_type_document_check CHECK (type_document IN ('facture', 'avoir'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.factures_achat ADD CONSTRAINT factures_achat_type_document_check CHECK (type_document IN ('facture', 'avoir'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un règlement peut être une compensation pure (montant net nul, sans trésorerie) ou un remboursement (net négatif).
ALTER TABLE public.reglements_tiers DROP CONSTRAINT IF EXISTS reglements_tiers_montant_check;
ALTER TABLE public.reglements_tiers ALTER COLUMN compte_tresorerie DROP NOT NULL;

-- Garde des factures de vente : comptabilisation uniquement par le serveur ; une fois comptabilisée, seules les notes,
-- l'échéance, le statut d'annulation et les champs de transmission DGID se modifient ; lignes figées ; suppression refusée.
CREATE OR REPLACE FUNCTION public.factures_vente_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE compta boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'facture_lignes' THEN
    SELECT comptabilisee INTO compta FROM public.factures WHERE id = COALESCE(NEW.facture_id, OLD.facture_id);
    IF coalesce(compta, false) THEN RAISE EXCEPTION 'Facture comptabilisée : ses lignes ne sont plus modifiables (émettez un avoir)'; END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.comptabilisee THEN RAISE EXCEPTION 'Comptabilisation réservée au serveur'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.comptabilisee THEN RAISE EXCEPTION 'Facture % comptabilisée : émettez un avoir, elle ne peut pas être supprimée', OLD.numero; END IF;
    RETURN OLD;
  END IF;
  IF NEW.comptabilisee IS DISTINCT FROM OLD.comptabilisee THEN RAISE EXCEPTION 'Comptabilisation réservée au serveur'; END IF;
  IF OLD.comptabilisee AND (to_jsonb(NEW) - ARRAY['notes', 'updated_at', 'date_echeance', 'uuid_dgid', 'qr_code', 'hash_certif', 'statut_dgid',
       'date_transmission', 'dgid_error', 'dgid_mode', 'montant_paye', 'statut'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['notes', 'updated_at', 'date_echeance', 'uuid_dgid', 'qr_code', 'hash_certif', 'statut_dgid',
       'date_transmission', 'dgid_error', 'dgid_mode', 'montant_paye', 'statut']) THEN
    RAISE EXCEPTION 'Facture % comptabilisée : client, montants, lignes et dates ne sont plus modifiables (émettez un avoir)', OLD.numero;
  END IF;
  IF OLD.comptabilisee AND NEW.statut = 'annulee' AND OLD.statut <> 'annulee' THEN
    RAISE EXCEPTION 'Facture % comptabilisée : annulez-la par un avoir', OLD.numero;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS factures_vente_guard ON public.factures;
CREATE TRIGGER factures_vente_guard BEFORE INSERT OR UPDATE OR DELETE ON public.factures FOR EACH ROW EXECUTE FUNCTION public.factures_vente_guard();
DROP TRIGGER IF EXISTS facture_lignes_vente_guard ON public.facture_lignes;
CREATE TRIGGER facture_lignes_vente_guard BEFORE INSERT OR UPDATE OR DELETE ON public.facture_lignes FOR EACH ROW EXECUTE FUNCTION public.factures_vente_guard();

-- Factures d'achat : passage à « comptabilisée » réservé au serveur (la garde existante ne couvrait que l'après).
CREATE OR REPLACE FUNCTION public.factures_achat_compta_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.comptabilisee) OR (TG_OP = 'UPDATE' AND NEW.comptabilisee AND NOT OLD.comptabilisee) THEN
    RAISE EXCEPTION 'Comptabilisation réservée au serveur';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS factures_achat_compta_guard ON public.factures_achat;
CREATE TRIGGER factures_achat_compta_guard BEFORE INSERT OR UPDATE ON public.factures_achat FOR EACH ROW EXECUTE FUNCTION public.factures_achat_compta_guard();

-- Compte client désormais numérique comme les fournisseurs : compte_tiers + 4 chiffres du code, auxiliaire = code client.
-- (Aucune facture de vente n'avait encore été comptabilisée avec l'ancien compte alphanumérique.)
CREATE OR REPLACE FUNCTION public.reglement_compte_tiers(_sens text, _tiers_id uuid, OUT compte text, OUT avance text, OUT nom text, OUT entreprise_id uuid,
  OUT auxiliaire text, OUT aux_libelle text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _sens = 'fournisseur' THEN
    SELECT f.compte_tiers || left(regexp_replace(f.code, '\D', '', 'g'), 4), f.raison_sociale, f.entreprise_id, f.code, f.raison_sociale
      INTO compte, nom, entreprise_id, auxiliaire, aux_libelle FROM public.fournisseurs f WHERE f.id = _tiers_id;
  ELSIF _sens = 'client' THEN
    SELECT coalesce(nullif(c.compte_tiers, ''), '411') || left(regexp_replace(c.code, '\D', '', 'g'), 4), c.nom, c.entreprise_id, c.code, c.nom
      INTO compte, nom, entreprise_id, auxiliaire, aux_libelle FROM public.clients c WHERE c.id = _tiers_id;
  END IF;
  IF compte IS NULL THEN RAISE EXCEPTION 'Tiers introuvable'; END IF;
  IF compte !~ '^4[0-9]+$' THEN RAISE EXCEPTION 'Compte tiers % invalide (numérique, classe 4)', compte; END IF;
  avance := CASE WHEN _sens = 'fournisseur' THEN '4091' ELSE '4191' END || substr(compte, 4);
END $function$;

-- Comptabilisation d'une facture ou d'un avoir de vente : 411 au débit (facture) ou au crédit (avoir), produits par compte de vente,
-- TVA collectée 4431 ; totaux recalculés depuis les lignes (remise comprise).
CREATE OR REPLACE FUNCTION public.fn_comptabiliser_facture_vente(_facture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.factures%ROWTYPE; o public.factures%ROWTYPE; x public.exercices%ROWTYPE; t record; v_ht numeric; v_tva numeric; v_ttc numeric;
  v_avoir boolean; v_lignes jsonb; v_ecr uuid; v_lib text;
BEGIN
  SELECT * INTO f FROM public.factures WHERE id = _facture_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF NOT public.can_write_entreprise(f.entreprise_id) THEN RAISE EXCEPTION 'Comptabilisation réservée à l''administrateur et au comptable'; END IF;
  IF f.comptabilisee THEN RAISE EXCEPTION 'Facture % déjà comptabilisée', f.numero; END IF;
  IF f.statut = 'annulee' THEN RAISE EXCEPTION 'Facture annulée'; END IF;
  SELECT * INTO x FROM public.exercices WHERE id = f.exercice_id AND entreprise_id = f.entreprise_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF f.date_facture < x.date_debut OR f.date_facture > x.date_fin THEN RAISE EXCEPTION 'Date % hors de l''exercice %', f.date_facture, x.annee; END IF;
  IF coalesce(f.compte_vente, '') !~ '^7[0-9]{2,}$' THEN RAISE EXCEPTION 'Compte de vente % invalide (classe 7)', f.compte_vente; END IF;
  IF coalesce(f.taux_tva, 0) < 0 THEN RAISE EXCEPTION 'Taux de TVA invalide'; END IF;
  v_avoir := f.type_document = 'avoir';
  IF f.facture_origine_id IS NOT NULL THEN
    SELECT * INTO o FROM public.factures WHERE id = f.facture_origine_id;
    IF NOT FOUND OR o.client_id <> f.client_id OR o.entreprise_id <> f.entreprise_id OR o.type_document <> 'facture' OR NOT o.comptabilisee THEN
      RAISE EXCEPTION 'Facture d''origine invalide (même client, facture comptabilisée)';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.facture_lignes WHERE facture_id = f.id AND (NOT (quantite > 0) OR prix_unitaire < 0 OR coalesce(remise_pct, 0) NOT BETWEEN 0 AND 100)) THEN
    RAISE EXCEPTION 'Ligne invalide : quantité, prix ou remise';
  END IF;
  SELECT coalesce(sum(round(quantite * prix_unitaire * (1 - coalesce(remise_pct, 0) / 100), 2)), 0) INTO v_ht FROM public.facture_lignes WHERE facture_id = f.id;
  IF v_ht <= 0 THEN RAISE EXCEPTION 'Facture sans montant'; END IF;
  v_tva := round(v_ht * coalesce(f.taux_tva, 0) / 100, 2);
  v_ttc := v_ht + v_tva;
  IF v_avoir AND f.facture_origine_id IS NOT NULL AND v_ttc > o.total_ttc THEN
    RAISE EXCEPTION 'Avoir de % supérieur à la facture d''origine % (%)', v_ttc, o.numero, o.total_ttc;
  END IF;
  SELECT * INTO t FROM public.reglement_compte_tiers('client', f.client_id);
  v_lib := CASE WHEN v_avoir THEN 'Avoir ' ELSE 'Facture ' END || f.numero || ' — ' || t.nom;
  v_lignes := jsonb_build_array(
    jsonb_build_object('compte', t.compte, 'intitule', 'Client ' || t.nom, 'libelle', v_lib, 'compte_auxiliaire', t.auxiliaire, 'auxiliaire_libelle', t.aux_libelle,
      'debit', CASE WHEN v_avoir THEN 0 ELSE v_ttc END, 'credit', CASE WHEN v_avoir THEN v_ttc ELSE 0 END),
    jsonb_build_object('compte', f.compte_vente, 'intitule', 'Ventes ' || f.compte_vente, 'libelle', v_lib,
      'debit', CASE WHEN v_avoir THEN v_ht ELSE 0 END, 'credit', CASE WHEN v_avoir THEN 0 ELSE v_ht END));
  IF v_tva > 0 THEN
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', '4431', 'intitule', 'TVA facturée sur ventes', 'libelle', v_lib,
      'debit', CASE WHEN v_avoir THEN v_tva ELSE 0 END, 'credit', CASE WHEN v_avoir THEN 0 ELSE v_tva END));
  END IF;
  v_ecr := public.fn_creer_ecriture(f.entreprise_id, f.exercice_id, 'VT', f.date_facture, v_lib, v_lignes, f.numero, 'validee', 'facture_vente');
  UPDATE public.factures SET comptabilisee = true, piece_journal = f.numero, total_ht = v_ht, total_tva = v_tva, total_ttc = v_ttc,
    statut = CASE WHEN statut = 'brouillon' THEN 'validee' ELSE statut END WHERE id = f.id;
  RETURN jsonb_build_object('ecriture', v_ecr, 'ht', v_ht, 'tva', v_tva, 'ttc', v_ttc, 'compte_client', t.compte);
END $function$;

-- Achats : un avoir fournisseur ne porte que des lignes de nature Charge (les retours de stock et sorties d'immobilisation
-- passent par leurs modules) ; son écriture est l'inverse de celle d'une facture.
DO $$
DECLARE d text := pg_get_functiondef('public.fn_comptabiliser_facture_achat'::regproc);
  a1 text := '  IF NOT EXISTS (SELECT 1 FROM public.factures_achat_lignes WHERE facture_id = f.id) THEN RAISE EXCEPTION ''Facture sans ligne''; END IF;';
  a2 text := '  v_ecr := public.fn_creer_ecriture(f.entreprise_id, f.exercice_id, ''AC'', f.date_facture,';
BEGIN
  IF position('type_document' in d) > 0 THEN RETURN; END IF;
  IF position(a1 in d) = 0 OR position(a2 in d) = 0 THEN RAISE EXCEPTION 'fn_comptabiliser_facture_achat : ancre introuvable'; END IF;
  d := replace(d, a1, a1 || E'\n' ||
$x$  IF f.type_document = 'avoir' THEN
    IF EXISTS (SELECT 1 FROM public.factures_achat_lignes WHERE facture_id = f.id AND (nature <> 'charge' OR commande_ligne_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Avoir : lignes de nature Charge uniquement (retours de stock et sorties d''immobilisations dans leurs modules)';
    END IF;
    IF f.facture_origine_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.factures_achat o WHERE o.id = f.facture_origine_id
       AND o.fournisseur_id = f.fournisseur_id AND o.type_document = 'facture' AND o.comptabilisee) THEN
      RAISE EXCEPTION 'Facture d''origine invalide (même fournisseur, facture comptabilisée)';
    END IF;
  END IF;$x$);
  d := replace(d, a2,
$x$  IF f.type_document = 'avoir' THEN
    SELECT jsonb_agg((e - 'debit' - 'credit') || jsonb_build_object('debit', e->'credit', 'credit', e->'debit')) INTO v_lignes FROM jsonb_array_elements(v_lignes) e;
  END IF;
$x$ || a2);
  EXECUTE d;
END $$;

-- Montant imputé et statut ; lettrage de la ligne tiers de la facture (ou de l'avoir) avec ses imputations quand elle est soldée.
CREATE OR REPLACE FUNCTION public.reglement_maj_facture(_sens text, _facture_id uuid, _delta numeric)
 RETURNS int
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ttc numeric; v_paye numeric; v_ent uuid; v_piece text; v_tiers uuid; v_jnl text; v_type text; t record; v_fl uuid; v_ids uuid[]; v_sens_ligne numeric;
BEGIN
  IF _sens = 'fournisseur' THEN
    UPDATE public.factures_achat SET montant_paye = round(montant_paye + _delta, 2),
      statut = CASE WHEN round(montant_paye + _delta, 2) >= total_ttc THEN 'payee' WHEN round(montant_paye + _delta, 2) > 0 THEN 'payee_partiel' ELSE 'validee' END
     WHERE id = _facture_id RETURNING total_ttc, montant_paye, entreprise_id, numero_interne, fournisseur_id, type_document INTO v_ttc, v_paye, v_ent, v_piece, v_tiers, v_type;
    v_jnl := 'AC';
  ELSE
    UPDATE public.factures SET montant_paye = round(montant_paye + _delta, 2),
      statut = CASE WHEN round(montant_paye + _delta, 2) >= total_ttc THEN 'payee' WHEN round(montant_paye + _delta, 2) > 0 THEN 'payee_partiel' ELSE 'validee' END
     WHERE id = _facture_id RETURNING total_ttc, montant_paye, entreprise_id, numero, client_id, type_document INTO v_ttc, v_paye, v_ent, v_piece, v_tiers, v_type;
    v_jnl := 'VT';
  END IF;
  IF v_paye < 0 THEN RAISE EXCEPTION 'Montant imputé négatif'; END IF;
  IF v_paye < v_ttc THEN RETURN 0; END IF;
  -- Solde attendu de la ligne tiers : fournisseur facture = crédit, client facture = débit ; l'avoir est l'inverse.
  v_sens_ligne := CASE WHEN (_sens = 'fournisseur') = (v_type = 'facture') THEN -1 ELSE 1 END;
  SELECT * INTO t FROM public.reglement_compte_tiers(_sens, v_tiers);
  SELECT j.id INTO v_fl FROM public.journal j JOIN public.ecritures e ON e.id = j.ecriture_id
   WHERE j.entreprise_id = v_ent AND j.piece = v_piece AND j.journal_code = v_jnl AND j.compte = t.compte AND e.contrepasse_par IS NULL
     AND (j.debit - j.credit) * v_sens_ligne = v_ttc
   ORDER BY j.created_at DESC LIMIT 1;
  IF v_fl IS NULL THEN RETURN 0; END IF;
  SELECT array_agg(i.journal_id) INTO v_ids FROM public.reglements_tiers_imputations i
   WHERE (i.facture_achat_id = _facture_id OR i.facture_id = _facture_id) AND i.annule_le IS NULL;
  RETURN public.reglement_lettrer(v_ids || v_fl);
END $function$;

-- Règlement : factures (sens normal) et avoirs (sens inverse) d'un même tiers, plus un éventuel acompte. Net positif = paiement
-- (fournisseur) ou encaissement (client) ; net négatif = remboursement ; net nul = compensation pure, sans trésorerie, journal OD.
CREATE OR REPLACE FUNCTION public.fn_regler_tiers(_exercice_id uuid, _sens text, _tiers_id uuid, _date date, _compte_tresorerie text,
  _mode text, _reference text, _imputations jsonb, _acompte numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; t record; v_jnl text; v_num text; v_n int; v_reg uuid; v_ecr uuid; v_lignes jsonb := '[]'::jsonb;
  v_net numeric := 0; v_acompte numeric := round(coalesce(_acompte, 0), 2); i jsonb; v_fid uuid; v_m numeric; v_ttc numeric; v_paye numeric;
  v_ent uuid; v_tiers uuid; v_nf text; v_statut text; v_compta boolean; v_type text; v_ids uuid[] := '{}'; v_mt numeric[] := '{}'; v_nums text[] := '{}';
  v_avoirs boolean[] := '{}'; k int; v_lettres int := 0; v_fourn boolean := _sens = 'fournisseur'; v_debit_tiers boolean; v_treso text;
BEGIN
  IF _sens NOT IN ('fournisseur', 'client') THEN RAISE EXCEPTION 'Sens de règlement inconnu'; END IF;
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_write_entreprise(x.entreprise_id) THEN RAISE EXCEPTION 'Règlement réservé à l''administrateur et au comptable'; END IF;
  IF _date IS NULL OR _date < x.date_debut OR _date > x.date_fin THEN RAISE EXCEPTION 'Date % hors de l''exercice %', _date, x.annee; END IF;
  IF v_acompte < 0 THEN RAISE EXCEPTION 'Acompte négatif'; END IF;
  SELECT * INTO t FROM public.reglement_compte_tiers(_sens, _tiers_id);
  IF t.entreprise_id <> x.entreprise_id THEN RAISE EXCEPTION 'Tiers hors de ce dossier'; END IF;

  FOR i IN SELECT * FROM jsonb_array_elements(coalesce(_imputations, '[]'::jsonb)) LOOP
    v_fid := (i->>'facture_id')::uuid; v_m := round(coalesce((i->>'montant')::numeric, 0), 2);
    IF v_m < 0 THEN RAISE EXCEPTION 'Montant négatif'; END IF;
    IF v_m = 0 THEN CONTINUE; END IF;
    IF v_fid = ANY(v_ids) THEN RAISE EXCEPTION 'Document présent deux fois dans le règlement'; END IF;
    IF v_fourn THEN
      SELECT entreprise_id, fournisseur_id, total_ttc, montant_paye, numero_interne, statut, comptabilisee, type_document
        INTO v_ent, v_tiers, v_ttc, v_paye, v_nf, v_statut, v_compta, v_type FROM public.factures_achat WHERE id = v_fid FOR UPDATE;
    ELSE
      SELECT entreprise_id, client_id, total_ttc, montant_paye, numero, statut, comptabilisee, type_document
        INTO v_ent, v_tiers, v_ttc, v_paye, v_nf, v_statut, v_compta, v_type FROM public.factures WHERE id = v_fid FOR UPDATE;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
    IF v_ent <> x.entreprise_id OR v_tiers <> _tiers_id THEN RAISE EXCEPTION 'Document % d''un autre tiers', v_nf; END IF;
    IF NOT v_compta OR v_statut = 'annulee' THEN RAISE EXCEPTION 'Document % non comptabilisé ou annulé : règlement impossible', v_nf; END IF;
    IF v_m > round(v_ttc - v_paye, 2) THEN
      RAISE EXCEPTION '% % : % imputé pour % restant', CASE WHEN v_type = 'avoir' THEN 'Avoir' ELSE 'Facture' END, v_nf, v_m, round(v_ttc - v_paye, 2);
    END IF;
    v_ids := v_ids || v_fid; v_mt := v_mt || v_m; v_nums := v_nums || v_nf; v_avoirs := v_avoirs || (v_type = 'avoir');
    v_net := v_net + CASE WHEN v_type = 'avoir' THEN -v_m ELSE v_m END;
  END LOOP;
  IF coalesce(array_length(v_ids, 1), 0) = 0 AND v_acompte = 0 THEN RAISE EXCEPTION 'Aucun montant à régler'; END IF;
  v_net := v_net + v_acompte;
  IF v_net <> 0 THEN
    v_treso := trim(coalesce(_compte_tresorerie, ''));
    IF v_treso !~ '^5[2-7][0-9]*$' THEN
      RAISE EXCEPTION 'Compte de trésorerie attendu (52 banque, 55 monnaie électronique, 57 caisse…) : %', _compte_tresorerie;
    END IF;
    v_jnl := CASE WHEN v_treso LIKE '57%' THEN 'CA' ELSE 'BQ' END;
  ELSE
    v_treso := NULL; v_jnl := 'OD';
  END IF;

  SELECT count(*) + 1 INTO v_n FROM public.reglements_tiers
   WHERE entreprise_id = x.entreprise_id AND sens = _sens AND date_part('year', date_reglement) = date_part('year', _date);
  LOOP
    v_num := CASE WHEN v_fourn THEN 'RF-' ELSE 'RC-' END || to_char(_date, 'YYYY') || '-' || lpad(v_n::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.reglements_tiers WHERE entreprise_id = x.entreprise_id AND numero = v_num);
    v_n := v_n + 1;
  END LOOP;

  FOR k IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
    -- Facture fournisseur : débit 401 ; avoir fournisseur : crédit 401 ; facture client : crédit 411 ; avoir client : débit 411.
    v_debit_tiers := v_fourn <> v_avoirs[k];
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', t.compte, 'compte_auxiliaire', t.auxiliaire, 'auxiliaire_libelle', t.aux_libelle,
      'intitule', CASE WHEN v_fourn THEN 'Fournisseur ' ELSE 'Client ' END || t.nom,
      'libelle', v_num || ' — ' || CASE WHEN v_avoirs[k] THEN 'avoir ' ELSE 'facture ' END || v_nums[k],
      'debit', CASE WHEN v_debit_tiers THEN v_mt[k] ELSE 0 END, 'credit', CASE WHEN v_debit_tiers THEN 0 ELSE v_mt[k] END));
  END LOOP;
  IF v_acompte > 0 THEN
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', t.avance, 'compte_auxiliaire', t.auxiliaire, 'auxiliaire_libelle', t.aux_libelle,
      'intitule', CASE WHEN v_fourn THEN 'Fournisseurs, avances versées ' ELSE 'Clients, avances reçues ' END || t.nom, 'libelle', v_num || ' — acompte',
      'debit', CASE WHEN v_fourn THEN v_acompte ELSE 0 END, 'credit', CASE WHEN v_fourn THEN 0 ELSE v_acompte END));
  END IF;
  IF v_net <> 0 THEN
    -- Fournisseur : net positif = sortie (crédit trésorerie) ; client : net positif = entrée (débit trésorerie).
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', v_treso, 'intitule', 'Trésorerie',
      'libelle', v_num || ' — ' || t.nom || coalesce(' — ' || nullif(trim(_reference), ''), ''),
      'debit', CASE WHEN (v_fourn AND v_net < 0) OR (NOT v_fourn AND v_net > 0) THEN abs(v_net) ELSE 0 END,
      'credit', CASE WHEN (v_fourn AND v_net > 0) OR (NOT v_fourn AND v_net < 0) THEN abs(v_net) ELSE 0 END));
  END IF;
  v_ecr := public.fn_creer_ecriture(x.entreprise_id, x.id, v_jnl, _date,
    CASE WHEN v_net = 0 THEN 'Compensation ' WHEN v_fourn AND v_net > 0 THEN 'Règlement fournisseur ' WHEN v_fourn THEN 'Remboursement fournisseur '
         WHEN v_net > 0 THEN 'Encaissement client ' ELSE 'Remboursement client ' END || t.nom || coalesce(' — ' || nullif(trim(_reference), ''), ''),
    v_lignes, v_num, 'validee', 'reglement_' || _sens);

  INSERT INTO public.reglements_tiers (entreprise_id, exercice_id, sens, fournisseur_id, client_id, numero, date_reglement, compte_tresorerie,
    journal_code, mode, reference, montant, acompte, compte_tiers, ecriture_id, journal_acompte_id)
  VALUES (x.entreprise_id, x.id, _sens, CASE WHEN v_fourn THEN _tiers_id END, CASE WHEN v_fourn THEN NULL ELSE _tiers_id END, v_num, _date,
    v_treso, v_jnl, CASE WHEN v_net = 0 THEN 'Compensation' ELSE nullif(trim(_mode), '') END, nullif(trim(_reference), ''), v_net, v_acompte, t.compte, v_ecr,
    CASE WHEN v_acompte > 0 THEN (SELECT id FROM public.journal WHERE ecriture_id = v_ecr AND compte = t.avance LIMIT 1) END)
  RETURNING id INTO v_reg;

  FOR k IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
    INSERT INTO public.reglements_tiers_imputations (reglement_id, entreprise_id, facture_achat_id, facture_id, montant, date_imputation, origine, ecriture_id, journal_id)
    VALUES (v_reg, x.entreprise_id, CASE WHEN v_fourn THEN v_ids[k] END, CASE WHEN v_fourn THEN NULL ELSE v_ids[k] END, v_mt[k], _date, 'reglement', v_ecr,
      (SELECT id FROM public.journal WHERE ecriture_id = v_ecr AND compte = t.compte
         AND libelle = v_num || ' — ' || CASE WHEN v_avoirs[k] THEN 'avoir ' ELSE 'facture ' END || v_nums[k] LIMIT 1));
    v_lettres := v_lettres + public.reglement_maj_facture(_sens, v_ids[k], v_mt[k]);
  END LOOP;
  RETURN jsonb_build_object('reglement', v_reg, 'numero', v_num, 'ecriture', v_ecr, 'journal', v_jnl,
    'total', v_net, 'acompte', v_acompte, 'factures', coalesce(array_length(v_ids, 1), 0), 'lettrees', v_lettres);
END $function$;

-- Un acompte ne s'impute que sur une facture (pas sur un avoir).
DO $$
DECLARE d text := pg_get_functiondef('public.fn_imputer_acompte_tiers'::regproc);
  a text := '  IF NOT v_compta OR v_statut = ''annulee'' THEN RAISE EXCEPTION ''Facture % non comptabilisée ou annulée'', v_nf; END IF;';
BEGIN
  IF position('Acompte imputable sur une facture' in d) > 0 THEN RETURN; END IF;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'fn_imputer_acompte_tiers : ancre introuvable'; END IF;
  d := replace(d, a, a || E'\n' ||
    '  IF EXISTS (SELECT 1 FROM public.factures_achat WHERE id = _facture_id AND type_document = ''avoir'') OR EXISTS (SELECT 1 FROM public.factures WHERE id = _facture_id AND type_document = ''avoir'') THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Acompte imputable sur une facture uniquement (pas sur un avoir)'';' || E'\n' ||
    '  END IF;');
  EXECUTE d;
END $$;

REVOKE ALL ON FUNCTION public.reglement_compte_tiers(text, uuid), public.reglement_maj_facture(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_comptabiliser_facture_vente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_comptabiliser_facture_vente(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_regler_tiers(uuid, text, uuid, date, text, text, text, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_regler_tiers(uuid, text, uuid, date, text, text, text, jsonb, numeric) TO authenticated;
