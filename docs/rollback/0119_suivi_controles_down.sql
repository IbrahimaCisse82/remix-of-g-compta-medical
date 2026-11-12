-- Retour de 0119 : supprime les contrôles programmés (les rendez-vous créés restent dans l'agenda).
DROP FUNCTION IF EXISTS public.sante_controles_a_revoir(uuid, int);
DROP TRIGGER IF EXISTS trg_sante_controle_realise ON public.sante_consultations;
DROP FUNCTION IF EXISTS public.trg_sante_controle_realise();
DROP FUNCTION IF EXISTS public.sante_annuler_controle(uuid, text);
DROP FUNCTION IF EXISTS public.sante_programmer_controle(uuid, date, text, time, int);
DROP TABLE IF EXISTS public.sante_controles;
