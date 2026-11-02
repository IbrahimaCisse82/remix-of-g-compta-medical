-- Retour arrière de 0101 : comptabilisation des achats côté navigateur, sans ventilation ni protection.
DROP TRIGGER IF EXISTS trg_factures_achat_guard ON public.factures_achat;
DROP TRIGGER IF EXISTS trg_factures_achat_lignes_guard ON public.factures_achat_lignes;
DROP FUNCTION IF EXISTS public.factures_achat_guard();
DROP FUNCTION IF EXISTS public.fn_comptabiliser_facture_achat(uuid);
ALTER TABLE public.factures_achat_lignes DROP CONSTRAINT IF EXISTS factures_achat_lignes_nature_check;
ALTER TABLE public.factures_achat_lignes
  DROP COLUMN IF EXISTS mouvement_stock_id, DROP COLUMN IF EXISTS immobilisation_id, DROP COLUMN IF EXISTS date_mise_service,
  DROP COLUMN IF EXISTS duree_annees, DROP COLUMN IF EXISTS article_id, DROP COLUMN IF EXISTS nature;
