-- 0115 — Retours des structures pilotes : bouton « Signaler / Suggérer » dans l'application, tri dans le back-office.
-- * Tout utilisateur connecté envoie un retour (bug, amélioration, question) ; il ne voit que les siens et la réponse.
-- * Rattachement à une structure seulement s'il en est membre ; l'entreprise est déduite côté serveur.
-- * Les opérateurs (est_operateur : double authentification) trient : statut, priorité, réponse ; chaque traitement
--   est inscrit au journal d'audit de la plateforme.
-- * Aucune lecture directe de la table : fonctions serveur uniquement. Limite : 30 retours par utilisateur et par jour.
-- Retour : docs/rollback/0115_retours_pilotes_down.sql

CREATE TABLE IF NOT EXISTS public.plateforme_retours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auteur_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  structure_id uuid REFERENCES public.structures(id) ON DELETE SET NULL,
  entreprise_id uuid REFERENCES public.entreprises(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('bug', 'amelioration', 'question')),
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 5 AND 4000),
  page text CHECK (length(page) <= 200),
  roles text[] NOT NULL DEFAULT '{}',
  contexte jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut text NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau', 'en_cours', 'planifie', 'resolu', 'rejete')),
  priorite text NOT NULL DEFAULT 'normale' CHECK (priorite IN ('basse', 'normale', 'haute', 'bloquante')),
  reponse text CHECK (length(reponse) <= 4000),
  repondu_le timestamptz,
  traite_par uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS plateforme_retours_statut_idx ON public.plateforme_retours (statut, created_at DESC);
CREATE INDEX IF NOT EXISTS plateforme_retours_auteur_idx ON public.plateforme_retours (auteur_id, created_at DESC);
ALTER TABLE public.plateforme_retours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plateforme_retours FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.retour_envoyer(_type text, _message text, _page text DEFAULT NULL, _structure_id uuid DEFAULT NULL, _contexte jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _id uuid; _entreprise uuid; _roles text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.plateforme_retours WHERE auteur_id = auth.uid() AND created_at > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'Limite atteinte : 30 retours par jour. Merci, l''équipe vous recontacte.';
  END IF;
  IF _structure_id IS NOT NULL THEN
    IF NOT public.is_structure_member(_structure_id) THEN RAISE EXCEPTION 'Structure inconnue' USING ERRCODE = '42501'; END IF;
    SELECT s.entreprise_id INTO _entreprise FROM public.structures s WHERE s.id = _structure_id;
    SELECT coalesce(array_agg(DISTINCT r.role::text ORDER BY r.role::text), '{}') INTO _roles
      FROM public.structure_memberships m JOIN public.medical_user_roles r ON r.membership_id = m.id
      WHERE m.structure_id = _structure_id AND m.user_id = auth.uid();
  END IF;
  INSERT INTO public.plateforme_retours(auteur_id, structure_id, entreprise_id, type, message, page, roles, contexte)
  VALUES (auth.uid(), _structure_id, _entreprise, _type, btrim(_message), left(_page, 200), _roles,
          coalesce(_contexte, '{}'::jsonb) - 'token' - 'password')
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.retour_envoyer(text, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retour_envoyer(text, text, text, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.retours_mes()
RETURNS TABLE(id uuid, created_at timestamptz, type text, message text, statut text, reponse text, repondu_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT r.id, r.created_at, r.type, r.message, r.statut, r.reponse, r.repondu_le
  FROM public.plateforme_retours r WHERE r.auteur_id = auth.uid() ORDER BY r.created_at DESC LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.retours_mes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retours_mes() TO authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_retours_lister(_statut text DEFAULT NULL, _limite int DEFAULT 200)
RETURNS TABLE(id uuid, created_at timestamptz, updated_at timestamptz, auteur_email text, structure_nom text, structure_type text,
              type text, message text, page text, roles text[], contexte jsonb, statut text, priorite text, reponse text, repondu_le timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT r.id, r.created_at, r.updated_at, u.email::text, s.nom::text, s.type::text, r.type, r.message, r.page, r.roles, r.contexte,
           r.statut, r.priorite, r.reponse, r.repondu_le
    FROM public.plateforme_retours r
    LEFT JOIN auth.users u ON u.id = r.auteur_id
    LEFT JOIN public.structures s ON s.id = r.structure_id
    WHERE _statut IS NULL OR r.statut = _statut
    ORDER BY CASE r.priorite WHEN 'bloquante' THEN 0 WHEN 'haute' THEN 1 WHEN 'normale' THEN 2 ELSE 3 END, r.created_at DESC
    LIMIT least(greatest(coalesce(_limite, 200), 1), 500);
END $$;
REVOKE ALL ON FUNCTION public.plateforme_retours_lister(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_retours_lister(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_retour_traiter(_id uuid, _statut text, _priorite text, _reponse text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _avant public.plateforme_retours;
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _avant FROM public.plateforme_retours WHERE id = _id FOR UPDATE;
  IF _avant.id IS NULL THEN RAISE EXCEPTION 'Retour introuvable'; END IF;
  UPDATE public.plateforme_retours SET statut = _statut, priorite = _priorite,
    reponse = nullif(btrim(coalesce(_reponse, '')), ''),
    repondu_le = CASE WHEN nullif(btrim(coalesce(_reponse, '')), '') IS DISTINCT FROM _avant.reponse THEN now() ELSE repondu_le END,
    traite_par = auth.uid(), updated_at = now()
  WHERE id = _id;
  PERFORM public.plateforme_tracer('retour_traite', 'retour', _id::text, jsonb_build_object(
    'statut', jsonb_build_array(_avant.statut, _statut), 'priorite', jsonb_build_array(_avant.priorite, _priorite),
    'reponse_modifiee', nullif(btrim(coalesce(_reponse, '')), '') IS DISTINCT FROM _avant.reponse));
END $$;
REVOKE ALL ON FUNCTION public.plateforme_retour_traiter(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_retour_traiter(uuid, text, text, text) TO authenticated;
