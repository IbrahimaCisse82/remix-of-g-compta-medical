-- CORRECTIF DE SÉCURITÉ (critique) — trouvé le 22/10/2026 lors de la recette de l'Étape 3.
-- can_write_entreprise / can_admin_entreprise renvoyaient NULL (et non false) pour un utilisateur
-- sans droit sur l'entreprise (get_entreprise_role = NULL ; NULL IN (...) = NULL).
-- Dans les politiques RLS, NULL vaut « refus » : pas d'impact. Mais en PL/pgSQL,
-- « IF NOT can_write_entreprise(x) THEN RAISE » ne lève RIEN quand la valeur est NULL.
-- Fonctions concernées (7) : fn_creer_ecriture, fn_valider_ecriture, fn_contrepasser_ecriture,
-- fn_cloturer_exercice, fn_rouvrir_exercice, fn_resync_balance, set_secteur_activite.
-- Démontré en transaction annulée : un utilisateur inconnu pouvait créer une écriture validée
-- dans le dossier comptable d'un autre. Correctif : renvoyer toujours un booléen strict.
-- Aucun appelant n'est modifié ; la sémantique RLS est inchangée (NULL et false = refus).

CREATE OR REPLACE FUNCTION public.can_write_entreprise(_entreprise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(public.get_entreprise_role(auth.uid(), _entreprise_id) IN ('admin','comptable'), false);
$function$;

CREATE OR REPLACE FUNCTION public.can_admin_entreprise(_entreprise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(public.get_entreprise_role(auth.uid(), _entreprise_id) = 'admin', false);
$function$;
