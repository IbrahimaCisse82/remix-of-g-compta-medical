/** FCFA cash amounts must be whole, finite and nonnegative. */
export function montantCaisse(value: string, positif = false): number {
  const n = Number(value.trim());
  if (!value.trim() || !Number.isSafeInteger(n) || n < 0 || (positif && n === 0)) {
    throw new Error(positif ? 'Montant FCFA entier strictement positif obligatoire' : 'Montant FCFA entier positif ou nul obligatoire');
  }
  return n;
}
/** Ancienneté d'une session de caisse : au-delà de 24 h, elle aurait dû être clôturée (rapport de fin de journée). */
export function ancienneteSession(ouverteLe: string, maintenant = new Date()): { heures: number; libelle: string; aCloturer: boolean } {
  const heures = Math.max(0, Math.floor((maintenant.getTime() - Date.parse(ouverteLe)) / 3_600_000));
  const jours = Math.floor(heures / 24);
  const libelle = heures < 1 ? 'moins d’une heure' : heures < 24 ? `${heures} h` : jours === 1 ? 'plus d’un jour' : `${jours} jours`;
  return { heures, libelle, aCloturer: heures >= 24 };
}
