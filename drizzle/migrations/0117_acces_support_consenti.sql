-- 0117 — Accès de support consenti et minuté.
-- Un opérateur de la plateforme demande l'accès à une structure (motif, durée 1 à 72 h). Seul un administrateur de
-- la structure l'accorde. L'accès donne le rôle « lecteur » (lecture seule, aucun dossier patient : can_access_patient
-- exclut ce rôle) et prend fin automatiquement (tâche horaire) ou sur révocation par l'administrateur ou l'opérateur.
-- Refusé si l'opérateur est déjà membre de la structure (on ne touche jamais à un vrai rattachement).
-- Chaque étape est inscrite au journal d'audit de la plateforme.
-- Retour : docs/rollback/0117_acces_support_consenti_down.sql

CREATE TABLE IF NOT EXISTS public.plateforme_acces_support (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  operateur_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motif text NOT NULL CHECK (length(btrim(motif)) BETWEEN 5 AND 500),
  duree_heures int NOT NULL CHECK (duree_heures BETWEEN 1 AND 72),
  statut text NOT NULL DEFAULT 'demande' CHECK (statut IN ('demande', 'accorde', 'refuse', 'revoque', 'expire')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decide_par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decide_le timestamptz,
  expire_le timestamptz,
  termine_le timestamptz,
  membership_id uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS plateforme_acces_support_un_ouvert
  ON public.plateforme_acces_support (structure_id, operateur_id) WHERE statut IN ('demande', 'accorde');
ALTER TABLE public.plateforme_acces_support ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plateforme_acces_support FROM PUBLIC, anon, authenticated;

-- Fin d'un accès accordé : retire le rattachement temporaire (et lui seul).
CREATE OR REPLACE FUNCTION public.plateforme_support_terminer(_id uuid, _statut text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.plateforme_acces_support;
BEGIN
  SELECT * INTO a FROM public.plateforme_acces_support WHERE id = _id FOR UPDATE;
  IF a.id IS NULL OR a.statut NOT IN ('demande', 'accorde') THEN RETURN; END IF;
  IF a.membership_id IS NOT NULL THEN
    DELETE FROM public.medical_user_roles WHERE membership_id = a.membership_id;
    DELETE FROM public.structure_memberships WHERE id = a.membership_id;
  END IF;
  UPDATE public.plateforme_acces_support SET statut = _statut, termine_le = now() WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_support_terminer(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_support_demander(_structure_id uuid, _motif text, _duree_heures int DEFAULT 4)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.structure_memberships WHERE structure_id = _structure_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Vous êtes déjà membre de cette structure : pas besoin d''accès de support';
  END IF;
  IF EXISTS (SELECT 1 FROM public.plateforme_acces_support WHERE structure_id = _structure_id AND operateur_id = auth.uid() AND statut IN ('demande', 'accorde')) THEN
    RAISE EXCEPTION 'Une demande est déjà en cours pour cette structure';
  END IF;
  INSERT INTO public.plateforme_acces_support(structure_id, operateur_id, motif, duree_heures)
  VALUES (_structure_id, auth.uid(), btrim(_motif), _duree_heures) RETURNING id INTO _id;
  PERFORM public.plateforme_tracer('support_demande', 'structure', _structure_id::text, jsonb_build_object('acces', _id, 'motif', btrim(_motif), 'duree_heures', _duree_heures));
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_support_demander(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_support_demander(uuid, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.plateforme_support_lister()
RETURNS TABLE(id uuid, structure_id uuid, structure_nom text, operateur_email text, motif text, duree_heures int, statut text,
              created_at timestamptz, decide_le timestamptz, expire_le timestamptz, termine_le timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.est_operateur() THEN RAISE EXCEPTION 'Réservé aux opérateurs de la plateforme (double authentification requise)' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.id, a.structure_id, s.nom, u.email::text, a.motif, a.duree_heures, a.statut, a.created_at, a.decide_le, a.expire_le, a.termine_le
    FROM public.plateforme_acces_support a JOIN public.structures s ON s.id = a.structure_id LEFT JOIN auth.users u ON u.id = a.operateur_id
    ORDER BY (a.statut IN ('demande', 'accorde')) DESC, a.created_at DESC LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_support_lister() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plateforme_support_lister() TO authenticated;

-- Côté structure : l'administrateur voit les demandes et accès en cours.
CREATE OR REPLACE FUNCTION public.support_demandes_structure(_structure_id uuid)
RETURNS TABLE(id uuid, operateur_email text, motif text, duree_heures int, statut text, created_at timestamptz, expire_le timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé aux administrateurs de la structure' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.id, u.email::text, a.motif, a.duree_heures, a.statut, a.created_at, a.expire_le
    FROM public.plateforme_acces_support a LEFT JOIN auth.users u ON u.id = a.operateur_id
    WHERE a.structure_id = _structure_id AND a.statut IN ('demande', 'accorde') ORDER BY a.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.support_demandes_structure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_demandes_structure(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.support_decider(_id uuid, _accepter boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE a public.plateforme_acces_support; _m uuid;
BEGIN
  SELECT * INTO a FROM public.plateforme_acces_support WHERE id = _id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT public.is_structure_admin(a.structure_id) THEN RAISE EXCEPTION 'Réservé aux administrateurs de la structure' USING ERRCODE = '42501'; END IF;
  IF a.statut <> 'demande' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée'; END IF;
  IF NOT _accepter THEN
    UPDATE public.plateforme_acces_support SET statut = 'refuse', decide_par = auth.uid(), decide_le = now(), termine_le = now() WHERE id = _id;
    PERFORM public.plateforme_tracer('support_refuse', 'structure', a.structure_id::text, jsonb_build_object('acces', _id));
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.structure_memberships WHERE structure_id = a.structure_id AND user_id = a.operateur_id) THEN
    RAISE EXCEPTION 'L''opérateur est déjà membre de la structure';
  END IF;
  INSERT INTO public.structure_memberships(structure_id, user_id, statut) VALUES (a.structure_id, a.operateur_id, 'actif') RETURNING id INTO _m;
  INSERT INTO public.medical_user_roles(membership_id, role) VALUES (_m, 'lecteur');
  UPDATE public.plateforme_acces_support SET statut = 'accorde', decide_par = auth.uid(), decide_le = now(),
    expire_le = now() + make_interval(hours => a.duree_heures), membership_id = _m WHERE id = _id;
  PERFORM public.plateforme_tracer('support_accorde', 'structure', a.structure_id::text, jsonb_build_object('acces', _id, 'duree_heures', a.duree_heures));
END $$;
REVOKE ALL ON FUNCTION public.support_decider(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_decider(uuid, boolean) TO authenticated;

-- Révocation par l'administrateur de la structure ou par l'opérateur lui-même (annulation d'une demande comprise).
CREATE OR REPLACE FUNCTION public.support_revoquer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE a public.plateforme_acces_support;
BEGIN
  SELECT * INTO a FROM public.plateforme_acces_support WHERE id = _id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Accès introuvable'; END IF;
  IF NOT (public.is_structure_admin(a.structure_id) OR (a.operateur_id = auth.uid() AND public.est_operateur())) THEN
    RAISE EXCEPTION 'Non autorisé' USING ERRCODE = '42501';
  END IF;
  PERFORM public.plateforme_support_terminer(_id, 'revoque');
  PERFORM public.plateforme_tracer('support_revoque', 'structure', a.structure_id::text, jsonb_build_object('acces', _id));
END $$;
REVOKE ALL ON FUNCTION public.support_revoquer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_revoquer(uuid) TO authenticated;

-- Fin automatique des accès arrivés à échéance (tâche horaire) ; appelable sans risque à tout moment.
CREATE OR REPLACE FUNCTION public.plateforme_support_expirer()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.plateforme_acces_support WHERE statut = 'accorde' AND expire_le <= now() LOOP
    PERFORM public.plateforme_support_terminer(r.id, 'expire'); n := n + 1;
  END LOOP;
  UPDATE public.plateforme_acces_support SET statut = 'expire', termine_le = now()
  WHERE statut = 'demande' AND created_at < now() - interval '7 days';
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.plateforme_support_expirer() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'support-expiration-horaire') THEN
    PERFORM cron.schedule('support-expiration-horaire', '7 * * * *', 'SELECT public.plateforme_support_expirer();');
  END IF;
END $$;
