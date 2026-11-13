-- Recette G-Santé ERP — harnais d'exécution. ENVIRONNEMENT TEST UNIQUEMENT (projet Lovable « G-Santé ERP — TEST »).
-- Chaque test s'exécute « en tant que » un compte fictif : mêmes réglages que l'API (rôle authenticated + jeton JWT),
-- donc mêmes règles d'accès (RLS) et mêmes contrôles des fonctions métier que l'application.
-- Les comptes n'ont aucun mot de passe connu (mot de passe aléatoire haché, jamais affiché).

DO $g$ BEGIN
  IF current_setting('app.recette_test', true) IS DISTINCT FROM 'oui'
     AND (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN
    RAISE EXCEPTION 'Refus : cette base contient des comptes qui ne sont pas des comptes de recette (production ?)';
  END IF;
END $g$;

CREATE SCHEMA IF NOT EXISTS recette;
COMMENT ON SCHEMA recette IS 'Recette G-Santé — base de TEST : données 100 % fictives, assainissables par recette.assainir()';

CREATE TABLE IF NOT EXISTS recette.comptes (
  cle text PRIMARY KEY,            -- ex. A-medecin-1
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  nom text NOT NULL,
  structure text,                  -- A, B, C ou NULL (plateforme / patient)
  roles text[] NOT NULL DEFAULT '{}',
  mfa boolean NOT NULL DEFAULT false,
  statut text NOT NULL DEFAULT 'actif',
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recette.structures (
  cle text PRIMARY KEY, structure_id uuid NOT NULL UNIQUE, entreprise_id uuid, nom text NOT NULL, type text NOT NULL
);
CREATE TABLE IF NOT EXISTS recette.resultats (
  id bigserial PRIMARY KEY,
  phase text NOT NULL, module text NOT NULL, profil text, scenario text NOT NULL,
  attendu text NOT NULL, obtenu text, statut text NOT NULL CHECK (statut IN ('reussi','echoue','bloque','non_teste')),
  exigence text, anomalie text, criticite text CHECK (criticite IN ('critique','majeure','mineure','amelioration')),
  duree_ms numeric, fait_le timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS recette.anomalies (
  code text PRIMARY KEY, titre text NOT NULL, module text NOT NULL, criticite text NOT NULL,
  reproduction text, cause text, correction text, statut text NOT NULL DEFAULT 'ouverte', pr text, cree_le timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recette.ids (cle text PRIMARY KEY, id uuid NOT NULL);  -- objets de référence créés

-- Compte fictif (sans mot de passe utilisable). Idempotent.
CREATE OR REPLACE FUNCTION recette.creer_compte(_cle text, _nom text, _structure text DEFAULT NULL, _mfa boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE _id uuid; _email text := lower(_cle) || '@recette.test';
BEGIN
  SELECT user_id INTO _id FROM recette.comptes WHERE cle = _cle;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  _id := gen_random_uuid();
  INSERT INTO auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                         raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', _id, 'authenticated', 'authenticated', _email,
          extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', _nom), now(), now());
  INSERT INTO auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), _id, _id::text, jsonb_build_object('sub', _id::text, 'email', _email, 'email_verified', true),
          'email', now(), now(), now());
  IF _mfa THEN
    INSERT INTO auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
    VALUES (gen_random_uuid(), _id, 'recette', 'totp', 'verified', now(), now(), encode(extensions.gen_random_bytes(20), 'hex'));
  END IF;
  INSERT INTO recette.comptes(cle, user_id, email, nom, structure, mfa) VALUES (_cle, _id, _email, _nom, _structure, _mfa);
  RETURN _id;
END $f$;

-- Agir en tant que : comme l'API (rôle authenticated + jeton). _aal = 'aal2' simule une session en double authentification.
CREATE OR REPLACE FUNCTION recette.agir(_cle text, _aal text DEFAULT 'aal2') RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE _id uuid;
BEGIN
  SELECT user_id INTO _id FROM recette.comptes WHERE cle = _cle;
  IF _id IS NULL THEN RAISE EXCEPTION 'Compte de recette inconnu : %', _cle; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _id, 'role', 'authenticated', 'aal', _aal,
                     'email', (SELECT email FROM recette.comptes WHERE cle = _cle))::text, true);
  PERFORM set_config('role', 'authenticated', true);
  RETURN _id;
END $f$;
GRANT USAGE ON SCHEMA recette TO authenticated;
GRANT EXECUTE ON FUNCTION recette.agir(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION recette.sortir() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $f$;
GRANT EXECUTE ON FUNCTION recette.sortir() TO authenticated;

-- Consigner un résultat (toujours en tant qu'administrateur de la base).
CREATE OR REPLACE FUNCTION recette.noter(_phase text, _module text, _profil text, _scenario text, _attendu text, _obtenu text,
  _ok boolean, _exigence text DEFAULT NULL, _anomalie text DEFAULT NULL, _criticite text DEFAULT NULL, _duree numeric DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = recette, public AS $f$
  INSERT INTO recette.resultats(phase, module, profil, scenario, attendu, obtenu, statut, exigence, anomalie, criticite, duree_ms)
  VALUES (_phase, _module, _profil, _scenario, _attendu, left(_obtenu, 500), CASE WHEN _ok THEN 'reussi' ELSE 'echoue' END,
          _exigence, _anomalie, CASE WHEN _ok THEN NULL ELSE _criticite END, _duree);
$f$;
GRANT EXECUTE ON FUNCTION recette.noter(text, text, text, text, text, text, boolean, text, text, text, numeric) TO authenticated;
GRANT USAGE ON SCHEMA recette TO authenticated;
GRANT SELECT ON recette.comptes, recette.structures, recette.ids TO authenticated;

-- Exécuter un essai en tant que _cle et le consigner.
-- _mode : 'ok' (doit réussir ; ses effets sont conservés), 'refus' (doit être refusé par la base),
--         'vide' (refusé ou ne renvoie rien : 0, vide, null), 'egal:<valeur>' (doit renvoyer exactement cette valeur).
-- En mode refus / vide, l'essai est toujours annulé, même s'il passe à tort : aucune donnée parasite.
CREATE OR REPLACE FUNCTION recette.essai(_phase text, _module text, _cle text, _scenario text, _attendu text,
  _mode text, _sql text, _exigence text DEFAULT NULL, _criticite text DEFAULT 'majeure') RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE _v text; _err text; _etat text; _ok boolean; _t0 timestamptz := clock_timestamp(); _annuler boolean := _mode IN ('refus', 'vide');
BEGIN
  BEGIN
    PERFORM recette.agir(_cle);
    EXECUTE _sql INTO _v;
    -- Les contrôles différés (équilibre, lettrage, comptabilisation) s'exécutent normalement au COMMIT, sous l'identité de
    -- l'appelant : on les déclenche ici, sinon un essai annulé ne les verrait jamais.
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    IF _annuler THEN RAISE EXCEPTION 'RECETTE_ANNULER' USING DETAIL = coalesce(_v, '∅'); END IF;
    PERFORM recette.sortir();
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'RECETTE_ANNULER' THEN
      GET STACKED DIAGNOSTICS _v = PG_EXCEPTION_DETAIL; IF _v = '∅' THEN _v := NULL; END IF;
    ELSE _err := SQLERRM; _etat := SQLSTATE; END IF;
  END;
  _ok := CASE
    WHEN _mode = 'ok' THEN _err IS NULL
    WHEN _mode = 'refus' THEN _err IS NOT NULL
    WHEN _mode = 'vide' THEN _err IS NOT NULL OR coalesce(_v, '') IN ('', '0', '[]', '{}', 'f', 'false')
    WHEN _mode LIKE 'egal:%' THEN _err IS NULL AND _v IS NOT DISTINCT FROM substr(_mode, 6)
    ELSE false END;
  -- Une erreur de rédaction du test (objet inconnu, syntaxe) n'est jamais comptée comme un refus réussi : test « bloqué ».
  IF _etat IS NOT NULL AND _etat LIKE '42%' AND _etat <> '42501' THEN
    INSERT INTO recette.resultats(phase, module, profil, scenario, attendu, obtenu, statut, exigence, duree_ms)
    VALUES (_phase, _module, _cle, _scenario, _attendu, 'Test à corriger (' || _etat || ') : ' || left(_err, 400), 'bloque', _exigence, 0);
    RETURN 'BLOQUÉ ' || _err;
  END IF;
  PERFORM recette.noter(_phase, _module, _cle, _scenario, _attendu,
    CASE WHEN _err IS NOT NULL THEN 'Refusé : ' || _err ELSE 'Accepté' || coalesce(' → ' || _v, '') END,
    _ok, _exigence, NULL, _criticite, round(extract(epoch FROM clock_timestamp() - _t0) * 1000));
  RETURN CASE WHEN _ok THEN 'OK ' ELSE 'ÉCHEC ' END || coalesce(_err, _v, '');
END $f$;

-- Assainissement : supprime tout ce qui a été créé pour la recette (comptes @recette.test et leurs structures).
-- À n'exécuter que sur la base de TEST, avec accord.
CREATE OR REPLACE FUNCTION recette.inventaire() RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'comptes', (SELECT count(*) FROM auth.users WHERE email LIKE '%@recette.test'),
    'structures', (SELECT count(*) FROM public.structures s JOIN recette.structures r ON r.structure_id = s.id),
    'resultats', (SELECT count(*) FROM recette.resultats));
$f$;
