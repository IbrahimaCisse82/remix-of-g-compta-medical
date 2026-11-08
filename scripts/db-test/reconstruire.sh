#!/usr/bin/env bash
# Reconstruit la structure de G-Santé dans une base de TEST vide :
#   1. migrations Lovable d'origine (db/baseline-lovable, mars → septembre 2026) ;
#   2. migrations du dépôt (drizzle/migrations, dans l'ordre de meta/_journal.json) ;
#   3. compare l'empreinte obtenue à celle de la production (scripts/db-test/empreinte-production.json).
# Chaque fichier passe dans sa propre transaction ; les fichiers appliqués sont notés dans base_de_test.journal,
# donc une relance reprend après le dernier fichier réussi.
#
# Usage : TEST_DATABASE_URL='postgresql://…' scripts/db-test/reconstruire.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

URL="${TEST_DATABASE_URL:-}"
[ -n "$URL" ] || { echo "TEST_DATABASE_URL manquant." >&2; exit 2; }
# Productions : Lovable Cloud (otyqiiumbdgaxvkcqpht) et Supabase « G-Santé production » (azusqndpbstvzzohlkba).
case "$URL" in *otyqiiumbdgaxvkcqpht*|*azusqndpbstvzzohlkba*) echo "REFUS : TEST_DATABASE_URL vise une base de PRODUCTION." >&2; exit 3;; esac

PSQL=(psql "$URL" -v ON_ERROR_STOP=1 -X -q -t -A)

# Garde-fou : soit la base est vierge (aucune table dans public), soit c'est déjà une base de test (journal présent).
journal=$("${PSQL[@]}" -c "select to_regclass('base_de_test.journal') is not null")
if [ "$journal" != "t" ]; then
  tables=$("${PSQL[@]}" -c "select count(*) from pg_tables where schemaname = 'public'")
  if [ "$tables" != "0" ]; then
    echo "REFUS : la base contient déjà $tables table(s) dans public et n'est pas une base de test connue." >&2
    exit 4
  fi
  "${PSQL[@]}" -c "create schema base_de_test; create table base_de_test.journal (fichier text primary key, applique_le timestamptz not null default now());
    comment on schema base_de_test is 'Base de TEST G-Santé : ne jamais y mettre de données réelles.'"
fi

fichiers=()
while IFS= read -r f; do fichiers+=("$f"); done < <(ls db/baseline-lovable/*.sql | sort)
# Migrations du dépôt dans l'ordre de l'index ; les 6 migrations restaurées du 22/10/2026 (db/restaurees-2026-10-22)
# s'insèrent après 0048_sante_onboarding_atomic, comme en production.
while IFS= read -r t; do
  fichiers+=("drizzle/migrations/$t.sql")
  if [ "$t" = "0048_sante_onboarding_atomic" ]; then
    while IFS= read -r r; do [ -n "$r" ] && fichiers+=("db/restaurees-2026-10-22/$r.sql"); done < db/restaurees-2026-10-22/ORDRE
  fi
done < <(node -e "for (const e of require('./drizzle/migrations/meta/_journal.json').entries.sort((a,b)=>a.idx-b.idx)) console.log(e.tag)")

appliques=0; ignores=0
for f in "${fichiers[@]}"; do
  [ -f "$f" ] || { echo "Fichier absent : $f" >&2; exit 5; }
  deja=$("${PSQL[@]}" -c "select count(*) from base_de_test.journal where fichier = '$f'")
  if [ "$deja" = "1" ]; then ignores=$((ignores+1)); continue; fi
  echo "→ $f"
  if ! psql "$URL" -v ON_ERROR_STOP=1 -X -q --single-transaction -f "$f" > /dev/null; then
    echo "ÉCHEC sur $f : corriger puis relancer (les fichiers déjà appliqués sont conservés)." >&2
    exit 6
  fi
  "${PSQL[@]}" -c "insert into base_de_test.journal(fichier) values ('$f')"
  appliques=$((appliques+1))
done
echo "Migrations : $appliques appliquée(s), $ignores déjà présente(s)."

echo "Comparaison avec la production :"
"${PSQL[@]}" -F $'\t' -f scripts/db-test/empreinte.sql > /tmp/empreinte-test.tsv
node -e "
const ref = require('./scripts/db-test/empreinte-production.json').categories;
const lignes = require('fs').readFileSync('/tmp/empreinte-test.tsv', 'utf8').trim().split('\n').map(l => l.split('\t'));
const test = Object.fromEntries(lignes.map(([c, n, e]) => [c, { nombre: +n, empreinte: e }]));
let ecarts = 0;
for (const c of Object.keys({ ...ref, ...test }).sort()) {
  const r = ref[c] ?? { nombre: 0 }, t = test[c] ?? { nombre: 0 };
  const ok = r.empreinte === t.empreinte;
  if (!ok) ecarts++;
  console.log((ok ? '  identique ' : '  ÉCART     ') + c.padEnd(20) + ' production ' + String(r.nombre).padStart(5) + '  test ' + String(t.nombre).padStart(5));
}
console.log(ecarts ? ecarts + ' catégorie(s) en écart : lancer scripts/db-test/empreinte-detail.sql sur les deux bases et comparer.' : 'Structure identique à la production.');
"
