-- 0113 — Phase pilote : un client ne peut plus créer, modifier ni supprimer son abonnement.
-- Avant : politiques abonnements_ins / _upd / _del ouvertes à can_write_entreprise / can_admin_entreprise, donc un
-- administrateur client pouvait s'attribuer n'importe quel plan et n'importe quelle date de fin.
-- Après : lecture seule pour les membres (abonnements_sel inchangée) ; l'écriture passera par le back-office
-- opérateur (fonctions serveur), lot commercial. Les pages « Mon abonnement » / « Abonnements clients » restent
-- masquées (src/lib/delivery-scope.ts).
-- Retour : docs/rollback/0113_abonnements_lecture_seule_clients_down.sql
DROP POLICY IF EXISTS abonnements_ins ON public.abonnements;
DROP POLICY IF EXISTS abonnements_upd ON public.abonnements;
DROP POLICY IF EXISTS abonnements_del ON public.abonnements;
DROP POLICY IF EXISTS "abonnements access" ON public.abonnements;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.abonnements FROM anon, authenticated;
