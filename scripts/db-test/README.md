# Base de test G-Santé

La production (Lovable Cloud, projet `otyqiiumbdgaxvkcqpht`) ne sert **jamais** aux tests.
Les tests de la base (`tests/db`) créent, modifient et suppriment des données avec la clé de service :
ils tournent sur un projet Supabase de test séparé, dans l'organisation G-Santé.
`tests/db/garde-production.ts` refuse toute exécution contre la production.

## Reconstruire la structure

La structure se reconstruit à partir du dépôt :

1. `db/baseline-lovable/` — les 31 migrations Lovable d'origine (mars → septembre 2026), retirées du dépôt lors
   du remix du 2 octobre et restaurées ici. Elles ne sont **pas** dans `supabase/migrations` pour que Lovable ne
   les rejoue jamais sur la production.
2. `drizzle/migrations/` — les migrations du dépôt, dans l'ordre de `meta/_journal.json`.

```bash
TEST_DATABASE_URL='postgresql://postgres:…@db.<ref-test>.supabase.co:5432/postgres' scripts/db-test/reconstruire.sh
```

Le script refuse la production et toute base non vierge qui n'est pas déjà une base de test (schéma `base_de_test`).
Il reprend après le dernier fichier réussi et compare enfin la structure à `empreinte-production.json`.

Depuis GitHub : onglet **Actions › Base de test (reconstruction) › Run workflow**.

## Secrets GitHub (Settings › Secrets and variables › Actions)

| Secret | Où le trouver (projet Supabase de TEST) |
| --- | --- |
| `TEST_DATABASE_URL` | Project Settings › Database › Connection string (URI, mot de passe inclus) |
| `TEST_SUPABASE_URL` | Project Settings › API › Project URL |
| `TEST_SUPABASE_PUBLISHABLE_KEY` | Project Settings › API › clé `anon` / publishable |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | Project Settings › API › clé `service_role` |

Tant qu'ils ne sont pas renseignés, le contrôle « Securite base (P0) » affiche un avertissement
« Tests de sécurité NON exécutés » au lieu de passer en silence.

## Vérifier qu'il n'y a pas de dérive

`empreinte.sql` résume la structure (une ligne par catégorie). Lancé sur la production et sur la base de test,
il doit donner les mêmes empreintes. En cas d'écart, `empreinte-detail.sql` liste chaque objet avec son md5.
Après chaque nouvelle migration appliquée en production, relever l'empreinte et mettre à jour
`empreinte-production.json`.
