-- 0116 — Back-office, lot pilote : Tableau de bord, Clients, Utilisateurs.
-- Uniquement des comptages et des informations de compte : aucun nom de patient, aucun contenu médical.
-- Toutes les fonctions exigent est_operateur() (opérateur actif en double authentification).
-- La recherche d'un utilisateur est inscrite au journal d'audit de la plateforme.
-- Retour : docs/rollback/0116_backoffice_tableau_clients_utilisateurs_down.sql

-- Structure de test : nom marqué TEST / démo / e2e, ou tous ses membres sur un domaine de test.
CREATE OR REPLACE FUNCTION public.plateforme_est_structure_test(_structure_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM public.structures s WHERE s.id = _structure_id
           AND s.nom ~* '(^|[^a-z])(test|d[ée]mo|e2e|recette|essai)([^a-z]|$)')
      OR NOT EXISTS (SELECT 1 FROM public.structure_memberships m JOIN auth.users u ON u.id = m.user_id
           WHERE m.structure_id = _structure_id AND u.email !~* '@(gsante\.test|gcompta\.sn|example\.(com|org))$');
$$;
REVOKE ALL ON FUNCTION public.plateforme_est_structure_test(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_tableau_bord()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _r jsonb; _reelles uuid[];
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(array_agg(s.id), '{}') INTO _reelles FROM public.structures s WHERE NOT public.plateforme_est_structure_test(s.id);
  SELECT jsonb_build_object(
    'structures_reelles', cardinality(_reelles),
    'structures_test', (SELECT count(*) FROM public.structures) - cardinality(_reelles),
    'par_type', (SELECT coalesce(jsonb_object_agg(t, n), '{}') FROM (SELECT s.type::text t, count(*) n FROM public.structures s WHERE s.id = ANY(_reelles) GROUP BY 1) x),
    'utilisateurs', (SELECT count(DISTINCT m.user_id) FROM public.structure_memberships m WHERE m.structure_id = ANY(_reelles) AND m.statut = 'actif'),
    'connectes_7j', (SELECT count(DISTINCT m.user_id) FROM public.structure_memberships m JOIN auth.users u ON u.id = m.user_id
                      WHERE m.structure_id = ANY(_reelles) AND u.last_sign_in_at > now() - interval '7 days'),
    'admins_sans_double_auth', (SELECT count(DISTINCT m.user_id) FROM public.structure_memberships m
                      JOIN public.medical_user_roles r ON r.membership_id = m.id AND r.role::text = 'admin_structure'
                      WHERE m.structure_id = ANY(_reelles) AND m.statut = 'actif'
                        AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = m.user_id AND f.status = 'verified')),
    'retours_ouverts', (SELECT count(*) FROM public.plateforme_retours WHERE statut IN ('nouveau', 'en_cours', 'planifie')),
    'retours_nouveaux', (SELECT count(*) FROM public.plateforme_retours WHERE statut = 'nouveau'),
    'retours_bloquants', (SELECT count(*) FROM public.plateforme_retours WHERE priorite = 'bloquante' AND statut NOT IN ('resolu', 'rejete')),
    'compta_en_erreur', (SELECT count(*) FROM public.sante_compta_evenements e WHERE e.statut = 'en_erreur' AND e.structure_id = ANY(_reelles)),
    'activite_7j', jsonb_build_object(
      'patients', (SELECT count(*) FROM public.sante_patients p WHERE p.structure_id = ANY(_reelles) AND p.created_at > now() - interval '7 days'),
      'consultations', (SELECT count(*) FROM public.sante_consultations c WHERE c.structure_id = ANY(_reelles) AND c.created_at > now() - interval '7 days'),
      'demandes_labo', (SELECT count(*) FROM public.sante_demandes_labo d WHERE d.structure_id = ANY(_reelles) AND d.created_at > now() - interval '7 days'),
      'factures', (SELECT count(*) FROM public.sante_factures f WHERE f.structure_id = ANY(_reelles) AND f.created_at > now() - interval '7 days'))
  ) INTO _r;
  RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_tableau_bord() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_tableau_bord() TO authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_clients_lister(_recherche text DEFAULT NULL, _inclure_test boolean DEFAULT false)
RETURNS TABLE(structure_id uuid, nom text, type text, entreprise text, ninea text, telephone text, created_at timestamptz, est_test boolean,
              membres int, administrateurs text[], derniere_connexion timestamptz,
              patients_30j int, consultations_30j int, demandes_labo_30j int, factures_30j int, retours_ouverts int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT s.id, s.nom, s.type::text, e.nom::text, s.ninea, s.telephone, s.created_at, public.plateforme_est_structure_test(s.id),
    (SELECT count(*)::int FROM public.structure_memberships m WHERE m.structure_id = s.id AND m.statut = 'actif'),
    (SELECT coalesce(array_agg(DISTINCT u.email::text), '{}') FROM public.structure_memberships m
       JOIN public.medical_user_roles r ON r.membership_id = m.id AND r.role::text = 'admin_structure'
       JOIN auth.users u ON u.id = m.user_id WHERE m.structure_id = s.id AND m.statut = 'actif'),
    (SELECT max(u.last_sign_in_at) FROM public.structure_memberships m JOIN auth.users u ON u.id = m.user_id WHERE m.structure_id = s.id),
    (SELECT count(*)::int FROM public.sante_patients p WHERE p.structure_id = s.id AND p.created_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM public.sante_consultations c WHERE c.structure_id = s.id AND c.created_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM public.sante_demandes_labo d WHERE d.structure_id = s.id AND d.created_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM public.sante_factures f WHERE f.structure_id = s.id AND f.created_at > now() - interval '30 days'),
    (SELECT count(*)::int FROM public.plateforme_retours r WHERE r.structure_id = s.id AND r.statut IN ('nouveau', 'en_cours', 'planifie'))
  FROM public.structures s LEFT JOIN public.entreprises e ON e.id = s.entreprise_id
  WHERE (_inclure_test OR NOT public.plateforme_est_structure_test(s.id))
    AND (coalesce(btrim(_recherche), '') = '' OR s.nom ILIKE '%' || btrim(_recherche) || '%' OR e.nom ILIKE '%' || btrim(_recherche) || '%')
  ORDER BY s.created_at DESC
  LIMIT 500;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_clients_lister(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_clients_lister(text, boolean) TO authenticated;

-- Fiche d'un compte : informations de connexion et rattachements, jamais de donnée médicale. Recherche tracée.
CREATE OR REPLACE FUNCTION public.plateforme_utilisateur_chercher(_email text)
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, derniere_connexion timestamptz, email_confirme boolean,
              double_auth boolean, operateur boolean, rattachements jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(_email, ''))) < 3 THEN RAISE EXCEPTION 'Saisissez au moins 3 caractères de l''adresse'; END IF;
  PERFORM public.plateforme_tracer('utilisateur_recherche', 'utilisateur', NULL, jsonb_build_object('recherche', lower(btrim(_email))));
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at IS NOT NULL,
    EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified'),
    EXISTS (SELECT 1 FROM public.plateforme_operateurs o WHERE o.user_id = u.id AND o.actif),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('structure', s.nom, 'type', s.type::text, 'statut', m.statut::text,
        'roles', (SELECT coalesce(jsonb_agg(r.role::text ORDER BY r.role::text), '[]') FROM public.medical_user_roles r WHERE r.membership_id = m.id))
        ORDER BY s.nom), '[]')
     FROM public.structure_memberships m JOIN public.structures s ON s.id = m.structure_id WHERE m.user_id = u.id)
  FROM auth.users u
  WHERE u.email ILIKE '%' || btrim(_email) || '%'
  ORDER BY u.last_sign_in_at DESC NULLS LAST
  LIMIT 20;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_utilisateur_chercher(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_utilisateur_chercher(text) TO authenticated;
