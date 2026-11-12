-- Phase 4 : génération d'une activité fictive par les fonctions de l'application, rôle par rôle (aucune insertion qui
-- contourne une règle). Chaque fonction traite un lot ; on l'appelle plusieurs fois. Les échecs sont consignés.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;

CREATE TABLE IF NOT EXISTS recette.erreurs (id bigserial PRIMARY KEY, etape text, profil text, message text, n int DEFAULT 1, fait_le timestamptz DEFAULT clock_timestamp());
CREATE OR REPLACE FUNCTION recette.erreur(_etape text, _profil text, _msg text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO recette.erreurs(etape, profil, message) VALUES (_etape, _profil, left(_msg, 300));
$f$;
CREATE OR REPLACE FUNCTION recette.au_hasard(_t text[]) RETURNS text LANGUAGE sql VOLATILE AS $f$ SELECT _t[1 + floor(random() * array_length(_t, 1))::int] $f$;

-- ---------------------------------------------------------------- Patients
CREATE OR REPLACE FUNCTION recette.gen_patients(_s text, _n int) RETURNS int LANGUAGE plpgsql AS $f$
DECLARE i int; _ok int := 0; _nom text; _pre text; _sexe text; _dn date; _est boolean; _tel text; _pid uuid;
  _noms text[] := ARRAY['DIOP','NDIAYE','FALL','SOW','BA','GUEYE','FAYE','SARR','MBAYE','DIALLO','CISSE','KANE','THIAM','SECK','SY','NIANG','CAMARA','TOURE','DIOUF','NDOUR','KA','LO','WADE','GAYE','DIAGNE','SENE','KEBE','MBENGUE','BADIANE','DIENG','TALL','DIA','NDOYE','SALL','COLY','MANE','SAGNA','BODIAN','GOUDIABY','DIEDHIOU'];
  _pf text[] := ARRAY['Awa','Fatou','Aminata','Mariama','Khady','Ndeye','Coumba','Astou','Aïssatou','Bineta','Rokhaya','Mame','Sokhna','Yacine','Adja','Penda','Dieynaba','Seynabou','Oumou','Ramatoulaye'];
  _pm text[] := ARRAY['Moussa','Mamadou','Ibrahima','Cheikh','Abdoulaye','Ousmane','Modou','Babacar','Pape','Alioune','Lamine','Serigne','Assane','Malick','Omar','Souleymane','El Hadji','Bassirou','Djibril','Ismaïla'];
BEGIN
  FOR i IN 1.._n LOOP
    BEGIN
      _sexe := CASE WHEN random() < 0.52 THEN 'F' ELSE 'M' END;
      _nom := recette.au_hasard(_noms);
      _pre := CASE _sexe WHEN 'F' THEN recette.au_hasard(_pf) ELSE recette.au_hasard(_pm) END;
      _dn := CASE WHEN random() < 0.22 THEN current_date - (floor(random() * 17 * 365) + 30)::int ELSE current_date - (floor(random() * 70 * 365) + 18 * 365)::int END;
      _est := random() < 0.05;
      IF _est THEN _dn := make_date(extract(year FROM _dn)::int, 1, 1); END IF;
      _tel := '+221 7' || (5 + floor(random() * 5))::int || ' ' || lpad(floor(random() * 1000)::int::text, 3, '0') || ' ' || lpad(floor(random() * 100)::int::text, 2, '0') || ' ' || lpad(floor(random() * 100)::int::text, 2, '0');
      PERFORM recette.agir(_s || '-secr');
      _pid := public.sante_creer_patient(recette.sid(_s), _nom, _pre || ' (TEST)', _sexe, _dn, _tel, 'Quartier fictif ' || (1 + floor(random() * 40))::int || ', ' || CASE _s WHEN 'C' THEN 'Thiès' ELSE 'Dakar' END,
               NULL, NULL, true, true, _est);
      PERFORM recette.sortir();
      _ok := _ok + 1;
    EXCEPTION WHEN OTHERS THEN PERFORM recette.erreur('patients', _s || '-secr', SQLERRM);
    END;
  END LOOP;
  RETURN _ok;
END $f$;

-- Couvertures : environ 35 % des patients ; quelques couvertures expirées et doubles couvertures.
CREATE OR REPLACE FUNCTION recette.gen_assurances(_s text) RETURNS int LANGUAGE plpgsql AS $f$
DECLARE p record; _orgs text[]; _ok int := 0; _r float;
BEGIN
  SELECT array_agg(nom) INTO _orgs FROM public.sante_organismes WHERE structure_id = recette.sid(_s);
  FOR p IN SELECT id FROM public.sante_patients x WHERE structure_id = recette.sid(_s)
             AND NOT EXISTS (SELECT 1 FROM public.sante_patient_assurances a WHERE a.patient_id = x.id) AND random() < 0.35 LOOP
    BEGIN
      _r := random();
      PERFORM recette.agir(_s || '-secr');
      INSERT INTO public.sante_patient_assurances(patient_id, organisme, numero_adherent, taux_couverture, date_debut, date_fin)
      VALUES (p.id, recette.au_hasard(_orgs), 'ADH-TEST-' || floor(random() * 1e6)::int, 80, '2025-01-01', CASE WHEN _r < 0.08 THEN DATE '2026-06-30' ELSE DATE '2027-12-31' END);
      IF _r > 0.95 THEN
        INSERT INTO public.sante_patient_assurances(patient_id, organisme, numero_adherent, taux_couverture, date_debut, date_fin)
        VALUES (p.id, recette.au_hasard(_orgs), 'ADH2-TEST-' || floor(random() * 1e6)::int, 50, '2026-01-01', '2027-12-31');
      END IF;
      PERFORM recette.sortir();
      _ok := _ok + 1;
    EXCEPTION WHEN OTHERS THEN PERFORM recette.erreur('assurances', _s || '-secr', SQLERRM);
    END;
  END LOOP;
  RETURN _ok;
END $f$;

-- ---------------------------------------------------------------- Caisse
CREATE OR REPLACE FUNCTION recette.session_caisse(_s text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE _id uuid; _u uuid := recette.uid(_s || '-caisse');
BEGIN
  SELECT id INTO _id FROM public.sante_sessions_caisse WHERE structure_id = recette.sid(_s) AND caissier = _u AND fermee_le IS NULL ORDER BY ouverte_le DESC LIMIT 1;
  IF _id IS NULL THEN
    PERFORM recette.agir(_s || '-caisse');
    _id := public.sante_ouvrir_caisse(recette.sid(_s), 50000);
    PERFORM recette.sortir();
  END IF;
  RETURN _id;
END $f$;

CREATE OR REPLACE FUNCTION recette.encaisser(_s text, _facture uuid) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE _pp numeric; _mode text; _deja numeric;
BEGIN
  SELECT part_patient INTO _pp FROM public.sante_factures WHERE id = _facture;
  SELECT coalesce(sum(montant), 0) INTO _deja FROM public.sante_encaissements WHERE facture_id = _facture;
  IF coalesce(_pp, 0) - _deja <= 0 THEN RETURN; END IF;
  PERFORM recette.session_caisse(_s);
  _mode := recette.au_hasard(ARRAY['especes','especes','especes','wave','wave','orange_money','free_money','wizall','carte','cheque','virement']);
  PERFORM recette.agir(_s || '-caisse');
  PERFORM public.sante_encaisser(_facture, _mode, _pp - _deja, CASE WHEN _mode IN ('especes') THEN NULL ELSE 'REF-TEST-' || floor(random() * 1e8)::bigint END);
  PERFORM recette.sortir();
END $f$;

-- ---------------------------------------------------------------- Parcours cabinet (A, C)
CREATE OR REPLACE FUNCTION recette.gen_consultations(_s text, _n int) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE i int; _pid uuid; _prat record; _rdv uuid; _c uuid; _debut timestamptz; _slot int; _fac uuid; _code text; _ass uuid;
  _stats jsonb := '{"rdv":0,"absents":0,"consultations":0,"ordonnances":0,"certificats":0,"controles":0,"demandes":0,"factures":0}'; _r float;
  _codes jsonb := '{"medecine-generale":["J06.9","A09.0","B54","I10","E11.9","R50.9","K29.7","M54.5","J20.9","N39.0"],
                    "cardiologie":["I10","I11.9","I20.9","I48.9","I50.9","E78.0","R07.4","I25.9"],
                    "gynecologie-obstetrique":["O80.9","N76.0","N94.6","Z34.9","N80.3","O21.0","Z30.0","N92.0"],
                    "pediatrie":["J06.9","A09.0","B54","J18.9","R50.9","L20.9","E44.0","H66.9"],
                    "dermatologie":["L20.9","B35.4","L70.0","L30.9","B36.0","L50.9","L40.0","B86"]}';
  _meds text[] := ARRAY['Paracétamol 500 mg','Amoxicilline 500 mg','Artéméther-luméfantrine','Ibuprofène 400 mg','Amlodipine 5 mg','Metformine 850 mg','Oméprazole 20 mg','SRO sachet','Fer acide folique','Desloratadine 5 mg'];
  _sp text; _ord uuid; _tarif numeric; _acte text;
BEGIN
  FOR i IN 1.._n LOOP
    BEGIN
      SELECT id INTO _pid FROM public.sante_patients WHERE structure_id = recette.sid(_s) AND statut = 'actif' ORDER BY random() LIMIT 1;
      SELECT pr.id, pr.specialite_id, c.cle INTO _prat FROM public.sante_praticiens pr JOIN recette.comptes c ON c.user_id = pr.user_id
       WHERE pr.structure_id = recette.sid(_s) AND c.cle LIKE _s || '-med-%' ORDER BY random() LIMIT 1;
      _sp := coalesce(_prat.specialite_id, 'medecine-generale');
      SELECT count(*) INTO _slot FROM public.sante_rendez_vous WHERE praticien_id = _prat.id;
      _debut := (DATE '2026-11-16' + (_slot / 24) * interval '1 day') + time '08:00' + (_slot % 24) * interval '20 minutes';
      _r := random();
      PERFORM recette.agir(_s || '-secr');
      INSERT INTO public.sante_rendez_vous(structure_id, praticien_id, patient_id, debut, duree_min, motif, statut)
      VALUES (recette.sid(_s), _prat.id, _pid, _debut, 20, recette.au_hasard(ARRAY['Fièvre','Contrôle','Douleurs','Bilan','Toux','Suivi tension','Consultation prénatale','Éruption cutanée']), 'planifie')
      RETURNING id INTO _rdv;
      _stats := jsonb_set(_stats, '{rdv}', to_jsonb((_stats->>'rdv')::int + 1));
      IF _r < 0.08 THEN
        UPDATE public.sante_rendez_vous SET statut = CASE WHEN _r < 0.04 THEN 'absent' ELSE 'annule' END WHERE id = _rdv;
        PERFORM recette.sortir();
        _stats := jsonb_set(_stats, '{absents}', to_jsonb((_stats->>'absents')::int + 1));
        CONTINUE;
      END IF;
      UPDATE public.sante_rendez_vous SET statut = 'arrive', arrive_le = now() WHERE id = _rdv;
      PERFORM recette.sortir();
      -- Consultation par le médecin.
      PERFORM recette.agir(_prat.cle);
      _c := public.sante_demarrer_consultation(_pid, _prat.id, _rdv, NULL);
      INSERT INTO public.sante_constantes(consultation_id, patient_id, ta_sys, ta_dia, pouls, temperature, poids, taille, spo2)
      VALUES (_c, _pid, 100 + floor(random() * 60), 60 + floor(random() * 35), 60 + floor(random() * 50), round((36 + random() * 3)::numeric, 1),
              round((10 + random() * 80)::numeric, 1), 60 + floor(random() * 120), 92 + floor(random() * 8));
      _code := (_codes->_sp)->>floor(random() * jsonb_array_length(_codes->_sp))::int;
      UPDATE public.sante_consultations SET anamnese = 'Anamnèse fictive (TEST)', examen = 'Examen clinique fictif (TEST)',
             diagnostic = 'Diagnostic fictif ' || _code, conduite = 'Conduite à tenir fictive (TEST)' WHERE id = _c;
      PERFORM public.sante_diagnostic_coder(_c, _code, true);
      IF random() < 0.55 THEN
        PERFORM public.sante_emettre_ordonnance(_c, jsonb_build_array(jsonb_build_object('medicament', recette.au_hasard(_meds), 'posologie', '1 prise x 2/j', 'duree', '5 jours', 'quantite', 1)), 'Repos (TEST)');
        _stats := jsonb_set(_stats, '{ordonnances}', to_jsonb((_stats->>'ordonnances')::int + 1));
      END IF;
      IF random() < 0.10 THEN
        PERFORM public.sante_emettre_certificat(_c, 'aptitude', 'Certificat fictif établi pour la recette (TEST).', NULL);
        _stats := jsonb_set(_stats, '{certificats}', to_jsonb((_stats->>'certificats')::int + 1));
      END IF;
      IF random() < 0.20 THEN
        PERFORM public.sante_programmer_controle(_c, current_date + 30, 'Contrôle fictif', NULL, 20);
        _stats := jsonb_set(_stats, '{controles}', to_jsonb((_stats->>'controles')::int + 1));
      END IF;
      IF _s = 'C' AND random() < 0.35 THEN
        PERFORM public.sante_creer_demande_labo(_pid, (SELECT array_agg(id) FROM (SELECT id FROM public.sante_analyses WHERE structure_id = recette.sid(_s) AND actif AND code IN ('NFS','GLY','CRP','GE','CREA','ECBU') ORDER BY random() LIMIT 2) z),
                                                (SELECT nom FROM public.sante_praticiens WHERE id = _prat.id), false, 'Renseignements fictifs', _c);
        _stats := jsonb_set(_stats, '{demandes}', to_jsonb((_stats->>'demandes')::int + 1));
      END IF;
      PERFORM public.sante_cloturer_consultation(_c);
      PERFORM recette.sortir();
      _stats := jsonb_set(_stats, '{consultations}', to_jsonb((_stats->>'consultations')::int + 1));
      -- Facturation et encaissement par le caissier (couverture active si elle existe).
      _acte := CASE WHEN _sp = 'medecine-generale' THEN 'CS' WHEN _sp = 'pediatrie' THEN 'CSP' ELSE 'CSS' END;
      SELECT tarif INTO _tarif FROM public.sante_actes WHERE structure_id = recette.sid(_s) AND code = _acte;
      -- La structure facture automatiquement la consultation à la clôture (acte par défaut) ; sinon le caissier la facture.
      SELECT id INTO _fac FROM public.sante_factures WHERE consultation_id = _c AND type = 'facture' AND NOT annulee LIMIT 1;
      IF _fac IS NULL THEN
        PERFORM recette.session_caisse(_s);
        PERFORM recette.agir(_s || '-caisse');
        SELECT a.id INTO _ass FROM public.sante_patient_assurances a WHERE a.patient_id = _pid AND (a.date_fin IS NULL OR a.date_fin >= current_date) ORDER BY a.date_debut LIMIT 1;
        _fac := public.sante_facturer_consultation(_c, _pid, jsonb_build_array(jsonb_build_object('code', _acte, 'libelle', 'Consultation', 'prix_unitaire', _tarif, 'quantite', 1)), _ass);
        PERFORM recette.sortir();
      END IF;
      PERFORM recette.encaisser(_s, _fac);
      _stats := jsonb_set(_stats, '{factures}', to_jsonb((_stats->>'factures')::int + 1));
    EXCEPTION WHEN OTHERS THEN PERFORM recette.erreur('consultation', _s, SQLERRM);
    END;
  END LOOP;
  RETURN _stats;
END $f$;

-- ---------------------------------------------------------------- Parcours laboratoire (B, C)
CREATE OR REPLACE FUNCTION recette.resultat_fictif(_p record) RETURNS record LANGUAGE plpgsql AS $f$
DECLARE r record; _bas numeric; _haut numeric; _x float := random(); _v numeric; _t text;
BEGIN
  IF _p.type = 'numerique' THEN
    SELECT bas, haut INTO _bas, _haut FROM public.sante_valeurs_reference WHERE parametre_id = _p.id AND age_min_jours = 6575 LIMIT 1;
    _bas := coalesce(_bas, 0); _haut := coalesce(_haut, greatest(_bas, 1) * 2);
    _v := CASE WHEN _x < 0.80 THEN _bas + random() * (_haut - _bas) WHEN _x < 0.97 THEN _haut * (1.05 + random() * 0.4) ELSE _bas * (0.5 + random() * 0.3) END;
    _v := round(_v, 2);
  ELSIF _p.type = 'qualitatif' THEN _t := CASE WHEN _x < 0.85 THEN 'Négatif' ELSE 'Positif' END;
  ELSE _t := 'Résultat descriptif fictif (TEST)';
  END IF;
  SELECT _v AS num, _t AS txt INTO r;
  RETURN r;
END $f$;

CREATE OR REPLACE FUNCTION recette.gen_demandes(_s text, _n int) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE i int; _pid uuid; _d uuid; _p record; _v record; _fac uuid; _rej boolean;
  _bio text := CASE _s WHEN 'B' THEN 'B-bio-1' ELSE 'C-bio' END; _bio2 text := CASE _s WHEN 'B' THEN 'B-bio-2' ELSE 'C-bio' END;
  _tech1 text := CASE _s WHEN 'B' THEN 'B-tech-1' ELSE 'C-tech' END; _tech2 text := CASE _s WHEN 'B' THEN 'B-tech-2' ELSE 'C-bio' END;  -- C : un seul technicien, la validation technique revient au biologiste
  _prel text := CASE _s WHEN 'B' THEN 'B-prel-1' ELSE 'C-prel' END;
  _stats jsonb := '{"demandes":0,"rejets":0,"resultats":0,"validees":0,"factures":0}';
BEGIN
  FOR i IN 1.._n LOOP
    BEGIN
      SELECT id INTO _pid FROM public.sante_patients WHERE structure_id = recette.sid(_s) AND statut = 'actif' ORDER BY random() LIMIT 1;
      PERFORM recette.agir(_s || '-secr');
      _d := public.sante_creer_demande_labo(_pid, (SELECT array_agg(id) FROM (SELECT id FROM public.sante_analyses WHERE structure_id = recette.sid(_s) AND actif
                                                    AND section <> 'bacteriologie' ORDER BY random() LIMIT 1 + floor(random() * 3)::int) z),
                                            'Dr Prescripteur externe (TEST)', random() < 0.1, 'Renseignements cliniques fictifs', NULL);
      PERFORM recette.sortir();
      _stats := jsonb_set(_stats, '{demandes}', to_jsonb((_stats->>'demandes')::int + 1));
      -- Facture créée selon le moment paramétré : on encaisse la part patient de toute facture de la demande.
      FOR _fac IN SELECT id FROM public.sante_factures WHERE demande_id = _d AND type = 'facture' LOOP
        PERFORM recette.encaisser(_s, _fac);
        _stats := jsonb_set(_stats, '{factures}', to_jsonb((_stats->>'factures')::int + 1));
      END LOOP;
      PERFORM recette.agir(_prel);
      PERFORM public.sante_prelever(_d, ARRAY['nom','date_naissance'], 'Pli du coude (TEST)', NULL);
      PERFORM recette.sortir();
      _rej := random() < 0.03;
      IF _rej THEN
        PERFORM recette.agir(_tech1);
        PERFORM public.sante_rejeter_echantillon(_d, 'hemolyse', 'Échantillon hémolysé (fictif)', true);
        PERFORM recette.sortir();
        _stats := jsonb_set(_stats, '{rejets}', to_jsonb((_stats->>'rejets')::int + 1));
        CONTINUE;
      END IF;
      PERFORM recette.agir(_tech1);
      PERFORM public.sante_avancer_demande(_d, 'recue', NULL);
      PERFORM public.sante_avancer_demande(_d, 'en_analyse', NULL);
      FOR _p IN SELECT ap.* FROM public.sante_analyse_parametres ap JOIN public.sante_demande_analyses da ON da.analyse_id = ap.analyse_id WHERE da.demande_id = _d LOOP
        _v := recette.resultat_fictif(_p);
        PERFORM public.sante_saisir_resultat(_d, _p.id, _v.num, _v.txt);
        _stats := jsonb_set(_stats, '{resultats}', to_jsonb((_stats->>'resultats')::int + 1));
      END LOOP;
      PERFORM recette.sortir();
      -- Valeurs critiques acquittées par le biologiste.
      PERFORM recette.agir(_bio);
      PERFORM public.sante_acquitter_critique(r.id) FROM public.sante_resultats r WHERE r.demande_id = _d AND r.drapeau IN ('HH','LL') AND r.critique_acquitte_par IS NULL;
      PERFORM recette.sortir();
      IF random() < 0.92 THEN
        PERFORM recette.agir(_tech2); PERFORM public.sante_valider_demande(_d, 'technique'); PERFORM recette.sortir();
        PERFORM recette.agir(_bio2); PERFORM public.sante_valider_demande(_d, 'biologique'); PERFORM recette.sortir();
        _stats := jsonb_set(_stats, '{validees}', to_jsonb((_stats->>'validees')::int + 1));
        FOR _fac IN SELECT id FROM public.sante_factures WHERE demande_id = _d AND type = 'facture' LOOP PERFORM recette.encaisser(_s, _fac); END LOOP;
      END IF;
    EXCEPTION WHEN OTHERS THEN PERFORM recette.erreur('demande', _s, SQLERRM);
    END;
  END LOOP;
  RETURN _stats;
END $f$;

-- Reprise des demandes existantes (prescrites en consultation, ou restées en cours) jusqu'à la validation biologique.
CREATE OR REPLACE FUNCTION recette.traiter_demandes(_s text, _n int) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE d record; _p record; _v record; _fac uuid; _k int := 0; _ok int := 0;
  _bio text := CASE _s WHEN 'B' THEN 'B-bio-1' ELSE 'C-bio' END; _tech1 text := CASE _s WHEN 'B' THEN 'B-tech-3' ELSE 'C-tech' END;
  _tech2 text := CASE _s WHEN 'B' THEN 'B-tech-2' ELSE 'C-bio' END; _prel text := CASE _s WHEN 'B' THEN 'B-prel-2' ELSE 'C-prel' END;
BEGIN
  FOR d IN SELECT id, statut, validee_tech_le FROM public.sante_demandes_labo WHERE structure_id = recette.sid(_s)
             AND statut NOT IN ('validee','rejetee','remise','annulee') ORDER BY created_at LIMIT _n LOOP
    _k := _k + 1;
    BEGIN
      IF d.statut IN ('en_attente','enregistree','prescrite') THEN
        PERFORM recette.agir(_prel); PERFORM public.sante_prelever(d.id, ARRAY['nom','date_naissance'], 'Pli du coude (TEST)', NULL); PERFORM recette.sortir();
      END IF;
      IF d.statut IN ('en_attente','enregistree','prescrite','prelevee') THEN
        PERFORM recette.agir(_tech1); PERFORM public.sante_avancer_demande(d.id, 'recue', NULL); PERFORM recette.sortir();
      END IF;
      IF d.statut IN ('en_attente','enregistree','prescrite','prelevee','recue') THEN
        PERFORM recette.agir(_tech1); PERFORM public.sante_avancer_demande(d.id, 'en_analyse', NULL); PERFORM recette.sortir();
      END IF;
      PERFORM recette.agir(_tech1);
      FOR _p IN SELECT ap.* FROM public.sante_analyse_parametres ap JOIN public.sante_demande_analyses da ON da.analyse_id = ap.analyse_id
                 WHERE da.demande_id = d.id AND NOT EXISTS (SELECT 1 FROM public.sante_resultats r WHERE r.demande_id = d.id AND r.parametre_id = ap.id) LOOP
        _v := recette.resultat_fictif(_p);
        PERFORM public.sante_saisir_resultat(d.id, _p.id, _v.num, _v.txt);
      END LOOP;
      PERFORM recette.sortir();
      PERFORM recette.agir(_bio);
      PERFORM public.sante_acquitter_critique(r.id) FROM public.sante_resultats r WHERE r.demande_id = d.id AND r.drapeau IN ('HH','LL') AND r.critique_acquitte_par IS NULL;
      PERFORM recette.sortir();
      IF d.validee_tech_le IS NULL THEN
        PERFORM recette.agir(_tech2); PERFORM public.sante_valider_demande(d.id, 'technique'); PERFORM recette.sortir();
      END IF;
      PERFORM recette.agir(_bio); PERFORM public.sante_valider_demande(d.id, 'biologique'); PERFORM recette.sortir();
      FOR _fac IN SELECT id FROM public.sante_factures WHERE demande_id = d.id AND type = 'facture' LOOP PERFORM recette.encaisser(_s, _fac); END LOOP;
      _ok := _ok + 1;
    EXCEPTION WHEN OTHERS THEN PERFORM recette.erreur('traiter_demande', _s, SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('vues', _k, 'validees', _ok);
END $f$;
