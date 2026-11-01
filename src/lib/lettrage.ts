// Lettrage des comptes de tiers : règles pures, testées hors interface.
// Un lettrage ne rapproche que des lignes d'un même compte ET d'un même tiers (compte auxiliaire),
// jamais une ligne déjà lettrée, et chaque code n'est attribué qu'une fois dans l'exercice.

export interface LigneTiers { id: string; compte: string; compte_auxiliaire?: string | null; auxiliaire_libelle?: string | null; debit?: number; credit?: number }

export const cleTiers = (l: Pick<LigneTiers, 'compte' | 'compte_auxiliaire'>) => `${l.compte}|${l.compte_auxiliaire ?? ''}`;
const cents = (n: number) => Math.round((n || 0) * 100);

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
  if (new Set(lignes.map(cleTiers)).size > 1) return 'Les lignes doivent porter sur le même compte et le même tiers.';
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
