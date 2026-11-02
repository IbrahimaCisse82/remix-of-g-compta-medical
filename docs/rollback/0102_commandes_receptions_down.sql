-- Retour arrière de 0102 : suppression des commandes et réceptions ; rejouer la fonction de comptabilisation de 0101.
DROP FUNCTION IF EXISTS public.fn_receptionner_commande(uuid, date, text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.commande_achat_maj_statut(uuid);
DROP FUNCTION IF EXISTS public.commande_ligne_quantites(uuid);
ALTER TABLE public.factures_achat_lignes DROP COLUMN IF EXISTS commande_ligne_id;
ALTER TABLE public.factures_achat DROP COLUMN IF EXISTS commande_id;
DROP TABLE IF EXISTS public.receptions_achat_lignes;
DROP TABLE IF EXISTS public.receptions_achat;
DROP TABLE IF EXISTS public.commandes_achat_lignes;
DROP TABLE IF EXISTS public.commandes_achat;
DROP FUNCTION IF EXISTS public.commandes_achat_guard();
-- puis : fn_comptabiliser_facture_achat de drizzle/migrations/0101_achats_ventilation.sql
