-- Mobile Money : une transaction comptabilisée n'est plus supprimable (02/11/2026).
-- Constat (recette Banque) : supprimer une transaction rapprochée, ou le moyen de paiement (suppression en cascade),
-- effaçait la trace de l'opération alors que l'écriture BQ restait au journal.
-- Correction : refus de suppression d'une transaction au statut « rapprochee » ; l'annulation passe par la
-- contre-passation de l'écriture. Les transactions importées ou ignorées restent supprimables.
CREATE OR REPLACE FUNCTION public.transactions_mm_suppression_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.statut = 'rapprochee' THEN
    RAISE EXCEPTION 'Transaction Mobile Money comptabilisée : contre-passez l''écriture, elle ne peut pas être supprimée';
  END IF;
  RETURN OLD;
END; $function$;

DROP TRIGGER IF EXISTS trg_transactions_mm_suppression ON public.transactions_mm;
CREATE TRIGGER trg_transactions_mm_suppression BEFORE DELETE ON public.transactions_mm
  FOR EACH ROW EXECUTE FUNCTION public.transactions_mm_suppression_guard();
