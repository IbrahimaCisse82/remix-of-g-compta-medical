-- Retour de 0120 : les factures émises restent ; seules les deux fonctions disparaissent.
DROP FUNCTION IF EXISTS public.sante_facturer_consultation(uuid, uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.sante_consultations_a_facturer(uuid, int);
