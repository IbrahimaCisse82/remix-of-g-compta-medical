-- Retour arrière de 0051 (rétrocessions). ATTENTION : supprime règles et relevés.
-- Les écritures comptables déjà générées sont CONSERVÉES : contre-passez-les manuellement si nécessaire.
DROP FUNCTION IF EXISTS public.sante_annuler_retrocession(uuid, text);
DROP FUNCTION IF EXISTS public.sante_payer_retrocession(uuid, text, text);
DROP FUNCTION IF EXISTS public.sante_valider_retrocession(uuid, date, date);
DROP FUNCTION IF EXISTS public.sante_calcul_retrocession(uuid, date, date);
DROP TABLE IF EXISTS public.sante_retrocessions;
DROP TABLE IF EXISTS public.sante_retrocession_regles;
ALTER TABLE public.sante_praticiens DROP CONSTRAINT IF EXISTS sante_praticiens_taux_retenue_chk;
ALTER TABLE public.sante_praticiens DROP COLUMN IF EXISTS taux_retenue_source;
-- sante_compte_defaut : les 3 clés ajoutées (honoraires_praticiens, praticiens, retenue_source) peuvent rester sans effet.
