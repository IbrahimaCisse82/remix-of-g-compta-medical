-- Retour de 0121 : supprime le référentiel CIM-10, les diagnostics codés et les maladies chroniques déclarées.
-- Le diagnostic en texte libre des consultations n'est pas touché.
DROP FUNCTION IF EXISTS public.sante_chronique_statut(uuid, text);
DROP FUNCTION IF EXISTS public.sante_chronique_declarer(uuid, text, text, date, uuid, text);
DROP FUNCTION IF EXISTS public.sante_diagnostic_retirer(uuid);
DROP FUNCTION IF EXISTS public.sante_diagnostic_coder(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.sante_medecin_du_dossier(uuid, uuid);
DROP FUNCTION IF EXISTS public.sante_cim10_chercher(text, int);
DROP FUNCTION IF EXISTS public.plateforme_cim10_importer(text, jsonb);
DROP TABLE IF EXISTS public.sante_maladies_chroniques;
DROP TABLE IF EXISTS public.sante_consultation_diagnostics;
DROP TABLE IF EXISTS public.sante_cim10;
DROP FUNCTION IF EXISTS public.sante_cim10_code(text);
DROP FUNCTION IF EXISTS public.sante_texte_recherche(text);
