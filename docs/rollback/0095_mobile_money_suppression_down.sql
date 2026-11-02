-- Retour arrière de 0095 : suppression des transactions Mobile Money sans contrôle, comme à l'origine.
DROP TRIGGER IF EXISTS trg_transactions_mm_suppression ON public.transactions_mm;
DROP FUNCTION IF EXISTS public.transactions_mm_suppression_guard();
