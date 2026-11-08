-- Retour de 0111 : retire la tâche d'alertes ; les espaces de stockage ne sont supprimés que s'ils sont vides.
SELECT cron.unschedule('alertes-echeances-quotidiennes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertes-echeances-quotidiennes');
DELETE FROM storage.buckets b WHERE b.id IN ('ged', 'sante-documents') AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = b.id);
