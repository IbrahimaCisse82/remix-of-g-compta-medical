CREATE OR REPLACE FUNCTION public.trg_exercices_statut() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.statut IS DISTINCT FROM OLD.statut AND coalesce(current_setting('app.exercice_ok', true),'') <> '1' THEN
    RAISE EXCEPTION 'Changement de statut d''exercice reserve aux fonctions de cloture/reouverture';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS exercices_statut_guard ON public.exercices;
CREATE TRIGGER exercices_statut_guard BEFORE UPDATE ON public.exercices FOR EACH ROW EXECUTE FUNCTION public.trg_exercices_statut();

CREATE OR REPLACE FUNCTION public.fn_cloturer_exercice(_exercice_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ent uuid;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Cloture reservee a l''administrateur'; END IF;
  PERFORM set_config('app.exercice_ok','1',true);
  UPDATE public.exercices SET statut = 'cloture' WHERE id = _exercice_id;
  PERFORM set_config('app.exercice_ok','',true);
END $$;

CREATE OR REPLACE FUNCTION public.fn_rouvrir_exercice(_exercice_id uuid, _motif text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ent uuid;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Reouverture reservee a l''administrateur'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif de reouverture obligatoire'; END IF;
  PERFORM set_config('app.exercice_ok','1',true);
  UPDATE public.exercices SET statut = 'en_cours' WHERE id = _exercice_id;
  PERFORM set_config('app.exercice_ok','',true);
  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (v_ent, _exercice_id, 'REOUVERTURE', jsonb_build_object('motif', _motif), auth.uid());
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_cloturer_exercice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cloturer_exercice(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_rouvrir_exercice(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_rouvrir_exercice(uuid,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_exercices_statut() FROM PUBLIC, anon;

CREATE TABLE IF NOT EXISTS public.portail_tentatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  entreprise_id uuid,
  email text,
  succes boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portail_tentatives TO service_role;
ALTER TABLE public.portail_tentatives ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS portail_tentatives_ip_idx ON public.portail_tentatives(ip, created_at);