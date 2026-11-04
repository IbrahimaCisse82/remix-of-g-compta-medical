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

/** Sous-comptes santé des prestations (rattachés à 7061 « Services vendus dans la Région ») : comptes par défaut des
 *  recettes par catégorie de l'espace santé (sante_compte_defaut) ; les médicaments vendus vont en 7011 (marchandises). */
export const COMPTES_SANTE: CompteReference[] = [
  ['70611', 'Prestations de santé — consultations'],
  ['70612', 'Prestations de santé — actes et soins'],
  ['70613', 'Prestations de santé — analyses de laboratoire'],
  ['70618', 'Prestations de santé — autres'],
].map(([numero, intitule]) => ({ numero, intitule, classe: '7', sens: 'C', type_compte: 'Résultat' }));

/** Comptes du référentiel (et sous-comptes santé) absents du plan du dossier (rien n'est modifié ni supprimé). */
export function comptesManquants(existants: Iterable<string>): CompteReference[] {
  const deja = new Set(existants);
  return [...COMPTES_REFERENCE, ...COMPTES_SANTE].filter(c => !deja.has(c.numero));
}

/** Lignes à insérer, découpées en lots pour l'API. */
export function lotsInstallation(entrepriseId: string, existants: Iterable<string>, taille = 400) {
  const lignes = comptesManquants(existants).map(c => ({ entreprise_id: entrepriseId, ...c, actif: true }));
  const lots: typeof lignes[] = [];
  for (let i = 0; i < lignes.length; i += taille) lots.push(lignes.slice(i, i + taille));
  return lots;
}
