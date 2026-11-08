-- Reconstruction de la base de TEST sans secret GitHub ni accès psql : la base télécharge elle-même les migrations
-- depuis GitHub (dépôt public, extension pg_net) et les applique dans l'ordre de la production.
-- À exécuter dans l'éditeur SQL du projet Supabase de TEST, étape par étape. JAMAIS sur la production.
-- Utilisé le 08/11/2026 pour monter « G-Santé test » (lduxaknsqzxymbpbolxi) : 148 migrations, structure identique
-- à la production (scripts/db-test/empreinte.sql).

-- 1. Outillage
create extension if not exists pg_net;
create schema if not exists base_de_test;
create table if not exists base_de_test.journal (fichier text primary key, applique_le timestamptz not null default now());
create table if not exists base_de_test.sources (ordre int primary key, fichier text unique not null, requete bigint, sql text, erreur text);
revoke all on schema base_de_test from public, anon, authenticated;

create or replace function base_de_test.appliquer(_max int default 10)
returns table(fichier text, resultat text) language plpgsql set search_path = public, extensions as $$
declare s record; n int := 0;
begin
  for s in select src.ordre, src.fichier, src.sql from base_de_test.sources src
            where not exists (select 1 from base_de_test.journal j where j.fichier = src.fichier) order by src.ordre loop
    exit when n >= _max;
    begin
      execute s.sql;
      insert into base_de_test.journal(fichier) values (s.fichier);
      fichier := s.fichier; resultat := 'ok'; return next;
    exception when others then
      update base_de_test.sources set erreur = sqlerrm where ordre = s.ordre;
      fichier := s.fichier; resultat := 'ERREUR : ' || sqlerrm; return next; return;
    end;
    n := n + 1;
  end loop;
end $$;

-- 2. Liste des fichiers dans l'ordre de production (à générer depuis le dépôt) :
--      ls db/baseline-lovable/*.sql | sort
--      puis drizzle/migrations/<tag>.sql dans l'ordre de meta/_journal.json,
--      avec db/restaurees-2026-10-22/<ORDRE> insérés après 0048_sante_onboarding_atomic.
--    Pour chaque fichier (ordre n, chemin f, commit c) :
--      insert into base_de_test.sources(ordre, fichier, requete) values (n, f,
--        net.http_get('https://raw.githubusercontent.com/IbrahimaCisse82/remix-of-g-compta-medical/' || c || '/' || f,
--                     timeout_milliseconds => 30000));

-- 3. Récupérer le contenu (quelques secondes après l'étape 2)
update base_de_test.sources s set sql = r.content
  from net._http_response r where r.id = s.requete and r.status_code = 200 and s.sql is null;
select count(*) filter (where sql is null) as manquants from base_de_test.sources;

-- 4. Appliquer par lots jusqu'à la fin (s'arrête et montre l'erreur au premier échec)
select * from base_de_test.appliquer(50);

-- 5. Comparer : exécuter scripts/db-test/empreinte.sql ici et sur la production.
