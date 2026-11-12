-- Phases 6 et 7 : parcours médicaux, laboratoire, facturation, caisse, tiers payant. TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase IN ('6','7');

DO $d$
DECLARE
  _p uuid; _p2 uuid; _enf uuid; _c uuid; _c2 uuid; _rdv uuid; _prat uuid; _prat2 uuid; _d uuid; _f uuid; _f2 uuid; _bdg uuid; _fu uuid; _s uuid; _ecbu uuid; _pecbu uuid; _x text;
  _nom text; _pre text; _dn date;
BEGIN
  -- ============================== Dossier patient
  SELECT id, nom, prenoms, date_naissance INTO _p, _nom, _pre, _dn FROM public.sante_patients WHERE structure_id = recette.sid('A') AND date_naissance < current_date - 30*365 ORDER BY numero_dossier LIMIT 1;
  PERFORM recette.essai('6','Patients','A-secr','Création d''un dossier en doublon (même nom, prénoms, date de naissance)','Alerte de doublon, création refusée sans confirmation','refus',
    format($$SELECT public.sante_creer_patient(recette.sid('A'), %L, %L, 'F', %L, NULL, NULL, NULL, NULL, true, false, false)::text$$, _nom, _pre, _dn), 'PAT-02', 'majeure');
  PERFORM recette.essai('6','Patients','A-secr','Doublons probables signalés avant création','Au moins un doublon proposé','ok',
    format($$SELECT CASE WHEN count(*) > 0 THEN count(*)::text ELSE NULL END FROM public.sante_doublons_patient(recette.sid('A'), %L, %L, %L, NULL)$$, _nom, _pre, _dn), 'PAT-02', 'majeure');
  PERFORM recette.essai('6','Patients','A-secr','Recherche sans accents (« aissatou » trouve « Aïssatou »)','Résultats','ok',
    $$SELECT CASE WHEN count(*) > 0 THEN count(*)::text END FROM public.sante_rechercher_patients(recette.sid('A'), 'aissatou', 20, 0)$$, 'PAT-02', 'majeure');
  PERFORM recette.essai('6','Patients','A-secr','Recherche par numéro de dossier','1 résultat','ok',
    format($$SELECT CASE WHEN count(*) >= 1 THEN count(*)::text END FROM public.sante_rechercher_patients(recette.sid('A'), %L, 20, 0)$$, (SELECT numero_dossier FROM public.sante_patients WHERE id = _p)), 'PAT-02', 'majeure');
  PERFORM recette.essai('6','Patients','A-secr','Recherche par téléphone','Résultat','ok',
    format($$SELECT CASE WHEN count(*) >= 1 THEN count(*)::text END FROM public.sante_rechercher_patients(recette.sid('A'), %L, 20, 0)$$, (SELECT right(regexp_replace(telephone, '\D', '', 'g'), 7) FROM public.sante_patients WHERE id = _p)), 'PAT-02', 'mineure');
  PERFORM recette.essai('6','Patients','A-secr','Numéro de dossier attribué par la base, sans doublon','0 doublon de numéro','egal:0',
    $$SELECT count(*)::text FROM (SELECT numero_dossier FROM public.sante_patients WHERE structure_id = recette.sid('A') GROUP BY 1 HAVING count(*) > 1) z$$, 'PAT-01', 'critique');
  PERFORM recette.essai('6','Patients','A-secr','Création sans nom refusée','Refus','refus',
    $$SELECT public.sante_creer_patient(recette.sid('A'), '', 'Sans nom', 'F', '1990-01-01', NULL, NULL, NULL, NULL, true, true, false)::text$$, 'PAT-01', 'majeure');
  PERFORM recette.essai('6','Patients','A-secr','Date de naissance dans le futur refusée','Refus','refus',
    $$SELECT public.sante_creer_patient(recette.sid('A'), 'FUTUR', 'Test', 'F', current_date + 10, NULL, NULL, NULL, NULL, true, true, false)::text$$, 'PAT-01', 'majeure');
  -- Fusion : deux dossiers du même patient.
  SELECT id INTO _p2 FROM public.sante_patients WHERE structure_id = recette.sid('A') AND id <> _p ORDER BY numero_dossier DESC LIMIT 1;
  _x := recette.essai('6','Patients','A-admin','Proposition de fusion de deux dossiers','Fusion proposée','ok',
    format($$SELECT public.sante_proposer_fusion(%L, %L, 'Doublon fictif de recette')::text$$, _p, _p2), 'PAT-03', 'majeure');
  SELECT id INTO _fu FROM public.sante_fusions WHERE structure_id = recette.sid('A') ORDER BY created_at DESC LIMIT 1;
  IF _fu IS NOT NULL THEN
    PERFORM recette.essai('6','Patients','A-admin','Confirmation de la fusion','Fusion confirmée','ok', format($$SELECT public.sante_confirmer_fusion(%L)::text$$, _fu), 'PAT-03', 'majeure');
    PERFORM recette.essai('6','Patients','A-admin','Annulation de la fusion','Fusion annulée, dossier restauré','ok', format($$SELECT public.sante_annuler_fusion(%L, 'Annulation de recette')::text$$, _fu), 'PAT-03', 'majeure');
  END IF;
  -- Allergie puis prescription.
  SELECT c.id, c.patient_id INTO _c, _p FROM public.sante_consultations c WHERE c.structure_id = recette.sid('A') AND c.statut = 'cloturee' LIMIT 1;
  PERFORM recette.agir('A-med-1');
  INSERT INTO public.sante_antecedents(patient_id, type, libelle, details) SELECT _p, 'allergie', 'Amoxicilline', 'Allergie fictive (TEST)' WHERE NOT EXISTS (SELECT 1 FROM public.sante_antecedents WHERE patient_id = _p AND type = 'allergie');
  PERFORM recette.sortir();
  -- Nouvelle consultation pour ce patient (sans rendez-vous).
  SELECT id INTO _prat FROM public.sante_praticiens WHERE user_id = recette.uid('A-med-1');
  PERFORM recette.agir('A-med-1'); _c2 := public.sante_demarrer_consultation(_p, _prat, NULL, 'Contrôle (TEST)'); PERFORM recette.sortir();
  PERFORM recette.essai('6','Consultation','A-med-1','Ordonnance d''un médicament allergisant sans justification','Refus (allergie)','refus',
    format($$SELECT public.sante_emettre_ordonnance(%L, '[{"medicament":"Amoxicilline 500 mg","posologie":"1 x 3/j","duree":"5 j","quantite":1}]', NULL)::text$$, _c2), 'CON-05', 'critique');
  PERFORM recette.essai('6','Consultation','A-med-1','Ordonnance du même médicament avec justification écrite','Acceptée, justification conservée','ok',
    format($$SELECT public.sante_emettre_ordonnance(%L, '[{"medicament":"Amoxicilline 500 mg","posologie":"1 x 3/j","duree":"5 j","quantite":1,"justification_allergie":"Allergie ancienne non confirmée, bénéfice supérieur au risque (TEST)"}]', NULL)::text$$, _c2), 'CON-05', 'critique');
  PERFORM recette.essai('6','Consultation','A-med-1','Clôture sans diagnostic refusée','Refus','refus', format($$SELECT public.sante_cloturer_consultation(%L)::text$$, _c2), 'CON-08', 'majeure');
  PERFORM recette.essai('6','Consultation','A-med-1','Deux diagnostics principaux : un seul reste principal','1 principal','egal:1',
    format($$SELECT (SELECT public.sante_diagnostic_coder(%1$L, 'I10', true)) IS NOT NULL AND (SELECT public.sante_diagnostic_coder(%1$L, 'E11.9', true)) IS NOT NULL,
             (SELECT count(*) FROM public.sante_consultation_diagnostics WHERE consultation_id = %1$L AND principal)::text$$, _c2), 'CON-02', 'majeure');
  PERFORM recette.essai('6','Consultation','A-med-1','Recherche CIM-10 sans accents et abréviation (« hta »)','Hypertension trouvée','ok',
    format($$SELECT string_agg(code, ',') FROM (SELECT code FROM public.sante_cim10_specialite(%L, 'hta', false, 5)) z HAVING bool_or(code LIKE 'I1%%')$$, _c2), 'CON-02', 'majeure');
  PERFORM recette.essai('6','Consultation','A-med-1','Recherche CIM-10 « pneumopathie » sans accent','Résultats','ok',
    format($$SELECT CASE WHEN count(*) > 0 THEN count(*)::text END FROM public.sante_cim10_specialite(%L, 'pneumopathie', true, 10)$$, _c2), 'CON-02', 'mineure');
  -- Hors spécialité : A (mode recommandé), cardiologue codant une dermatose → accepté avec mention.
  SELECT id INTO _prat2 FROM public.sante_praticiens WHERE user_id = recette.uid('A-med-2');
  PERFORM recette.agir('A-med-2'); _c := public.sante_demarrer_consultation(_p, _prat2, NULL, 'Avis (TEST)'); PERFORM recette.sortir();
  PERFORM recette.essai('6','Consultation','A-med-2','Mode recommandé : code hors spécialité accepté et signalé','hors_specialite = vrai','egal:true',
    format($$SELECT (SELECT hors_specialite FROM public.sante_consultation_diagnostics WHERE id = public.sante_diagnostic_coder(%L, 'L40.0', false))::text$$, _c), 'CON-03', 'majeure');
  -- C est en mode strict : le dermatologue ne code pas un code obstétrical.
  SELECT c.id INTO _c FROM public.sante_consultations c JOIN public.sante_praticiens pr ON pr.id = c.praticien_id WHERE pr.user_id = recette.uid('C-med-2') AND c.statut = 'brouillon' LIMIT 1;
  IF _c IS NULL THEN
    SELECT id INTO _p FROM public.sante_patients WHERE structure_id = recette.sid('C') LIMIT 1;
    SELECT id INTO _prat2 FROM public.sante_praticiens WHERE user_id = recette.uid('C-med-2');
    PERFORM recette.agir('C-med-2'); _c := public.sante_demarrer_consultation(_p, _prat2, NULL, 'Avis (TEST)'); PERFORM recette.sortir();
  END IF;
  PERFORM recette.essai('6','Consultation','C-med-2','Mode strict : code hors spécialité refusé (O80.9 pour un dermatologue)','Refus','refus',
    format($$SELECT public.sante_diagnostic_coder(%L, 'O80.9', false)::text$$, _c), 'CON-03', 'majeure');
  PERFORM recette.essai('6','Consultation','C-med-2','Mode strict : code commun accepté (R50.9 fièvre)','Accepté','ok',
    format($$SELECT public.sante_diagnostic_coder(%L, 'R50.9', false)::text$$, _c), 'CON-03', 'majeure');
  -- Rendez-vous : chevauchement et ordre du parcours.
  SELECT r.praticien_id, r.debut INTO _prat, _x FROM public.sante_rendez_vous r WHERE r.structure_id = recette.sid('A') AND r.statut IN ('termine','planifie','arrive') LIMIT 1;
  PERFORM recette.essai('6','Agenda','A-secr','Rendez-vous chevauchant un autre du même praticien','Refus','refus',
    format($$INSERT INTO public.sante_rendez_vous(structure_id, praticien_id, patient_id, debut, duree_min, statut)
             SELECT recette.sid('A'), praticien_id, patient_id, debut + interval '5 minutes', 20, 'planifie' FROM public.sante_rendez_vous WHERE structure_id = recette.sid('A') AND statut = 'planifie' LIMIT 1 RETURNING id::text$$), 'CON-01', 'majeure');
  SELECT r.id, r.patient_id, r.praticien_id INTO _rdv, _p, _prat FROM public.sante_rendez_vous r WHERE r.structure_id = recette.sid('A') AND r.statut = 'planifie' LIMIT 1;
  IF _rdv IS NULL THEN
    SELECT id INTO _p FROM public.sante_patients WHERE structure_id = recette.sid('A') ORDER BY random() LIMIT 1;
    SELECT id INTO _prat FROM public.sante_praticiens WHERE user_id = recette.uid('A-med-1');
    PERFORM recette.agir('A-secr');
    INSERT INTO public.sante_rendez_vous(structure_id, praticien_id, patient_id, debut, duree_min, statut) VALUES (recette.sid('A'), _prat, _p, DATE '2027-01-15' + time '09:00', 20, 'planifie') RETURNING id INTO _rdv;
    PERFORM recette.sortir();
  END IF;
  PERFORM recette.essai('6','Consultation','A-med-1','Démarrer une consultation sur un rendez-vous sans arrivée du patient','Refus','refus',
    format($$SELECT public.sante_demarrer_consultation(%L, %L, %L, NULL)::text$$, _p, _prat, _rdv), 'CON-01', 'majeure');
  PERFORM recette.essai('6','Agenda','A-secr','Passer un rendez-vous de planifié à terminé','Refus ou sans effet','vide',
    format($$WITH u AS (UPDATE public.sante_rendez_vous SET statut = 'termine' WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u$$, _rdv), 'CON-01', 'majeure');
  -- Addendum après clôture.
  SELECT id, patient_id INTO _c, _p FROM public.sante_consultations WHERE structure_id = recette.sid('A') AND statut = 'cloturee' AND praticien_id = (SELECT id FROM public.sante_praticiens WHERE user_id = recette.uid('A-med-1')) LIMIT 1;
  PERFORM recette.essai('6','Consultation','A-med-1','Addendum à une consultation clôturée','Addendum enregistré, original intact','ok',
    format($$INSERT INTO public.sante_consultation_addenda(consultation_id, patient_id, texte) VALUES (%L, %L, 'Complément daté (TEST)') RETURNING id::text$$, _c, _p), 'CON-08', 'majeure');
  -- Bris de glace : le gynécologue n'a pas de relation de soin avec ce patient.
  SELECT id INTO _p FROM public.sante_patients x WHERE structure_id = recette.sid('A')
     AND NOT EXISTS (SELECT 1 FROM public.sante_consultations c JOIN public.sante_praticiens pr ON pr.id = c.praticien_id WHERE c.patient_id = x.id AND pr.user_id = recette.uid('A-med-3'))
     AND EXISTS (SELECT 1 FROM public.sante_consultations c WHERE c.patient_id = x.id) LIMIT 1;
  PERFORM recette.essai('6','Bris de glace','A-med-3','Médecin sans relation de soin : contenu clinique invisible','0 consultation visible','vide',
    format($$SELECT count(*)::text FROM public.sante_consultations WHERE patient_id = %L$$, _p), 'PAT-10', 'critique');
  PERFORM recette.essai('6','Bris de glace','A-med-3','Bris de glace avec motif trop court refusé','Refus','refus',
    format($$SELECT public.sante_bris_de_glace(%L, 'urgence', 'urgence_vitale')::text$$, _p), 'PAT-10', 'majeure');
  PERFORM recette.essai('6','Bris de glace','A-med-3','Bris de glace motivé (≥ 20 caractères)','Accès ouvert et tracé','ok',
    format($$SELECT public.sante_bris_de_glace(%L, 'Patient inconscient amené aux urgences, besoin des antécédents (TEST)', 'urgence_vitale')::text$$, _p), 'PAT-10', 'majeure');
  PERFORM recette.essai('6','Bris de glace','A-med-3','Après bris de glace, le contenu clinique devient lisible','Consultations visibles','ok',
    format($$SELECT CASE WHEN count(*) > 0 THEN count(*)::text END FROM public.sante_consultations WHERE patient_id = %L$$, _p), 'PAT-10', 'majeure');
  SELECT id INTO _bdg FROM public.sante_bris_glace WHERE patient_id = _p ORDER BY created_at DESC LIMIT 1;
  PERFORM recette.essai('6','Bris de glace','A-med-3','Le médecin ne revoit pas son propre bris de glace','Refus','refus',
    format($$SELECT public.sante_revoir_bris_glace(%L, 'auto-revue')::text$$, _bdg), 'PAT-10', 'majeure');
  PERFORM recette.essai('6','Bris de glace','A-admin','Revue du bris de glace par l''administrateur','Revue enregistrée','ok',
    format($$SELECT public.sante_revoir_bris_glace(%L, 'Motif vérifié (TEST)')::text$$, _bdg), 'PAT-10', 'majeure');

  -- ============================== Laboratoire
  SELECT id INTO _d FROM public.sante_demandes_labo WHERE structure_id = recette.sid('B') AND statut = 'en_analyse' LIMIT 1;
  PERFORM recette.essai('6','Laboratoire','B-bio-1','Validation biologique avant la validation technique','Refus','refus',
    format($$SELECT public.sante_valider_demande(%L, 'biologique')::text$$, _d), 'LAB-14', 'critique');
  SELECT d.id INTO _d FROM public.sante_demandes_labo d WHERE d.structure_id = recette.sid('B') AND d.statut = 'en_analyse'
     AND EXISTS (SELECT 1 FROM public.sante_resultats r WHERE r.demande_id = d.id AND r.saisi_par = recette.uid('B-tech-1')) LIMIT 1;
  PERFORM recette.essai('6','Laboratoire','B-tech-1','Le technicien valide techniquement ses propres saisies','Refus (personnes distinctes)','refus',
    format($$SELECT public.sante_valider_demande(%L, 'technique')::text$$, _d), 'LAB-15', 'critique');
  -- Nouvelle demande : saut d'étape, double identification.
  SELECT id INTO _p FROM public.sante_patients WHERE structure_id = recette.sid('B') ORDER BY random() LIMIT 1;
  PERFORM recette.agir('B-secr');
  _d := public.sante_creer_demande_labo(_p, ARRAY(SELECT id FROM public.sante_analyses WHERE structure_id = recette.sid('B') AND code = 'GLY'), 'Dr Externe (TEST)', false, NULL, NULL);
  PERFORM recette.sortir();
  PERFORM recette.essai('6','Laboratoire','B-tech-1','Validation technique d''une demande enregistrée sans résultat (saut d''étape)','Refus','refus',
    format($$SELECT public.sante_valider_demande(%L, 'technique')::text$$, _d), 'LAB-14', 'critique');
  PERFORM recette.essai('6','Laboratoire','B-prel-1','Prélèvement avec un seul identifiant','Refus (2 identifiants)','refus',
    format($$SELECT public.sante_prelever(%L, ARRAY['nom'], 'Bras (TEST)', NULL)::text$$, _d), 'LAB-11', 'critique');
  PERFORM recette.essai('6','Laboratoire','B-prel-1','Prélèvement avec deux identifiants','Accepté','ok',
    format($$SELECT public.sante_prelever(%L, ARRAY['nom','date_naissance'], 'Bras (TEST)', NULL)::text$$, _d), 'LAB-11', 'critique');
  PERFORM recette.essai('6','Laboratoire','B-tech-1','Rejet d''échantillon sans motif codifié','Refus','refus',
    format($$SELECT public.sante_rejeter_echantillon(%L, 'pas_beau', 'x', true)::text$$, _d), 'LAB-12', 'majeure');
  PERFORM recette.essai('6','Laboratoire','B-tech-1','Rejet codifié avec nouveau prélèvement lié','Rejet et nouvelle demande liée','ok',
    format($$SELECT public.sante_rejeter_echantillon(%L, 'coagule', 'Échantillon coagulé (fictif)', true)::text$$, _d), 'LAB-12', 'majeure');
  PERFORM recette.essai('6','Laboratoire','B-tech-1','La nouvelle demande pointe vers la demande d''origine','1 demande liée','egal:1',
    format($$SELECT count(*)::text FROM public.sante_demandes_labo WHERE demande_origine_id = %L$$, _d), 'LAB-12', 'majeure');
  -- Microbiologie : germe préliminaire bloquant.
  SELECT id INTO _p FROM public.sante_patients WHERE structure_id = recette.sid('B') ORDER BY random() LIMIT 1;
  PERFORM recette.agir('B-secr');
  _ecbu := public.sante_creer_demande_labo(_p, ARRAY(SELECT id FROM public.sante_analyses WHERE structure_id = recette.sid('B') AND code = 'ECBU'), 'Dr Externe (TEST)', false, NULL, NULL);
  PERFORM recette.sortir();
  PERFORM recette.agir('B-prel-1'); PERFORM public.sante_prelever(_ecbu, ARRAY['nom','date_naissance'], 'Urines (TEST)', NULL); PERFORM recette.sortir();
  PERFORM recette.agir('B-tech-1'); PERFORM public.sante_avancer_demande(_ecbu, 'recue', NULL); PERFORM public.sante_avancer_demande(_ecbu, 'en_analyse', NULL);
  PERFORM public.sante_saisir_resultat(_ecbu, ap.id, CASE ap.type WHEN 'numerique' THEN 5 END, CASE ap.type WHEN 'numerique' THEN NULL ELSE 'Culture en cours (TEST)' END)
     FROM public.sante_analyse_parametres ap JOIN public.sante_analyses a ON a.id = ap.analyse_id WHERE a.structure_id = recette.sid('B') AND a.code = 'ECBU';
  PERFORM recette.sortir();
  PERFORM recette.essai('6','Laboratoire','B-tech-1','Saisie d''un germe préliminaire','Germe enregistré','ok',
    format($$SELECT public.sante_saisir_germe(%L, 'culture', 'Escherichia coli', '10^5 UFC/mL', 'Identification préliminaire (TEST)', false, NULL)::text$$, _ecbu), 'LAB-16', 'majeure');
  PERFORM recette.essai('6','Laboratoire','B-tech-2','Validation bloquée tant que le germe est préliminaire','Refus','refus',
    format($$SELECT public.sante_valider_demande(%L, 'technique')::text$$, _ecbu), 'LAB-16', 'critique');
  PERFORM recette.essai('6','Laboratoire','B-tech-1','Germe rendu définitif','Accepté','ok',
    format($$SELECT public.sante_germe_definitif((SELECT id FROM public.sante_micro_germes WHERE demande_id = %L LIMIT 1))::text$$, _ecbu), 'LAB-16', 'majeure');
  PERFORM recette.essai('6','Laboratoire','B-tech-2','Validation technique après germe définitif','Acceptée','ok', format($$SELECT public.sante_valider_demande(%L, 'technique')::text$$, _ecbu), 'LAB-16', 'majeure');
  PERFORM recette.essai('6','Laboratoire','B-bio-1','Validation biologique : libellés figés et jeton de compte rendu','Jeton présent','ok',
    format($$SELECT public.sante_valider_demande(%1$L, 'biologique') IS NULL OR true, (SELECT CASE WHEN cr_token IS NOT NULL THEN 'jeton' END FROM public.sante_demandes_labo WHERE id = %1$L)$$, _ecbu), 'LAB-17', 'majeure');
  PERFORM recette.essai('6','Laboratoire','B-bio-2','Rectification d''un résultat validé : nouvelle version tracée','Accepté, historique conservé','ok',
    format($$SELECT public.sante_rectifier_resultat_v2(%L, (SELECT ap.id FROM public.sante_analyse_parametres ap JOIN public.sante_analyses a ON a.id = ap.analyse_id WHERE a.structure_id = recette.sid('B') AND a.code = 'ECBU' AND ap.type = 'numerique' LIMIT 1), 7, NULL, 'Erreur de transcription (TEST)', false)::text$$, _ecbu), 'LAB-18', 'majeure');
  PERFORM recette.essai('6','Laboratoire','B-bio-2','La rectification conserve l''historique','Historique présent','ok',
    format($$SELECT CASE WHEN count(*) > 0 THEN count(*)::text END FROM public.sante_resultats_historique WHERE demande_id = %L$$, _ecbu), 'LAB-18', 'majeure');
  -- Vérification publique du compte rendu.
  PERFORM recette.essai('6','Portail','X-externe','Vérification publique d''un jeton valide (sans afficher les résultats)','Authentique, sans valeurs','ok',
    format($$SELECT left(public.sante_verifier_cr(%L)::text, 200)$$, (SELECT cr_token FROM public.sante_demandes_labo WHERE id = _ecbu)), 'POR-02', 'majeure');
  PERFORM recette.essai('6','Portail','X-externe','Vérification d''un jeton inventé','Refus ou réponse « inconnu »','vide',
    $$SELECT CASE WHEN public.sante_verifier_cr('jeton-invente-123')::text ILIKE '%valide%true%' THEN 'accepte' END$$, 'POR-02', 'critique');
  -- Remise du compte rendu conditionnée au règlement (B).
  PERFORM recette.essai('6','Laboratoire','B-caisse','Compte rendu non remettable si la part patient est impayée (B)','Non remettable','ok',
    format($$SELECT CASE WHEN NOT public.sante_cr_remettable(d.id) THEN 'bloque' END FROM public.sante_demandes_labo d
             WHERE d.structure_id = recette.sid('B') AND d.statut = 'validee' AND EXISTS (SELECT 1 FROM public.sante_factures f WHERE f.demande_id = d.id AND f.part_patient > 0)
               AND NOT EXISTS (SELECT 1 FROM public.sante_encaissements e JOIN public.sante_factures f ON f.id = e.facture_id WHERE f.demande_id = d.id) LIMIT 1$$), 'LAB-19', 'majeure');

  -- ============================== Facturation, caisse, tiers payant
  SELECT id INTO _s FROM public.sante_sessions_caisse WHERE structure_id = recette.sid('A') AND fermee_le IS NULL LIMIT 1;
  SELECT f.id INTO _f FROM public.sante_factures f WHERE f.structure_id = recette.sid('A') AND f.type = 'facture' AND f.part_patient > 0
     AND (SELECT coalesce(sum(montant), 0) FROM public.sante_encaissements e WHERE e.facture_id = f.id) >= f.part_patient LIMIT 1;
  PERFORM recette.essai('7','Caisse','A-caisse','Encaissement au-delà du reste à payer','Refus','refus',
    format($$SELECT public.sante_encaisser(%L, 'especes', 1000, NULL)::text$$, _f), 'CAI-02', 'critique');
  PERFORM recette.essai('7','Caisse','A-caisse','Encaissement d''un montant négatif','Refus','refus',
    format($$SELECT public.sante_encaisser(%L, 'especes', -500, NULL)::text$$, _f), 'CAI-02', 'critique');
  PERFORM recette.essai('7','Facturation','A-caisse','Avoir sur une facture encaissée (annulation avec motif)','Avoir créé','ok',
    format($$SELECT public.sante_annuler_facture(%L, 'Erreur d''acte (TEST)')::text$$, _f), 'FAC-04', 'critique');
  PERFORM recette.essai('7','Facturation','A-caisse','L''avoir apparaît lié à la facture d''origine, montant opposé','Avoir = -total','ok',
    format($$SELECT CASE WHEN a.total = -f.total THEN 'ok' END FROM public.sante_factures a JOIN public.sante_factures f ON f.id = a.facture_origine_id WHERE a.facture_origine_id = %L AND a.type = 'avoir'$$, _f), 'FAC-04', 'critique');
  PERFORM recette.essai('7','Facturation','A-caisse','Annuler deux fois la même facture','Refus','refus',
    format($$SELECT public.sante_annuler_facture(%L, 'Deuxième annulation')::text$$, _f), 'FAC-04', 'critique');
  PERFORM recette.essai('7','Facturation','A-caisse','Après l''avoir, la consultation redevient à facturer','Consultation dans la liste','ok',
    format($$SELECT CASE WHEN EXISTS (SELECT 1 FROM public.sante_consultations_a_facturer(recette.sid('A'), 60) z WHERE z.consultation_id = (SELECT consultation_id FROM public.sante_factures WHERE id = %L)) THEN 'oui' END$$, _f), 'FAC-05', 'majeure');
  PERFORM recette.essai('7','Facturation','A-admin','Un remboursement issu d''un avoir est approuvé par l''administrateur','Approuvé','ok',
    format($$SELECT public.sante_decider_remboursement((SELECT id FROM public.sante_remboursements r WHERE r.structure_id = recette.sid('A') ORDER BY created_at DESC LIMIT 1), true, 'OK (TEST)')::text$$), 'FAC-04', 'majeure');
  PERFORM recette.essai('7','Facturation','A-caisse','Paiement du remboursement approuvé','Payé','ok',
    format($$SELECT public.sante_payer_remboursement((SELECT id FROM public.sante_remboursements r WHERE r.structure_id = recette.sid('A') ORDER BY created_at DESC LIMIT 1), 'especes')::text$$), 'FAC-04', 'majeure');
  -- Clôture de caisse avec écart.
  PERFORM recette.essai('7','Caisse','A-caisse','Clôture de caisse avec un écart de 500 F','Session fermée, écart enregistré','ok',
    format($$SELECT public.sante_fermer_caisse(%1$L, (SELECT montant_attendu FROM public.sante_sessions_caisse WHERE id = %1$L) - 500)::text$$, _s), 'CAI-03', 'critique');
  PERFORM recette.essai('7','Caisse','A-caisse','Écart de caisse calculé','Écart = -500','egal:-500',
    format($$SELECT round(ecart)::text FROM public.sante_sessions_caisse WHERE id = %L$$, _s), 'CAI-03', 'critique');
  PERFORM recette.essai('7','Caisse','A-caisse','Encaissement sans session ouverte','Refus','refus',
    format($$SELECT public.sante_encaisser((SELECT id FROM public.sante_factures f WHERE structure_id = recette.sid('A') AND type = 'facture' AND part_patient > 0 AND NOT annulee
             AND NOT EXISTS (SELECT 1 FROM public.sante_encaissements e WHERE e.facture_id = f.id) LIMIT 1), 'especes', 100, NULL)::text$$), 'CAI-02', 'critique');
  PERFORM recette.essai('7','Caisse','A-caisse','Rapport de caisse de la session clôturée','Rapport produit','ok', format($$SELECT left(public.sante_rapport_caisse(%L)::text, 80)$$, _s), 'CAI-03', 'majeure');
  PERFORM recette.essai('7','Caisse','A-caisse','Ré-ouvrir la session clôturée','Refus ou sans effet','vide',
    format($$WITH u AS (UPDATE public.sante_sessions_caisse SET fermee_le = NULL WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u$$, _s), 'CAI-03', 'critique');
  -- Tiers payant : transmission, rejet, règlement partiel, lettrage, créances, provision, relance.
  SELECT f.id, f.organisme INTO _f, _x FROM public.sante_factures f WHERE f.structure_id = recette.sid('B') AND f.type = 'facture' AND f.part_organisme > 0 AND NOT f.annulee AND f.statut_tiers = 'a_facturer' LIMIT 1;
  PERFORM recette.essai('7','Tiers payant','B-tp','Transmission de la facture à l''organisme','Statut envoyé','ok', format($$SELECT public.sante_statut_tiers(%L, 'envoye')::text$$, _f), 'TP-04', 'majeure');
  SELECT f.id INTO _f2 FROM public.sante_factures f WHERE f.structure_id = recette.sid('B') AND f.type = 'facture' AND f.part_organisme > 0 AND NOT f.annulee AND f.statut_tiers = 'a_facturer' AND f.organisme = _x LIMIT 1;
  PERFORM recette.essai('7','Tiers payant','B-tp','Rejet partiel codifié par l''organisme','Rejet enregistré','ok',
    format($$SELECT public.sante_rejet_tiers(%L, 'partiel', 'Acte non couvert (TEST)', 1000)::text$$, coalesce(_f2, _f)), 'TP-05', 'majeure');
  PERFORM recette.essai('7','Tiers payant','B-tp','Règlement partiel de l''organisme imputé sur une facture','Imputé','ok',
    format($$SELECT public.sante_imputer_reglement(recette.sid('B'), %L, 1000, 'virement', 'VIR-TEST-1', jsonb_build_array(jsonb_build_object('facture_id', %L, 'montant', 1000)))::text$$, _x, _f), 'TP-06', 'majeure');
  PERFORM recette.essai('7','Tiers payant','B-tp','Règlement supérieur à la créance refusé','Refus','refus',
    format($$SELECT public.sante_imputer_reglement(recette.sid('B'), %L, 99999999, 'virement', 'VIR-TEST-2', jsonb_build_array(jsonb_build_object('facture_id', %L, 'montant', 99999999)))::text$$, _x, _f), 'TP-06', 'critique');
  PERFORM recette.essai('7','Tiers payant','B-tp','Créances par organisme','Liste non vide','ok',
    $$SELECT CASE WHEN count(*) > 0 THEN count(*)::text END FROM public.sante_creances_organismes(recette.sid('B'))$$, 'TP-07', 'majeure');
  PERFORM recette.essai('7','Tiers payant','B-admin','Provision pour créance douteuse','Provision comptabilisée','ok',
    format($$SELECT public.sante_provisionner_creance(recette.sid('B'), %L, 5000, 'Retard de paiement (TEST)')::text$$, _x), 'TP-07', 'majeure');
  PERFORM recette.essai('7','Tiers payant','B-tp','Relance d''un organisme','Relance enregistrée','ok',
    format($$SELECT public.sante_relancer(recette.sid('B'), %L)::text$$, _x), 'TP-07', 'mineure');
  PERFORM recette.essai('7','Tiers payant','B-caisse','Un caissier ne transmet pas aux organismes','Refus','refus',
    format($$SELECT public.sante_statut_tiers(%L, 'paye')::text$$, coalesce(_f2, _f)), 'TP-04', 'majeure');
  -- Mode secours.
  PERFORM recette.essai('7','Facturation','A-admin','Réservation d''un bloc de numéros de secours','Bloc réservé','ok',
    $$SELECT public.sante_reserver_bloc(recette.sid('A'), 'Accueil', 20)::text$$, 'FAC-06', 'majeure');
  PERFORM recette.essai('7','Facturation','A-caisse','Facture de secours hors du bloc refusée','Refus','refus',
    $$SELECT public.sante_saisir_facture_secours((SELECT id FROM public.sante_blocs_secours WHERE structure_id = recette.sid('A') ORDER BY created_at DESC LIMIT 1), 999999,
       (SELECT id FROM public.sante_patients WHERE structure_id = recette.sid('A') LIMIT 1), '[{"code":"CS","libelle":"Consultation","prix_unitaire":10000,"quantite":1}]', NULL)::text$$, 'FAC-06', 'majeure');
END $d$;
