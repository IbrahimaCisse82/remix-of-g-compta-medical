-- Retour de 0117. Termine d'abord les accès accordés (retire les rattachements temporaires), puis supprime le dispositif.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.plateforme_acces_support WHERE statut IN ('demande', 'accorde') LOOP
    PERFORM public.plateforme_support_terminer(r.id, 'revoque');
  END LOOP;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'support-expiration-horaire') THEN PERFORM cron.unschedule('support-expiration-horaire'); END IF;
END $$;
DROP FUNCTION IF EXISTS public.plateforme_support_expirer();
DROP FUNCTION IF EXISTS public.support_revoquer(uuid);
DROP FUNCTION IF EXISTS public.support_decider(uuid, boolean);
DROP FUNCTION IF EXISTS public.support_demandes_structure(uuid);
DROP FUNCTION IF EXISTS public.plateforme_support_lister();
DROP FUNCTION IF EXISTS public.plateforme_support_demander(uuid, text, int);
DROP FUNCTION IF EXISTS public.plateforme_support_terminer(uuid, text);
DROP TABLE IF EXISTS public.plateforme_acces_support;
