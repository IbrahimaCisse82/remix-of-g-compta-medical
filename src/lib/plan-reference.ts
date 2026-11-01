import { REFERENCE_ACCOUNTS } from '@/lib/syscohada-reference';

// Plan comptable SYSCOHADA révisé (référentiel 2019) à installer dans un dossier.
// Comptes de niveau 3 à 5, classes 1 à 8 : les comptes à 2 chiffres sont des titres et la classe 9
// (engagements, analytique) n'est pas mouvementée dans la comptabilité générale.
const TYPE: Record<string, string> = { '6': 'Résultat', '7': 'Résultat', '8': 'HAO' };

export interface CompteReference { numero: string; intitule: string; classe: string; sens: string; type_compte: string }

export const COMPTES_REFERENCE: CompteReference[] = REFERENCE_ACCOUNTS
  .filter(r => r.compte.length >= 3 && r.classe !== '9')
  .map(r => ({
    numero: r.compte,
    intitule: r.intitule,
    classe: r.classe,
    sens: r.sens_normal_indicatif === 'D' || r.sens_normal_indicatif === 'C' ? r.sens_normal_indicatif : 'D/C',
    type_compte: TYPE[r.classe] ?? 'Bilan',
  }));

/** Comptes du référentiel absents du plan du dossier (rien n'est modifié ni supprimé). */
export function comptesManquants(existants: Iterable<string>): CompteReference[] {
  const deja = new Set(existants);
  return COMPTES_REFERENCE.filter(c => !deja.has(c.numero));
}

/** Lignes à insérer, découpées en lots pour l'API. */
export function lotsInstallation(entrepriseId: string, existants: Iterable<string>, taille = 400) {
  const lignes = comptesManquants(existants).map(c => ({ entreprise_id: entrepriseId, ...c, actif: true }));
  const lots: typeof lignes[] = [];
  for (let i = 0; i < lignes.length; i += taille) lots.push(lignes.slice(i, i + taille));
  return lots;
}
