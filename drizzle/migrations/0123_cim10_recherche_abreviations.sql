-- 0123 — Recherche CIM-10 : mots entiers (début de mot) et abréviations courantes en consultation.
-- Avant : « hta » trouvait « ophtalmie » (sous-chaîne). Désormais chaque mot saisi doit commencer un mot du libellé,
-- et les abréviations usuelles sont développées (HTA → hypertension, AVC, VIH, BPCO, drépanocytose…).
-- Remplace les deux fonctions de recherche de 0121 et 0122 (mêmes signatures). Retour : docs/rollback/0123_..._down.sql

CREATE OR REPLACE FUNCTION public.sante_cim10_mots(_q text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
DECLARE _t text := ' ' || public.sante_texte_recherche(coalesce(_q, '')) || ' '; a text[];
BEGIN
  FOREACH a SLICE 1 IN ARRAY ARRAY[
    ['hta', 'hypertension'], ['avc', 'accident vasculaire cerebral'], ['ait', 'ischemie cerebrale transitoire'],
    ['idm', 'infarctus myocarde'], ['vih', 'immunodeficience humaine'], ['sida', 'immunodeficience humaine'],
    ['bpco', 'pulmonaires obstructives chroniques'], ['drepanocytose', 'falciformes'], ['drepanocytaire', 'falciformes'],
    ['irc', 'maladie renale chronique'], ['ivu', 'infection voies urinaires'], ['gea', 'gastroenterite'],
    ['rgo', 'reflux gastro'], ['hbp', 'hyperplasie prostate'], ['dt1', 'diabete type 1'], ['dt2', 'diabete type 2'],
    ['ist', 'transmission sexuel'], ['mst', 'transmission sexuel'], ['tb', 'tuberculose'], ['ira', 'respiratoires aigue'],
    ['palu', 'paludisme'], ['ivg', 'avortement medical'], ['fcs', 'avortement spontane'], ['geu', 'grossesse extra uterine'],
    ['hpp', 'hemorragie post partum'], ['tvp', 'thrombose veineuse'], ['ep', 'embolie pulmonaire']
  ] LOOP
    _t := replace(_t, ' ' || a[1] || ' ', ' ' || a[2] || ' ');
  END LOOP;
  RETURN ARRAY(SELECT m FROM unnest(regexp_split_to_array(btrim(regexp_replace(_t, '[^a-z0-9 ]', ' ', 'g')), '\s+')) m WHERE m <> '');
END $$;

-- Chaque mot saisi commence un mot du libellé.
CREATE OR REPLACE FUNCTION public.sante_cim10_correspond(_recherche text, _mots text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT coalesce(array_length(_mots, 1), 0) > 0 AND NOT EXISTS (SELECT 1 FROM unnest(_mots) m WHERE _recherche !~ ('\m' || m))
$$;

CREATE OR REPLACE FUNCTION public.sante_cim10_chercher(_q text, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _mots text[] := public.sante_cim10_mots(_q); _c text := public.sante_cim10_code(_q);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(_q, ''))) < 2 THEN RETURN; END IF;
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre FROM public.sante_cim10 k
    WHERE k.actif AND (k.code LIKE _c || '%' OR public.sante_cim10_correspond(k.recherche, _mots))
    ORDER BY (k.code = _c) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;

CREATE OR REPLACE FUNCTION public.sante_cim10_specialite(_consultation_id uuid, _q text, _toutes boolean DEFAULT false, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text, dans_specialite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; _plages text[]; _tout boolean := false;
  _mots text[] := public.sante_cim10_mots(_q); _c text := public.sante_cim10_code(_q);
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF c.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Consultation introuvable' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_q, ''))) < 2 THEN RETURN; END IF;
  SELECT array_agg(s.id) INTO _plages FROM public.sante_specialites s
   WHERE s.id = (SELECT specialite_id FROM public.sante_praticiens WHERE id = c.praticien_id);
  IF _plages IS NULL THEN
    SELECT array_agg(specialite_id) INTO _plages FROM public.sante_structure_specialites WHERE structure_id = c.structure_id;
  END IF;
  IF _plages IS NULL OR EXISTS (SELECT 1 FROM public.sante_specialites WHERE id = ANY(_plages) AND plages = '{}') THEN
    _tout := true;
  ELSE
    SELECT array_agg(DISTINCT p) || ARRAY['R00-R99', 'Z00-Z99'] INTO _plages
      FROM public.sante_specialites s, unnest(s.plages) p WHERE s.id = ANY(_plages);
  END IF;
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre, (_tout OR public.sante_cim10_dans_plages(k.code, _plages)) AS dans
    FROM public.sante_cim10 k
    WHERE k.actif AND (k.code LIKE _c || '%' OR public.sante_cim10_correspond(k.recherche, _mots))
      AND (_tout OR _toutes OR public.sante_cim10_dans_plages(k.code, _plages))
    ORDER BY (k.code = _c) DESC, (_tout OR public.sante_cim10_dans_plages(k.code, _plages)) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;
