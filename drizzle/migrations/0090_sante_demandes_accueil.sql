-- Laboratoire vu de l'accueil (31/10/2026).
-- Constat (recette par profil) : la secrétaire et l'administrateur peuvent créer une demande d'analyses et
-- enregistrer la remise du compte rendu (politique « remises ajout »), mais la lecture de sante_demandes_labo est
-- réservée au personnel du laboratoire et au médecin traitant : leur liste restait vide, la remise impossible.
-- Fonction de lecture limitée aux informations administratives (numéro, patient, statut, urgence, date) :
-- ni analyses demandées, ni renseignements cliniques, ni résultats. Le secret médical reste inchangé.
CREATE OR REPLACE FUNCTION public.sante_demandes_accueil(_structure_id uuid, _statut text DEFAULT 'actives', _limit integer DEFAULT 25, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, numero text, statut text, urgence boolean, created_at timestamptz, patient_id uuid, patient_nom text, patient_prenoms text, numero_dossier text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
  IF NOT coalesce(public.has_any_medical_role(_structure_id, ARRAY['admin_structure','secretaire']), false) THEN
    RAISE EXCEPTION 'Accès refusé : réservé à l''accueil et à l''administrateur.';
  END IF;
  IF NOT coalesce(public.mfa_conforme(), false) THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF NOT coalesce(public.structure_module_actif(_structure_id, 'sante_laboratoire'), false) THEN RETURN; END IF;
  RETURN QUERY
  SELECT d.id, d.numero, d.statut::text, d.urgence, d.created_at, d.patient_id, p.nom, p.prenoms, p.numero_dossier
  FROM public.sante_demandes_labo d JOIN public.sante_patients p ON p.id = d.patient_id
  WHERE d.structure_id = _structure_id
    AND CASE coalesce(_statut, 'actives')
          WHEN 'actives' THEN d.statut::text NOT IN ('validee', 'rejetee')
          WHEN 'toutes' THEN true
          ELSE d.statut::text = _statut END
  ORDER BY d.urgence DESC, d.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 25), 1), 100) OFFSET greatest(coalesce(_offset, 0), 0);
END $function$;
REVOKE ALL ON FUNCTION public.sante_demandes_accueil(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_demandes_accueil(uuid, text, integer, integer) TO authenticated;
