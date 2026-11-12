-- Phase 5 : habilitations. Lectures et actions de chaque rôle, dans sa structure et dans une autre. TEST uniquement.
-- Attendus tirés du cahier des charges (section 4). 'vide' = refusé ou 0 ligne visible ; 'plein' = au moins 1 ligne.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '5';

CREATE OR REPLACE FUNCTION recette.lecture(_cle text, _table text, _s text, _attendu text, _criticite text DEFAULT 'critique') RETURNS text LANGUAGE plpgsql AS $f$
DECLARE _col text := CASE WHEN _table IN ('ecritures','plan_comptable','exercices') THEN 'entreprise_id' ELSE 'structure_id' END;
        _cible uuid := CASE WHEN _col = 'entreprise_id' THEN (SELECT entreprise_id FROM recette.structures WHERE cle = _s) ELSE recette.sid(_s) END;
BEGIN
  RETURN recette.essai('5', 'Habilitations', _cle,
    'Lecture de ' || _table || ' (structure ' || _s || ')',
    CASE _attendu WHEN 'plein' THEN 'Lignes visibles' ELSE 'Aucune ligne visible (ou refus)' END,
    CASE _attendu WHEN 'plein' THEN 'ok' ELSE 'vide' END,
    format('SELECT count(*)::text FROM public.%I WHERE %I = %L', _table, _col, _cible),
    'Section 4', _criticite);
END $f$;

-- Matrice de lecture dans sa propre structure.
DO $d$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- profil, table, structure, attendu
    ('A-admin','sante_patients','A','plein'),('A-admin','sante_consultations','A','vide'),('A-admin','sante_constantes_vue','A','skip'),
    ('A-med-1','sante_patients','A','plein'),('A-med-1','sante_consultations','A','plein'),('A-med-1','ecritures','A','vide'),
    ('A-secr','sante_patients','A','plein'),('A-secr','sante_consultations','A','vide'),('A-secr','ecritures','A','vide'),
    ('A-caisse','sante_consultations','A','vide'),('A-caisse','sante_factures','A','plein'),('A-caisse','ecritures','A','vide'),
    ('A-compta','sante_patients','A','vide'),('A-compta','sante_consultations','A','vide'),('A-compta','ecritures','A','plein'),
    ('A-lecteur','sante_patients','A','vide'),('A-lecteur','sante_consultations','A','vide'),('A-lecteur','ecritures','A','plein'),
    ('A-tp','sante_consultations','A','vide'),('A-tp','sante_factures','A','plein'),('A-tp','ecritures','A','vide'),
    ('B-bio-1','sante_resultats','B','plein'),('B-bio-1','ecritures','B','vide'),
    ('B-tech-1','sante_resultats','B','plein'),('B-tech-1','ecritures','B','vide'),
    ('B-prel-1','sante_patients','B','plein'),('B-prel-1','ecritures','B','vide'),
    ('B-secr','sante_resultats','B','vide'),('B-caisse','sante_resultats','B','vide'),('B-tp','sante_resultats','B','vide'),
    ('B-lecteur','sante_resultats','B','vide'),('B-lecteur','sante_patients','B','vide'),('B-admin','sante_resultats','B','vide'),
    ('C-compta','sante_resultats','C','vide'),('C-compta','sante_patients','C','vide'),('C-med-1','sante_resultats','C','plein'),
    -- Cloisonnement : un membre d'une structure ne voit rien d'une autre.
    ('A-med-1','sante_patients','B','vide'),('A-med-1','sante_resultats','C','vide'),('B-bio-1','sante_patients','A','vide'),
    ('A-compta','ecritures','B','vide'),('C-admin','sante_factures','A','vide'),('B-admin','sante_patients','C','vide'),
    -- Comptes hors structure.
    ('X-externe','sante_patients','A','vide'),('X-externe','ecritures','A','vide'),('P-operateur','sante_patients','A','vide'),
    ('P-operateur','sante_consultations','C','vide'),('P-proprietaire','sante_resultats','B','vide')
  ) v(p, t, s, a) LOOP
    IF r.a <> 'skip' THEN PERFORM recette.lecture(r.p, r.t, r.s, r.a, CASE r.a WHEN 'plein' THEN 'majeure' ELSE 'critique' END); END IF;
  END LOOP;
END $d$;

-- Identité du patient : la comptabilité ne reçoit ni nom ni acte.
SELECT recette.essai('5','Habilitations','A-compta','Libellés des écritures de ventes santé sans nom de patient','Aucun nom de patient dans les libellés','vide',
  $$SELECT count(*)::text FROM public.ecritures e JOIN public.sante_patients p ON position(upper(p.nom) || ' ' IN upper(e.libelle) || ' ') > 0
     WHERE e.entreprise_id = (SELECT entreprise_id FROM recette.structures WHERE cle = 'A') AND p.structure_id = recette.sid('A')$$, 'CPT-04', 'critique');

-- Actions interdites.
SELECT recette.essai('5','Habilitations','B-tech-1','Un technicien tente d''encaisser une facture','Refus','refus',
  $$SELECT public.sante_encaisser((SELECT id FROM public.sante_factures WHERE structure_id = recette.sid('B') AND type = 'facture' ORDER BY created_at DESC LIMIT 1), 'especes', 100, NULL)::text$$, 'Section 3', 'critique');
SELECT recette.essai('5','Habilitations','B-prel-1','Un préleveur tente de saisir un résultat','Refus','refus',
  $$SELECT public.sante_saisir_resultat(d.id, ap.id, 1, NULL)::text FROM public.sante_demandes_labo d JOIN public.sante_demande_analyses da ON da.demande_id = d.id
     JOIN public.sante_analyse_parametres ap ON ap.analyse_id = da.analyse_id WHERE d.structure_id = recette.sid('B') AND d.statut = 'en_analyse' LIMIT 1$$, 'LAB-15', 'critique');
SELECT recette.essai('5','Habilitations','A-secr','Une secrétaire tente de valider biologiquement','Refus','refus',
  $$SELECT public.sante_valider_demande((SELECT id FROM public.sante_demandes_labo WHERE structure_id = recette.sid('B') AND statut = 'en_analyse' LIMIT 1), 'biologique')::text$$, 'LAB-15', 'critique');
SELECT recette.essai('5','Habilitations','B-secr','Une secrétaire du labo tente de valider techniquement','Refus','refus',
  $$SELECT public.sante_valider_demande((SELECT id FROM public.sante_demandes_labo WHERE structure_id = recette.sid('B') AND statut = 'en_analyse' LIMIT 1), 'technique')::text$$, 'LAB-15', 'critique');
SELECT recette.essai('5','Habilitations','A-med-1','Un médecin tente de passer une écriture comptable','Refus','refus',
  $$INSERT INTO public.ecritures(entreprise_id, date_ecriture, journal, numero_piece, libelle, statut)
     VALUES ((SELECT entreprise_id FROM recette.structures WHERE cle = 'A'), current_date, 'OD', 'PIRATE-1', 'Écriture pirate', 'brouillon') RETURNING id::text$$, 'Section 4', 'critique');
SELECT recette.essai('5','Habilitations','A-lecteur','Un lecteur tente de modifier une écriture','Refus ou aucune ligne modifiée','vide',
  $$WITH u AS (UPDATE public.ecritures SET libelle = 'modifié par le lecteur' WHERE entreprise_id = (SELECT entreprise_id FROM recette.structures WHERE cle = 'A') RETURNING 1) SELECT count(*)::text FROM u$$, 'CPT-11', 'critique');
SELECT recette.essai('5','Habilitations','A-caisse','Un caissier tente d''ouvrir un dossier clinique','Refus','refus',
  $$SELECT public.sante_ouvrir_dossier((SELECT id FROM public.sante_patients WHERE structure_id = recette.sid('A') LIMIT 1), 'consultation')::text$$, 'Section 4', 'critique');
SELECT recette.essai('5','Habilitations','A-compta','Un comptable tente une recherche de patients','Refus ou aucun résultat','vide',
  $$SELECT count(*)::text FROM public.sante_rechercher_patients(recette.sid('A'), 'DIOP', 20, 0)$$, 'RG-08', 'critique');
SELECT recette.essai('5','Habilitations','A-admin','L''administrateur sans rôle soignant tente d''exporter un dossier patient','Refus','refus',
  $$SELECT public.sante_export_dossier((SELECT id FROM public.sante_patients WHERE structure_id = recette.sid('A') LIMIT 1))::text$$, 'PAT-11', 'majeure');
SELECT recette.essai('5','Habilitations','A-secr','Une secrétaire tente d''exporter un dossier patient','Refus','refus',
  $$SELECT public.sante_export_dossier((SELECT id FROM public.sante_patients WHERE structure_id = recette.sid('A') LIMIT 1))::text$$, 'PAT-11', 'critique');
SELECT recette.essai('5','Habilitations','A-secr','Une secrétaire tente d''exporter toute la structure','Refus','refus',
  $$SELECT left(public.sante_export_structure(recette.sid('A'))::text, 20)$$, 'STR-16', 'critique');
SELECT recette.essai('5','Habilitations','A-admin','Export de la structure par l''administrateur en double authentification','Export produit','ok',
  $$SELECT (public.sante_export_structure(recette.sid('A'))->>'format')$$, 'STR-16', 'majeure');
SELECT recette.essai('5','Habilitations','A-admin','Export refusé sans double authentification (session aal1)','Refus','refus',
  $$SELECT recette.agir('A-admin','aal1')::text || left(public.sante_export_structure(recette.sid('A'))::text, 10)$$, 'SEC-03', 'critique');
SELECT recette.essai('5','Habilitations','A-med-2','Un médecin d''une autre structure tente de coder un diagnostic chez C','Refus','refus',
  $$SELECT public.sante_diagnostic_coder((SELECT id FROM public.sante_consultations WHERE structure_id = recette.sid('C') LIMIT 1), 'I10', false)::text$$, 'RG-01', 'critique');
SELECT recette.essai('5','Habilitations','P-operateur','Un opérateur de la plateforme tente de lire un dossier médical','Refus ou vide','vide',
  $$SELECT count(*)::text FROM public.sante_consultations$$, 'Section 12', 'critique');
SELECT recette.essai('5','Habilitations','A-admin','Un administrateur de structure tente d''utiliser le back-office','Refus','refus',
  $$SELECT public.plateforme_tableau_bord()::text$$, 'Section 12', 'critique');
SELECT recette.essai('5','Habilitations','P-operateur','Un opérateur ouvre le tableau de bord du back-office','Accepté','ok',
  $$SELECT left(public.plateforme_tableau_bord()::text, 40)$$, 'Section 12', 'majeure');

-- Immutabilité.
SELECT recette.essai('5','Immutabilité','A-admin','Modifier le montant d''une facture émise','Refus ou aucune ligne','vide',
  $$WITH u AS (UPDATE public.sante_factures SET total = 1 WHERE structure_id = recette.sid('A') AND type = 'facture' RETURNING 1) SELECT count(*)::text FROM u$$, 'FAC-04', 'critique');
SELECT recette.essai('5','Immutabilité','A-admin','Supprimer une facture émise','Refus ou aucune ligne','vide',
  $$WITH u AS (DELETE FROM public.sante_factures WHERE structure_id = recette.sid('A') AND type = 'facture' RETURNING 1) SELECT count(*)::text FROM u$$, 'FAC-04', 'critique');
SELECT recette.essai('5','Immutabilité','A-med-1','Modifier une consultation clôturée','Refus ou aucune ligne','vide',
  $$WITH u AS (UPDATE public.sante_consultations SET diagnostic = 'réécrit' WHERE structure_id = recette.sid('A') AND statut = 'cloturee' RETURNING 1) SELECT count(*)::text FROM u$$, 'CON-08', 'critique');
SELECT recette.essai('5','Immutabilité','B-bio-1','Modifier un résultat validé biologiquement','Refus ou aucune ligne','vide',
  $$WITH u AS (UPDATE public.sante_resultats r SET valeur_num = 999 FROM public.sante_demandes_labo d WHERE d.id = r.demande_id AND d.statut = 'validee' AND d.structure_id = recette.sid('B') RETURNING 1) SELECT count(*)::text FROM u$$, 'LAB-18', 'critique');
SELECT recette.essai('5','Immutabilité','A-compta','Modifier une écriture validée','Refus ou aucune ligne','vide',
  $$WITH u AS (UPDATE public.ecritures SET libelle = 'réécrite' WHERE entreprise_id = (SELECT entreprise_id FROM recette.structures WHERE cle = 'A') AND statut = 'validee' RETURNING 1) SELECT count(*)::text FROM u$$, 'CPT-11', 'critique');
SELECT recette.essai('5','Immutabilité','A-compta','Supprimer une écriture validée','Refus ou aucune ligne','vide',
  $$WITH u AS (DELETE FROM public.ecritures WHERE entreprise_id = (SELECT entreprise_id FROM recette.structures WHERE cle = 'A') AND statut = 'validee' RETURNING 1) SELECT count(*)::text FROM u$$, 'CPT-11', 'critique');
SELECT recette.essai('5','Immutabilité','A-admin','Supprimer un patient','Refus ou aucune ligne','vide',
  $$WITH u AS (DELETE FROM public.sante_patients WHERE structure_id = recette.sid('A') RETURNING 1) SELECT count(*)::text FROM u$$, 'PAT-12', 'critique');
