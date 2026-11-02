-- Clôture d'exercice complète, réouverture symétrique et affectation du résultat (02/11/2026).
-- Constat : fn_cloturer_exercice ne faisait que passer l'exercice au statut « cloture » : ni résultat reporté, ni
-- à-nouveaux dans l'exercice suivant ; la réouverture ne défaisait rien ; aucune affectation du résultat.
-- Règles (SYSCOHADA révisé ; AUSCGIE art. 143-144 et 346) :
--  - clôture, en une transaction : contrôles (brouillons, événements santé, résultat N-1 non affecté), exercice
--    suivant créé au besoin, écriture d'à-nouveaux AN-CLOTURE-<année> au 1er jour de N+1 reprenant les soldes des
--    classes 1 à 5 et le résultat en 1301 (bénéfice) ou 1309 (perte) « résultat en instance d'affectation »,
--    puis verrouillage. Le garde-fou existant (syscohada_cloture_garde : MFA, référentiel visé, brouillons) reste
--    appliqué au changement de statut ;
--  - réouverture : refusée si N+1 est clôturé ou si l'affectation est passée ; contre-passe l'écriture
--    d'à-nouveaux de clôture puis déverrouille ;
--  - affectation (décision de l'assemblée) : écriture AFF-<année> dans l'exercice qui porte le 130, soldant
--    1301/1309 vers réserves (11x), report à nouveau (121/129) et dividendes (465) ; réserve légale d'au moins
--    10 % du bénéfice diminué des pertes antérieures, jusqu'au cinquième du capital, quand le dossier a un capital.
DROP FUNCTION IF EXISTS public.fn_cloturer_exercice(uuid);
CREATE FUNCTION public.fn_cloturer_exercice(_exercice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; nx public.exercices%ROWTYPE; v_ent uuid; v_n int; v_res numeric := 0;
  v_lignes jsonb; v_an uuid; v_130 numeric;
BEGIN
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  v_ent := x.entreprise_id;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Cloture reservee a l''administrateur'; END IF;
  IF x.statut = 'cloture' THEN RAISE EXCEPTION 'Exercice % deja cloture', x.annee; END IF;
  SELECT count(*) INTO v_n FROM public.sante_compta_evenements e JOIN public.structures s ON s.id = e.structure_id
    WHERE s.entreprise_id = v_ent AND e.statut <> 'comptabilise';
  IF v_n > 0 THEN RAISE EXCEPTION 'Cloture impossible : % ecriture(s) sante en attente de comptabilisation', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.exercices p WHERE p.entreprise_id = v_ent AND p.date_fin = x.date_debut - 1 AND p.statut <> 'cloture') THEN
    RAISE EXCEPTION 'Cloturez d''abord l''exercice precedent';
  END IF;

  -- Soldes de l'exercice (écritures validées et lignes historiques sans en-tête, comme la balance).
  CREATE TEMP TABLE IF NOT EXISTS _cloture_soldes (compte text, intitule text, solde numeric) ON COMMIT DROP;
  DELETE FROM _cloture_soldes;
  INSERT INTO _cloture_soldes
  SELECT compte, min(intitule), round(sum(debit - credit), 2) FROM (
    SELECT el.compte, el.intitule, el.debit, el.credit FROM public.ecriture_lignes el JOIN public.ecritures e ON e.id = el.ecriture_id
     WHERE e.exercice_id = _exercice_id AND e.statut = 'validee'
    UNION ALL
    SELECT j.compte, j.intitule, j.debit, j.credit FROM public.journal j WHERE j.exercice_id = _exercice_id AND j.ecriture_id IS NULL
  ) s GROUP BY compte;

  SELECT coalesce(sum(solde), 0) INTO v_130 FROM _cloture_soldes WHERE compte LIKE '130%';
  IF v_130 <> 0 THEN
    RAISE EXCEPTION 'Resultat de l''exercice precedent non affecte (compte 130 : %) : passez l''affectation avant de cloturer', v_130;
  END IF;
  SELECT coalesce(-sum(solde), 0) INTO v_res FROM _cloture_soldes WHERE compte ~ '^[6-8]';

  -- Exercice suivant (créé au besoin, douze mois).
  SELECT * INTO nx FROM public.exercices WHERE entreprise_id = v_ent AND date_debut = x.date_fin + 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.exercices (entreprise_id, annee, date_debut, date_fin, statut)
    VALUES (v_ent, extract(year FROM x.date_fin + 1)::int, x.date_fin + 1, ((x.date_fin + 1) + interval '1 year' - interval '1 day')::date, 'en_cours')
    RETURNING * INTO nx;
  END IF;
  IF nx.statut = 'cloture' THEN RAISE EXCEPTION 'Exercice suivant % deja cloture', nx.annee; END IF;
  SELECT count(*) INTO v_n FROM public.ecritures WHERE exercice_id = nx.id AND journal_code = 'AN' AND statut <> 'annulee'
    AND contrepasse_par IS NULL AND coalesce(origine, '') <> 'contrepassation';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'L''exercice % contient deja % ecriture(s) d''a-nouveaux : contre-passez-les avant la cloture', nx.annee, v_n;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('compte', compte, 'intitule', coalesce(intitule, ''), 'libelle', 'A-nouveau ' || x.annee,
      'debit', greatest(solde, 0), 'credit', greatest(-solde, 0)) ORDER BY compte)
    INTO v_lignes FROM _cloture_soldes WHERE compte ~ '^[1-5]' AND solde <> 0;
  IF v_res <> 0 THEN
    v_lignes := coalesce(v_lignes, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'compte', CASE WHEN v_res > 0 THEN '1301' ELSE '1309' END,
      'intitule', CASE WHEN v_res > 0 THEN 'Résultat en instance d''affectation : bénéfice' ELSE 'Résultat en instance d''affectation : perte' END,
      'libelle', 'Resultat ' || x.annee || ' en instance d''affectation',
      'debit', greatest(-v_res, 0), 'credit', greatest(v_res, 0)));
  END IF;
  IF v_lignes IS NOT NULL AND jsonb_array_length(v_lignes) >= 2 THEN
    PERFORM set_config('app.syscohada_cloture', '1', true);   -- origine « cloture » réservée au serveur (syscohada_garde_ecriture)
    v_an := public.fn_creer_ecriture(v_ent, nx.id, 'AN', nx.date_debut, 'A-nouveaux de l''exercice ' || x.annee, v_lignes,
      'AN-CLOTURE-' || x.annee, 'validee', 'cloture');
    PERFORM set_config('app.syscohada_cloture', '', true);
  END IF;

  PERFORM set_config('app.exercice_ok', '1', true);
  UPDATE public.exercices SET statut = 'cloture' WHERE id = _exercice_id;
  PERFORM set_config('app.exercice_ok', '', true);
  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (v_ent, _exercice_id, 'CLOTURE', jsonb_build_object('resultat', v_res, 'exercice_suivant', nx.annee, 'ecriture_an', v_an,
    'comptes_reportes', coalesce(jsonb_array_length(v_lignes), 0)), auth.uid());
  RETURN jsonb_build_object('resultat', v_res, 'exercice_suivant_id', nx.id, 'exercice_suivant', nx.annee, 'ecriture_an', v_an);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_rouvrir_exercice(_exercice_id uuid, _motif text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; nx public.exercices%ROWTYPE; e record;
BEGIN
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(x.entreprise_id) THEN RAISE EXCEPTION 'Reouverture reservee a l''administrateur'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif de reouverture obligatoire'; END IF;
  IF x.statut <> 'cloture' THEN RAISE EXCEPTION 'Exercice % non cloture', x.annee; END IF;
  SELECT * INTO nx FROM public.exercices WHERE entreprise_id = x.entreprise_id AND date_debut = x.date_fin + 1;
  IF FOUND THEN
    IF nx.statut = 'cloture' THEN RAISE EXCEPTION 'Rouvrez d''abord l''exercice suivant %', nx.annee; END IF;
    IF EXISTS (SELECT 1 FROM public.ecritures WHERE exercice_id = nx.id AND piece = 'AFF-' || x.annee AND statut <> 'annulee'
               AND contrepasse_par IS NULL AND coalesce(origine, '') <> 'contrepassation') THEN
      RAISE EXCEPTION 'Affectation du resultat % passee : contre-passez-la avant de rouvrir', x.annee;
    END IF;
    PERFORM set_config('app.syscohada_cloture', '1', true);
    FOR e IN SELECT id FROM public.ecritures WHERE exercice_id = nx.id AND piece = 'AN-CLOTURE-' || x.annee AND statut <> 'annulee'
             AND contrepasse_par IS NULL AND coalesce(origine, '') <> 'contrepassation' LOOP
      PERFORM public.fn_contrepasser_ecriture(e.id, 'Reouverture de l''exercice ' || x.annee || ' : ' || trim(_motif));
    END LOOP;
    PERFORM set_config('app.syscohada_cloture', '', true);
  END IF;
  PERFORM set_config('app.exercice_ok', '1', true);
  UPDATE public.exercices SET statut = 'en_cours' WHERE id = _exercice_id;
  PERFORM set_config('app.exercice_ok', '', true);
  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (x.entreprise_id, _exercice_id, 'REOUVERTURE', jsonb_build_object('motif', _motif), auth.uid());
END $function$;

-- Affectation : _lignes = [{compte, debit, credit}] hors 130 ; la ligne qui solde 1301/1309 est ajoutée ici.
CREATE OR REPLACE FUNCTION public.fn_affecter_resultat(_exercice_id uuid, _date date, _lignes jsonb, _reference text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; p public.exercices%ROWTYPE; v_130 numeric; v_d numeric := 0; v_c numeric := 0; l jsonb;
  v_capital numeric; v_rl numeric; v_pertes numeric; v_min numeric; v_dot_rl numeric := 0; v_lignes jsonb; v_id uuid; v_annee int;
BEGIN
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(x.entreprise_id) THEN RAISE EXCEPTION 'Affectation reservee a l''administrateur'; END IF;
  IF x.statut = 'cloture' THEN RAISE EXCEPTION 'Exercice cloture'; END IF;
  IF _date IS NULL OR _date < x.date_debut OR _date > x.date_fin THEN RAISE EXCEPTION 'Date de l''assemblee hors de l''exercice %', x.annee; END IF;
  IF _reference IS NULL OR length(trim(_reference)) < 3 THEN RAISE EXCEPTION 'Reference de la decision (proces-verbal) obligatoire'; END IF;
  SELECT * INTO p FROM public.exercices WHERE entreprise_id = x.entreprise_id AND date_fin = x.date_debut - 1;
  v_annee := coalesce(p.annee, x.annee - 1);
  IF EXISTS (SELECT 1 FROM public.ecritures WHERE exercice_id = x.id AND piece = 'AFF-' || v_annee AND statut <> 'annulee'
             AND contrepasse_par IS NULL AND coalesce(origine, '') <> 'contrepassation') THEN
    RAISE EXCEPTION 'Resultat % deja affecte', v_annee;
  END IF;
  -- Soldes utiles de l'exercice (crédit − débit).
  SELECT coalesce(sum(el.credit - el.debit) FILTER (WHERE el.compte LIKE '130%'), 0),
         coalesce(sum(el.credit - el.debit) FILTER (WHERE el.compte ~ '^10[1-4]'), 0),
         coalesce(sum(el.credit - el.debit) FILTER (WHERE el.compte LIKE '111%'), 0),
         coalesce(sum(el.debit - el.credit) FILTER (WHERE el.compte LIKE '129%'), 0)
    INTO v_130, v_capital, v_rl, v_pertes
    FROM public.ecriture_lignes el JOIN public.ecritures e ON e.id = el.ecriture_id
   WHERE e.exercice_id = x.id AND e.statut = 'validee';
  IF v_130 = 0 THEN RAISE EXCEPTION 'Aucun resultat en instance d''affectation (compte 130) dans l''exercice %', x.annee; END IF;
  IF _lignes IS NULL OR jsonb_array_length(_lignes) = 0 THEN RAISE EXCEPTION 'Repartition vide'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    IF coalesce(l->>'compte', '') !~ '^(11[1-8]|12[19]|465)[0-9]*$' THEN
      RAISE EXCEPTION 'Compte % non autorise pour une affectation (11x reserves, 121/129 report a nouveau, 465 dividendes)', l->>'compte';
    END IF;
    IF coalesce((l->>'debit')::numeric, 0) < 0 OR coalesce((l->>'credit')::numeric, 0) < 0 THEN RAISE EXCEPTION 'Montants negatifs interdits'; END IF;
    v_d := v_d + round(coalesce((l->>'debit')::numeric, 0), 2);
    v_c := v_c + round(coalesce((l->>'credit')::numeric, 0), 2);
    IF l->>'compte' LIKE '111%' THEN v_dot_rl := v_dot_rl + round(coalesce((l->>'credit')::numeric, 0) - coalesce((l->>'debit')::numeric, 0), 2); END IF;
  END LOOP;
  IF round(v_c - v_d, 2) <> round(v_130, 2) THEN
    RAISE EXCEPTION 'Repartition (%) differente du resultat en instance d''affectation (%)', round(v_c - v_d, 2), round(v_130, 2);
  END IF;
  -- Réserve légale (AUSCGIE art. 346) : 10 % du bénéfice diminué des pertes antérieures, jusqu'au cinquième du capital.
  IF v_130 > 0 AND v_capital > 0 THEN
    v_min := least(greatest(round(0.10 * (v_130 - greatest(v_pertes, 0)), 0), 0), greatest(round(v_capital / 5 - v_rl, 0), 0));
    IF v_dot_rl < v_min THEN
      RAISE EXCEPTION 'Reserve legale insuffisante : au moins % (10%% du benefice diminue des pertes anterieures, dans la limite du cinquieme du capital)', v_min;
    END IF;
  END IF;
  v_lignes := _lignes || jsonb_build_array(jsonb_build_object(
    'compte', CASE WHEN v_130 > 0 THEN '1301' ELSE '1309' END, 'intitule', 'Résultat en instance d''affectation',
    'libelle', 'Affectation du resultat ' || v_annee, 'debit', greatest(v_130, 0), 'credit', greatest(-v_130, 0)));
  PERFORM set_config('app.syscohada_cloture', '1', true);
  v_id := public.fn_creer_ecriture(x.entreprise_id, x.id, 'OD', _date, 'Affectation du resultat ' || v_annee || ' (' || trim(_reference) || ')',
    v_lignes, 'AFF-' || v_annee, 'validee', 'cloture');
  PERFORM set_config('app.syscohada_cloture', '', true);
  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (x.entreprise_id, x.id, 'AFFECTATION', jsonb_build_object('resultat', v_130, 'annee', v_annee, 'reference', _reference, 'ecriture', v_id), auth.uid());
  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.fn_cloturer_exercice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cloturer_exercice(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_affecter_resultat(uuid, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_affecter_resultat(uuid, date, jsonb, text) TO authenticated;
