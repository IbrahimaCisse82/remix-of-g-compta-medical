-- Chargement du référentiel CIM-10 FR dans une base (test, puis production avec accord) depuis le fichier du dépôt.
-- Équivaut à plateforme_cim10_importer, sans session d'opérateur ; à exécuter par l'administrateur de la base.
-- 1. Remplacer <COMMIT> par le commit contenant scripts/referentiels/cim10-fr-2026.json, puis lancer :
--    select net.http_get('https://raw.githubusercontent.com/IbrahimaCisse82/remix-of-g-compta-medical/<COMMIT>/scripts/referentiels/cim10-fr-2026.json', timeout_milliseconds => 60000);
-- 2. Quelques secondes plus tard, avec l'identifiant renvoyé (<REQ>) :
with f as (select content::jsonb j from net._http_response where id = <REQ> and status_code = 200)
insert into public.sante_cim10(code, libelle, chapitre, recherche, version, actif, updated_at)
select public.sante_cim10_code(x->>'code'), x->>'libelle', x->>'chapitre',
       public.sante_texte_recherche(public.sante_cim10_code(x->>'code') || ' ' || replace(public.sante_cim10_code(x->>'code'), '.', '') || ' ' || (x->>'libelle')),
       f.j->>'version', true, now()
from f, jsonb_array_elements(f.j->'codes') x
on conflict (code) do update set libelle = excluded.libelle, chapitre = excluded.chapitre, recherche = excluded.recherche,
  version = excluded.version, actif = true, updated_at = now();
-- 3. Contrôle : select version, count(*) from public.sante_cim10 group by 1;
