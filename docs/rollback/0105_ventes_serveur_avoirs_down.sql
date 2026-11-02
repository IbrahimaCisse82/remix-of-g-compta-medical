-- Retour de 0105 : rétablit les fonctions de 0104, retire les avoirs et la comptabilisation serveur des ventes.
-- Préalable : contre-passer les avoirs et compensations éventuellement passés (les colonnes type_document sont supprimées).
DROP TRIGGER IF EXISTS factures_vente_guard ON public.factures;
DROP TRIGGER IF EXISTS facture_lignes_vente_guard ON public.facture_lignes;
DROP FUNCTION IF EXISTS public.factures_vente_guard();
DROP TRIGGER IF EXISTS factures_achat_compta_guard ON public.factures_achat;
DROP FUNCTION IF EXISTS public.factures_achat_compta_guard();
DROP FUNCTION IF EXISTS public.fn_comptabiliser_facture_vente(uuid);
-- fn_comptabiliser_facture_achat : retrait exact des deux blocs ajoutés.
DO $$
DECLARE d text := pg_get_functiondef('public.fn_comptabiliser_facture_achat'::regproc);
  a1 text := '  IF NOT EXISTS (SELECT 1 FROM public.factures_achat_lignes WHERE facture_id = f.id) THEN RAISE EXCEPTION ''Facture sans ligne''; END IF;';
  a2 text := '  v_ecr := public.fn_creer_ecriture(f.entreprise_id, f.exercice_id, ''AC'', f.date_facture,';
BEGIN
  d := replace(d, a1 || E'\n' || $x$  IF f.type_document = 'avoir' THEN
    IF EXISTS (SELECT 1 FROM public.factures_achat_lignes WHERE facture_id = f.id AND (nature <> 'charge' OR commande_ligne_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Avoir : lignes de nature Charge uniquement (retours de stock et sorties d''immobilisations dans leurs modules)';
    END IF;
    IF f.facture_origine_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.factures_achat o WHERE o.id = f.facture_origine_id
       AND o.fournisseur_id = f.fournisseur_id AND o.type_document = 'facture' AND o.comptabilisee) THEN
      RAISE EXCEPTION 'Facture d''origine invalide (même fournisseur, facture comptabilisée)';
    END IF;
  END IF;$x$, a1);
  d := replace(d, $x$  IF f.type_document = 'avoir' THEN
    SELECT jsonb_agg((e - 'debit' - 'credit') || jsonb_build_object('debit', e->'credit', 'credit', e->'debit')) INTO v_lignes FROM jsonb_array_elements(v_lignes) e;
  END IF;
$x$ || a2, a2);
  IF position('type_document' in d) > 0 THEN RAISE EXCEPTION 'Retrait incomplet de fn_comptabiliser_facture_achat'; END IF;
  EXECUTE d;
END $$;
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
    SELECT left(c.compte_tiers || c.code, 12), c.nom, c.entreprise_id INTO compte, nom, entreprise_id FROM public.clients c WHERE c.id = _tiers_id;
  END IF;
  IF compte IS NULL THEN RAISE EXCEPTION 'Tiers introuvable'; END IF;
  avance := CASE WHEN _sens = 'fournisseur' THEN '4091' ELSE '4191' END || substr(compte, 4);
END $function$;
CREATE OR REPLACE FUNCTION public.reglement_maj_facture(_sens text, _facture_id uuid, _delta numeric)
 RETURNS int
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ttc numeric; v_paye numeric; v_ent uuid; v_piece text; v_tiers uuid; v_jnl text; t record; v_fl uuid; v_ids uuid[];
BEGIN
  IF _sens = 'fournisseur' THEN
    UPDATE public.factures_achat SET montant_paye = round(montant_paye + _delta, 2),
      statut = CASE WHEN round(montant_paye + _delta, 2) >= total_ttc THEN 'payee' WHEN round(montant_paye + _delta, 2) > 0 THEN 'payee_partiel' ELSE 'validee' END
     WHERE id = _facture_id RETURNING total_ttc, montant_paye, entreprise_id, numero_interne, fournisseur_id INTO v_ttc, v_paye, v_ent, v_piece, v_tiers;
    v_jnl := 'AC';
  ELSE
    UPDATE public.factures SET montant_paye = round(montant_paye + _delta, 2),
      statut = CASE WHEN round(montant_paye + _delta, 2) >= total_ttc THEN 'payee' WHEN round(montant_paye + _delta, 2) > 0 THEN 'payee_partiel' ELSE 'validee' END
     WHERE id = _facture_id RETURNING total_ttc, montant_paye, entreprise_id, numero, client_id INTO v_ttc, v_paye, v_ent, v_piece, v_tiers;
    v_jnl := 'VT';
  END IF;
  IF v_paye < 0 THEN RAISE EXCEPTION 'Montant payé négatif'; END IF;
  IF v_paye < v_ttc THEN RETURN 0; END IF;
  SELECT * INTO t FROM public.reglement_compte_tiers(_sens, v_tiers);
  SELECT j.id INTO v_fl FROM public.journal j JOIN public.ecritures e ON e.id = j.ecriture_id
   WHERE j.entreprise_id = v_ent AND j.piece = v_piece AND j.journal_code = v_jnl AND j.compte = t.compte AND e.contrepasse_par IS NULL
     AND (CASE WHEN _sens = 'fournisseur' THEN j.credit - j.debit ELSE j.debit - j.credit END) = v_ttc
   ORDER BY j.created_at DESC LIMIT 1;
  IF v_fl IS NULL THEN RETURN 0; END IF;
  SELECT array_agg(i.journal_id) INTO v_ids FROM public.reglements_tiers_imputations i
   WHERE (i.facture_achat_id = _facture_id OR i.facture_id = _facture_id) AND i.annule_le IS NULL;
  RETURN public.reglement_lettrer(v_ids || v_fl);
END $function$;
CREATE OR REPLACE FUNCTION public.fn_regler_tiers(_exercice_id uuid, _sens text, _tiers_id uuid, _date date, _compte_tresorerie text,
  _mode text, _reference text, _imputations jsonb, _acompte numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; t record; v_jnl text; v_num text; v_n int; v_reg uuid; v_ecr uuid; v_lignes jsonb := '[]'::jsonb;
  v_total numeric := 0; v_acompte numeric := round(coalesce(_acompte, 0), 2); i jsonb; v_fid uuid; v_m numeric; v_ttc numeric; v_paye numeric;
  v_ent uuid; v_tiers uuid; v_nf text; v_statut text; v_compta boolean; v_ids uuid[] := '{}'; v_mt numeric[] := '{}'; v_nums text[] := '{}';
  k int; v_lettres int := 0; v_fourn boolean := _sens = 'fournisseur';
BEGIN
  IF _sens NOT IN ('fournisseur', 'client') THEN RAISE EXCEPTION 'Sens de règlement inconnu'; END IF;
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_write_entreprise(x.entreprise_id) THEN RAISE EXCEPTION 'Règlement réservé à l''administrateur et au comptable'; END IF;
  IF _date IS NULL OR _date < x.date_debut OR _date > x.date_fin THEN RAISE EXCEPTION 'Date % hors de l''exercice %', _date, x.annee; END IF;
  IF coalesce(_compte_tresorerie, '') !~ '^5[2-7][0-9]*$' THEN
    RAISE EXCEPTION 'Compte de trésorerie attendu (52 banque, 55 monnaie électronique, 57 caisse…) : %', _compte_tresorerie;
  END IF;
  IF v_acompte < 0 THEN RAISE EXCEPTION 'Acompte négatif'; END IF;
  SELECT * INTO t FROM public.reglement_compte_tiers(_sens, _tiers_id);
  IF t.entreprise_id <> x.entreprise_id THEN RAISE EXCEPTION 'Tiers hors de ce dossier'; END IF;
  v_jnl := CASE WHEN _compte_tresorerie LIKE '57%' THEN 'CA' ELSE 'BQ' END;

  FOR i IN SELECT * FROM jsonb_array_elements(coalesce(_imputations, '[]'::jsonb)) LOOP
    v_fid := (i->>'facture_id')::uuid; v_m := round(coalesce((i->>'montant')::numeric, 0), 2);
    IF v_m < 0 THEN RAISE EXCEPTION 'Montant négatif'; END IF;
    IF v_m = 0 THEN CONTINUE; END IF;
    IF v_fid = ANY(v_ids) THEN RAISE EXCEPTION 'Facture présente deux fois dans le règlement'; END IF;
    IF v_fourn THEN
      SELECT entreprise_id, fournisseur_id, total_ttc, montant_paye, numero_interne, statut, comptabilisee
        INTO v_ent, v_tiers, v_ttc, v_paye, v_nf, v_statut, v_compta FROM public.factures_achat WHERE id = v_fid FOR UPDATE;
    ELSE
      SELECT entreprise_id, client_id, total_ttc, montant_paye, numero, statut, comptabilisee
        INTO v_ent, v_tiers, v_ttc, v_paye, v_nf, v_statut, v_compta FROM public.factures WHERE id = v_fid FOR UPDATE;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
    IF v_ent <> x.entreprise_id OR v_tiers <> _tiers_id THEN RAISE EXCEPTION 'Facture % d''un autre tiers', v_nf; END IF;
    IF NOT v_compta OR v_statut = 'annulee' THEN RAISE EXCEPTION 'Facture % non comptabilisée ou annulée : règlement impossible', v_nf; END IF;
    IF v_m > round(v_ttc - v_paye, 2) THEN RAISE EXCEPTION 'Facture % : % réglé pour % restant dû', v_nf, v_m, round(v_ttc - v_paye, 2); END IF;
    v_ids := v_ids || v_fid; v_mt := v_mt || v_m; v_nums := v_nums || v_nf; v_total := v_total + v_m;
  END LOOP;
  IF v_total + v_acompte <= 0 THEN RAISE EXCEPTION 'Aucun montant à régler'; END IF;

  SELECT count(*) + 1 INTO v_n FROM public.reglements_tiers
   WHERE entreprise_id = x.entreprise_id AND sens = _sens AND date_part('year', date_reglement) = date_part('year', _date);
  LOOP
    v_num := CASE WHEN v_fourn THEN 'RF-' ELSE 'RC-' END || to_char(_date, 'YYYY') || '-' || lpad(v_n::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.reglements_tiers WHERE entreprise_id = x.entreprise_id AND numero = v_num);
    v_n := v_n + 1;
  END LOOP;

  FOR k IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', t.compte, 'compte_auxiliaire', t.auxiliaire, 'auxiliaire_libelle', t.aux_libelle,
      'intitule', CASE WHEN v_fourn THEN 'Fournisseur ' ELSE 'Client ' END || t.nom, 'libelle', v_num || ' — facture ' || v_nums[k],
      'debit', CASE WHEN v_fourn THEN v_mt[k] ELSE 0 END, 'credit', CASE WHEN v_fourn THEN 0 ELSE v_mt[k] END));
  END LOOP;
  IF v_acompte > 0 THEN
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', t.avance, 'compte_auxiliaire', t.auxiliaire, 'auxiliaire_libelle', t.aux_libelle,
      'intitule', CASE WHEN v_fourn THEN 'Fournisseurs, avances versées ' ELSE 'Clients, avances reçues ' END || t.nom, 'libelle', v_num || ' — acompte',
      'debit', CASE WHEN v_fourn THEN v_acompte ELSE 0 END, 'credit', CASE WHEN v_fourn THEN 0 ELSE v_acompte END));
  END IF;
  v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', _compte_tresorerie, 'intitule', 'Trésorerie',
    'libelle', v_num || ' — ' || t.nom || coalesce(' — ' || nullif(trim(_reference), ''), ''),
    'debit', CASE WHEN v_fourn THEN 0 ELSE v_total + v_acompte END, 'credit', CASE WHEN v_fourn THEN v_total + v_acompte ELSE 0 END));
  v_ecr := public.fn_creer_ecriture(x.entreprise_id, x.id, v_jnl, _date,
    CASE WHEN v_fourn THEN 'Règlement fournisseur ' ELSE 'Encaissement client ' END || t.nom || coalesce(' — ' || nullif(trim(_reference), ''), ''),
    v_lignes, v_num, 'validee', 'reglement_' || _sens);

  INSERT INTO public.reglements_tiers (entreprise_id, exercice_id, sens, fournisseur_id, client_id, numero, date_reglement, compte_tresorerie,
    journal_code, mode, reference, montant, acompte, compte_tiers, ecriture_id, journal_acompte_id)
  VALUES (x.entreprise_id, x.id, _sens, CASE WHEN v_fourn THEN _tiers_id END, CASE WHEN v_fourn THEN NULL ELSE _tiers_id END, v_num, _date,
    _compte_tresorerie, v_jnl, nullif(trim(_mode), ''), nullif(trim(_reference), ''), v_total + v_acompte, v_acompte, t.compte, v_ecr,
    CASE WHEN v_acompte > 0 THEN (SELECT id FROM public.journal WHERE ecriture_id = v_ecr AND compte = t.avance LIMIT 1) END)
  RETURNING id INTO v_reg;

  FOR k IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
    INSERT INTO public.reglements_tiers_imputations (reglement_id, entreprise_id, facture_achat_id, facture_id, montant, date_imputation, origine, ecriture_id, journal_id)
    VALUES (v_reg, x.entreprise_id, CASE WHEN v_fourn THEN v_ids[k] END, CASE WHEN v_fourn THEN NULL ELSE v_ids[k] END, v_mt[k], _date, 'reglement', v_ecr,
      (SELECT id FROM public.journal WHERE ecriture_id = v_ecr AND compte = t.compte AND libelle = v_num || ' — facture ' || v_nums[k] LIMIT 1));
    v_lettres := v_lettres + public.reglement_maj_facture(_sens, v_ids[k], v_mt[k]);
  END LOOP;
  RETURN jsonb_build_object('reglement', v_reg, 'numero', v_num, 'ecriture', v_ecr, 'journal', v_jnl,
    'total', v_total + v_acompte, 'acompte', v_acompte, 'factures', coalesce(array_length(v_ids, 1), 0), 'lettrees', v_lettres);
END $function$;
DO $$
DECLARE d text := pg_get_functiondef('public.fn_imputer_acompte_tiers'::regproc); i int; j int;
BEGIN
  i := position('  IF EXISTS (SELECT 1 FROM public.factures_achat WHERE id = _facture_id AND type_document' in d);
  IF i = 0 THEN RETURN; END IF;
  j := position('  END IF;' in substr(d, i)) + i + length('  END IF;');
  EXECUTE substr(d, 1, i - 1) || substr(d, j);
END $$;
ALTER TABLE public.reglements_tiers ALTER COLUMN compte_tresorerie SET NOT NULL; -- échoue s'il existe des compensations : les annuler avant
ALTER TABLE public.reglements_tiers ADD CONSTRAINT reglements_tiers_montant_check CHECK (montant > 0);
ALTER TABLE public.factures DROP COLUMN IF EXISTS piece_journal;
ALTER TABLE public.factures DROP COLUMN IF EXISTS facture_origine_id;
ALTER TABLE public.factures DROP COLUMN IF EXISTS type_document;
ALTER TABLE public.factures_achat DROP COLUMN IF EXISTS facture_origine_id;
ALTER TABLE public.factures_achat DROP COLUMN IF EXISTS type_document;
