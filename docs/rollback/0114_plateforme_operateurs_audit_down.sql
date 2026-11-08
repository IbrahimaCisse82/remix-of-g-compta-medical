-- Retour de 0114 : supprime le socle du back-office (opérateurs et journal d'audit de la plateforme).
-- ATTENTION : le journal d'audit est perdu. L'exporter avant (select * from public.plateforme_audit).
DROP FUNCTION IF EXISTS public.plateforme_operateur_definir(text, text, boolean);
DROP FUNCTION IF EXISTS public.plateforme_operateurs_lister();
DROP FUNCTION IF EXISTS public.plateforme_journal(int, bigint);
DROP FUNCTION IF EXISTS public.plateforme_tracer(text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.plateforme_moi();
DROP FUNCTION IF EXISTS public.est_proprietaire_plateforme();
DROP FUNCTION IF EXISTS public.est_operateur();
DROP TABLE IF EXISTS public.plateforme_audit;
DROP FUNCTION IF EXISTS public.plateforme_audit_immuable();
DROP TABLE IF EXISTS public.plateforme_operateurs;
