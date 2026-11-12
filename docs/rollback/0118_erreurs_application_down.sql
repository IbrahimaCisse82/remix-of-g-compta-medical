-- Retour de 0118 : tableau de bord ramené à sa définition de 0116, puis suppression de la surveillance des erreurs (les erreurs enregistrées sont perdues).
-- Définition 0116 (sans erreurs_24h), avant de supprimer la table qu'elle ne lit plus.
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

DO $$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'erreurs-purge-quotidienne') THEN PERFORM cron.unschedule('erreurs-purge-quotidienne'); END IF; END $$;
DROP FUNCTION IF EXISTS public.plateforme_erreurs_purger();
DROP FUNCTION IF EXISTS public.plateforme_erreurs_lister(int);
DROP FUNCTION IF EXISTS public.erreur_signaler(text, text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.plateforme_nettoyer_texte(text, int);
DROP TABLE IF EXISTS public.plateforme_erreurs;
