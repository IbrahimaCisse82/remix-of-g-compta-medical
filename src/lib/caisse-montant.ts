/** FCFA cash amounts must be whole, finite and nonnegative. */
export function montantCaisse(value: string, positif = false): number {
  const n = Number(value.trim());
  if (!value.trim() || !Number.isSafeInteger(n) || n < 0 || (positif && n === 0)) {
    throw new Error(positif ? 'Montant FCFA entier strictement positif obligatoire' : 'Montant FCFA entier positif ou nul obligatoire');
  }
  return n;
}