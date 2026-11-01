-- Suppression des lectures anonymes « démo » (31/10/2026).
-- Toute entreprise sans propriétaire (user_id NULL) et ses écritures, factures, clients, balance, plan, immobilisations
-- étaient lisibles sans connexion. L'entreprise de démonstration n'existe pas en base : le mode démo utilise les données
-- intégrées à l'application (src/lib/demo-data.ts) et ne dépend pas de ces règles. Seule « TEST P2 A » était exposée.
DROP POLICY IF EXISTS "Anon read demo amortissements" ON public.amortissements;
DROP POLICY IF EXISTS "Anon read demo balance" ON public.balance;
DROP POLICY IF EXISTS "Anon read demo clients" ON public.clients;
DROP POLICY IF EXISTS "Anon read demo entreprises" ON public.entreprises;
DROP POLICY IF EXISTS "Anon read demo exercices" ON public.exercices;
DROP POLICY IF EXISTS "Anon read demo facture_lignes" ON public.facture_lignes;
DROP POLICY IF EXISTS "Anon read demo factures" ON public.factures;
DROP POLICY IF EXISTS "Anon read demo immobilisations" ON public.immobilisations;
DROP POLICY IF EXISTS "Anon read demo journal" ON public.journal;
DROP POLICY IF EXISTS "Anon read demo notes_annexes_data" ON public.notes_annexes_data;
DROP POLICY IF EXISTS "Anon read demo plan_comptable" ON public.plan_comptable;
