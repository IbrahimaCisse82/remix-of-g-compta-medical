-- Phase 9 : imports (catalogue, règlements d'organismes, relevés bancaires) et export de sauvegarde. TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '9';

-- Fichiers d'import construits à partir du catalogue fictif de B ; conservés dans recette.fichiers pour le livrable 3.
DO $d$ DECLARE _ok jsonb; _vol jsonb; BEGIN
  SELECT jsonb_agg(jsonb_build_object('code_analyse', z.acode, 'code_parametre', z.pcode, 'type', 'numerique', 'unite', coalesce(z.unite, ''),
           'bas', (10 + z.n)::text, 'haut', (60 + z.n)::text, 'critique_bas', '1', 'critique_haut', (900 + z.n)::text, 'sexe', CASE WHEN z.n % 2 = 0 THEN 'M' ELSE 'F' END,
           'age_min_ans', '18', 'age_max_ans', '150', 'delai_heures', '24', 'a_jeun', 'non'))
    INTO _ok FROM (SELECT a.code AS acode, p.code AS pcode, p.unite, row_number() OVER (ORDER BY a.code, p.code) n
                     FROM public.sante_analyse_parametres p JOIN public.sante_analyses a ON a.id = p.analyse_id
                    WHERE p.structure_id = recette.sid('B') AND p.type = 'numerique' ORDER BY a.code, p.code LIMIT 20) z;
  SELECT jsonb_agg(_ok->(g % jsonb_array_length(_ok))) INTO _vol FROM generate_series(0, 4999) g;
  INSERT INTO recette.fichiers (nom, contenu) VALUES
    ('import_catalogue_valide', _ok),
    ('import_catalogue_volume_5000', _vol),
    ('import_catalogue_volume_5001', _vol || jsonb_build_array(_ok->0)),
    ('import_catalogue_erreurs', jsonb_build_array(
       jsonb_build_object('code_analyse','ZZZ-INCONNU','code_parametre','X'),
       jsonb_build_object('code_analyse',_ok->0->>'code_analyse','code_parametre',_ok->0->>'code_parametre','bas','80','haut','20'),
       jsonb_build_object('code_analyse',_ok->0->>'code_analyse','code_parametre',_ok->0->>'code_parametre','bas','10','haut','20','sexe','X'),
       jsonb_build_object('code_analyse',_ok->0->>'code_analyse','code_parametre','NOUV','type','image'),
       jsonb_build_object('code_analyse',_ok->0->>'code_analyse','code_parametre',_ok->0->>'code_parametre','bas','dix','haut','20'),
       jsonb_build_object('code_analyse',_ok->0->>'code_analyse','code_parametre',_ok->0->>'code_parametre','bas','10','haut','20','critique_bas','15'),
       jsonb_build_object('code_analyse',_ok->0->>'code_analyse','delai_heures','-3')))
  ON CONFLICT (nom) DO UPDATE SET contenu = excluded.contenu;
END $d$;
CREATE OR REPLACE FUNCTION recette.fichier(_nom text) RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT contenu FROM recette.fichiers WHERE nom = _nom $f$;
GRANT EXECUTE ON FUNCTION recette.fichier(text) TO authenticated;
GRANT SELECT ON recette.fichiers TO authenticated;

SELECT recette.essai('9','Import catalogue','B-caisse','Import du catalogue par un caissier','Refus','refus',
  $$SELECT public.sante_catalogue_importer_references(recette.sid('B'), recette.fichier('import_catalogue_valide'))::text$$, 'LAB-01', 'majeure');
SELECT recette.essai('9','Import catalogue','A-admin','Import dans le catalogue d''une autre structure (A → B)','Refus','refus',
  $$SELECT public.sante_catalogue_importer_references(recette.sid('B'), recette.fichier('import_catalogue_valide'))::text$$, 'SEC-02', 'critique');
SELECT recette.essai('9','Import catalogue','B-bio-1','Fichier vide','Refus','refus',
  $$SELECT public.sante_catalogue_importer_references(recette.sid('B'), '[]'::jsonb)::text$$, 'LAB-01', 'mineure');
DO $d$ DECLARE _l jsonb; i int := 0; _lib text[] := ARRAY['analyse inconnue','bas supérieur à haut','sexe invalide','type inconnu','nombre illisible','critique_bas > bas','délai négatif']; BEGIN
  FOR _l IN SELECT value FROM jsonb_array_elements(recette.fichier('import_catalogue_erreurs')) LOOP
    i := i + 1;
    PERFORM recette.essai('9','Import catalogue','B-bio-1','Ligne erronée refusée avec son numéro : ' || _lib[i],'Refus, fichier entier annulé','refus',
      format('SELECT public.sante_catalogue_importer_references(recette.sid(''B''), recette.fichier(''import_catalogue_valide'') || %L::jsonb)::text', jsonb_build_array(_l)), 'LAB-01', 'majeure');
  END LOOP;
END $d$;
DO $d$ DECLARE _avant bigint; _apres bigint; _apres2 bigint; _r text; BEGIN
  SELECT count(*) INTO _avant FROM public.sante_valeurs_reference WHERE structure_id = recette.sid('B');
  _r := recette.essai('9','Import catalogue','B-bio-1','Import valide de 20 paramètres (bornes, critiques, sexe, âge, délai)','20 lignes, 20 références','ok',
    $$SELECT public.sante_catalogue_importer_references(recette.sid('B'), recette.fichier('import_catalogue_valide'))::text$$, 'LAB-01', 'majeure');
  SELECT count(*) INTO _apres FROM public.sante_valeurs_reference WHERE structure_id = recette.sid('B');
  _r := recette.essai('9','Import catalogue','B-bio-1','Réimport du même fichier (doublons)','Aucune référence en double','ok',
    $$SELECT public.sante_catalogue_importer_references(recette.sid('B'), recette.fichier('import_catalogue_valide'))::text$$, 'LAB-01', 'majeure');
  SELECT count(*) INTO _apres2 FROM public.sante_valeurs_reference WHERE structure_id = recette.sid('B');
  PERFORM recette.noter('9','Import catalogue',NULL,'Valeurs de référence : +20 au premier import, +0 au réimport','+20 puis +0', '+' || (_apres - _avant) || ' puis +' || (_apres2 - _apres), _apres - _avant = 20 AND _apres2 = _apres, 'LAB-01', NULL, 'majeure');
END $d$;
SELECT recette.essai('9','Import catalogue','B-bio-1','Volume : fichier de 5 000 lignes (limite)','Accepté','ok',
  $$SELECT public.sante_catalogue_importer_references(recette.sid('B'), recette.fichier('import_catalogue_volume_5000'))->>'lignes'$$, 'LAB-01', 'majeure');
SELECT recette.essai('9','Import catalogue','B-bio-1','Volume : fichier de 5 001 lignes','Refus (5 000 maximum)','refus',
  $$SELECT public.sante_catalogue_importer_references(recette.sid('B'), recette.fichier('import_catalogue_volume_5001'))->>'lignes'$$, 'LAB-01', 'mineure');

-- Règlements d'organismes (relevé de tiers payant).
DO $d$ DECLARE _f record; BEGIN
  SELECT f.id, f.organisme, public.sante_reste_organisme(f.id) reste INTO _f FROM public.sante_factures f
   WHERE f.structure_id = recette.sid('B') AND f.type = 'facture' AND NOT f.annulee AND f.organisme IS NOT NULL AND public.sante_reste_organisme(f.id) >= 2000
   ORDER BY f.created_at LIMIT 1;
  INSERT INTO recette.fichiers (nom, contenu) VALUES
    ('import_reglements_valide', jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'organisme', _f.organisme, 'reference', 'REL-TEST-1', 'mode', 'virement', 'montant', 1000, 'date', current_date - 3, 'confirme', 'true'))),
    ('import_reglements_modifie', jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'organisme', _f.organisme, 'reference', 'REL-TEST-1', 'mode', 'virement', 'montant', 1500, 'date', current_date - 3, 'confirme', 'true'))),
    ('import_reglements_non_confirme', jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'organisme', _f.organisme, 'reference', 'REL-TEST-2', 'mode', 'virement', 'montant', 500, 'date', current_date - 1))),
    ('import_reglements_date_future', jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'organisme', _f.organisme, 'reference', 'REL-TEST-3', 'mode', 'virement', 'montant', 500, 'date', current_date + 5, 'confirme', 'true'))),
    ('import_reglements_trop_percu', jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'organisme', _f.organisme, 'reference', 'REL-TEST-4', 'mode', 'virement', 'montant', _f.reste + 1000, 'date', current_date - 1, 'confirme', 'true'))),
    ('import_reglements_mauvais_organisme', jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'organisme', 'Organisme fictif inexistant', 'reference', 'REL-TEST-5', 'mode', 'virement', 'montant', 500, 'date', current_date - 1, 'confirme', 'true'))),
    ('import_reglements_montant_decimal', jsonb_build_array(jsonb_build_object('facture_id', _f.id, 'organisme', _f.organisme, 'reference', 'REL-TEST-6', 'mode', 'virement', 'montant', 500.5, 'date', current_date - 1, 'confirme', 'true'))),
    ('import_reglements_501', (SELECT jsonb_agg(jsonb_build_object('facture_id', _f.id, 'organisme', _f.organisme, 'reference', 'REL-V-' || g, 'mode', 'virement', 'montant', 1, 'date', current_date - 1, 'confirme', 'true')) FROM generate_series(1, 501) g))
  ON CONFLICT (nom) DO UPDATE SET contenu = excluded.contenu;
  INSERT INTO recette.ids VALUES ('reg_facture', _f.id) ON CONFLICT (cle) DO UPDATE SET id = excluded.id;
END $d$;
SELECT recette.essai('9','Import règlements','B-lecteur','Import d''un relevé par un lecteur','Refus','refus',
  $$SELECT public.sante_importer_reglements(recette.sid('B'), recette.fichier('import_reglements_valide'))::text$$, 'TP-05', 'majeure');
DO $d$ DECLARE _n text; _lib text; BEGIN
  FOREACH _n IN ARRAY ARRAY['non_confirme','date_future','trop_percu','mauvais_organisme','montant_decimal','501'] LOOP
    _lib := CASE _n WHEN 'non_confirme' THEN 'correspondance non confirmée' WHEN 'date_future' THEN 'date dans le futur' WHEN 'trop_percu' THEN 'montant supérieur au reste dû'
      WHEN 'mauvais_organisme' THEN 'organisme différent de celui de la facture' WHEN 'montant_decimal' THEN 'montant FCFA non entier' ELSE '501 lignes (500 maximum)' END;
    PERFORM recette.essai('9','Import règlements','B-tp','Relevé refusé : ' || _lib,'Refus','refus',
      format('SELECT public.sante_importer_reglements(recette.sid(''B''), recette.fichier(%L))::text', 'import_reglements_' || _n), 'TP-05', 'majeure');
  END LOOP;
END $d$;
DO $d$ DECLARE _reste0 numeric; _reste1 numeric; _r text; _e bigint; _e1 bigint; _date date; BEGIN
  _reste0 := public.sante_reste_organisme((SELECT id FROM recette.ids WHERE cle = 'reg_facture'));
  SELECT count(*) INTO _e FROM public.sante_compta_evenements WHERE structure_id = recette.sid('B') AND source_type = 'reglement_organisme';
  _r := recette.essai('9','Import règlements','B-tp','Import d''un relevé valide (1 000 F sur une facture)','1 ajouté','ok',
    $$SELECT public.sante_importer_reglements(recette.sid('B'), recette.fichier('import_reglements_valide'))->>'ajoutes'$$, 'TP-05', 'majeure');
  _r := recette.essai('9','Import règlements','B-tp','Réimport du même relevé (idempotence)','0 ajouté, 1 existant','egal:{"ajoutes": 0, "existants": 1}',
    $$SELECT (public.sante_importer_reglements(recette.sid('B'), recette.fichier('import_reglements_valide')) - 'ids')::text$$, 'TP-05', 'critique');
  _r := recette.essai('9','Import règlements','B-tp','Même référence réimportée avec un autre montant','Refus','refus',
    $$SELECT public.sante_importer_reglements(recette.sid('B'), recette.fichier('import_reglements_modifie'))::text$$, 'TP-05', 'critique');
  _reste1 := public.sante_reste_organisme((SELECT id FROM recette.ids WHERE cle = 'reg_facture'));
  SELECT count(*) INTO _e1 FROM public.sante_compta_evenements WHERE structure_id = recette.sid('B') AND source_type = 'reglement_organisme';
  PERFORM recette.noter('9','Import règlements',NULL,'Le reste dû baisse de 1 000 F une seule fois ; une seule écriture de banque','−1 000 F ; +1 événement',
    (_reste1 - _reste0) || ' F ; +' || (_e1 - _e) || ' événement(s)', _reste0 - _reste1 = 1000 AND _e1 - _e = 1, 'TP-05', NULL, 'critique');
  SELECT e.date_piece INTO _date FROM public.sante_compta_evenements e WHERE e.structure_id = recette.sid('B') AND e.source_type = 'reglement_organisme' AND e.piece = 'REL-TEST-1';
  PERFORM recette.noter('9','Import règlements',NULL,'L''écriture de banque est datée du jour du règlement (date du relevé)', (current_date - 3)::text, coalesce(_date::text, 'aucune'), _date = current_date - 3, 'CPT-01', NULL, 'mineure');
END $d$;

-- Relevés bancaires.
DO $d$ BEGIN
  INSERT INTO recette.fichiers (nom, contenu) VALUES
   ('import_banque_200', (SELECT jsonb_agg(jsonb_build_object('date', (DATE '2026-02-01' + g)::text, 'libelle', CASE WHEN g % 3 = 0 THEN 'VIR RECU MUTUELLE TEST ' ELSE 'PRLV FOURNISSEUR TEST ' END || g,
       'reference', 'RB-' || g, 'montant', CASE WHEN g % 3 = 0 THEN 25000 + g * 100 ELSE -(10000 + g * 50) END)) FROM generate_series(1, 200) g)),
   ('import_banque_erreur', jsonb_build_array(jsonb_build_object('date','2026-03-01','libelle','OK','montant',1000), jsonb_build_object('date','2026-03-02','libelle','Montant nul','montant',0)))
  ON CONFLICT (nom) DO UPDATE SET contenu = excluded.contenu;
END $d$;
SELECT recette.essai('9','Import banque','A-caisse','Import d''un relevé bancaire par le caissier','Refus (comptable)','refus',
  $$SELECT public.banque_importer(recette.eid('A'), recette.exo('A', 2026), '5211', 'releve.csv', encode(sha256('recette-1'::bytea), 'hex'), 0, recette.fichier('import_banque_200'))::text$$, 'CPT-15', 'majeure');
SELECT recette.essai('9','Import banque','A-compta','Relevé sur un compte non bancaire (571)','Refus','refus',
  $$SELECT public.banque_importer(recette.eid('A'), recette.exo('A', 2026), '571', 'releve.csv', encode(sha256('recette-2'::bytea), 'hex'), 0, recette.fichier('import_banque_200'))::text$$, 'CPT-15', 'majeure');
SELECT recette.essai('9','Import banque','A-compta','Relevé contenant une opération de montant nul','Refus avec numéro de ligne','refus',
  $$SELECT public.banque_importer(recette.eid('A'), recette.exo('A', 2026), '5211', 'releve-err.csv', encode(sha256('recette-3'::bytea), 'hex'), 0, recette.fichier('import_banque_erreur'))::text$$, 'CPT-15', 'majeure');
SELECT recette.essai('9','Import banque','C-compta','Relevé sur l''exercice clôturé 2025','Refus','refus',
  $$SELECT public.banque_importer(recette.eid('C'), recette.exo('C', 2025), '5211', 'releve.csv', encode(sha256('recette-4'::bytea), 'hex'), 0, '[{"date":"2025-05-01","libelle":"x","montant":1000}]')::text$$, 'CPT-15', 'majeure');
SELECT recette.essai('9','Import banque','A-compta','Import d''un relevé de 200 opérations','Accepté','ok',
  $$SELECT (SELECT count(*) FROM public.operations_bancaires WHERE releve_id = public.banque_importer(recette.eid('A'), recette.exo('A', 2026), '5211', 'releve-fevrier.csv', encode(sha256('recette-5'::bytea), 'hex'), 1500000, recette.fichier('import_banque_200')))::text$$, 'CPT-15', 'majeure');
SELECT recette.essai('9','Import banque','A-compta','Réimport du même fichier (même empreinte)','Refus (doublon)','refus',
  $$SELECT public.banque_importer(recette.eid('A'), recette.exo('A', 2026), '5211', 'releve-fevrier.csv', encode(sha256('recette-5'::bytea), 'hex'), 1500000, recette.fichier('import_banque_200'))::text$$, 'CPT-15', 'critique');

-- Export de sauvegarde de la structure.
SELECT recette.essai('9','Export','B-caisse','Export de sauvegarde par un caissier','Refus','refus',
  $$SELECT left(public.sante_export_structure(recette.sid('B'))::text, 10)$$, 'SAV-02', 'critique');
SELECT recette.essai('9','Export','A-admin','Export de la structure B par l''administrateur de A','Refus','refus',
  $$SELECT left(public.sante_export_structure(recette.sid('B'))::text, 10)$$, 'SEC-02', 'critique');
CREATE OR REPLACE FUNCTION recette.export_controle(_s text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE _x jsonb; _ecarts text := ''; _k text; _n bigint; _sid uuid := recette.sid(_s); BEGIN
  _x := public.sante_export_structure(_sid);
  FOR _k IN SELECT key FROM jsonb_each(_x->'compteurs') LOOP
    CONTINUE WHEN _k IN ('membres','patient_assurances','sites');
    IF _k = 'patients' THEN SELECT count(*) INTO _n FROM public.sante_patients WHERE structure_id = _sid;
    ELSIF to_regclass('public.sante_' || _k) IS NOT NULL THEN EXECUTE format('SELECT count(*) FROM public.%I WHERE structure_id = $1', 'sante_' || _k) INTO _n USING _sid;
    ELSE CONTINUE; END IF;
    IF _n <> (_x->'compteurs'->>_k)::bigint THEN _ecarts := _ecarts || _k || ' ' || (_x->'compteurs'->>_k) || '≠' || _n || ' '; END IF;
  END LOOP;
  RETURN (SELECT count(*) FROM jsonb_object_keys(_x->'compteurs')) || ' rubriques ; ' || length(_x::text) / 1024 || ' Ko ; patients ' || (_x->'compteurs'->>'patients') || ' ; factures ' || (_x->'compteurs'->>'factures')
    || ' ; écarts : ' || coalesce(nullif(_ecarts, ''), 'aucun') || CASE WHEN _x::text ~* '(consultation_id.*diagnostic|"resultats":)' THEN ' ; contenu clinique présent' ELSE '' END;
END $f$;
GRANT EXECUTE ON FUNCTION recette.export_controle(text) TO authenticated;
SELECT recette.essai('9','Export','B-admin','Export de sauvegarde de B et rapprochement des compteurs avec la base','Compteurs = lignes en base, sans contenu clinique','ok',
  $$SELECT recette.export_controle('B')$$, 'SAV-02', 'critique');
SELECT recette.essai('9','Export','A-admin','Export de sauvegarde de A et rapprochement des compteurs avec la base','Compteurs = lignes en base, sans contenu clinique','ok',
  $$SELECT recette.export_controle('A')$$, 'SAV-02', 'critique');
DO $d$ DECLARE _n bigint; BEGIN
  SELECT count(*) INTO _n FROM public.medical_audit_log WHERE structure_id IN (recette.sid('A'), recette.sid('B')) AND action = 'EXPORT' AND created_at > now() - interval '1 hour';
  PERFORM recette.noter('9','Export',NULL,'Chaque export est tracé dans le journal d''audit','≥ 2 traces', _n || ' trace(s)', _n >= 2, 'SAV-02', NULL, 'majeure');
END $d$;
