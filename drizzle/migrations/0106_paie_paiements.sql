-- 0106 — Paiement des salaires et des cotisations d'une période de paie, côté serveur.
-- Pour une période dont l'écriture PAIE-<période> est en vigueur : reste dû par nature (salaires 422, IR/TRIMF 4471,
-- CFCE 4472, IPRES 4313, CSS 4311/4312, IPM 4333) ; paiement total ou partiel en une écriture BQ/CA (pièce PP-<année>-NNNN),
-- montant borné au reste dû ; lettrage automatique d'un compte soldé avec la ligne de paie ; annulation par contre-passation.
-- Additive : une table, quatre fonctions ; fn_contrepasser_ecriture refuse l'extourne directe d'un paiement de paie et celle
-- d'une écriture de paie déjà (partiellement) payée. Retour : docs/rollback/0106_paie_paiements_down.sql

CREATE TABLE IF NOT EXISTS public.paie_paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid NOT NULL REFERENCES public.exercices(id) ON DELETE RESTRICT,
  periode text NOT NULL CHECK (periode ~ '^\d{4}-\d{2}$'),
  nature text NOT NULL CHECK (nature IN ('salaires', 'ir', 'cfce', 'ipres', 'css', 'ipm')),
  numero text NOT NULL,
  date_paiement date NOT NULL,
  compte_tresorerie text NOT NULL,
  journal_code text NOT NULL,
  mode text,
  reference text,
  montant numeric NOT NULL CHECK (montant > 0),
  repartition jsonb NOT NULL,
  ecriture_id uuid REFERENCES public.ecritures(id) ON DELETE RESTRICT,
  annule_le timestamptz,
  motif_annulation text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paie_paiements_numero UNIQUE (entreprise_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_paie_paiements_periode ON public.paie_paiements(entreprise_id, periode);
ALTER TABLE public.paie_paiements ENABLE ROW LEVEL SECURITY;
CREATE POLICY paie_paiements_sel ON public.paie_paiements FOR SELECT TO authenticated USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY paie_paiements_mfa ON public.paie_paiements AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
GRANT SELECT ON public.paie_paiements TO authenticated;

-- Comptes de chaque nature, dans l'ordre d'imputation d'un paiement partiel.
CREATE OR REPLACE FUNCTION public.paie_comptes_nature(_nature text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE _nature WHEN 'salaires' THEN ARRAY['422'] WHEN 'ir' THEN ARRAY['4471'] WHEN 'cfce' THEN ARRAY['4472']
    WHEN 'ipres' THEN ARRAY['4313'] WHEN 'css' THEN ARRAY['4311', '4312'] WHEN 'ipm' THEN ARRAY['4333'] END;
$function$;

-- Dû, payé et reste par nature et par compte pour une période (écriture PAIE-<période> en vigueur).
CREATE OR REPLACE FUNCTION public.fn_paie_restes(_entreprise_id uuid, _periode text)
 RETURNS TABLE(nature text, compte text, du numeric, paye numeric, reste numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _entreprise_id NOT IN (SELECT public.get_user_entreprise_ids(auth.uid())) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY
  WITH ecr AS (
    SELECT e.id FROM public.ecritures e WHERE e.entreprise_id = _entreprise_id AND e.journal_code = 'PA' AND e.piece = 'PAIE-' || _periode
       AND e.contrepasse_par IS NULL AND coalesce(e.origine, '') <> 'contrepassation' ORDER BY e.created_at DESC LIMIT 1),
  natures AS (SELECT n, unnest(public.paie_comptes_nature(n)) AS c FROM unnest(ARRAY['salaires', 'ir', 'cfce', 'ipres', 'css', 'ipm']) n),
  dus AS (SELECT l.compte AS c, sum(l.credit - l.debit) AS m FROM public.ecriture_lignes l JOIN ecr ON ecr.id = l.ecriture_id GROUP BY l.compte),
  payes AS (SELECT r.key AS c, sum((r.value)::numeric) AS m FROM public.paie_paiements p, jsonb_each_text(p.repartition) r
             WHERE p.entreprise_id = _entreprise_id AND p.periode = _periode AND p.annule_le IS NULL GROUP BY r.key)
  SELECT na.n, na.c, coalesce(d.m, 0), coalesce(p.m, 0), coalesce(d.m, 0) - coalesce(p.m, 0)
    FROM natures na LEFT JOIN dus d ON d.c = na.c LEFT JOIN payes p ON p.c = na.c
   WHERE coalesce(d.m, 0) <> 0 OR coalesce(p.m, 0) <> 0
   ORDER BY array_position(ARRAY['salaires', 'ir', 'cfce', 'ipres', 'css', 'ipm'], na.n), na.c;
END $function$;

-- Paiement (total par défaut, ou partiel) d'une nature de dette de paie pour une période.
CREATE OR REPLACE FUNCTION public.fn_payer_paie(_exercice_id uuid, _periode text, _nature text, _date date, _compte_tresorerie text,
  _montant numeric DEFAULT NULL, _mode text DEFAULT NULL, _reference text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; v_jnl text; v_reste numeric; v_m numeric; v_rep jsonb := '{}'::jsonb; v_lignes jsonb := '[]'::jsonb;
  r record; v_part numeric; v_num text; v_n int; v_ecr uuid; v_id uuid; v_lettres int := 0; v_paie uuid; v_ids uuid[]; v_lib text;
BEGIN
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_write_entreprise(x.entreprise_id) THEN RAISE EXCEPTION 'Paiement réservé à l''administrateur et au comptable'; END IF;
  IF public.paie_comptes_nature(_nature) IS NULL THEN RAISE EXCEPTION 'Nature de paiement inconnue : %', _nature; END IF;
  IF _date IS NULL OR _date < x.date_debut OR _date > x.date_fin THEN RAISE EXCEPTION 'Date % hors de l''exercice %', _date, x.annee; END IF;
  IF coalesce(_compte_tresorerie, '') !~ '^5[2-7][0-9]*$' THEN RAISE EXCEPTION 'Compte de trésorerie attendu (52 banque, 55 monnaie électronique, 57 caisse…)'; END IF;
  IF NOT public.paie_ecriture_en_vigueur(x.entreprise_id, _periode) THEN RAISE EXCEPTION 'Paie % non comptabilisée', _periode; END IF;
  PERFORM 1 FROM public.entreprises WHERE id = x.entreprise_id FOR UPDATE;  -- sérialise les paiements d'un dossier
  SELECT coalesce(sum(t.reste), 0) INTO v_reste FROM public.fn_paie_restes(x.entreprise_id, _periode) t WHERE t.nature = _nature;
  IF v_reste <= 0 THEN RAISE EXCEPTION 'Rien à payer pour % de la période %', _nature, _periode; END IF;
  v_m := round(coalesce(_montant, v_reste));
  IF v_m <= 0 OR v_m > v_reste THEN RAISE EXCEPTION 'Montant % : reste dû % pour % de la période %', v_m, v_reste, _nature, _periode; END IF;
  IF v_m <> coalesce(_montant, v_m) THEN RAISE EXCEPTION 'Montant en FCFA entiers'; END IF;
  v_jnl := CASE WHEN _compte_tresorerie LIKE '57%' THEN 'CA' ELSE 'BQ' END;
  SELECT count(*) + 1 INTO v_n FROM public.paie_paiements WHERE entreprise_id = x.entreprise_id AND date_part('year', date_paiement) = date_part('year', _date);
  LOOP
    v_num := 'PP-' || to_char(_date, 'YYYY') || '-' || lpad(v_n::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.paie_paiements WHERE entreprise_id = x.entreprise_id AND numero = v_num);
    v_n := v_n + 1;
  END LOOP;
  v_lib := CASE _nature WHEN 'salaires' THEN 'Paiement des salaires ' WHEN 'ir' THEN 'Versement IR/TRIMF ' WHEN 'cfce' THEN 'Versement CFCE '
    WHEN 'ipres' THEN 'Cotisations IPRES ' WHEN 'css' THEN 'Cotisations CSS ' ELSE 'Cotisations IPM ' END || _periode;
  v_part := v_m;
  FOR r IN SELECT t.compte, t.reste FROM public.fn_paie_restes(x.entreprise_id, _periode) t WHERE t.nature = _nature AND t.reste > 0 LOOP
    EXIT WHEN v_part <= 0;
    v_rep := v_rep || jsonb_build_object(r.compte, least(v_part, r.reste));
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', r.compte, 'intitule', v_lib, 'libelle', v_num || ' — ' || v_lib,
      'debit', least(v_part, r.reste), 'credit', 0));
    v_part := v_part - least(v_part, r.reste);
  END LOOP;
  v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', _compte_tresorerie, 'intitule', 'Trésorerie',
    'libelle', v_num || ' — ' || v_lib || coalesce(' — ' || nullif(trim(_reference), ''), ''), 'debit', 0, 'credit', v_m));
  v_ecr := public.fn_creer_ecriture(x.entreprise_id, x.id, v_jnl, _date, v_lib || coalesce(' — ' || nullif(trim(_reference), ''), ''), v_lignes, v_num, 'validee', 'paie_paiement');
  INSERT INTO public.paie_paiements (entreprise_id, exercice_id, periode, nature, numero, date_paiement, compte_tresorerie, journal_code, mode, reference,
    montant, repartition, ecriture_id)
  VALUES (x.entreprise_id, x.id, _periode, _nature, v_num, _date, _compte_tresorerie, v_jnl, nullif(trim(_mode), ''), nullif(trim(_reference), ''), v_m, v_rep, v_ecr)
  RETURNING id INTO v_id;
  -- Lettrage de chaque compte soldé : ligne de l'écriture de paie + lignes des paiements de ce compte.
  SELECT e.id INTO v_paie FROM public.ecritures e WHERE e.entreprise_id = x.entreprise_id AND e.journal_code = 'PA' AND e.piece = 'PAIE-' || _periode
     AND e.contrepasse_par IS NULL AND coalesce(e.origine, '') <> 'contrepassation' ORDER BY e.created_at DESC LIMIT 1;
  FOR r IN SELECT t.compte FROM public.fn_paie_restes(x.entreprise_id, _periode) t WHERE t.nature = _nature AND t.reste = 0 AND t.du > 0 LOOP
    SELECT array_agg(j.id) INTO v_ids FROM public.journal j
     WHERE j.compte = r.compte AND (j.ecriture_id = v_paie OR j.ecriture_id IN (SELECT p.ecriture_id FROM public.paie_paiements p
       WHERE p.entreprise_id = x.entreprise_id AND p.periode = _periode AND p.annule_le IS NULL AND p.repartition ? r.compte));
    v_lettres := v_lettres + public.reglement_lettrer(v_ids);
  END LOOP;
  RETURN jsonb_build_object('paiement', v_id, 'numero', v_num, 'journal', v_jnl, 'montant', v_m, 'repartition', v_rep, 'lettres', v_lettres);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_annuler_paiement_paie(_paiement_id uuid, _motif text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.paie_paiements%ROWTYPE; v_ids uuid[]; v_ext uuid;
BEGIN
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif d''annulation obligatoire'; END IF;
  SELECT * INTO p FROM public.paie_paiements WHERE id = _paiement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;
  IF NOT public.can_write_entreprise(p.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF p.annule_le IS NOT NULL THEN RAISE EXCEPTION 'Paiement % déjà annulé', p.numero; END IF;
  SELECT array_agg(id) INTO v_ids FROM public.journal WHERE ecriture_id = p.ecriture_id;
  DELETE FROM public.lettrage l USING (SELECT DISTINCT entreprise_id, exercice_id, code_lettrage FROM public.lettrage WHERE journal_entry_id = ANY(v_ids)) g
   WHERE l.entreprise_id = g.entreprise_id AND l.exercice_id = g.exercice_id AND l.code_lettrage = g.code_lettrage;
  PERFORM set_config('app.reglement_annulation', '1', true);
  v_ext := public.fn_contrepasser_ecriture(p.ecriture_id, 'Annulation ' || p.numero || ' : ' || trim(_motif));
  PERFORM set_config('app.reglement_annulation', '', true);
  UPDATE public.paie_paiements SET annule_le = now(), motif_annulation = trim(_motif) WHERE id = p.id;
  RETURN jsonb_build_object('extourne', v_ext);
END $function$;

-- Extourne directe refusée pour un paiement de paie (passer par l'annulation) et pour une paie déjà payée.
DO $$
DECLARE d text := pg_get_functiondef('public.fn_contrepasser_ecriture'::regproc);
  ancre text := '  IF e.contrepasse_par IS NOT NULL THEN RAISE EXCEPTION ''Ecriture deja contre-passee''; END IF;';
BEGIN
  IF position('paie_paiements' in d) > 0 THEN RETURN; END IF;
  IF position(ancre in d) = 0 THEN RAISE EXCEPTION 'fn_contrepasser_ecriture : ancre introuvable'; END IF;
  d := replace(d, ancre, ancre || E'\n' ||
    '  IF coalesce(current_setting(''app.reglement_annulation'', true), '''') <> ''1'' AND EXISTS (SELECT 1 FROM public.paie_paiements WHERE ecriture_id = _ecriture_id) THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Ecriture de paiement de paie : annulez le paiement depuis l''''ecran Paie'';' || E'\n' ||
    '  END IF;' || E'\n' ||
    '  IF e.journal_code = ''PA'' AND e.piece LIKE ''PAIE-%'' AND EXISTS (SELECT 1 FROM public.paie_paiements WHERE entreprise_id = e.entreprise_id' || E'\n' ||
    '     AND periode = substr(e.piece, 6) AND annule_le IS NULL) THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Paie % deja payee (en tout ou partie) : annulez d''''abord ses paiements'', substr(e.piece, 6);' || E'\n' ||
    '  END IF;');
  EXECUTE d;
END $$;

REVOKE ALL ON FUNCTION public.fn_paie_restes(uuid, text), public.fn_payer_paie(uuid, text, text, date, text, numeric, text, text),
  public.fn_annuler_paiement_paie(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_paie_restes(uuid, text), public.fn_payer_paie(uuid, text, text, date, text, numeric, text, text),
  public.fn_annuler_paiement_paie(uuid, text) TO authenticated;
