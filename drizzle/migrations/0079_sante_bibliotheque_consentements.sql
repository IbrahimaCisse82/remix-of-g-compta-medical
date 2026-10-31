-- Bibliothèque de textes de consentement par structure (demande du 30/10/2026).
-- L'administrateur enregistre une fois chaque texte validé (juriste / responsable),
-- le soignant le choisit dans une liste au lieu de le retaper.
-- Migration additive : la signature libre existante (sante_signer_consentement) reste disponible
-- et les consentements déjà recueillis ne sont pas modifiés.

CREATE TABLE IF NOT EXISTS public.sante_consentement_modeles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('traitement_donnees','soins','partage_tiers_payant','portail_sms')),
  version text NOT NULL CHECK (length(trim(version)) >= 2),
  titre text NOT NULL CHECK (length(trim(titre)) >= 3),
  texte text NOT NULL CHECK (length(trim(texte)) >= 50),
  texte_sha256 text NOT NULL,
  valide_par text,
  actif boolean NOT NULL DEFAULT true,
  cree_par uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  archive_par uuid,
  archive_le timestamptz,
  UNIQUE (structure_id, type, version)
);
CREATE INDEX IF NOT EXISTS idx_consentement_modeles_structure ON public.sante_consentement_modeles(structure_id, type) WHERE actif;

ALTER TABLE public.sante_consentements
  ADD COLUMN IF NOT EXISTS modele_id uuid REFERENCES public.sante_consentement_modeles(id) ON DELETE RESTRICT;

-- Un texte validé ne se modifie jamais : on l'archive et on crée une nouvelle version.
CREATE OR REPLACE FUNCTION public.sante_consentement_modele_immuable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un texte de consentement ne peut pas être supprimé : archivez-le.';
  END IF;
  IF NEW.structure_id IS DISTINCT FROM OLD.structure_id OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.titre IS DISTINCT FROM OLD.titre
     OR NEW.texte IS DISTINCT FROM OLD.texte OR NEW.texte_sha256 IS DISTINCT FROM OLD.texte_sha256
     OR NEW.valide_par IS DISTINCT FROM OLD.valide_par OR NEW.cree_par IS DISTINCT FROM OLD.cree_par
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Un texte de consentement validé ne peut pas être modifié : archivez-le et créez une nouvelle version.';
  END IF;
  IF OLD.actif = false AND NEW.actif = true THEN
    RAISE EXCEPTION 'Un texte archivé ne peut pas être réactivé : créez une nouvelle version.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_consentement_modele_immuable ON public.sante_consentement_modeles;
CREATE TRIGGER trg_consentement_modele_immuable BEFORE UPDATE OR DELETE ON public.sante_consentement_modeles
FOR EACH ROW EXECUTE FUNCTION public.sante_consentement_modele_immuable();

DROP TRIGGER IF EXISTS trg_audit_sante_consentement_modeles ON public.sante_consentement_modeles;
CREATE TRIGGER trg_audit_sante_consentement_modeles AFTER INSERT OR UPDATE ON public.sante_consentement_modeles
FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

-- Lecture : tout membre actif de la structure. Écriture : uniquement via les fonctions ci-dessous.
ALTER TABLE public.sante_consentement_modeles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consentement modeles lecture" ON public.sante_consentement_modeles;
CREATE POLICY "consentement modeles lecture" ON public.sante_consentement_modeles
  FOR SELECT USING (public.is_structure_member(structure_id));
DROP POLICY IF EXISTS "consentement modeles mfa" ON public.sante_consentement_modeles;
CREATE POLICY "consentement modeles mfa" ON public.sante_consentement_modeles
  AS RESTRICTIVE FOR ALL USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
REVOKE INSERT, UPDATE, DELETE ON public.sante_consentement_modeles FROM anon, authenticated;
GRANT SELECT ON public.sante_consentement_modeles TO authenticated;

-- Création d'un texte validé (administrateur + MFA).
CREATE OR REPLACE FUNCTION public.sante_modele_consentement_creer(
  _structure_id uuid, _type text, _version text, _titre text, _texte text, _valide_par text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  IF NOT coalesce(public.is_structure_admin(_structure_id), false) THEN
    RAISE EXCEPTION 'Accès refusé : seul l''administrateur de la structure enregistre les textes de consentement.';
  END IF;
  IF NOT coalesce(public.mfa_conforme(), false) THEN
    RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes avant d''enregistrer un texte.';
  END IF;
  IF _type IS NULL OR _type NOT IN ('traitement_donnees','soins','partage_tiers_payant','portail_sms') THEN
    RAISE EXCEPTION 'Type de consentement inconnu';
  END IF;
  IF _version IS NULL OR length(trim(_version)) < 2 THEN RAISE EXCEPTION 'Version du texte obligatoire (2 caractères minimum)'; END IF;
  IF _titre IS NULL OR length(trim(_titre)) < 3 THEN RAISE EXCEPTION 'Titre obligatoire (3 caractères minimum)'; END IF;
  IF _texte IS NULL OR length(trim(_texte)) < 50 THEN RAISE EXCEPTION 'Texte intégral obligatoire (50 caractères minimum)'; END IF;
  IF EXISTS (SELECT 1 FROM sante_consentement_modeles WHERE structure_id = _structure_id AND type = _type AND version = trim(_version)) THEN
    RAISE EXCEPTION 'La version « % » existe déjà pour ce type de consentement : choisissez un nouveau numéro de version.', trim(_version);
  END IF;
  INSERT INTO sante_consentement_modeles(structure_id, type, version, titre, texte, texte_sha256, valide_par, cree_par)
  VALUES (_structure_id, _type, trim(_version), trim(_titre), _texte,
          encode(extensions.digest(_texte, 'sha256'), 'hex'), nullif(trim(coalesce(_valide_par, '')), ''), auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Archivage (le texte reste lisible et rattaché aux signatures déjà recueillies).
CREATE OR REPLACE FUNCTION public.sante_modele_consentement_archiver(_modele_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _actif boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  SELECT structure_id, actif INTO _sid, _actif FROM sante_consentement_modeles WHERE id = _modele_id;
  IF _sid IS NULL THEN RAISE EXCEPTION 'Texte de consentement introuvable'; END IF;
  IF NOT coalesce(public.is_structure_admin(_sid), false) THEN
    RAISE EXCEPTION 'Accès refusé : seul l''administrateur de la structure archive les textes de consentement.';
  END IF;
  IF NOT coalesce(public.mfa_conforme(), false) THEN
    RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes avant d''archiver un texte.';
  END IF;
  IF NOT _actif THEN RAISE EXCEPTION 'Ce texte est déjà archivé'; END IF;
  UPDATE sante_consentement_modeles SET actif = false, archive_par = auth.uid(), archive_le = now() WHERE id = _modele_id;
END $$;

-- Signature à partir d'un texte de la bibliothèque : type, version et texte viennent du modèle,
-- jamais de la saisie. Les contrôles de rôle, MFA et module restent ceux de sante_signer_consentement.
CREATE OR REPLACE FUNCTION public.sante_signer_consentement_modele(
  _patient_id uuid, _modele_id uuid, _accorde boolean, _signataire_nom text, _signataire_qualite text, _signature_png text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m sante_consentement_modeles%ROWTYPE; _psid uuid; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  SELECT * INTO _m FROM sante_consentement_modeles WHERE id = _modele_id;
  SELECT structure_id INTO _psid FROM sante_patients WHERE id = _patient_id;
  IF _m.id IS NULL OR _psid IS NULL OR _m.structure_id IS DISTINCT FROM _psid THEN
    RAISE EXCEPTION 'Texte de consentement introuvable pour la structure de ce patient';
  END IF;
  IF NOT _m.actif THEN RAISE EXCEPTION 'Ce texte de consentement est archivé : choisissez la version en vigueur.'; END IF;
  _id := public.sante_signer_consentement(_patient_id, _m.type, _m.version, _m.texte, _accorde,
                                          _signataire_nom, _signataire_qualite, _signature_png);
  UPDATE sante_consentements SET modele_id = _m.id WHERE id = _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.sante_modele_consentement_creer(uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sante_modele_consentement_archiver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sante_signer_consentement_modele(uuid, uuid, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_modele_consentement_creer(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sante_modele_consentement_archiver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sante_signer_consentement_modele(uuid, uuid, boolean, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sante_consentement_modele_immuable() FROM PUBLIC, anon, authenticated;
