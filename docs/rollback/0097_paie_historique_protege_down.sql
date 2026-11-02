-- Retour arrière de 0097 : bulletins et salariés sans protection, comme à l'origine.
DROP TRIGGER IF EXISTS trg_bulletins_paie_guard ON public.bulletins_paie;
DROP FUNCTION IF EXISTS public.bulletins_paie_guard();
DROP TRIGGER IF EXISTS trg_employees_suppression ON public.employees;
DROP FUNCTION IF EXISTS public.employees_suppression_guard();
DROP FUNCTION IF EXISTS public.paie_ecriture_en_vigueur(uuid, text);
