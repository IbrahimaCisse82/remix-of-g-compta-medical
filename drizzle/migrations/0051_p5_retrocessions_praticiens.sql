-- P5 (Étape 3) — Rétrocessions d'honoraires aux praticiens.
-- Base : factures émises au nom du praticien qui a RÉALISÉ l'acte (sante_factures.praticien_id),
-- hors factures annulées, nettes des remises et de la TVA, diminuées des avoirs de la période.
-- Volontairement exclu : toute commission sur des examens ou médicaments PRESCRITS (compérage,
-- interdit par le code de déontologie) — les factures de laboratoire n'ont pas de praticien,
-- et les lignes « medicaments » ne sont jamais rétrocédées.
-- Relevé figé à la validation (détail par catégorie), écritures SYSCOHADA via l'outbox :
--   validation : 6324 Honoraires (D) / 4011 Praticiens (C) [/ 4478 Retenue à la source (C)]
--   paiement   : 4011 (D) / 57x-52x (C) ; annulation : contre-passation.
-- Migration additive et rejouable.

ALTER TABLE public.sante_praticiens ADD COLUMN IF NOT EXISTS taux_retenue_source numeric NOT NULL DEFAULT 0;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sante_praticiens_taux_retenue_chk') THEN
    ALTER TABLE public.sante_praticiens ADD CONSTRAINT sante_praticiens_taux_retenue_chk CHECK (taux_retenue_source >= 0 AND taux_retenue_source <= 50);
  END IF;
END $c$;

-- Comptes par défaut (les clés existantes sont reprises à l'identique).
CREATE OR REPLACE FUNCTION public.sante_compte_defaut(_cle text)
RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE _cle
    WHEN 'patients' THEN '4111' WHEN 'organismes' THEN '4114' WHEN 'produits' THEN '706'
    WHEN 'produits_consultation' THEN '706' WHEN 'produits_acte' THEN '706' WHEN 'produits_analyses' THEN '706'
    WHEN 'produits_medicaments' THEN '706' WHEN 'produits_autres' THEN '706'
    WHEN 'tva_collectee' THEN '4431'
    WHEN 'especes' THEN '571' WHEN 'mobile_money' THEN '5215' WHEN 'carte' THEN '521'
    WHEN 'cheques_a_encaisser' THEN '513' WHEN 'banque' THEN '521'
    WHEN 'ecart_caisse_perte' THEN '658' WHEN 'ecart_caisse_gain' THEN '758' WHEN 'perte_creance' THEN '651'
    WHEN 'dotation_provision' THEN '6594' WHEN 'provision_creance' THEN '4914'
    WHEN 'honoraires_praticiens' THEN '6324' WHEN 'praticiens' THEN '4011' WHEN 'retenue_source' THEN '4478'
    ELSE NULL END
$function$;

-- ───────────────────────── Règles ─────────────────────────
CREATE TABLE IF NOT EXISTS public.sante_retrocession_regles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES public.sante_praticiens(id) ON DELETE CASCADE,
  categorie text NOT NULL CHECK (categorie IN ('toutes','consultation','acte','analyses','autres')),
  taux numeric NOT NULL CHECK (taux >= 0 AND taux <= 100),
  actif boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (praticien_id, categorie)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sante_retrocession_regles TO authenticated;
GRANT ALL ON public.sante_retrocession_regles TO service_role;
ALTER TABLE public.sante_retrocession_regles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "retro regles lecture" ON public.sante_retrocession_regles;
CREATE POLICY "retro regles lecture" ON public.sante_retrocession_regles FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','comptable'])
         OR EXISTS (SELECT 1 FROM public.sante_praticiens p WHERE p.id = praticien_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "retro regles ecriture" ON public.sante_retrocession_regles;
CREATE POLICY "retro regles ecriture" ON public.sante_retrocession_regles FOR ALL TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure']))
  WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure'])
    AND EXISTS (SELECT 1 FROM public.sante_praticiens p WHERE p.id = praticien_id AND p.structure_id = sante_retrocession_regles.structure_id));
DROP POLICY IF EXISTS "retro regles mfa" ON public.sante_retrocession_regles;
CREATE POLICY "retro regles mfa" ON public.sante_retrocession_regles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
DROP TRIGGER IF EXISTS trg_audit_sante_retrocession_regles ON public.sante_retrocession_regles;
CREATE TRIGGER trg_audit_sante_retrocession_regles AFTER INSERT OR UPDATE OR DELETE ON public.sante_retrocession_regles
  FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

-- ───────────────────────── Relevés ─────────────────────────
CREATE TABLE IF NOT EXISTS public.sante_retrocessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES public.sante_praticiens(id) ON DELETE RESTRICT,
  numero text NOT NULL,
  periode_debut date NOT NULL,
  periode_fin date NOT NULL CHECK (periode_fin >= periode_debut),
  base numeric NOT NULL DEFAULT 0,
  montant_brut numeric NOT NULL DEFAULT 0,
  retenue numeric NOT NULL DEFAULT 0,
  montant_net numeric NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut text NOT NULL DEFAULT 'validee' CHECK (statut IN ('validee','payee','annulee')),
  valide_par uuid DEFAULT auth.uid(),
  valide_le timestamptz NOT NULL DEFAULT now(),
  paye_par uuid, paye_le timestamptz, mode_paiement text, reference_paiement text,
  annule_par uuid, annule_le timestamptz, motif_annulation text,
  UNIQUE (structure_id, numero)
);
CREATE INDEX IF NOT EXISTS sante_retrocessions_praticien_idx ON public.sante_retrocessions(praticien_id, periode_debut);
GRANT SELECT ON public.sante_retrocessions TO authenticated;
GRANT ALL ON public.sante_retrocessions TO service_role;
ALTER TABLE public.sante_retrocessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "retro lecture" ON public.sante_retrocessions;
CREATE POLICY "retro lecture" ON public.sante_retrocessions FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','comptable'])
         OR EXISTS (SELECT 1 FROM public.sante_praticiens p WHERE p.id = praticien_id AND p.user_id = auth.uid()));
DROP POLICY IF EXISTS "retro mfa" ON public.sante_retrocessions;
CREATE POLICY "retro mfa" ON public.sante_retrocessions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
DROP TRIGGER IF EXISTS trg_audit_sante_retrocessions ON public.sante_retrocessions;
CREATE TRIGGER trg_audit_sante_retrocessions AFTER INSERT OR UPDATE OR DELETE ON public.sante_retrocessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

-- ───────────────────────── Calcul (aperçu, sans écriture) ─────────────────────────
CREATE OR REPLACE FUNCTION public.sante_calcul_retrocession(_praticien_id uuid, _debut date, _fin date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.sante_praticiens%ROWTYPE; _cats jsonb := '{}'::jsonb; r record;
        _taux numeric; _base numeric := 0; _brut numeric := 0; _ret numeric; _nf int; _na int;
BEGIN
  SELECT * INTO p FROM public.sante_praticiens WHERE id = _praticien_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Praticien introuvable'; END IF;
  -- coalesce : un praticien sans compte (user_id NULL) ne doit jamais ouvrir l'accès (NULL = x n'est pas faux).
  IF NOT (public.has_any_medical_role(p.structure_id, ARRAY['admin_structure','comptable']) OR coalesce(p.user_id = auth.uid(), false)) THEN
    RAISE EXCEPTION 'Accès refusé : les rétrocessions sont réservées à l''administrateur, au comptable et au praticien concerné.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF _debut IS NULL OR _fin IS NULL OR _fin < _debut THEN RAISE EXCEPTION 'Période invalide'; END IF;
  IF _fin - _debut > 366 THEN RAISE EXCEPTION 'Période trop longue (un an maximum)'; END IF;

  SELECT count(*) INTO _nf FROM public.sante_factures f
   WHERE f.structure_id = p.structure_id AND f.praticien_id = p.id AND f.type = 'facture' AND NOT f.annulee
     AND (f.created_at AT TIME ZONE 'Africa/Dakar')::date BETWEEN _debut AND _fin;
  SELECT count(*) INTO _na FROM public.sante_factures a JOIN public.sante_factures o ON o.id = a.facture_origine_id
   WHERE a.structure_id = p.structure_id AND o.praticien_id = p.id AND a.type = 'avoir' AND NOT a.annulee
     AND (a.created_at AT TIME ZONE 'Africa/Dakar')::date BETWEEN _debut AND _fin;

  FOR r IN
    WITH fac AS (
      SELECT f.id, f.total, f.montant_tva,
             (SELECT coalesce(sum(l.montant - l.montant_tva), 0) FROM public.sante_facture_lignes l WHERE l.facture_id = f.id) AS ht
      FROM public.sante_factures f
      WHERE f.structure_id = p.structure_id AND f.type = 'facture' AND NOT f.annulee AND f.praticien_id = p.id
    ),
    lignes AS (
      -- Factures de la période, nettes de remise : coefficient = (total TTC − TVA) / Σ lignes HT
      SELECT coalesce(l.categorie, 'autres') AS cat,
             (l.montant - l.montant_tva) * CASE WHEN fac.ht > 0 THEN greatest(fac.total - fac.montant_tva, 0) / fac.ht ELSE 1 END AS net
      FROM fac JOIN public.sante_factures f ON f.id = fac.id JOIN public.sante_facture_lignes l ON l.facture_id = fac.id
      WHERE (f.created_at AT TIME ZONE 'Africa/Dakar')::date BETWEEN _debut AND _fin
        AND coalesce(l.categorie, 'autres') <> 'medicaments'
      UNION ALL
      -- Avoirs de la période sur des factures du praticien : quote-part de la facture d'origine
      SELECT coalesce(l.categorie, 'autres'),
             -(l.montant - l.montant_tva) * CASE WHEN fac.ht > 0 THEN greatest(fac.total - fac.montant_tva, 0) / fac.ht ELSE 1 END
               * least(abs(a.total) / nullif(fac.total, 0), 1)
      FROM public.sante_factures a JOIN fac ON fac.id = a.facture_origine_id JOIN public.sante_facture_lignes l ON l.facture_id = fac.id
      WHERE a.type = 'avoir' AND NOT a.annulee AND (a.created_at AT TIME ZONE 'Africa/Dakar')::date BETWEEN _debut AND _fin
        AND coalesce(l.categorie, 'autres') <> 'medicaments'
    )
    SELECT CASE WHEN cat IN ('consultation','acte','analyses') THEN cat ELSE 'autres' END AS cat, round(sum(net)) AS base
    FROM lignes GROUP BY 1
  LOOP
    SELECT taux INTO _taux FROM public.sante_retrocession_regles WHERE praticien_id = p.id AND actif AND categorie = r.cat;
    IF _taux IS NULL THEN SELECT taux INTO _taux FROM public.sante_retrocession_regles WHERE praticien_id = p.id AND actif AND categorie = 'toutes'; END IF;
    _taux := coalesce(_taux, 0);
    _cats := _cats || jsonb_build_object(r.cat, jsonb_build_object('base', r.base, 'taux', _taux, 'montant', round(r.base * _taux / 100)));
    _base := _base + r.base;
    _brut := _brut + round(r.base * _taux / 100);
    _taux := NULL;
  END LOOP;
  _ret := round(_brut * p.taux_retenue_source / 100);
  RETURN jsonb_build_object('praticien_id', p.id, 'praticien', p.nom, 'debut', _debut, 'fin', _fin,
    'categories', _cats, 'base', _base, 'montant_brut', _brut, 'taux_retenue', p.taux_retenue_source,
    'retenue', _ret, 'montant_net', _brut - _ret, 'nb_factures', _nf, 'nb_avoirs', _na);
END $function$;
REVOKE ALL ON FUNCTION public.sante_calcul_retrocession(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_calcul_retrocession(uuid, date, date) TO authenticated, service_role;

-- ───────────────────────── Validation (relevé figé + écriture) ─────────────────────────
CREATE OR REPLACE FUNCTION public.sante_valider_retrocession(_praticien_id uuid, _debut date, _fin date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.sante_praticiens%ROWTYPE; c jsonb; _id uuid; _num text; _seq int; _lignes jsonb;
BEGIN
  SELECT * INTO p FROM public.sante_praticiens WHERE id = _praticien_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Praticien introuvable'; END IF;
  IF NOT public.has_any_medical_role(p.structure_id, ARRAY['admin_structure']) THEN
    RAISE EXCEPTION 'Accès refusé : la validation des rétrocessions est réservée à l''administrateur de la structure.';
  END IF;
  PERFORM 1 FROM public.sante_praticiens WHERE id = p.id FOR UPDATE;  -- sérialise les validations d'un même praticien
  IF EXISTS (SELECT 1 FROM public.sante_retrocessions r WHERE r.praticien_id = p.id AND r.statut <> 'annulee'
             AND daterange(r.periode_debut, r.periode_fin, '[]') && daterange(_debut, _fin, '[]')) THEN
    RAISE EXCEPTION 'Un relevé validé couvre déjà tout ou partie de cette période pour ce praticien';
  END IF;
  c := public.sante_calcul_retrocession(_praticien_id, _debut, _fin);
  IF (c->>'montant_brut')::numeric <= 0 THEN RAISE EXCEPTION 'Aucun montant à rétrocéder sur la période (vérifiez les taux et les factures)'; END IF;
  SELECT count(*) + 1 INTO _seq FROM public.sante_retrocessions WHERE structure_id = p.structure_id AND extract(year FROM valide_le) = extract(year FROM now());
  _num := 'RET' || to_char(now(), 'YYYY') || '-' || lpad(_seq::text, 4, '0');
  INSERT INTO public.sante_retrocessions(structure_id, praticien_id, numero, periode_debut, periode_fin, base, montant_brut, retenue, montant_net, details)
  VALUES (p.structure_id, p.id, _num, _debut, _fin, (c->>'base')::numeric, (c->>'montant_brut')::numeric, (c->>'retenue')::numeric, (c->>'montant_net')::numeric, c)
  RETURNING id INTO _id;
  _lignes := jsonb_build_array(
    jsonb_build_object('compte', public.sante_compte(p.structure_id, 'honoraires_praticiens'), 'debit', (c->>'montant_brut')::numeric, 'libelle', _num, 'intitule', 'Honoraires — ' || p.nom),
    jsonb_build_object('compte', public.sante_compte(p.structure_id, 'praticiens'), 'credit', (c->>'montant_net')::numeric, 'libelle', _num, 'intitule', p.nom));
  IF (c->>'retenue')::numeric > 0 THEN
    _lignes := _lignes || jsonb_build_array(jsonb_build_object('compte', public.sante_compte(p.structure_id, 'retenue_source'), 'credit', (c->>'retenue')::numeric, 'libelle', _num, 'intitule', 'Retenue à la source — ' || p.nom));
  END IF;
  PERFORM public.sante_comptabiliser(p.structure_id, 'retrocession', _id, 'OD', _fin, 'Rétrocession ' || p.nom || ' ' || to_char(_debut, 'DD/MM') || '–' || to_char(_fin, 'DD/MM/YYYY'), _num, _lignes);
  RETURN _id;
END $function$;
REVOKE ALL ON FUNCTION public.sante_valider_retrocession(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_valider_retrocession(uuid, date, date) TO authenticated, service_role;

-- ───────────────────────── Paiement ─────────────────────────
CREATE OR REPLACE FUNCTION public.sante_payer_retrocession(_id uuid, _mode text, _reference text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.sante_retrocessions%ROWTYPE; _tresor text; _nom text;
BEGIN
  SELECT * INTO r FROM public.sante_retrocessions WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relevé introuvable'; END IF;
  IF NOT public.has_any_medical_role(r.structure_id, ARRAY['admin_structure','comptable']) THEN
    RAISE EXCEPTION 'Accès refusé : le paiement des rétrocessions est réservé à l''administrateur et au comptable.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF r.statut <> 'validee' THEN RAISE EXCEPTION 'Seul un relevé validé et non payé peut être payé'; END IF;
  _tresor := CASE _mode WHEN 'especes' THEN 'especes' WHEN 'mobile_money' THEN 'mobile_money' WHEN 'virement' THEN 'banque' WHEN 'cheque' THEN 'banque' END;
  IF _tresor IS NULL THEN RAISE EXCEPTION 'Mode de paiement invalide (especes, mobile_money, virement, cheque)'; END IF;
  IF _mode IN ('virement','cheque','mobile_money') AND coalesce(trim(_reference), '') = '' THEN RAISE EXCEPTION 'Référence du paiement obligatoire'; END IF;
  SELECT nom INTO _nom FROM public.sante_praticiens WHERE id = r.praticien_id;
  UPDATE public.sante_retrocessions SET statut = 'payee', paye_par = auth.uid(), paye_le = now(), mode_paiement = _mode, reference_paiement = nullif(trim(_reference), '') WHERE id = _id;
  IF r.montant_net > 0 THEN
    PERFORM public.sante_comptabiliser(r.structure_id, 'retrocession_paiement', _id, CASE WHEN _mode = 'especes' THEN 'CA' ELSE 'BQ' END, current_date,
      'Paiement rétrocession ' || r.numero, coalesce(nullif(trim(_reference), ''), r.numero),
      jsonb_build_array(
        jsonb_build_object('compte', public.sante_compte(r.structure_id, 'praticiens'), 'debit', r.montant_net, 'libelle', r.numero, 'intitule', _nom),
        jsonb_build_object('compte', public.sante_compte(r.structure_id, _tresor), 'credit', r.montant_net, 'libelle', r.numero, 'intitule', 'Paiement ' || _mode)));
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.sante_payer_retrocession(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_payer_retrocession(uuid, text, text) TO authenticated, service_role;

-- ───────────────────────── Annulation (avant paiement) ─────────────────────────
CREATE OR REPLACE FUNCTION public.sante_annuler_retrocession(_id uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.sante_retrocessions%ROWTYPE; _nom text; _lignes jsonb;
BEGIN
  SELECT * INTO r FROM public.sante_retrocessions WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relevé introuvable'; END IF;
  IF NOT public.has_any_medical_role(r.structure_id, ARRAY['admin_structure']) THEN
    RAISE EXCEPTION 'Accès refusé : l''annulation d''un relevé est réservée à l''administrateur de la structure.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF r.statut = 'payee' THEN RAISE EXCEPTION 'Relevé déjà payé : il ne peut plus être annulé'; END IF;
  IF r.statut = 'annulee' THEN RAISE EXCEPTION 'Relevé déjà annulé'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 10 THEN RAISE EXCEPTION 'Motif d''annulation obligatoire (10 caractères minimum)'; END IF;
  SELECT nom INTO _nom FROM public.sante_praticiens WHERE id = r.praticien_id;
  UPDATE public.sante_retrocessions SET statut = 'annulee', annule_par = auth.uid(), annule_le = now(), motif_annulation = trim(_motif) WHERE id = _id;
  _lignes := jsonb_build_array(
    jsonb_build_object('compte', public.sante_compte(r.structure_id, 'honoraires_praticiens'), 'credit', r.montant_brut, 'libelle', 'Annulation ' || r.numero, 'intitule', 'Honoraires — ' || _nom),
    jsonb_build_object('compte', public.sante_compte(r.structure_id, 'praticiens'), 'debit', r.montant_net, 'libelle', 'Annulation ' || r.numero, 'intitule', _nom));
  IF r.retenue > 0 THEN
    _lignes := _lignes || jsonb_build_array(jsonb_build_object('compte', public.sante_compte(r.structure_id, 'retenue_source'), 'debit', r.retenue, 'libelle', 'Annulation ' || r.numero, 'intitule', 'Retenue à la source — ' || _nom));
  END IF;
  PERFORM public.sante_comptabiliser(r.structure_id, 'retrocession_annulation', _id, 'OD', current_date, 'Annulation ' || r.numero, r.numero, _lignes);
END $function$;
REVOKE ALL ON FUNCTION public.sante_annuler_retrocession(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_annuler_retrocession(uuid, text) TO authenticated, service_role;
