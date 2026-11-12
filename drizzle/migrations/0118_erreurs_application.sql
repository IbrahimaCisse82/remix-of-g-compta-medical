-- 0118 — Surveillance des erreurs de l'application, sans service tiers (les données de santé ne quittent pas l'hébergeur).
-- Le navigateur signale les erreurs non gérées (message et pile nettoyés côté client ET côté serveur) ; les erreurs
-- identiques du jour sont regroupées (compteur). Lecture par les opérateurs du back-office uniquement.
-- Limite : 50 erreurs différentes par utilisateur et par jour. Purge automatique après 90 jours.
-- Retour : docs/rollback/0118_erreurs_application_down.sql

CREATE TABLE IF NOT EXISTS public.plateforme_erreurs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empreinte text NOT NULL,
  jour date NOT NULL DEFAULT current_date,
  premiere timestamptz NOT NULL DEFAULT now(),
  derniere timestamptz NOT NULL DEFAULT now(),
  occurrences int NOT NULL DEFAULT 1,
  utilisateurs uuid[] NOT NULL DEFAULT '{}',
  structure_id uuid REFERENCES public.structures(id) ON DELETE SET NULL,
  page text,
  message text NOT NULL,
  pile text,
  contexte jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (empreinte, jour)
);
CREATE INDEX IF NOT EXISTS plateforme_erreurs_derniere_idx ON public.plateforme_erreurs (derniere DESC);
ALTER TABLE public.plateforme_erreurs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plateforme_erreurs FROM PUBLIC, anon, authenticated;

-- Retire adresses e-mail, numéros longs (téléphones, NINEA) et jetons éventuels.
CREATE OR REPLACE FUNCTION public.plateforme_nettoyer_texte(_t text, _max int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT left(regexp_replace(regexp_replace(regexp_replace(coalesce(_t, ''),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[e-mail]', 'g'),
    '(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Fa-f0-9]{32,})', '[jeton]', 'g'),
    '\+?\d[\d ]{6,}\d', '[nombre]', 'g'), _max);
$$;

CREATE OR REPLACE FUNCTION public.erreur_signaler(_message text, _pile text DEFAULT NULL, _page text DEFAULT NULL,
  _structure_id uuid DEFAULT NULL, _contexte jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _m text; _p text; _e text; _s uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF (SELECT coalesce(sum(1), 0) FROM public.plateforme_erreurs WHERE jour = current_date AND auth.uid() = ANY(utilisateurs)) >= 50 THEN RETURN; END IF;
  _m := public.plateforme_nettoyer_texte(_message, 500);
  IF length(btrim(_m)) = 0 THEN RETURN; END IF;
  _p := public.plateforme_nettoyer_texte(_pile, 2000);
  _e := md5(_m || '|' || coalesce(split_part(_p, E'\n', 2), ''));
  _s := CASE WHEN _structure_id IS NOT NULL AND public.is_structure_member(_structure_id) THEN _structure_id END;
  INSERT INTO public.plateforme_erreurs(empreinte, structure_id, page, message, pile, contexte, utilisateurs)
  VALUES (_e, _s, left(_page, 200), _m, _p,
          jsonb_build_object('navigateur', left(_contexte->>'navigateur', 200), 'version', left(_contexte->>'version', 40), 'ecran', left(_contexte->>'ecran', 20)),
          ARRAY[auth.uid()])
  ON CONFLICT (empreinte, jour) DO UPDATE SET occurrences = plateforme_erreurs.occurrences + 1, derniere = now(),
    utilisateurs = CASE WHEN auth.uid() = ANY(plateforme_erreurs.utilisateurs) OR cardinality(plateforme_erreurs.utilisateurs) >= 50
                        THEN plateforme_erreurs.utilisateurs ELSE plateforme_erreurs.utilisateurs || auth.uid() END;
END $$;
REVOKE ALL ON FUNCTION public.erreur_signaler(text, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erreur_signaler(text, text, text, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_erreurs_lister(_jours int DEFAULT 7)
RETURNS TABLE(id bigint, jour date, premiere timestamptz, derniere timestamptz, occurrences int, utilisateurs int,
              structure_nom text, page text, message text, pile text, contexte jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT e.id, e.jour, e.premiere, e.derniere, e.occurrences, cardinality(e.utilisateurs), s.nom, e.page, e.message, e.pile, e.contexte
    FROM public.plateforme_erreurs e LEFT JOIN public.structures s ON s.id = e.structure_id
    WHERE e.jour >= current_date - greatest(least(coalesce(_jours, 7), 90), 1)
    ORDER BY e.derniere DESC LIMIT 300;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_erreurs_lister(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_erreurs_lister(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_erreurs_purger() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.plateforme_erreurs WHERE jour < current_date - 90 RETURNING 1) SELECT count(*)::int FROM d;
$$;
REVOKE ALL ON FUNCTION public.plateforme_erreurs_purger() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'erreurs-purge-quotidienne') THEN
    PERFORM cron.schedule('erreurs-purge-quotidienne', '23 3 * * *', 'SELECT public.plateforme_erreurs_purger();');
  END IF;
END $$;

-- Tableau de bord : nombre d'erreurs de l'application sur 24 h (même définition que 0116, une clé en plus).
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
    'erreurs_24h', (SELECT coalesce(sum(e.occurrences), 0) FROM public.plateforme_erreurs e WHERE e.derniere > now() - interval '24 hours'),
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
