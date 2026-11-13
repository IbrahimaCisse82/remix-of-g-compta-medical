-- Phase 9 (reprise) : deux essais de 11 étaient mal rédigés. TEST uniquement.
--  - relevé bancaire : la fonction était appelée dans un WHERE sur une table vide, donc jamais exécutée (faux « 0 ») ;
--  - export : l'expression « contenu clinique » captait le libellé d'analyse « Sérodiagnostic ».
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '9' AND (scenario IN ('Import d''un relevé de 200 opérations', 'Réimport du même fichier (même empreinte)') OR scenario LIKE 'Export de sauvegarde de % et rapprochement%');
SELECT recette.essai('9','Import banque','A-compta','Import d''un relevé de 200 opérations','Relevé créé','ok',
  $$SELECT public.banque_importer(recette.eid('A'), recette.exo('A', 2026), '5211', 'releve-fevrier.csv', encode(sha256('recette-5'::bytea), 'hex'), 1500000, recette.fichier('import_banque_200'))::text$$, 'CPT-15', 'majeure');
DO $d$ DECLARE _n bigint; _s numeric; BEGIN
  SELECT count(*), sum(o.montant) INTO _n, _s FROM public.operations_bancaires o JOIN public.releves_bancaires r ON r.id = o.releve_id
   WHERE r.entreprise_id = recette.eid('A') AND r.nom_fichier = 'releve-fevrier.csv';
  PERFORM recette.noter('9','Import banque',NULL,'Relevé importé : 200 opérations, total conforme au fichier','200 opérations ; ' || (SELECT sum((x->>'montant')::numeric) FROM jsonb_array_elements(recette.fichier('import_banque_200')) x) || ' F',
    _n || ' opérations ; ' || coalesce(_s, 0) || ' F', _n = 200 AND _s = (SELECT sum((x->>'montant')::numeric) FROM jsonb_array_elements(recette.fichier('import_banque_200')) x), 'CPT-15', NULL, 'majeure');
END $d$;
SELECT recette.essai('9','Import banque','A-compta','Réimport du même fichier (même empreinte)','Refus (doublon)','refus',
  $$SELECT public.banque_importer(recette.eid('A'), recette.exo('A', 2026), '5211', 'releve-fevrier-bis.csv', encode(sha256('recette-5'::bytea), 'hex'), 1500000, recette.fichier('import_banque_200'))::text$$, 'CPT-15', 'critique');

CREATE OR REPLACE FUNCTION recette.export_controle(_s text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE _x jsonb; _ecarts text := ''; _k text; _n bigint; _sid uuid := recette.sid(_s); _clin text; BEGIN
  _x := public.sante_export_structure(_sid);
  PERFORM recette.sortir();  -- comptage en administrateur de la base : les séquences ne sont pas lisibles par l'utilisateur
  FOR _k IN SELECT key FROM jsonb_each(_x->'compteurs') LOOP
    CONTINUE WHEN _k IN ('membres','patient_assurances','sites','journal_exploitation');  -- le journal reçoit la trace de l'export lui-même
    IF _k = 'patients' THEN SELECT count(*) INTO _n FROM public.sante_patients WHERE structure_id = _sid;
    ELSIF to_regclass('public.sante_' || _k) IS NOT NULL THEN EXECUTE format('SELECT count(*) FROM public.%I WHERE structure_id = $1', 'sante_' || _k) INTO _n USING _sid;
    ELSE CONTINUE; END IF;
    IF _n <> (_x->'compteurs'->>_k)::bigint THEN _ecarts := _ecarts || _k || ' ' || (_x->'compteurs'->>_k) || '≠' || _n || ' '; END IF;
  END LOOP;
  SELECT string_agg(k, ',') INTO _clin FROM jsonb_object_keys(_x) k WHERE k ~ '^(consultations|diagnostics|resultats|ordonnances|documents|signatures|constantes|certificats)$';
  IF _ecarts <> '' OR _clin IS NOT NULL THEN RAISE EXCEPTION 'Export non conforme : écarts % ; rubriques cliniques %', nullif(_ecarts, ''), _clin; END IF;
  RETURN (SELECT count(*) FROM jsonb_object_keys(_x->'compteurs')) || ' rubriques ; ' || length(_x::text) / 1024 || ' Ko ; patients ' || (_x->'compteurs'->>'patients')
    || ' ; factures ' || (_x->'compteurs'->>'factures') || ' ; aucun écart ; aucune rubrique clinique';
END $f$;
SELECT recette.essai('9','Export','B-admin','Export de sauvegarde de B et rapprochement des compteurs avec la base','Compteurs = lignes en base, sans rubrique clinique','ok',
  $$SELECT recette.export_controle('B')$$, 'SAV-02', 'critique');
SELECT recette.essai('9','Export','A-admin','Export de sauvegarde de A et rapprochement des compteurs avec la base','Compteurs = lignes en base, sans rubrique clinique','ok',
  $$SELECT recette.export_controle('A')$$, 'SAV-02', 'critique');

INSERT INTO recette.anomalies (code, titre, module, criticite, reproduction, cause, correction, statut)
SELECT 'A-010', 'Règlement d''organisme importé : écriture de banque datée du jour de l''import, pas de la date du règlement', 'Tiers payant', 'mineure',
  'sante_importer_reglements avec une date de règlement J-3 : sante_reglements_organisme.date_reglement = J-3, mais l''événement comptable et l''écriture BQ sont datés du jour de l''import.',
  'sante_imputer_reglement comptabilise avec current_date ; la date du relevé n''est posée qu''après, par UPDATE de date_reglement.',
  'Passer la date du règlement à sante_imputer_reglement (paramètre optionnel, défaut current_date) et l''utiliser pour la comptabilisation ; rapprochement bancaire et clôture mensuelle en dépendent.', 'ouverte'
WHERE NOT EXISTS (SELECT 1 FROM recette.anomalies WHERE code = 'A-010');
UPDATE recette.resultats SET anomalie = 'A-010' WHERE phase = '9' AND scenario LIKE 'L''écriture de banque est datée%';
