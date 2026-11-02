-- Retour arrière de 0098 : lettrage sans contrôle serveur, comme à l'origine.
DROP TRIGGER IF EXISTS trg_lettrage_controle ON public.lettrage;
DROP FUNCTION IF EXISTS public.lettrage_controle();
DROP TRIGGER IF EXISTS trg_lettrage_montant ON public.lettrage;
DROP FUNCTION IF EXISTS public.lettrage_montant_journal();
