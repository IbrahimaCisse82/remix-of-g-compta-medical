-- « C'est moi » : un praticien relie sa fiche à son compte (31/10/2026).
-- Constat (recette par profil) : la mise à jour de sante_praticiens est réservée à l'administrateur ; le bouton
-- « C'est moi » d'un médecin ou d'un biologiste ne modifiait rien (0 ligne, sans erreur) alors que la fiche reliée
-- est nécessaire pour signer les ordonnances et valider les résultats. Fonction dédiée, limitée à ce seul geste :
-- membre actif médecin ou biologiste (ou administrateur), MFA, fiche active de la même structure encore non reliée,
-- une seule fiche par personne et par structure. Journalisée dans medical_audit_log.
CREATE OR REPLACE FUNCTION public.sante_praticien_relier_moi(_praticien_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.sante_praticiens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  SELECT * INTO p FROM public.sante_praticiens WHERE id = _praticien_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche praticien introuvable'; END IF;
  IF NOT coalesce(public.has_any_medical_role(p.structure_id, ARRAY['medecin','biologiste','admin_structure']), false) THEN
    RAISE EXCEPTION 'Accès refusé : seuls un médecin, un biologiste ou l''administrateur peuvent relier une fiche praticien.';
  END IF;
  IF NOT coalesce(public.mfa_conforme(), false) THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF NOT p.actif THEN RAISE EXCEPTION 'Fiche praticien inactive'; END IF;
  IF p.user_id = auth.uid() THEN RETURN; END IF;
  IF p.user_id IS NOT NULL THEN RAISE EXCEPTION 'Cette fiche est déjà reliée au compte d''une autre personne : demandez à l''administrateur de la corriger.'; END IF;
  IF EXISTS (SELECT 1 FROM public.sante_praticiens x WHERE x.structure_id = p.structure_id AND x.user_id = auth.uid() AND x.id <> p.id) THEN
    RAISE EXCEPTION 'Votre compte est déjà relié à une autre fiche praticien de cette structure.';
  END IF;
  UPDATE public.sante_praticiens SET user_id = auth.uid() WHERE id = p.id;
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (p.structure_id, auth.uid(), 'praticien_relier_moi', 'sante_praticiens', p.id, jsonb_build_object('nom', p.nom));
END $function$;
REVOKE ALL ON FUNCTION public.sante_praticien_relier_moi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_praticien_relier_moi(uuid) TO authenticated;
