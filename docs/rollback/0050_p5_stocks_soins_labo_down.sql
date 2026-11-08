-- Retour arrière de 0050 (stocks reliés aux soins et au labo).
-- ATTENTION : supprime l'historique des délivrances et des consommations de réactifs.
-- Les mouvements de stock (mouvements_stock), les quantités d'articles et de lots déjà
-- décomptées, et les écritures comptables générées sont CONSERVÉS (données comptables).
DROP TRIGGER IF EXISTS sante_consommer_reactifs ON public.sante_demandes_labo;
DROP FUNCTION IF EXISTS public.trg_sante_consommer_reactifs();
DROP FUNCTION IF EXISTS public.sante_alertes_stock(uuid);
DROP FUNCTION IF EXISTS public.sante_dispenser(uuid, jsonb);
DROP FUNCTION IF EXISTS public.sante_articles_disponibles(uuid);
DROP TABLE IF EXISTS public.sante_consommations_reactifs;
DROP TABLE IF EXISTS public.sante_analyse_reactifs;
DROP TABLE IF EXISTS public.sante_dispensations;
