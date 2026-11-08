-- Retour arrière de 0052 (personnel). ATTENTION : supprime plannings et forfaits.
-- La colonne bulletins_paie.prime_gardes est conservée (bulletins déjà émis).
DROP FUNCTION IF EXISTS public.sante_primes_gardes_paie(uuid, int, int);
DROP FUNCTION IF EXISTS public.sante_recap_personnel(uuid, int, int);
DROP FUNCTION IF EXISTS public.sante_valider_creneaux(uuid[]);
DROP FUNCTION IF EXISTS public.sante_personnel_liste(uuid);
DROP TABLE IF EXISTS public.sante_plannings;
DROP FUNCTION IF EXISTS public.trg_sante_planning_controle();
DROP TABLE IF EXISTS public.sante_personnel_parametres;
