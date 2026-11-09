-- Retour de 0115 : supprime les retours des pilotes. ATTENTION : exporter d'abord public.plateforme_retours.
DROP FUNCTION IF EXISTS public.plateforme_retour_traiter(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.plateforme_retours_lister(text, int);
DROP FUNCTION IF EXISTS public.retours_mes();
DROP FUNCTION IF EXISTS public.retour_envoyer(text, text, text, uuid, jsonb);
DROP TABLE IF EXISTS public.plateforme_retours;
