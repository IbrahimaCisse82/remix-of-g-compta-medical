-- Empreinte détaillée de la structure (schéma public + tâches planifiées + espaces de stockage) :
-- une ligne par objet, avec le md5 de sa définition. Comparer la production et la base de test
-- permet de voir tout écart sans transférer le code des objets.
WITH o(categorie, objet, def) AS (
  SELECT 'colonne', c.table_name || '.' || c.column_name,
         c.data_type || '|' || coalesce(c.udt_name, '') || '|' || c.is_nullable || '|' || coalesce(c.column_default, '')
    FROM information_schema.columns c
    JOIN pg_class t ON t.relname = c.table_name AND t.relnamespace = 'public'::regnamespace AND t.relkind IN ('r', 'p')
   WHERE c.table_schema = 'public'
  UNION ALL
  SELECT 'contrainte', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conrelid <> 0
  UNION ALL
  SELECT 'index', indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT 'fonction', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(p.prosrc) || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' || pg_get_function_result(p.oid)
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
  UNION ALL
  SELECT 'droit_fonction', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         concat_ws(',', CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon' END,
                        CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'authenticated' END)
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
  UNION ALL
  SELECT 'declencheur', tgrelid::regclass::text || '.' || tgname, pg_get_triggerdef(oid)
    FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
  UNION ALL
  SELECT 'politique', tablename || '.' || policyname,
         cmd || '|' || permissive || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
    FROM pg_policies WHERE schemaname = 'public'
  UNION ALL
  SELECT 'rls', relname, relrowsecurity::text || '|' || relforcerowsecurity::text
    FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')
  UNION ALL
  SELECT 'type', t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname
  UNION ALL
  SELECT 'vue', c.relname, md5(pg_get_viewdef(c.oid))
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
  UNION ALL
  SELECT 'tache_planifiee', jobname, schedule || '|' || command FROM cron.job
  UNION ALL
  SELECT 'stockage', id, public::text || '|' || coalesce(file_size_limit::text, '') || '|' || coalesce(array_to_string(allowed_mime_types, ','), '') FROM storage.buckets
  UNION ALL
  SELECT 'politique_stockage', tablename || '.' || policyname,
         cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
    FROM pg_policies WHERE schemaname = 'storage'
)
SELECT categorie, objet, md5(def) AS empreinte FROM o ORDER BY categorie, objet;
