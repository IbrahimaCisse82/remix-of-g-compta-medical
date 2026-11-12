-- Retour de 0128 : les comptes déjà ajoutés aux dossiers et les lignes du journal restent (journal immuable).
DROP FUNCTION IF EXISTS public.plateforme_referentiels_etat();
DROP FUNCTION IF EXISTS public.plateforme_compte_commun_definir(text, text, text, boolean);
DROP FUNCTION IF EXISTS public.plan_installer_reference(uuid);
DROP FUNCTION IF EXISTS public.plan_reference_comptes(boolean);
DROP FUNCTION IF EXISTS public.plan_reference_version();
DROP TABLE IF EXISTS public.plateforme_comptes_communs;
