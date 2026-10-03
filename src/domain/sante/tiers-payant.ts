// Ventilation part patient / part organisme — miroir de sante_creer_facture (la base fait foi).
export interface Ligne { quantite?: number; prix_unitaire: number }
export interface Couverture { taux: number; plafond?: number | null }

export function totalLignes(lignes: Ligne[]): number {
  return lignes.reduce((s, l) => s + Math.round((l.quantite ?? 1) * l.prix_unitaire), 0);
}

export function ventiler(total: number, remise = 0, couverture?: Couverture | null) {
  if (remise < 0 || remise > total) throw new Error('Remise invalide');
  const net = total - remise;
  let organisme = couverture ? Math.round((net * couverture.taux) / 100) : 0;
  if (couverture?.plafond != null && organisme > couverture.plafond) organisme = couverture.plafond;
  return { net, organisme, patient: net - organisme };
}

export function resteDu(partPatient: number, encaisse: number) {
  return Math.max(0, partPatient - encaisse);
}

export const MODES_PAIEMENT = [
  ['especes', 'Espèces'], ['wave', 'Wave'], ['orange_money', 'Orange Money'], ['free_money', 'Free Money'],
  ['wizall', 'Wizall'], ['carte', 'Carte'], ['cheque', 'Chèque'], ['virement', 'Virement'],
] as const;

export const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
