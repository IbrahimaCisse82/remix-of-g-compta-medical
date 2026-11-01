-- Un compte n'apparaît qu'une fois par dossier (31/10/2026) : l'installation du plan SYSCOHADA de référence
-- depuis l'écran Plan comptable peut ainsi être relancée sans créer de doublons. Ajout uniquement (aucun doublon existant).
CREATE UNIQUE INDEX IF NOT EXISTS plan_comptable_entreprise_numero_uniq ON public.plan_comptable(entreprise_id, numero);
