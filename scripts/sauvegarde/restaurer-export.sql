-- Essai de restauration d'un export de structure (format g-sante-export-v2) — BASE DE TEST UNIQUEMENT.
-- Recharge l'export dans une NOUVELLE structure (identifiants renouvelés, l'original reste intact), puis compare
-- rubrique par rubrique le nombre de lignes rechargées avec les compteurs de l'export.
-- Les déclencheurs et contrôles de clés sont suspendus pendant le chargement (session_replication_role = replica) :
-- on recharge des lignes déjà validées, sans rejouer les règles de saisie (numérotation, factures immuables…).
-- Les comptes utilisateurs gardent leur identifiant ; tout autre identifiant est renouvelé.
-- Usage : SELECT base_de_test.restaurer_export(<export jsonb>, 'suffixe du nom');
CREATE OR REPLACE FUNCTION base_de_test.restaurer_export(_export jsonb, _suffixe text DEFAULT 'restauration')
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $f$
DECLARE
  _rubriques text[];
  _r text; _table text; _n int; _bilan jsonb := '{}'; _ecarts int := 0;
  _nouvelle uuid;
BEGIN
  IF to_regclass('base_de_test.journal') IS NULL THEN RAISE EXCEPTION 'Réservé à une base de TEST'; END IF;
  IF _export->>'format' <> 'g-sante-export-v2' THEN RAISE EXCEPTION 'Format inattendu : %', _export->>'format'; END IF;
  SET LOCAL session_replication_role = replica;

  -- Correspondance ancien → nouvel identifiant pour tout identifiant de l'export, sauf les comptes utilisateurs
  -- (les mêmes personnes retrouvent leur accès). Les références hors export (contenu clinique…) sont renouvelées
  -- de la même façon, ce qui garde la cohérence entre rubriques.
  CREATE TEMP TABLE _ids(ancien text PRIMARY KEY, nouveau text NOT NULL) ON COMMIT DROP;
  INSERT INTO _ids SELECT u, gen_random_uuid()::text FROM (
    SELECT DISTINCT m[1] AS u FROM regexp_matches(_export::text, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') m) t
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id::text = t.u);
  SELECT nouveau::uuid INTO _nouvelle FROM _ids WHERE ancien = _export->'structure'->>'id';

  -- Structure, avec un nom distinct.
  PERFORM base_de_test._inserer('structures', jsonb_build_array(_export->'structure'),
    jsonb_build_object('nom', (_export->'structure'->>'nom') || ' (' || _suffixe || ')'));

  -- Membres et rôles.
  PERFORM base_de_test._inserer('structure_memberships', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e->'membership_id',
      'user_id', e->'user_id', 'site_id', e->'site_id', 'statut', e->'statut')), '[]') FROM jsonb_array_elements(_export->'membres') e),
    jsonb_build_object('structure_id', _nouvelle));
  PERFORM base_de_test._inserer('medical_user_roles', (SELECT coalesce(jsonb_agg(jsonb_build_object('membership_id', e->'membership_id', 'role', r)), '[]')
      FROM jsonb_array_elements(_export->'membres') e, jsonb_array_elements(e->'roles') r), '{}'::jsonb);

  -- Rubriques tabulaires : patients, assurances, sites, puis les tables sante_<rubrique>.
  SELECT array_agg(k) INTO _rubriques FROM jsonb_each(_export) e(k, v) WHERE jsonb_typeof(v) = 'array' AND k NOT IN ('membres');
  FOREACH _r IN ARRAY _rubriques LOOP
    _table := CASE _r WHEN 'sites' THEN 'sites' WHEN 'patients' THEN 'sante_patients' WHEN 'patient_assurances' THEN 'sante_patient_assurances' ELSE 'sante_' || _r END;
    IF to_regclass('public.' || _table) IS NULL THEN CONTINUE; END IF;
    PERFORM base_de_test._inserer(_table, _export->_r,
      CASE WHEN _r = 'patient_assurances' THEN '{}'::jsonb ELSE jsonb_build_object('structure_id', _nouvelle) END);
  END LOOP;
  SET LOCAL session_replication_role = origin;

  -- Contrôle : lignes présentes dans la structure restaurée, rubrique par rubrique.
  FOREACH _r IN ARRAY _rubriques || ARRAY['membres'] LOOP
    _table := CASE _r WHEN 'sites' THEN 'sites' WHEN 'patients' THEN 'sante_patients' WHEN 'membres' THEN 'structure_memberships' ELSE 'sante_' || _r END;
    IF _r = 'patient_assurances' THEN
      SELECT count(*) INTO _n FROM sante_patient_assurances a JOIN sante_patients p ON p.id = a.patient_id WHERE p.structure_id = _nouvelle;
    ELSIF to_regclass('public.' || _table) IS NULL THEN CONTINUE;
    ELSE EXECUTE format('SELECT count(*) FROM public.%I WHERE structure_id = $1', _table) INTO _n USING _nouvelle;
    END IF;
    IF _n <> (_export->'compteurs'->>_r)::int THEN _ecarts := _ecarts + 1; END IF;
    _bilan := _bilan || jsonb_build_object(_r, jsonb_build_object('export', (_export->'compteurs'->>_r)::int, 'restaure', _n));
  END LOOP;
  RETURN jsonb_build_object('structure_restauree', _nouvelle, 'rubriques', jsonb_array_length(jsonb_path_query_array(_bilan, '$.keyvalue()')),
                            'ecarts', _ecarts, 'detail', _bilan);
END $f$;

-- Remplace dans une ligne chaque identifiant exporté par son nouvel identifiant.
CREATE OR REPLACE FUNCTION base_de_test._remapper(_ligne jsonb) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE _t text := _ligne::text; _u text; _n text;
BEGIN
  FOR _u IN SELECT DISTINCT m[1] FROM regexp_matches(_t, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') m LOOP
    SELECT nouveau INTO _n FROM _ids WHERE ancien = _u;
    IF _n IS NOT NULL THEN _t := replace(_t, _u, _n); END IF;
  END LOOP;
  RETURN _t::jsonb;
END $f$;

-- Insère des lignes exportées : seules les colonnes présentes dans l'export (les autres prennent leur valeur par défaut).
CREATE OR REPLACE FUNCTION base_de_test._inserer(_table text, _lignes jsonb, _ajout jsonb) RETURNS int LANGUAGE plpgsql AS $f$
DECLARE _cols text; _sel text; _n int;
BEGIN
  IF jsonb_array_length(_lignes) = 0 THEN RETURN 0; END IF;
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position), string_agg('r.' || quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO _cols, _sel
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = _table AND c.is_generated = 'NEVER'
     -- Identifiant numérique : renuméroté (l'original occupe déjà le numéro dans cette base).
     AND NOT (c.column_name = 'id' AND c.data_type IN ('bigint', 'integer'))
     AND (c.column_name IN (SELECT jsonb_object_keys(x) FROM jsonb_array_elements(_lignes) x) OR _ajout ? c.column_name);
  EXECUTE format('INSERT INTO public.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_array_elements($1) x, '
                 'LATERAL jsonb_populate_record(NULL::public.%I, base_de_test._remapper(x) || $2) r', _table, _cols, _sel, _table)
    USING _lignes, _ajout;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $f$;
