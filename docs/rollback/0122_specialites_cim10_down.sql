-- Retour de 0122 : retire les spécialités CIM-10 (la spécialité texte des praticiens est conservée).
DROP FUNCTION IF EXISTS public.sante_cim10_couverture(uuid);
DROP FUNCTION IF EXISTS public.sante_cim10_specialite(uuid, text, boolean, int);
DROP FUNCTION IF EXISTS public.sante_structure_specialites_definir(uuid, text[]);
DROP FUNCTION IF EXISTS public.sante_cim10_dans_plages(text, text[]);
ALTER TABLE public.sante_praticiens DROP COLUMN IF EXISTS specialite_id;
DROP TABLE IF EXISTS public.sante_structure_specialites;
DROP TABLE IF EXISTS public.sante_specialites;
