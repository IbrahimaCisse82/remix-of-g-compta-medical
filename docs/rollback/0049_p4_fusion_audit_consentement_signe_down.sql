-- Retour arrière de 0049 (à n'utiliser qu'en cas d'incident).
-- 1) La fonction de signature et les colonnes ajoutées sont retirées.
--    ⚠️ Les signatures recueillies depuis 0049 seraient perdues : exporter
--    sante_consentements avant (SELECT * … WHERE signature_png IS NOT NULL).
DROP FUNCTION IF EXISTS public.sante_signer_consentement(uuid,text,text,text,boolean,text,text,text);
ALTER TABLE public.sante_consentements
  DROP COLUMN IF EXISTS texte_sha256,
  DROP COLUMN IF EXISTS signature_sha256,
  DROP COLUMN IF EXISTS signature_png,
  DROP COLUMN IF EXISTS signataire_qualite,
  DROP COLUMN IF EXISTS signataire_nom;
-- 2) Fonctions de fusion : la version 0044 était inutilisable (colonnes d'audit
--    inexistantes). Pas de retour à 0044 ; en cas de besoin, désactiver la fusion :
-- CREATE OR REPLACE FUNCTION public.sante_proposer_fusion(_conserve uuid, _fusionne uuid, _motif text)
-- RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fusion temporairement désactivée'; END $$;
