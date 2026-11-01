-- Retour arrière de 0080 : retire la fonction d'import (les données importées restent en place).
BEGIN;
DROP FUNCTION IF EXISTS public.sante_catalogue_importer_references(uuid, jsonb);
DROP FUNCTION IF EXISTS public.sante_import_nombre(text, integer, text);
COMMIT;
