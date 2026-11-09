-- Retour de 0116 : retire les écrans Tableau de bord, Clients et Utilisateurs du back-office (lecture seule, aucune donnée perdue).
DROP FUNCTION IF EXISTS public.plateforme_utilisateur_chercher(text);
DROP FUNCTION IF EXISTS public.plateforme_clients_lister(text, boolean);
DROP FUNCTION IF EXISTS public.plateforme_tableau_bord();
DROP FUNCTION IF EXISTS public.plateforme_est_structure_test(uuid);
