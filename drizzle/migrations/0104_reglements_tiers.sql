-- 0104 — Règlements fournisseurs et clients côté serveur : une transaction par règlement (écriture BQ/CA, imputation
-- sur une ou plusieurs factures, contrôle du reste dû, statut de paiement), acomptes 4091/4191 et leur imputation,
-- lettrage automatique des factures soldées, annulation par contre-passation.
-- Additive : deux tables, une colonne (factures.montant_paye), un déclencheur de garde, six fonctions ;
-- fn_contrepasser_ecriture refuse l'extourne directe d'un règlement géré ici. Retour : docs/rollback/0104_reglements_tiers_down.sql

ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS montant_paye numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.reglements_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid NOT NULL REFERENCES public.exercices(id) ON DELETE RESTRICT,
  sens text NOT NULL CHECK (sens IN ('fournisseur', 'client')),
  fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  numero text NOT NULL,
  date_reglement date NOT NULL,
  compte_tresorerie text NOT NULL,
  journal_code text NOT NULL,
  mode text,
  reference text,
  montant numeric NOT NULL CHECK (montant > 0),
  acompte numeric NOT NULL DEFAULT 0 CHECK (acompte >= 0),
  compte_tiers text NOT NULL,
  ecriture_id uuid REFERENCES public.ecritures(id) ON DELETE RESTRICT,
  journal_acompte_id uuid,
  annule_le timestamptz,
  motif_annulation text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reglements_tiers_sens_tiers CHECK ((sens = 'fournisseur' AND fournisseur_id IS NOT NULL AND client_id IS NULL)
    OR (sens = 'client' AND client_id IS NOT NULL AND fournisseur_id IS NULL)),
  CONSTRAINT reglements_tiers_numero UNIQUE (entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.reglements_tiers_imputations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reglement_id uuid NOT NULL REFERENCES public.reglements_tiers(id) ON DELETE RESTRICT,
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  facture_achat_id uuid REFERENCES public.factures_achat(id) ON DELETE RESTRICT,
  facture_id uuid REFERENCES public.factures(id) ON DELETE RESTRICT,
  montant numeric NOT NULL CHECK (montant > 0),
  date_imputation date NOT NULL,
  origine text NOT NULL CHECK (origine IN ('reglement', 'acompte')),
  ecriture_id uuid REFERENCES public.ecritures(id) ON DELETE RESTRICT,
  journal_id uuid,
  journal_avance_id uuid,
  annule_le timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reglements_imputations_une_facture CHECK (num_nonnulls(facture_achat_id, facture_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_reg_tiers_ent ON public.reglements_tiers(entreprise_id, sens);
CREATE INDEX IF NOT EXISTS idx_reg_imp_reg ON public.reglements_tiers_imputations(reglement_id);
CREATE INDEX IF NOT EXISTS idx_reg_imp_fa ON public.reglements_tiers_imputations(facture_achat_id) WHERE facture_achat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reg_imp_fv ON public.reglements_tiers_imputations(facture_id) WHERE facture_id IS NOT NULL;

-- Lecture seule pour l'application ; écriture exclusivement par les fonctions ci-dessous.
ALTER TABLE public.reglements_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglements_tiers_imputations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reglements_tiers_sel ON public.reglements_tiers FOR SELECT TO authenticated USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY reglements_tiers_mfa ON public.reglements_tiers AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
CREATE POLICY reglements_imp_sel ON public.reglements_tiers_imputations FOR SELECT TO authenticated USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY reglements_imp_mfa ON public.reglements_tiers_imputations AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
GRANT SELECT ON public.reglements_tiers, public.reglements_tiers_imputations TO authenticated;

-- Montant payé et statut de paiement des factures tenus par les règlements (plus de mise à jour directe par l'application).
CREATE OR REPLACE FUNCTION public.factures_paiement_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.montant_paye := 0;
    IF NEW.statut IN ('payee', 'payee_partiel') THEN RAISE EXCEPTION 'Statut de paiement tenu par les règlements'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.montant_paye IS DISTINCT FROM OLD.montant_paye THEN RAISE EXCEPTION 'Montant payé tenu par les règlements : enregistrez un règlement'; END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut AND (NEW.statut IN ('payee', 'payee_partiel') OR OLD.statut IN ('payee', 'payee_partiel')) THEN
    RAISE EXCEPTION 'Statut de paiement tenu par les règlements';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS factures_paiement_guard ON public.factures;
CREATE TRIGGER factures_paiement_guard BEFORE INSERT OR UPDATE ON public.factures FOR EACH ROW EXECUTE FUNCTION public.factures_paiement_guard();
DROP TRIGGER IF EXISTS factures_achat_paiement_guard ON public.factures_achat;
CREATE TRIGGER factures_achat_paiement_guard BEFORE INSERT OR UPDATE ON public.factures_achat FOR EACH ROW EXECUTE FUNCTION public.factures_paiement_guard();

-- Compte du tiers, identique à celui des factures : fournisseur = compte_tiers + 4 chiffres du code (fn_comptabiliser_facture_achat),
-- client = compte_tiers + code sur 12 caractères (comptabilisation des ventes) ; avance 4091… / 4191… (pas de compensation).
-- Compte auxiliaire : code fournisseur (comme la facture d'achat), aucun pour les clients (comme la facture de vente).
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

-- Lettrage d'un groupe de lignes de journal s'il est soldé, sur un seul exercice et non déjà lettré. Renvoie 1 si lettré.
CREATE OR REPLACE FUNCTION public.reglement_lettrer(_ids uuid[])
 RETURNS int
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ent uuid; v_ex uuid; v_nb int; v_exs int; v_solde numeric; v_code text;
BEGIN
  IF _ids IS NULL OR array_position(_ids, NULL) IS NOT NULL OR cardinality(_ids) < 2 THEN RETURN 0; END IF;
  SELECT count(*), count(DISTINCT exercice_id), sum(round(debit * 100) - round(credit * 100)), min(entreprise_id::text)::uuid, min(exercice_id::text)::uuid
    INTO v_nb, v_exs, v_solde, v_ent, v_ex FROM public.journal WHERE id = ANY(_ids);
  IF v_nb <> cardinality(_ids) OR v_exs <> 1 OR v_solde <> 0 THEN RETURN 0; END IF;
  IF (SELECT count(DISTINCT compte || '|' || coalesce(compte_auxiliaire, '')) FROM public.journal WHERE id = ANY(_ids)) <> 1 THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.lettrage WHERE journal_entry_id = ANY(_ids)) THEN RETURN 0; END IF;
  SELECT 'R' || lpad((coalesce(max(substring(code_lettrage FROM '^R(\d+)$')::int), 0) + 1)::text, 4, '0') INTO v_code
    FROM public.lettrage WHERE entreprise_id = v_ent AND exercice_id = v_ex;
  INSERT INTO public.lettrage (entreprise_id, exercice_id, compte, code_lettrage, journal_entry_id, montant, date_lettrage)
  SELECT v_ent, v_ex, j.compte, v_code, j.id, j.debit - j.credit, current_date FROM public.journal j WHERE j.id = ANY(_ids);
  RETURN 1;
END $function$;

-- Met à jour montant payé et statut d'une facture ; si elle est soldée, lettre sa ligne tiers avec ses règlements. Renvoie 1 si lettrée.
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

-- Règlement d'un tiers : imputations sur ses factures comptabilisées (reste dû contrôlé) et/ou acompte, en une écriture
-- BQ (ou CA pour un compte 57), une ligne tiers par facture ; numéro RF-/RC-<année>-NNNN ; lettrage des factures soldées.
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

-- Imputation (totale ou partielle) d'un acompte sur une facture du même tiers : écriture OD 401/4091 (ou 4191/411),
-- pièce <n° du règlement>-IMP ; lettrage de la facture si soldée, et de l'avance une fois l'acompte entièrement imputé.
CREATE OR REPLACE FUNCTION public.fn_imputer_acompte_tiers(_reglement_id uuid, _facture_id uuid, _montant numeric, _date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.reglements_tiers%ROWTYPE; x public.exercices%ROWTYPE; t record; v_m numeric := round(coalesce(_montant, 0), 2); v_reste numeric;
  v_ent uuid; v_tiers uuid; v_ttc numeric; v_paye numeric; v_nf text; v_statut text; v_compta boolean; v_ecr uuid; v_lignes jsonb; v_lib text;
  v_fourn boolean; v_imp uuid; v_lettres int := 0; v_ids uuid[];
BEGIN
  SELECT * INTO r FROM public.reglements_tiers WHERE id = _reglement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Règlement introuvable'; END IF;
  IF NOT public.can_write_entreprise(r.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF r.annule_le IS NOT NULL THEN RAISE EXCEPTION 'Règlement % annulé', r.numero; END IF;
  v_fourn := r.sens = 'fournisseur';
  v_reste := r.acompte - coalesce((SELECT sum(montant) FROM public.reglements_tiers_imputations
    WHERE reglement_id = r.id AND origine = 'acompte' AND annule_le IS NULL), 0);
  IF v_m <= 0 OR v_m > v_reste THEN RAISE EXCEPTION 'Acompte % : % disponible', r.numero, v_reste; END IF;
  SELECT * INTO x FROM public.exercices WHERE entreprise_id = r.entreprise_id AND _date BETWEEN date_debut AND date_fin;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucun exercice ne couvre le %', _date; END IF;
  IF _date < r.date_reglement THEN RAISE EXCEPTION 'Imputation antérieure au versement de l''acompte'; END IF;
  IF v_fourn THEN
    SELECT entreprise_id, fournisseur_id, total_ttc, montant_paye, numero_interne, statut, comptabilisee
      INTO v_ent, v_tiers, v_ttc, v_paye, v_nf, v_statut, v_compta FROM public.factures_achat WHERE id = _facture_id FOR UPDATE;
  ELSE
    SELECT entreprise_id, client_id, total_ttc, montant_paye, numero, statut, comptabilisee
      INTO v_ent, v_tiers, v_ttc, v_paye, v_nf, v_statut, v_compta FROM public.factures WHERE id = _facture_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF v_ent <> r.entreprise_id OR v_tiers <> coalesce(r.fournisseur_id, r.client_id) THEN RAISE EXCEPTION 'Facture % d''un autre tiers', v_nf; END IF;
  IF NOT v_compta OR v_statut = 'annulee' THEN RAISE EXCEPTION 'Facture % non comptabilisée ou annulée', v_nf; END IF;
  IF v_m > round(v_ttc - v_paye, 2) THEN RAISE EXCEPTION 'Facture % : % imputé pour % restant dû', v_nf, v_m, round(v_ttc - v_paye, 2); END IF;
  SELECT * INTO t FROM public.reglement_compte_tiers(r.sens, coalesce(r.fournisseur_id, r.client_id));
  v_lib := 'Imputation acompte ' || r.numero || ' — facture ' || v_nf;
  v_lignes := jsonb_build_array(
    jsonb_build_object('compte', t.compte, 'compte_auxiliaire', t.auxiliaire, 'auxiliaire_libelle', t.aux_libelle, 'intitule', CASE WHEN v_fourn THEN 'Fournisseur ' ELSE 'Client ' END || t.nom, 'libelle', v_lib,
      'debit', CASE WHEN v_fourn THEN v_m ELSE 0 END, 'credit', CASE WHEN v_fourn THEN 0 ELSE v_m END),
    jsonb_build_object('compte', t.avance, 'compte_auxiliaire', t.auxiliaire, 'auxiliaire_libelle', t.aux_libelle, 'intitule', CASE WHEN v_fourn THEN 'Fournisseurs, avances versées ' ELSE 'Clients, avances reçues ' END || t.nom,
      'libelle', v_lib || ' (avance)', 'debit', CASE WHEN v_fourn THEN 0 ELSE v_m END, 'credit', CASE WHEN v_fourn THEN v_m ELSE 0 END));
  v_ecr := public.fn_creer_ecriture(r.entreprise_id, x.id, 'OD', _date, v_lib, v_lignes, r.numero || '-IMP', 'validee', 'reglement_' || r.sens);
  INSERT INTO public.reglements_tiers_imputations (reglement_id, entreprise_id, facture_achat_id, facture_id, montant, date_imputation, origine,
    ecriture_id, journal_id, journal_avance_id)
  VALUES (r.id, r.entreprise_id, CASE WHEN v_fourn THEN _facture_id END, CASE WHEN v_fourn THEN NULL ELSE _facture_id END, v_m, _date, 'acompte', v_ecr,
    (SELECT id FROM public.journal WHERE ecriture_id = v_ecr AND compte = t.compte LIMIT 1),
    (SELECT id FROM public.journal WHERE ecriture_id = v_ecr AND compte = t.avance LIMIT 1))
  RETURNING id INTO v_imp;
  v_lettres := public.reglement_maj_facture(r.sens, _facture_id, v_m);
  IF v_reste - v_m = 0 THEN
    SELECT array_agg(journal_avance_id) INTO v_ids FROM public.reglements_tiers_imputations
     WHERE reglement_id = r.id AND origine = 'acompte' AND annule_le IS NULL;
    v_lettres := v_lettres + public.reglement_lettrer(v_ids || r.journal_acompte_id);
  END IF;
  RETURN jsonb_build_object('imputation', v_imp, 'ecriture', v_ecr, 'reste_acompte', v_reste - v_m, 'lettrees', v_lettres);
END $function$;

-- Annulation d'un règlement (contre-passation de son écriture, factures remises à leur reste dû, lettrages défaits)
-- ou d'une imputation d'acompte (_imputation_id). Un acompte déjà imputé s'annule après ses imputations.
CREATE OR REPLACE FUNCTION public.fn_annuler_reglement_tiers(_reglement_id uuid, _imputation_id uuid, _motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.reglements_tiers%ROWTYPE; im public.reglements_tiers_imputations%ROWTYPE; v_ecr uuid; v_lignes uuid[]; v_ext uuid; v_n int := 0;
BEGIN
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif d''annulation obligatoire'; END IF;
  SELECT * INTO r FROM public.reglements_tiers WHERE id = _reglement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Règlement introuvable'; END IF;
  IF NOT public.can_write_entreprise(r.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF r.annule_le IS NOT NULL THEN RAISE EXCEPTION 'Règlement % déjà annulé', r.numero; END IF;
  IF _imputation_id IS NOT NULL THEN
    SELECT * INTO im FROM public.reglements_tiers_imputations WHERE id = _imputation_id AND reglement_id = r.id AND origine = 'acompte' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Imputation d''acompte introuvable'; END IF;
    IF im.annule_le IS NOT NULL THEN RAISE EXCEPTION 'Imputation déjà annulée'; END IF;
    v_ecr := im.ecriture_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.reglements_tiers_imputations WHERE reglement_id = r.id AND origine = 'acompte' AND annule_le IS NULL) THEN
      RAISE EXCEPTION 'Acompte % déjà imputé : annulez d''abord ses imputations', r.numero;
    END IF;
    v_ecr := r.ecriture_id;
  END IF;
  -- Lettrages touchant l'écriture annulée (et, pour une imputation, l'avance de l'acompte) : défaits en entier.
  SELECT array_agg(id) INTO v_lignes FROM public.journal WHERE ecriture_id = v_ecr;
  IF _imputation_id IS NOT NULL THEN v_lignes := v_lignes || r.journal_acompte_id; END IF;
  DELETE FROM public.lettrage l USING (SELECT DISTINCT entreprise_id, exercice_id, code_lettrage FROM public.lettrage WHERE journal_entry_id = ANY(v_lignes)) g
   WHERE l.entreprise_id = g.entreprise_id AND l.exercice_id = g.exercice_id AND l.code_lettrage = g.code_lettrage;
  PERFORM set_config('app.reglement_annulation', '1', true);
  v_ext := public.fn_contrepasser_ecriture(v_ecr, 'Annulation ' || r.numero || ' : ' || trim(_motif));
  PERFORM set_config('app.reglement_annulation', '', true);
  FOR im IN SELECT * FROM public.reglements_tiers_imputations WHERE ecriture_id = v_ecr AND annule_le IS NULL
             AND (_imputation_id IS NULL OR id = _imputation_id) LOOP
    UPDATE public.reglements_tiers_imputations SET annule_le = now() WHERE id = im.id;
    PERFORM public.reglement_maj_facture(r.sens, coalesce(im.facture_achat_id, im.facture_id), -im.montant);
    v_n := v_n + 1;
  END LOOP;
  IF _imputation_id IS NULL THEN UPDATE public.reglements_tiers SET annule_le = now(), motif_annulation = trim(_motif) WHERE id = r.id; END IF;
  RETURN jsonb_build_object('extourne', v_ext, 'factures', v_n);
END $function$;

-- L'extourne directe (journal) d'une écriture de règlement géré ici désynchroniserait les factures : passer par l'annulation.
DO $$
DECLARE d text := pg_get_functiondef('public.fn_contrepasser_ecriture'::regproc);
  ancre text := '  IF e.contrepasse_par IS NOT NULL THEN RAISE EXCEPTION ''Ecriture deja contre-passee''; END IF;';
BEGIN
  IF position('app.reglement_annulation' in d) > 0 THEN RETURN; END IF;
  IF position(ancre in d) = 0 THEN RAISE EXCEPTION 'fn_contrepasser_ecriture : ancre introuvable'; END IF;
  d := replace(d, ancre, ancre || E'\n' ||
    '  IF coalesce(current_setting(''app.reglement_annulation'', true), '''') <> ''1'' AND (EXISTS (SELECT 1 FROM public.reglements_tiers WHERE ecriture_id = _ecriture_id)' || E'\n' ||
    '     OR EXISTS (SELECT 1 FROM public.reglements_tiers_imputations WHERE ecriture_id = _ecriture_id)) THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Ecriture de reglement : annulez le reglement depuis l''''ecran des reglements (factures remises a jour)'';' || E'\n' ||
    '  END IF;');
  EXECUTE d;
END $$;

REVOKE ALL ON FUNCTION public.reglement_compte_tiers(text, uuid), public.reglement_lettrer(uuid[]), public.reglement_maj_facture(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_regler_tiers(uuid, text, uuid, date, text, text, text, jsonb, numeric), public.fn_imputer_acompte_tiers(uuid, uuid, numeric, date),
  public.fn_annuler_reglement_tiers(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_regler_tiers(uuid, text, uuid, date, text, text, text, jsonb, numeric), public.fn_imputer_acompte_tiers(uuid, uuid, numeric, date),
  public.fn_annuler_reglement_tiers(uuid, uuid, text) TO authenticated;
