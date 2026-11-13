-- Phase 11 : balayage des droits de lecture (anonyme, compte sans structure, administrateur d'une autre structure),
-- vérification publique des comptes rendus, et anomalie A-011 (tableau de bord). TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
DELETE FROM recette.resultats WHERE phase = '11';

-- Lignes visibles, table par table, pour un profil : 'anon' (sans jeton) ou une clé de compte de recette.
-- _hors : ne compter que les lignes des structures/dossiers qui ne sont pas ceux du profil (tables portant structure_id ou entreprise_id).
CREATE OR REPLACE FUNCTION recette.balayage(_qui text, _hors text DEFAULT NULL) RETURNS TABLE(tbl text, n bigint, err text) LANGUAGE plpgsql AS $f$
DECLARE t record; _sql text; _sid uuid := recette.sid(_hors); _eid uuid := recette.eid(_hors); _claims text; _role text;
BEGIN
  IF _qui = 'anon' THEN _claims := '{"role":"anon"}'; _role := 'anon';
  ELSE _claims := json_build_object('sub', recette.uid(_qui), 'role', 'authenticated', 'aal', 'aal2')::text; _role := 'authenticated'; END IF;
  FOR t IN SELECT c.relname,
                  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'structure_id' AND NOT a.attisdropped) has_s,
                  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'entreprise_id' AND NOT a.attisdropped) has_e
             FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') ORDER BY c.relname LOOP
    IF _hors IS NOT NULL THEN
      IF t.has_s THEN _sql := format('SELECT count(*) FROM public.%I WHERE structure_id IS DISTINCT FROM %L AND structure_id IN (SELECT structure_id FROM recette.structures)', t.relname, _sid);
      ELSIF t.has_e THEN _sql := format('SELECT count(*) FROM public.%I WHERE entreprise_id IS DISTINCT FROM %L AND entreprise_id IN (SELECT entreprise_id FROM recette.structures)', t.relname, _eid);
      ELSE CONTINUE; END IF;
    ELSE _sql := format('SELECT count(*) FROM public.%I', t.relname); END IF;
    tbl := t.relname; n := NULL; err := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims', _claims, true);
      PERFORM set_config('role', _role, true);
      EXECUTE _sql INTO n;
      PERFORM set_config('role', 'postgres', true);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('role', 'postgres', true);
      err := left(SQLERRM, 120);
    END;
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN NEXT;
  END LOOP;
END $f$;
GRANT USAGE ON SCHEMA recette TO anon;
GRANT SELECT ON recette.structures TO anon, authenticated;

-- Tables de référence publiques par conception (lecture ouverte attendue) : exclues du constat, listées dans le rapport.
CREATE OR REPLACE FUNCTION recette.references_publiques() RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$
  SELECT ARRAY['syscohada_references','sante_cim10','sante_specialites','plans_abonnement','echeances_modeles','plateforme_comptes_communs','sante_repertoire_organismes','tva_parametrage']
$f$;

DO $d$ DECLARE _l text; _n bigint; _e text; BEGIN
  SELECT string_agg(tbl || ' (' || n || ')', ', ' ORDER BY tbl), count(*) INTO _l, _n FROM recette.balayage('anon') WHERE n > 0 AND NOT tbl = ANY(recette.references_publiques());
  SELECT string_agg(DISTINCT err, ' ; ') INTO _e FROM recette.balayage('anon') WHERE err IS NOT NULL AND err NOT LIKE 'permission denied%';
  PERFORM recette.noter('11','Sécurité','anon','Visiteur anonyme : aucune ligne lisible hors référentiels publics, sur toutes les tables','0 table', coalesce(_n, 0) || ' table(s)' || coalesce(' : ' || _l, '') || coalesce(' ; erreurs : ' || _e, ''), coalesce(_n, 0) = 0, 'SEC-01', NULL, 'critique');
  SELECT string_agg(tbl || ' (' || n || ')', ', ' ORDER BY tbl), count(*) INTO _l, _n FROM recette.balayage('X-externe') WHERE n > 0 AND NOT tbl = ANY(recette.references_publiques());
  PERFORM recette.noter('11','Sécurité','X-externe','Compte connecté sans structure : aucune ligne lisible hors référentiels publics','0 table', coalesce(_n, 0) || ' table(s)' || coalesce(' : ' || _l, ''), coalesce(_n, 0) = 0, 'SEC-02', NULL, 'critique');
  SELECT string_agg(tbl || ' (' || n || ')', ', ' ORDER BY tbl), count(*) INTO _l, _n FROM recette.balayage('A-admin', 'A') WHERE n > 0;
  PERFORM recette.noter('11','Sécurité','A-admin','Administrateur de A : aucune ligne des structures B et C lisible, sur toutes les tables','0 table', coalesce(_n, 0) || ' table(s)' || coalesce(' : ' || _l, ''), coalesce(_n, 0) = 0, 'SEC-02', NULL, 'critique');
  SELECT string_agg(tbl || ' (' || n || ')', ', ' ORDER BY tbl), count(*) INTO _l, _n FROM recette.balayage('B-bio-1', 'B') WHERE n > 0;
  PERFORM recette.noter('11','Sécurité','B-bio-1','Biologiste de B : aucune ligne des structures A et C lisible','0 table', coalesce(_n, 0) || ' table(s)' || coalesce(' : ' || _l, ''), coalesce(_n, 0) = 0, 'SEC-02', NULL, 'critique');
  SELECT string_agg(tbl || ' (' || n || ')', ', ' ORDER BY tbl), count(*) INTO _l, _n FROM recette.balayage('C-compta', 'C') WHERE n > 0;
  PERFORM recette.noter('11','Sécurité','C-compta','Comptable de C : aucune ligne des dossiers A et B lisible','0 table', coalesce(_n, 0) || ' table(s)' || coalesce(' : ' || _l, ''), coalesce(_n, 0) = 0, 'SEC-02', NULL, 'critique');
END $d$;

-- Écriture anonyme : quelques insertions représentatives.
CREATE OR REPLACE FUNCTION recette.anon_sql(_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE _v text; BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
    EXECUTE _sql INTO _v;
    PERFORM set_config('role', 'postgres', true);
    RAISE EXCEPTION 'RECETTE_ANNULER' USING DETAIL = coalesce(_v, '∅');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role', 'postgres', true);
    IF SQLERRM = 'RECETTE_ANNULER' THEN GET STACKED DIAGNOSTICS _v = PG_EXCEPTION_DETAIL; RETURN 'ACCEPTÉ ' || _v; END IF;
    RETURN 'REFUSÉ ' || left(SQLERRM, 150);
  END;
END $f$;
DO $d$ DECLARE _r text; _q text; _lib text; BEGIN
  FOR _lib, _q IN VALUES
    ('Création anonyme d''un patient', format('INSERT INTO public.sante_patients (structure_id, nom, prenoms, sexe) VALUES (%L, ''ANONYME'', ''TEST'', ''M'') RETURNING id::text', recette.sid('A'))),
    ('Création anonyme d''une facture', format('INSERT INTO public.sante_factures (structure_id, numero, total) VALUES (%L, ''X-ANON'', 1000) RETURNING id::text', recette.sid('A'))),
    ('Appel anonyme d''une fonction métier (encaissement)', 'SELECT public.sante_consultations_a_facturer(NULL)::text'),
    ('Lecture anonyme des comptes rendus par une fonction', format('SELECT public.sante_export_structure(%L)::text', recette.sid('A')))
  LOOP
    _r := recette.anon_sql(_q);
    PERFORM recette.noter('11','Sécurité','anon', _lib, 'Refus', _r, _r LIKE 'REFUSÉ%', 'SEC-01', NULL, 'critique');
  END LOOP;
END $d$;

-- Vérification publique d'un compte rendu : un jeton inconnu ne renvoie rien d'autre que « non authentique ».
DO $d$ DECLARE _r text; BEGIN
  _r := recette.anon_sql($$SELECT public.sante_verifier_cr('jeton-inexistant-recette')::text$$);
  PERFORM recette.noter('11','Sécurité','anon','Vérification publique d''un compte rendu avec un jeton inconnu','{"authentique": false}', _r, _r = 'ACCEPTÉ {"authentique": false}', 'LAB-09', NULL, 'majeure');
END $d$;

INSERT INTO recette.anomalies (code, titre, module, criticite, reproduction, cause, correction, statut)
SELECT 'A-011', 'Tableau de bord : le palmarès des actes renvoie 30 libellés quelconques, pas les 30 premiers par montant', 'Tableau de bord', 'mineure',
  'sante_tableau_bord(B, 2026-01-01, 2026-12-31) : 30 libellés renvoyés, dont certains absents des 30 plus forts montants de la période (B compte plus de 30 analyses facturées).',
  'Dans ca_actes, LIMIT 30 est appliqué au GROUP BY sans ORDER BY ; le tri n''intervient qu''ensuite, dans jsonb_agg.',
  'Ajouter ORDER BY sum(montant) DESC avant LIMIT 30 dans la sous-requête (migration additive : CREATE OR REPLACE de la fonction).', 'ouverte'
WHERE NOT EXISTS (SELECT 1 FROM recette.anomalies WHERE code = 'A-011');
UPDATE recette.resultats SET anomalie = 'A-011' WHERE phase = '10' AND scenario LIKE '%palmarès des actes%' AND statut = 'echoue';
