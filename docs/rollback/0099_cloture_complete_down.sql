-- Retour arrière de 0099 : clôture et réouverture limitées au changement de statut, sans affectation.
DROP FUNCTION IF EXISTS public.fn_affecter_resultat(uuid, date, jsonb, text);
DROP FUNCTION IF EXISTS public.fn_cloturer_exercice(uuid);
CREATE FUNCTION public.fn_cloturer_exercice(_exercice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ent uuid; v_n int;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Cloture reservee a l''administrateur'; END IF;
  SELECT count(*) INTO v_n FROM public.sante_compta_evenements e JOIN public.structures s ON s.id = e.structure_id
    WHERE s.entreprise_id = v_ent AND e.statut <> 'comptabilise';
  IF v_n > 0 THEN RAISE EXCEPTION 'Cloture impossible : % ecriture(s) sante en attente de comptabilisation', v_n; END IF;
  PERFORM set_config('app.exercice_ok','1',true);
  UPDATE public.exercices SET statut = 'cloture' WHERE id = _exercice_id;
  PERFORM set_config('app.exercice_ok','',true);
END $function$;
CREATE OR REPLACE FUNCTION public.fn_rouvrir_exercice(_exercice_id uuid, _motif text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;
