-- Retour arrière de 0079 (bibliothèque des textes de consentement).
-- À n'exécuter que si aucune signature n'a été recueillie depuis un modèle :
--   SELECT count(*) FROM public.sante_consentements WHERE modele_id IS NOT NULL;  -- doit valoir 0
-- Les consentements signés restent intacts (texte, version et empreintes sont copiés dans chaque signature).
BEGIN;
DROP FUNCTION IF EXISTS public.sante_signer_consentement_modele(uuid, uuid, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.sante_modele_consentement_archiver(uuid);
DROP FUNCTION IF EXISTS public.sante_modele_consentement_creer(uuid, text, text, text, text, text);
ALTER TABLE public.sante_consentements DROP COLUMN IF EXISTS modele_id;
DROP TABLE IF EXISTS public.sante_consentement_modeles;
DROP FUNCTION IF EXISTS public.sante_consentement_modele_immuable();
COMMIT;
