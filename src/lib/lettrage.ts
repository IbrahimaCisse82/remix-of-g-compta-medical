// Lettrage des comptes de tiers : règles pures, testées hors interface.
// Un lettrage ne rapproche que des lignes d'un même compte et jamais de deux tiers différents : une ligne sans compte
// auxiliaire (à-nouveau, ancienne saisie) peut rejoindre celles d'un tiers. Jamais une ligne déjà lettrée ; chaque code
// n'est attribué qu'une fois dans l'exercice (mêmes règles que le contrôle serveur lettrage_controle).

export interface LigneTiers { id: string; compte: string; compte_auxiliaire?: string | null; auxiliaire_libelle?: string | null; debit?: number; credit?: number; piece?: string | null; libelle?: string | null }

export const cleTiers = (l: Pick<LigneTiers, 'compte' | 'compte_auxiliaire'>) => `${l.compte}|${l.compte_auxiliaire ?? ''}`;
const cents = (n: number) => Math.round((n || 0) * 100);

/** Même compte, et au plus un compte auxiliaire parmi les lignes qui en portent un. */
export function compatibles(lignes: Pick<LigneTiers, 'compte' | 'compte_auxiliaire'>[]): boolean {
  return new Set(lignes.map(l => l.compte)).size <= 1 && new Set(lignes.map(l => l.compte_auxiliaire).filter(Boolean)).size <= 1;
}

/** Code suivant pour un préfixe (L manuel, A automatique), d'après les codes existants. */
export function prochainCode(existants: Iterable<string>, prefixe: string, deja = new Set<string>()): string {
  let max = 0;
  for (const c of [...existants, ...deja]) {
    const m = new RegExp(`^${prefixe}(\\d+)$`).exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefixe}${String(max + 1).padStart(4, '0')}`;
}

/** Contrôle d'une sélection manuelle ; renvoie le motif du refus ou null. */
export function controlerSelection(lignes: LigneTiers[], lettrees: Set<string>): string | null {
  if (lignes.length < 2) return 'Sélectionnez au moins deux lignes.';
  if (lignes.some(l => lettrees.has(l.id))) return 'Une ligne sélectionnée est déjà lettrée.';
  if (!compatibles(lignes)) return 'Les lignes doivent porter sur le même compte et le même tiers.';
  const solde = lignes.reduce((s, l) => s + cents(l.debit ?? 0) - cents(l.credit ?? 0), 0);
  if (solde !== 0) return 'La sélection n’est pas soldée.';
  return null;
}

/** Paires débit/crédit de même montant, à l'intérieur d'un même compte et d'un même tiers. */
export function pairesAutomatiques(lignes: LigneTiers[], lettrees: Set<string>): [LigneTiers, LigneTiers][] {
  const groupes = new Map<string, LigneTiers[]>();
  for (const l of lignes) {
    if (lettrees.has(l.id)) continue;
    const k = cleTiers(l);
    groupes.set(k, [...(groupes.get(k) ?? []), l]);
  }
  const paires: [LigneTiers, LigneTiers][] = [];
  for (const g of groupes.values()) {
    const credits = g.filter(l => (l.credit ?? 0) > 0);
    const pris = new Set<string>();
    for (const d of g.filter(l => (l.debit ?? 0) > 0)) {
      const c = credits.find(x => !pris.has(x.id) && cents(x.credit ?? 0) === cents(d.debit ?? 0));
      if (c) { pris.add(c.id); paires.push([d, c]); }
    }
  }
  return paires;
}

/** Pièce d'origine d'une ligne ; pour un à-nouveau détaillé (« A-nouveau 2025 — FA-001 — … »), la pièce reportée. */
export const pieceOrigine = (l: Pick<LigneTiers, 'piece' | 'libelle'>) => (/^A-nouveau \d{4} — (.+?) — /.exec(l.libelle ?? '')?.[1] ?? l.piece ?? '').trim();
const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lettrage par pièce (anciens paiements, à-nouveaux) : pour chaque pièce d'origine, regroupe les lignes non lettrées du même
 * compte qui portent cette pièce, « REG-<pièce> », ou la citent dans leur libellé (« Règlement FA-001 », « A-nouveau 2025 — FA-001 — … »).
 * Ne propose que des groupes soldés, compatibles (un seul tiers) et sans ligne commune à deux groupes.
 */
export function propositionsParPiece(lignes: LigneTiers[], lettrees: Set<string>): LigneTiers[][] {
  const libres = lignes.filter(l => !lettrees.has(l.id) && cents((l.debit ?? 0) - (l.credit ?? 0)) !== 0);
  const pris = new Set<string>();
  const groupes: LigneTiers[][] = [];
  const pieces = [...new Set(libres.map(pieceOrigine).filter(p => p.length >= 3 && !/^(AN-|REPRISE)/.test(p)))];
  for (const p of pieces) {
    const cite = new RegExp(`(^|[\\s—:(-])${echapper(p)}($|[\\s—:),])`);
    const parCompte = new Map<string, LigneTiers[]>();
    for (const l of libres) {
      if (pris.has(l.id)) continue;
      const piece = pieceOrigine(l);
      if (piece === p || piece === `REG-${p}` || cite.test(l.libelle ?? '')) parCompte.set(l.compte, [...(parCompte.get(l.compte) ?? []), l]);
    }
    for (const g of parCompte.values()) {
      if (g.length < 2 || !compatibles(g)) continue;
      if (g.reduce((s, l) => s + cents(l.debit ?? 0) - cents(l.credit ?? 0), 0) !== 0) continue;
      g.forEach(l => pris.add(l.id));
      groupes.push(g);
    }
  }
  return groupes;
}
