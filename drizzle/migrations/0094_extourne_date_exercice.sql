-- Extourne d'une écriture d'un exercice antérieur encore ouvert (01/11/2026).
-- Constat (test de reprise de balance) : l'extourne de la reprise à-nouveaux 2024 échouait avec « Exercice, entreprise
-- ou date incohérents » : la contre-passation était datée du jour (CURRENT_DATE, 2026), hors de l'exercice 2024.
-- Toute écriture d'un exercice passé non clôturé était donc impossible à extourner.
-- Correction : l'extourne est datée du jour, ramené dans l'exercice de l'écriture d'origine
-- (au plus tard la date de fin de l'exercice, jamais avant l'écriture d'origine). Rien d'autre ne change.
CREATE OR REPLACE FUNCTION public.fn_contrepasser_ecriture(_ecriture_id uuid, _motif text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.ecritures%ROWTYPE; v_lignes jsonb; v_new uuid; v_date date;
BEGIN
  SELECT * INTO e FROM public.ecritures WHERE id = _ecriture_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ecriture introuvable'; END IF;
  IF NOT public.can_write_entreprise(e.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF e.contrepasse_par IS NOT NULL THEN RAISE EXCEPTION 'Ecriture deja contre-passee'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif d''extourne obligatoire'; END IF;

  SELECT GREATEST(e.date_ecriture, LEAST(CURRENT_DATE, x.date_fin)) INTO v_date
    FROM public.exercices x WHERE x.id = e.exercice_id;

  SELECT jsonb_agg(jsonb_build_object('compte', compte, 'intitule', intitule,
           'libelle', 'EXTOURNE ' || COALESCE(libelle,''), 'debit', credit, 'credit', debit)
         ORDER BY ordre)
    INTO v_lignes FROM public.ecriture_lignes WHERE ecriture_id = _ecriture_id;

  v_new := public.fn_creer_ecriture(e.entreprise_id, e.exercice_id, e.journal_code, COALESCE(v_date, CURRENT_DATE),
    'EXTOURNE ' || e.numero || ' — ' || _motif, v_lignes, NULL, 'validee', 'contrepassation');

  UPDATE public.ecritures SET contrepasse_par = v_new, motif_annulation = _motif WHERE id = _ecriture_id;
  UPDATE public.ecritures SET contrepassation_de = _ecriture_id WHERE id = v_new;

  INSERT INTO public.journal_audit (entreprise_id, exercice_id, action, old_data, new_data, user_id)
  VALUES (e.entreprise_id, e.exercice_id, 'CONTREPASSATION',
    jsonb_build_object('ecriture_id', _ecriture_id, 'numero', e.numero),
    jsonb_build_object('ecriture_id', v_new, 'motif', _motif), auth.uid());
  RETURN v_new;
END; $function$;
