-- Retour de 0129 : retire les fonctions de mise à jour des référentiels en back-office.
-- Les versions du plan déjà publiées (visées) et les codes CIM-10 modifiés sont conservés : ce sont des données
-- de référence validées ; seul un brouillon non publié est supprimé. Le journal (immuable) n'est pas touché.
DROP FUNCTION IF EXISTS public.plateforme_cim10_desactiver_absents(text, boolean);
DROP FUNCTION IF EXISTS public.plateforme_cim10_code_definir(text, text, boolean, text);
DROP FUNCTION IF EXISTS public.plateforme_cim10_chercher(text, boolean, int);
DROP FUNCTION IF EXISTS public.plateforme_plan_version_publier(text, text);
DROP FUNCTION IF EXISTS public.plateforme_plan_version_supprimer(text);
DROP FUNCTION IF EXISTS public.plateforme_plan_compte_modifier(text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.plateforme_plan_version_creer(text, text);
DROP FUNCTION IF EXISTS public.plateforme_plan_versions();
DROP FUNCTION IF EXISTS public.plateforme_plan_ecarts(text);
DROP FUNCTION IF EXISTS public.plan_version_comptes(text);

-- Fonction de 0127 (sans priorité du code officiel sur le code de la structure).
CREATE OR REPLACE FUNCTION public.sante_cim10_structure(_structure_id uuid)
RETURNS TABLE(code text, libelle text, chapitre text, recherche text, propre boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.code, k.libelle, k.chapitre, k.recherche, false FROM public.sante_cim10 k WHERE k.actif
  UNION ALL
  SELECT l.code, l.libelle, o.chapitre, l.recherche, true
    FROM public.sante_cim10_structure_codes l
    LEFT JOIN public.sante_cim10 o ON o.code = left(l.code, 3)
   WHERE l.structure_id = _structure_id AND l.actif
$$;
REVOKE ALL ON FUNCTION public.sante_cim10_structure(uuid) FROM PUBLIC, anon, authenticated;

DELETE FROM public.syscohada_references WHERE NOT valide_officiellement AND base_version IS NOT NULL;
ALTER TABLE public.syscohada_references
  DROP COLUMN IF EXISTS publie_par,
  DROP COLUMN IF EXISTS cree_par,
  DROP COLUMN IF EXISTS base_version,
  DROP COLUMN IF EXISTS note;
