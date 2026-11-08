-- 0114 — Socle du back-office : opérateurs de la plateforme (équipe Grow Hub) et journal d'audit.
-- * Les opérateurs sont distincts des rôles métier ; double authentification (aal2) exigée pour toute action.
-- * Aucun accès direct aux tables : tout passe par des fonctions serveur qui vérifient le rôle et tracent l'action.
-- * Aucune donnée médicale n'est exposée par ces fonctions.
-- * Premier propriétaire : insertion manuelle par l'équipe technique (docs/backoffice.md), jamais depuis l'application.
-- Retour : docs/rollback/0114_plateforme_operateurs_audit_down.sql

CREATE TABLE IF NOT EXISTS public.plateforme_operateurs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'operateur' CHECK (role IN ('proprietaire', 'operateur')),
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cree_par uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.plateforme_operateurs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plateforme_operateurs FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.plateforme_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operateur_id uuid, -- sans clé étrangère : le journal survit à la suppression du compte
  action text NOT NULL,
  cible_type text,
  cible_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plateforme_audit_date_idx ON public.plateforme_audit (created_at DESC);
ALTER TABLE public.plateforme_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plateforme_audit FROM PUBLIC, anon, authenticated;

-- Journal en ajout seul : ni modification ni suppression, même par une fonction serveur.
CREATE OR REPLACE FUNCTION public.plateforme_audit_immuable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Le journal d''audit de la plateforme ne se modifie pas'; END $$;
DROP TRIGGER IF EXISTS plateforme_audit_immuable ON public.plateforme_audit;
CREATE TRIGGER plateforme_audit_immuable BEFORE UPDATE OR DELETE ON public.plateforme_audit
  FOR EACH ROW EXECUTE FUNCTION public.plateforme_audit_immuable();

-- Opérateur actif ET session en double authentification.
CREATE OR REPLACE FUNCTION public.est_operateur() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM public.plateforme_operateurs o WHERE o.user_id = auth.uid() AND o.actif)
     AND coalesce(auth.jwt()->>'aal', '') = 'aal2';
$$;
REVOKE ALL ON FUNCTION public.est_operateur() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.est_operateur() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.est_proprietaire_plateforme() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT public.est_operateur() AND EXISTS (SELECT 1 FROM public.plateforme_operateurs o
    WHERE o.user_id = auth.uid() AND o.actif AND o.role = 'proprietaire');
$$;
REVOKE ALL ON FUNCTION public.est_proprietaire_plateforme() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.est_proprietaire_plateforme() TO authenticated, service_role;

-- Ce que l'écran /admin doit afficher : rien pour un non-opérateur, demande de double authentification sinon.
CREATE OR REPLACE FUNCTION public.plateforme_moi() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT jsonb_build_object(
    'operateur', o.user_id IS NOT NULL,
    'role', o.role,
    'mfa', coalesce(auth.jwt()->>'aal', '') = 'aal2')
  FROM (SELECT 1) x LEFT JOIN public.plateforme_operateurs o ON o.user_id = auth.uid() AND o.actif;
$$;
REVOKE ALL ON FUNCTION public.plateforme_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_moi() TO authenticated;

-- Trace interne, appelée par les fonctions du back-office (jamais directement par l'application).
CREATE OR REPLACE FUNCTION public.plateforme_tracer(_action text, _cible_type text, _cible_id text, _details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.plateforme_audit(operateur_id, action, cible_type, cible_id, details)
  VALUES (auth.uid(), _action, _cible_type, _cible_id, coalesce(_details, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.plateforme_tracer(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_journal(_limite int DEFAULT 100, _avant bigint DEFAULT NULL)
RETURNS TABLE(id bigint, created_at timestamptz, operateur_email text, action text, cible_type text, cible_id text, details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT a.id, a.created_at, u.email::text, a.action, a.cible_type, a.cible_id, a.details
    FROM public.plateforme_audit a LEFT JOIN auth.users u ON u.id = a.operateur_id
    WHERE _avant IS NULL OR a.id < _avant
    ORDER BY a.id DESC LIMIT least(greatest(coalesce(_limite, 100), 1), 500);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_journal(int, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_journal(int, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_operateurs_lister()
RETURNS TABLE(user_id uuid, email text, role text, actif boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT o.user_id, u.email::text, o.role, o.actif, o.created_at
    FROM public.plateforme_operateurs o JOIN auth.users u ON u.id = o.user_id ORDER BY o.created_at;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_operateurs_lister() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_operateurs_lister() TO authenticated;

-- Ajouter, modifier ou désactiver un opérateur : propriétaire uniquement ; le dernier propriétaire actif reste.
CREATE OR REPLACE FUNCTION public.plateforme_operateur_definir(_email text, _role text, _actif boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _uid uuid; _avant public.plateforme_operateurs;
BEGIN
  IF NOT public.est_proprietaire_plateforme() THEN RAISE EXCEPTION 'Réservé au propriétaire de la plateforme' USING ERRCODE = '42501'; END IF;
  IF _role NOT IN ('proprietaire', 'operateur') THEN RAISE EXCEPTION 'Rôle inconnu : %', _role; END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(trim(_email));
  IF _uid IS NULL THEN RAISE EXCEPTION 'Aucun compte avec cette adresse : la personne doit d''abord créer son compte'; END IF;
  SELECT * INTO _avant FROM public.plateforme_operateurs WHERE user_id = _uid;
  IF _avant.user_id IS NOT NULL AND _avant.role = 'proprietaire' AND _avant.actif AND (_role <> 'proprietaire' OR NOT _actif)
     AND NOT EXISTS (SELECT 1 FROM public.plateforme_operateurs WHERE role = 'proprietaire' AND actif AND user_id <> _uid) THEN
    RAISE EXCEPTION 'Impossible : il doit rester au moins un propriétaire actif';
  END IF;
  INSERT INTO public.plateforme_operateurs(user_id, role, actif, cree_par) VALUES (_uid, _role, _actif, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET role = excluded.role, actif = excluded.actif, updated_at = now();
  PERFORM public.plateforme_tracer(CASE WHEN _avant.user_id IS NULL THEN 'operateur_ajoute' ELSE 'operateur_modifie' END,
    'operateur', _uid::text,
    jsonb_build_object('email', lower(trim(_email)), 'role', _role, 'actif', _actif, 'avant', CASE WHEN _avant.user_id IS NULL THEN NULL ELSE jsonb_build_object('role', _avant.role, 'actif', _avant.actif) END));
  RETURN _uid;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_operateur_definir(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_operateur_definir(text, text, boolean) TO authenticated;
