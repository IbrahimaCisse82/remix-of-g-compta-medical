export function couvertureValide(taux: string, plafond: string, debut: string, fin: string) {
  const t = Number(taux), p = plafond.trim() ? Number(plafond) : null;
  if (!taux.trim() || !Number.isFinite(t) || t < 0 || t > 100) throw new Error('Le taux doit être compris entre 0 et 100 %.');
  if (p !== null && (!Number.isSafeInteger(p) || p < 0)) throw new Error('Le plafond doit être un montant FCFA entier positif ou nul.');
  if (debut && fin && fin < debut) throw new Error('La fin de validité doit être après le début.');
  return { taux_couverture: t, plafond: p, date_debut: debut || null, date_fin: fin || null };
}
export function imputationsValides(values: Record<string, string>, factures: { id: string; reste: number }[]) {
  return Object.entries(values).filter(([, value]) => value.trim() !== '').map(([facture_id, value]) => {
    const montant = Number(value), facture = factures.find(f => f.id === facture_id);
    if (!facture || !Number.isSafeInteger(montant) || montant < 0 || montant > facture.reste) throw new Error('Chaque imputation doit être un montant FCFA entier, au plus égal au reste dû.');
    return { facture_id, montant };
  }).filter(l => l.montant > 0);
}
export function conventionValide(taux: string, plafond: string, franchise: string) {
  const coverage = couvertureValide(taux, plafond, '', '');
  const montant = Number(franchise || 0);
  if (!Number.isSafeInteger(montant) || montant < 0) throw new Error('Franchise FCFA entière positive ou nulle requise.');
  return { taux: coverage.taux_couverture, plafond: coverage.plafond, franchise: montant };
}