// Règles de Westgard — logique pure, miroir de sante_saisir_cq côté base.
export type StatutCQ = 'accepte' | 'alerte' | 'rejete';

export const zScore = (valeur: number, cible: number, ecartType: number) => (valeur - cible) / ecartType;

export function evaluerWestgard(z: number, zPrecedent: number | null): { statut: StatutCQ; regles: string[] } {
  const regles: string[] = [];
  if (Math.abs(z) > 3) regles.push('1-3s');
  if (zPrecedent !== null && ((z > 2 && zPrecedent > 2) || (z < -2 && zPrecedent < -2))) regles.push('2-2s');
  if (zPrecedent !== null && Math.abs(z - zPrecedent) > 4 && Math.sign(z) !== Math.sign(zPrecedent)) regles.push('R-4s');
  if (regles.length) return { statut: 'rejete', regles };
  if (Math.abs(z) > 2) return { statut: 'alerte', regles: ['1-2s'] };
  return { statut: 'accepte', regles: [] };
}

/** Alertes de stock des réactifs : seuil, péremption proche (≤ 30 j) ou dépassée. */
export function alertesReactif(lots: { quantite_restante: number; peremption: string }[], seuil: number, aujourdHui = new Date()): string[] {
  const out: string[] = [];
  const valides = lots.filter(l => new Date(l.peremption + 'T23:59:59') >= aujourdHui);
  const stock = valides.reduce((s, l) => s + Number(l.quantite_restante), 0);
  if (stock <= seuil) out.push('Stock sous le seuil');
  if (lots.some(l => Number(l.quantite_restante) > 0 && new Date(l.peremption + 'T23:59:59') < aujourdHui)) out.push('Lot périmé en stock');
  const limite = new Date(aujourdHui.getTime() + 30 * 86_400_000);
  if (valides.some(l => Number(l.quantite_restante) > 0 && new Date(l.peremption) <= limite)) out.push('Péremption < 30 jours');
  return out;
}
