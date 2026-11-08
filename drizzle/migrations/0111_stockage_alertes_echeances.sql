-- 0111 — Éléments de production qui n'étaient décrits dans aucune migration (constat de la reconstruction de la base
-- de test du 08/11/2026) :
-- 1. Espaces de stockage privés « ged » (documents comptables) et « sante-documents » (documents patients, 20 Mo max),
--    créés hors migration ; leurs règles d'accès, elles, sont déjà dans les migrations.
-- 2. Tâche quotidienne « alertes-echeances-quotidiennes » (6 h UTC) : prévue par la migration Lovable du 15/08/2026
--    mais absente de la production ; sans elle, aucune alerte d'échéance fiscale n'est générée.
-- Additive et idempotente : ne modifie rien qui existe déjà.
-- La tâche « sante-rappels-18h » (appel de la fonction sante-rappels avec le jeton de sante_cron_config) dépend de
-- l'environnement et reste créée à la main : voir scripts/db-test/README.md.
-- Retour : docs/rollback/0111_stockage_alertes_echeances_down.sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ged', 'ged', false, NULL), ('sante-documents', 'sante-documents', false, 20971520)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertes-echeances-quotidiennes') THEN
    PERFORM cron.schedule('alertes-echeances-quotidiennes', '0 6 * * *', 'SELECT public.fn_generer_alertes_echeances();');
  END IF;
END $$;
