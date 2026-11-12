-- Retour de 0126 : les rattachements déjà faits restent (lignes de sante_facturation_sources) ; seules les fonctions disparaissent.
DROP FUNCTION IF EXISTS public.sante_rattacher_facture_consultation(uuid, uuid);
DROP FUNCTION IF EXISTS public.sante_factures_rattachables(uuid);
