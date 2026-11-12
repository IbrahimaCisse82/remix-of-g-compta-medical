-- Chargement du référentiel CIM-10 FR dans une base (test, puis production avec accord) depuis le fichier du dépôt.
-- Équivaut à plateforme_cim10_importer, sans session d'opérateur ; à exécuter par l'administrateur de la base.
-- 1. Remplacer <COMMIT> par le commit contenant scripts/referentiels/cim10-fr-2026.json :
--    select net.http_get('https://raw.githubusercontent.com/IbrahimaCisse82/remix-of-g-compta-medical/<COMMIT>/scripts/referentiels/cim10-fr-2026.json', timeout_milliseconds => 60000);
-- 2. Vérifier la réponse (<REQ> = identifiant renvoyé ; md5 attendu = md5sum du fichier) :
--    select status_code, md5(content) from net._http_response where id = <REQ>;
-- 3. Décomposer puis charger (en deux temps : la lecture du JSON entier dépasse sinon le délai d'exécution) :
set statement_timeout = '300s';
create table if not exists base_de_test.cim10_brut as
  select x from (select content::jsonb j from net._http_response where id = <REQ> and status_code = 200) f, jsonb_array_elements(f.j->'codes') x;
insert into public.sante_cim10(code, libelle, chapitre, recherche, version, actif, updated_at)
select public.sante_cim10_code(x->>'code'), x->>'libelle', x->>'chapitre',
       public.sante_texte_recherche(public.sante_cim10_code(x->>'code') || ' ' || replace(public.sante_cim10_code(x->>'code'), '.', '') || ' ' || (x->>'libelle')),
       'CIM-10 FR 2026 (BO 04/06/2026)', true, now()
from base_de_test.cim10_brut
on conflict (code) do update set libelle = excluded.libelle, chapitre = excluded.chapitre, recherche = excluded.recherche,
  version = excluded.version, actif = true, updated_at = now();
drop table base_de_test.cim10_brut;
-- 4. Contrôle : select version, count(*) from public.sante_cim10 group by 1;   -- attendu : 11 926 codes
-- (en production, remplacer le schéma base_de_test par un schéma temporaire, par exemple pg_temp)
