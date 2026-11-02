/**
 * Réalisé budgétaire : un budget porte sur un compte ou une racine (601 couvre 6011, 6012…) ; les charges (6) se
 * lisent au débit, les produits (7) au crédit, pour être comparées à des budgets saisis en positif.
 */
export function realiseParMois(compteBudget: string, lignes: Array<{ compte: string; date_ecriture: string; debit?: number; credit?: number }>): number[] {
  const mois = Array(12).fill(0) as number[];
  const racine = compteBudget.trim();
  if (!racine) return mois;
  const produit = racine.startsWith('7');
  for (const l of lignes) {
    if (!l.compte.startsWith(racine)) continue;
    const m = Number(l.date_ecriture.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    const net = (l.debit || 0) - (l.credit || 0);
    mois[m] += produit ? -net : net;
  }
  return mois.map(v => Math.round(v * 100) / 100);
}
