-- Retour de 0123 : rétablit les fonctions de recherche de 0121 et 0122, puis retire les fonctions d'aide.
CREATE OR REPLACE FUNCTION public.sante_cim10_chercher(_q text, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t text := public.sante_texte_recherche(btrim(coalesce(_q, ''))); _mots text[]; _c text := public.sante_cim10_code(_q);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF length(_t) < 2 THEN RETURN; END IF;
  _mots := regexp_split_to_array(_t, '\s+');
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre FROM public.sante_cim10 k
    WHERE k.actif AND (k.code LIKE _c || '%' OR NOT EXISTS (SELECT 1 FROM unnest(_mots) m WHERE position(m IN k.recherche) = 0))
    ORDER BY (k.code = _c) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;
CREATE OR REPLACE FUNCTION public.sante_cim10_specialite(_consultation_id uuid, _q text, _toutes boolean DEFAULT false, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text, dans_specialite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; _plages text[]; _tout boolean := false;
  _t text := public.sante_texte_recherche(btrim(coalesce(_q, ''))); _mots text[]; _c text := public.sante_cim10_code(_q);
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF c.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Consultation introuvable' USING ERRCODE = '42501';
  END IF;
  IF length(_t) < 2 THEN RETURN; END IF;
  _mots := regexp_split_to_array(_t, '\s+');
  -- Spécialités retenues : celle du praticien, à défaut celles de la structure.
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
    WHERE k.actif AND (k.code LIKE _c || '%' OR NOT EXISTS (SELECT 1 FROM unnest(_mots) m WHERE position(m IN k.recherche) = 0))
      AND (_tout OR _toutes OR public.sante_cim10_dans_plages(k.code, _plages))
    ORDER BY (k.code = _c) DESC, (_tout OR public.sante_cim10_dans_plages(k.code, _plages)) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;
DROP FUNCTION IF EXISTS public.sante_cim10_correspond(text, text[]);
DROP FUNCTION IF EXISTS public.sante_cim10_mots(text);
