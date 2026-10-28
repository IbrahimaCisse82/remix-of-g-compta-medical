/** Numeric entry for laboratory quantities and control measurements. */
export function nombreQualite(value: string, positif = false): number {
  const n = Number(value.trim().replace(',', '.'));
  if (!value.trim() || !Number.isFinite(n) || (positif && n <= 0)) {
    throw new Error(positif ? 'Valeur positive obligatoire' : 'Valeur numérique obligatoire');
  }
  return n;
}