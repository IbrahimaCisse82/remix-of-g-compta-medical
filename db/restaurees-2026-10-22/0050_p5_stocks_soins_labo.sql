-- P5 (Étape 3) — Stocks pharmacie et réactifs reliés aux consultations et au laboratoire.
--  A) Délivrance en consultation : sortie de stock (CUMP) des articles du dossier comptable lié,
--     trace par consultation, écriture SYSCOHADA via l'outbox (6031 / 31x), jamais l'identité du patient.
--  B) Réactifs par analyse : quantité consommée par test, décrément automatique FEFO des lots
--     à la validation technique. La consommation ne bloque jamais la validation (rupture tracée).
--  C) Alertes de stock (seuils, péremptions, ruptures).
-- Migration additive et rejouable : aucune donnée existante n'est modifiée.

-- ───────────────────────── A) Délivrance en consultation ─────────────────────────
CREATE TABLE IF NOT EXISTS public.sante_dispensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  consultation_id uuid NOT NULL REFERENCES public.sante_consultations(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id) ON DELETE RESTRICT,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  mouvement_id uuid REFERENCES public.mouvements_stock(id) ON DELETE SET NULL,
  quantite numeric NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric NOT NULL DEFAULT 0,
  montant numeric NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sante_dispensations_consultation_idx ON public.sante_dispensations(consultation_id);
CREATE INDEX IF NOT EXISTS sante_dispensations_structure_idx ON public.sante_dispensations(structure_id, created_at DESC);
GRANT SELECT ON public.sante_dispensations TO authenticated;
GRANT ALL ON public.sante_dispensations TO service_role;
ALTER TABLE public.sante_dispensations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispensations lecture" ON public.sante_dispensations;
CREATE POLICY "dispensations lecture" ON public.sante_dispensations FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','medecin','secretaire']));
DROP POLICY IF EXISTS "dispensations mfa" ON public.sante_dispensations;
CREATE POLICY "dispensations mfa" ON public.sante_dispensations AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
DROP TRIGGER IF EXISTS trg_audit_sante_dispensations ON public.sante_dispensations;
CREATE TRIGGER trg_audit_sante_dispensations AFTER INSERT OR UPDATE OR DELETE ON public.sante_dispensations
  FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

-- Articles délivrables (le personnel soignant n'a pas accès au dossier comptable lui-même).
CREATE OR REPLACE FUNCTION public.sante_articles_disponibles(_structure_id uuid)
RETURNS TABLE(id uuid, code text, designation text, unite text, quantite_stock numeric, stock_minimum numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure','medecin','secretaire']) THEN
    RAISE EXCEPTION 'Accès refusé : la pharmacie est réservée aux rôles Administrateur, Médecin et Secrétaire.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  RETURN QUERY
    SELECT a.id, a.code, a.designation, a.unite, a.quantite_stock, a.stock_minimum
    FROM public.articles a JOIN public.structures s ON s.entreprise_id = a.entreprise_id
    WHERE s.id = _structure_id AND a.actif
    ORDER BY a.designation;
END $function$;
REVOKE ALL ON FUNCTION public.sante_articles_disponibles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_articles_disponibles(uuid) TO authenticated, service_role;

-- Délivrance : _lignes = [{"article_id": uuid, "quantite": number}, ...] — tout ou rien.
CREATE OR REPLACE FUNCTION public.sante_dispenser(_consultation_id uuid, _lignes jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.sante_consultations%ROWTYPE; a public.articles%ROWTYPE; l jsonb;
        _eid uuid; _q numeric; _montant numeric; _mid uuid; _did uuid; _n integer := 0; _piece text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['medecin','secretaire']) THEN
    RAISE EXCEPTION 'Accès refusé : la délivrance est réservée aux rôles Médecin et Secrétaire.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF NOT public.structure_module_actif(c.structure_id, 'sante_clinique') THEN
    RAISE EXCEPTION 'Module Clinique inactif : contactez votre administrateur pour son activation.';
  END IF;
  SELECT entreprise_id INTO _eid FROM public.structures WHERE id = c.structure_id;
  IF _eid IS NULL THEN RAISE EXCEPTION 'Aucun dossier comptable relié à la structure : reliez-la dans Structure & paramètres.'; END IF;
  IF _lignes IS NULL OR jsonb_typeof(_lignes) <> 'array' OR jsonb_array_length(_lignes) = 0 THEN RAISE EXCEPTION 'Aucune ligne à délivrer'; END IF;
  IF jsonb_array_length(_lignes) > 50 THEN RAISE EXCEPTION 'Trop de lignes (50 maximum)'; END IF;
  _piece := 'DLV-' || to_char(now(), 'YYMMDD') || '-' || upper(left(replace(c.id::text, '-', ''), 6));

  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    BEGIN _q := (l->>'quantite')::numeric; EXCEPTION WHEN OTHERS THEN _q := NULL; END;
    IF _q IS NULL OR _q <= 0 OR _q > 100000 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
    SELECT * INTO a FROM public.articles WHERE id = (l->>'article_id')::uuid AND entreprise_id = _eid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Article introuvable dans le stock de la structure'; END IF;
    IF NOT a.actif THEN RAISE EXCEPTION 'Article inactif : %', a.designation; END IF;
    IF a.quantite_stock < _q THEN RAISE EXCEPTION 'Stock insuffisant pour % : % % disponible(s)', a.designation, trim_scale(a.quantite_stock), a.unite; END IF;
    _montant := round(_q * coalesce(a.prix_achat_moyen, 0), 2);
    INSERT INTO public.mouvements_stock(entreprise_id, article_id, date_mvt, type_mvt, reference, quantite, prix_unitaire, montant, cump_apres, qte_apres, notes)
    VALUES (_eid, a.id, current_date, 'sortie', _piece, _q, coalesce(a.prix_achat_moyen, 0), _montant, coalesce(a.prix_achat_moyen, 0), a.quantite_stock - _q, 'Délivrance en consultation')
    RETURNING id INTO _mid;
    UPDATE public.articles SET quantite_stock = quantite_stock - _q WHERE id = a.id;
    INSERT INTO public.sante_dispensations(structure_id, consultation_id, patient_id, article_id, mouvement_id, quantite, prix_unitaire, montant)
    VALUES (c.structure_id, c.id, c.patient_id, a.id, _mid, _q, coalesce(a.prix_achat_moyen, 0), _montant)
    RETURNING id INTO _did;
    -- Inventaire permanent SYSCOHADA : 603x (variation) au débit, 3x (stock) au crédit. Jamais bloquant.
    IF _montant > 0 THEN
      PERFORM public.sante_comptabiliser(c.structure_id, 'dispensation', _did, 'OD', current_date,
        'Sortie de stock ' || a.code, _piece,
        jsonb_build_array(
          jsonb_build_object('compte', coalesce(a.compte_variation, '6031'), 'debit', _montant, 'libelle', 'Sortie ' || a.code, 'intitule', 'Variation des stocks'),
          jsonb_build_object('compte', coalesce(a.compte_stock, '31'), 'credit', _montant, 'libelle', 'Sortie ' || a.code, 'intitule', 'Stocks')));
    END IF;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $function$;
REVOKE ALL ON FUNCTION public.sante_dispenser(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_dispenser(uuid, jsonb) TO authenticated, service_role;

-- ───────────────────────── B) Réactifs consommés par analyse ─────────────────────────
CREATE TABLE IF NOT EXISTS public.sante_analyse_reactifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  analyse_id uuid NOT NULL REFERENCES public.sante_analyses(id) ON DELETE CASCADE,
  reactif_id uuid NOT NULL REFERENCES public.sante_reactifs(id) ON DELETE CASCADE,
  quantite_par_test numeric NOT NULL CHECK (quantite_par_test > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analyse_id, reactif_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sante_analyse_reactifs TO authenticated;
GRANT ALL ON public.sante_analyse_reactifs TO service_role;
ALTER TABLE public.sante_analyse_reactifs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "analyse reactifs lecture" ON public.sante_analyse_reactifs;
CREATE POLICY "analyse reactifs lecture" ON public.sante_analyse_reactifs FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));
DROP POLICY IF EXISTS "analyse reactifs ecriture" ON public.sante_analyse_reactifs;
CREATE POLICY "analyse reactifs ecriture" ON public.sante_analyse_reactifs FOR ALL TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']))
  WITH CHECK (
    public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste'])
    AND EXISTS (SELECT 1 FROM public.sante_analyses x WHERE x.id = analyse_id AND x.structure_id = sante_analyse_reactifs.structure_id)
    AND EXISTS (SELECT 1 FROM public.sante_reactifs x WHERE x.id = reactif_id AND x.structure_id = sante_analyse_reactifs.structure_id));
DROP POLICY IF EXISTS "analyse reactifs mfa" ON public.sante_analyse_reactifs;
CREATE POLICY "analyse reactifs mfa" ON public.sante_analyse_reactifs AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
DROP TRIGGER IF EXISTS trg_audit_sante_analyse_reactifs ON public.sante_analyse_reactifs;
CREATE TRIGGER trg_audit_sante_analyse_reactifs AFTER INSERT OR UPDATE OR DELETE ON public.sante_analyse_reactifs
  FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

CREATE TABLE IF NOT EXISTS public.sante_consommations_reactifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  demande_id uuid NOT NULL REFERENCES public.sante_demandes_labo(id) ON DELETE CASCADE,
  analyse_id uuid NOT NULL REFERENCES public.sante_analyses(id) ON DELETE CASCADE,
  reactif_id uuid NOT NULL REFERENCES public.sante_reactifs(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.sante_lots_reactifs(id) ON DELETE SET NULL,
  quantite numeric NOT NULL CHECK (quantite > 0),
  rupture boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sante_conso_reactifs_structure_idx ON public.sante_consommations_reactifs(structure_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sante_conso_reactifs_demande_idx ON public.sante_consommations_reactifs(demande_id);
GRANT SELECT ON public.sante_consommations_reactifs TO authenticated;
GRANT ALL ON public.sante_consommations_reactifs TO service_role;
ALTER TABLE public.sante_consommations_reactifs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conso reactifs lecture" ON public.sante_consommations_reactifs;
CREATE POLICY "conso reactifs lecture" ON public.sante_consommations_reactifs FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));
DROP POLICY IF EXISTS "conso reactifs mfa" ON public.sante_consommations_reactifs;
CREATE POLICY "conso reactifs mfa" ON public.sante_consommations_reactifs AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());

-- Décrément FEFO (premier périmé, premier sorti) à chaque passage en validation technique.
CREATE OR REPLACE FUNCTION public.trg_sante_consommer_reactifs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; l record; _reste numeric; _pris numeric;
BEGIN
  BEGIN
    FOR r IN
      SELECT da.analyse_id, ar.reactif_id, ar.quantite_par_test AS q
      FROM public.sante_demande_analyses da
      JOIN public.sante_analyse_reactifs ar ON ar.analyse_id = da.analyse_id
      JOIN public.sante_reactifs re ON re.id = ar.reactif_id AND re.actif
      WHERE da.demande_id = NEW.id
    LOOP
      _reste := r.q;
      FOR l IN
        SELECT id, quantite_restante FROM public.sante_lots_reactifs
        WHERE reactif_id = r.reactif_id AND quantite_restante > 0 AND peremption >= current_date
        ORDER BY peremption, recu_le FOR UPDATE
      LOOP
        _pris := least(_reste, l.quantite_restante);
        UPDATE public.sante_lots_reactifs SET quantite_restante = quantite_restante - _pris WHERE id = l.id;
        INSERT INTO public.sante_consommations_reactifs(structure_id, demande_id, analyse_id, reactif_id, lot_id, quantite)
        VALUES (NEW.structure_id, NEW.id, r.analyse_id, r.reactif_id, l.id, _pris);
        _reste := _reste - _pris;
        EXIT WHEN _reste <= 0;
      END LOOP;
      IF _reste > 0 THEN
        INSERT INTO public.sante_consommations_reactifs(structure_id, demande_id, analyse_id, reactif_id, lot_id, quantite, rupture)
        VALUES (NEW.structure_id, NEW.id, r.analyse_id, r.reactif_id, NULL, _reste, true);
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- La validation des résultats ne doit jamais être bloquée par la gestion des stocks.
    RAISE WARNING 'Consommation de réactifs non enregistrée pour la demande % : %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS sante_consommer_reactifs ON public.sante_demandes_labo;
CREATE TRIGGER sante_consommer_reactifs AFTER UPDATE OF statut ON public.sante_demandes_labo
  FOR EACH ROW WHEN (NEW.statut = 'validee_technique' AND OLD.statut IS DISTINCT FROM NEW.statut)
  EXECUTE FUNCTION public.trg_sante_consommer_reactifs();

-- ───────────────────────── C) Alertes de stock ─────────────────────────
CREATE OR REPLACE FUNCTION public.sante_alertes_stock(_structure_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _labo boolean; _pharma boolean; _res jsonb := '{}'::jsonb;
BEGIN
  _labo := public.has_any_medical_role(_structure_id, ARRAY['admin_structure','biologiste','technicien']);
  _pharma := public.has_any_medical_role(_structure_id, ARRAY['admin_structure','medecin','secretaire']);
  IF NOT (_labo OR _pharma) THEN RAISE EXCEPTION 'Accès refusé : alertes de stock réservées aux équipes de soins, du laboratoire et à l''administrateur.'; END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF _labo THEN
    _res := _res || jsonb_build_object(
      'reactifs_sous_seuil', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', r.id, 'nom', r.nom, 'unite', r.unite, 'stock', s.stock, 'seuil', r.seuil_alerte) ORDER BY r.nom)
        FROM public.sante_reactifs r
        CROSS JOIN LATERAL (SELECT coalesce(sum(quantite_restante), 0) AS stock FROM public.sante_lots_reactifs WHERE reactif_id = r.id AND peremption >= current_date) s
        WHERE r.structure_id = _structure_id AND r.actif AND s.stock <= r.seuil_alerte), '[]'::jsonb),
      'lots_bientot_perimes', coalesce((
        SELECT jsonb_agg(jsonb_build_object('reactif', r.nom, 'lot', l.numero_lot, 'peremption', l.peremption, 'quantite', l.quantite_restante) ORDER BY l.peremption)
        FROM public.sante_lots_reactifs l JOIN public.sante_reactifs r ON r.id = l.reactif_id
        WHERE l.structure_id = _structure_id AND l.quantite_restante > 0 AND l.peremption < current_date + 30), '[]'::jsonb),
      'ruptures_30j', coalesce((
        SELECT jsonb_agg(jsonb_build_object('reactif', r.nom, 'quantite', x.q, 'demandes', x.n) ORDER BY r.nom)
        FROM (SELECT reactif_id, sum(quantite) q, count(DISTINCT demande_id) n FROM public.sante_consommations_reactifs
              WHERE structure_id = _structure_id AND rupture AND created_at > now() - interval '30 days' GROUP BY reactif_id) x
        JOIN public.sante_reactifs r ON r.id = x.reactif_id), '[]'::jsonb));
  END IF;
  IF _pharma THEN
    _res := _res || jsonb_build_object(
      'articles_sous_minimum', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'designation', a.designation, 'unite', a.unite, 'stock', a.quantite_stock, 'minimum', a.stock_minimum) ORDER BY a.designation)
        FROM public.articles a JOIN public.structures s ON s.entreprise_id = a.entreprise_id
        WHERE s.id = _structure_id AND a.actif AND a.quantite_stock <= a.stock_minimum), '[]'::jsonb));
  END IF;
  RETURN _res;
END $function$;
REVOKE ALL ON FUNCTION public.sante_alertes_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_alertes_stock(uuid) TO authenticated, service_role;
