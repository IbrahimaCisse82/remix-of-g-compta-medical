-- Import tableur des paramètres mesurés et valeurs de référence du catalogue (lot 3 du plan, 31/10/2026).
-- Additive : une fonction d'import et un utilitaire de lecture de nombres. Tout ou rien :
-- une ligne refusée annule l'ensemble. Réimportable : paramètre mis à jour par (analyse, code),
-- valeur de référence remplacée pour le même (paramètre, sexe, tranche d'âge).
-- N'active aucune analyse : l'activation reste un geste du biologiste.

CREATE OR REPLACE FUNCTION public.sante_import_nombre(_v text, _ligne integer, _champ text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _t text := nullif(trim(replace(coalesce(_v, ''), ',', '.')), '');
BEGIN
  IF _t IS NULL THEN RETURN NULL; END IF;
  IF _t !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'Ligne % : % doit être un nombre (reçu « % »)', _ligne, _champ, _v;
  END IF;
  RETURN _t::numeric;
END $$;

CREATE OR REPLACE FUNCTION public.sante_catalogue_importer_references(_structure_id uuid, _lignes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l jsonb; n integer := 0; _aid uuid; _pid uuid; _type text; _sexe text;
  _amin integer; _amax integer; _bas numeric; _haut numeric; _cb numeric; _ch numeric;
  _analyses uuid[] := '{}'; _params uuid[] := '{}'; nb_r integer := 0; _code text; _pcode text;
  _delai numeric; _dec numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  IF NOT coalesce(public.has_any_medical_role(_structure_id, ARRAY['admin_structure','biologiste']), false) THEN
    RAISE EXCEPTION 'Accès refusé : l''import du catalogue est réservé à l''administrateur et au biologiste de la structure.';
  END IF;
  IF NOT coalesce(public.mfa_conforme(), false) THEN
    RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes avant d''importer.';
  END IF;
  IF _lignes IS NULL OR jsonb_typeof(_lignes) <> 'array' OR jsonb_array_length(_lignes) = 0 THEN
    RAISE EXCEPTION 'Fichier vide : aucune ligne à importer.';
  END IF;
  IF jsonb_array_length(_lignes) > 5000 THEN RAISE EXCEPTION 'Fichier trop long (5 000 lignes maximum).'; END IF;

  FOR l IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
    n := n + 1;
    _code := upper(trim(coalesce(l->>'code_analyse', '')));
    SELECT id INTO _aid FROM sante_analyses WHERE structure_id = _structure_id AND code = _code;
    IF _aid IS NULL THEN RAISE EXCEPTION 'Ligne % : analyse « % » absente du catalogue de la structure', n, _code; END IF;

    _delai := public.sante_import_nombre(l->>'delai_heures', n, 'delai_heures');
    IF _delai IS NOT NULL AND (_delai <= 0 OR _delai <> trunc(_delai)) THEN RAISE EXCEPTION 'Ligne % : délai en heures entier positif attendu', n; END IF;
    UPDATE sante_analyses SET
      section = coalesce(nullif(lower(trim(l->>'section')), ''), section),
      tube = coalesce(nullif(trim(l->>'tube'), ''), tube),
      echantillon = coalesce(nullif(trim(l->>'echantillon'), ''), echantillon),
      delai_heures = coalesce(_delai::integer, delai_heures),
      jeune = coalesce(CASE lower(trim(l->>'a_jeun')) WHEN 'oui' THEN true WHEN 'non' THEN false END, jeune),
      sensible = coalesce(CASE lower(trim(l->>'sensible')) WHEN 'oui' THEN true WHEN 'non' THEN false END, sensible)
    WHERE id = _aid;
    IF NOT _aid = ANY(_analyses) THEN _analyses := _analyses || _aid; END IF;

    _pcode := upper(trim(coalesce(l->>'code_parametre', '')));
    IF _pcode = '' THEN CONTINUE; END IF;
    _type := coalesce(nullif(lower(trim(l->>'type')), ''), 'numerique');
    IF _type NOT IN ('numerique','qualitatif','texte') THEN RAISE EXCEPTION 'Ligne % : type « % » inconnu', n, l->>'type'; END IF;
    _dec := public.sante_import_nombre(l->>'decimales', n, 'decimales');
    IF _dec IS NOT NULL AND (_dec < 0 OR _dec > 4 OR _dec <> trunc(_dec)) THEN RAISE EXCEPTION 'Ligne % : décimales entre 0 et 4', n; END IF;

    INSERT INTO sante_analyse_parametres AS p (structure_id, analyse_id, code, libelle, unite, type, decimales, ordre)
    VALUES (_structure_id, _aid, _pcode, coalesce(nullif(trim(l->>'libelle_parametre'), ''), _pcode),
            nullif(trim(l->>'unite'), ''), _type, coalesce(_dec::integer, 1),
            (SELECT coalesce(max(ordre), 0) + 1 FROM sante_analyse_parametres WHERE analyse_id = _aid))
    ON CONFLICT (analyse_id, code) DO UPDATE SET
      libelle = coalesce(nullif(trim(l->>'libelle_parametre'), ''), p.libelle),
      unite = coalesce(nullif(trim(l->>'unite'), ''), p.unite),
      type = _type,
      decimales = coalesce(_dec::integer, p.decimales)
    RETURNING id INTO _pid;
    IF NOT _pid = ANY(_params) THEN _params := _params || _pid; END IF;

    _bas := public.sante_import_nombre(l->>'bas', n, 'bas');
    _haut := public.sante_import_nombre(l->>'haut', n, 'haut');
    _cb := public.sante_import_nombre(l->>'critique_bas', n, 'critique_bas');
    _ch := public.sante_import_nombre(l->>'critique_haut', n, 'critique_haut');
    IF _bas IS NULL AND _haut IS NULL AND _cb IS NULL AND _ch IS NULL THEN CONTINUE; END IF;
    IF _type <> 'numerique' THEN RAISE EXCEPTION 'Ligne % : valeurs de référence réservées aux paramètres numériques', n; END IF;
    IF _bas IS NULL AND _haut IS NULL THEN RAISE EXCEPTION 'Ligne % : au moins une borne normale (bas ou haut) est attendue', n; END IF;
    IF _bas IS NOT NULL AND _haut IS NOT NULL AND _bas > _haut THEN RAISE EXCEPTION 'Ligne % : bas supérieur à haut', n; END IF;
    IF _cb IS NOT NULL AND _ch IS NOT NULL AND _cb > _ch THEN RAISE EXCEPTION 'Ligne % : critique_bas supérieur à critique_haut', n; END IF;
    IF _cb IS NOT NULL AND _bas IS NOT NULL AND _cb > _bas THEN RAISE EXCEPTION 'Ligne % : critique_bas doit être inférieur ou égal à bas', n; END IF;
    IF _ch IS NOT NULL AND _haut IS NOT NULL AND _ch < _haut THEN RAISE EXCEPTION 'Ligne % : critique_haut doit être supérieur ou égal à haut', n; END IF;
    _sexe := nullif(upper(trim(coalesce(l->>'sexe', ''))), '');
    IF _sexe IS NOT NULL AND _sexe NOT IN ('M','F') THEN RAISE EXCEPTION 'Ligne % : sexe M, F ou vide', n; END IF;
    _amin := round(coalesce(public.sante_import_nombre(l->>'age_min_ans', n, 'age_min_ans'), 0) * 365.25);
    _amax := round(coalesce(public.sante_import_nombre(l->>'age_max_ans', n, 'age_max_ans'), 150) * 365.25);
    IF _amin < 0 OR _amax > round(150 * 365.25) OR _amin > _amax THEN RAISE EXCEPTION 'Ligne % : tranche d''âge invalide (0 à 150 ans)', n; END IF;

    DELETE FROM sante_valeurs_reference
     WHERE parametre_id = _pid AND sexe IS NOT DISTINCT FROM _sexe AND age_min_jours = _amin AND age_max_jours = _amax;
    INSERT INTO sante_valeurs_reference(structure_id, parametre_id, sexe, age_min_jours, age_max_jours, bas, haut, critique_bas, critique_haut)
    VALUES (_structure_id, _pid, _sexe, _amin, _amax, _bas, _haut, _cb, _ch);
    nb_r := nb_r + 1;
  END LOOP;

  RETURN jsonb_build_object('lignes', n, 'analyses', coalesce(array_length(_analyses, 1), 0),
                            'parametres', coalesce(array_length(_params, 1), 0), 'references', nb_r);
END $$;

REVOKE ALL ON FUNCTION public.sante_catalogue_importer_references(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_catalogue_importer_references(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.sante_import_nombre(text, integer, text) FROM PUBLIC, anon;
