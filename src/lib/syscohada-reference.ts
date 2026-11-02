import reference from '@/data/syscohada-plan-2019.json';
import mapping from '@/data/syscohada-mapping-2019.json';

export const REFERENCE_VERSION = reference.version;
export const REFERENCE_ACCOUNTS = reference.rows;
export const REFERENCE_MAPPING = mapping.rows;
/** Visa de l'expert-comptable sur le référentiel (déclaré le 02/11/2026) : couvre les lignes « à valider ». */
export const REFERENCE_VISA = (mapping as { visa?: { date: string; declare_par: string; expert: string | null } }).visa ?? null;
export const MAPPINGS_A_VALIDER = mapping.rows.filter(r => r.verification.includes('A_VALIDER') || r.verification.includes('PARTIEL'));
export const UNVALIDATED_MAPPINGS = REFERENCE_VISA ? [] : MAPPINGS_A_VALIDER;

export function accountReference(account: string) {
  if (/^(20|6811|1374)/.test(account)) return undefined;
  const trouve = reference.rows.filter(r => account === r.compte || (r.compte.length >= 3 && account.startsWith(r.compte)))
    .sort((a, b) => b.compte.length - a.compte.length)[0];
  if (trouve) return trouve;
  // Compte général complété de zéros (120000 = 12 Report à nouveau, comme dans le Guide d'application).
  const racine = account.replace(/0+$/, '');
  return racine.length >= 2 ? reference.rows.find(r => r.compte === racine) : undefined;
}

/** Restricted arithmetic grammar: no eval, executable expressions or arbitrary identifiers. */
export function referenceFormula(expression: string, values: Record<string, number>): number {
  if (!/^[+-]?[A-Z]{2}(?:[+-][A-Z]{2})*$/.test(expression)) throw new Error(`Formule de référence invalide : ${expression}`);
  const terms: string[] = Array.from(expression.match(/[+-]?[A-Z]{2}/g) ?? []);
  return terms.reduce<number>((sum, term) => {
    const id = term.replace(/^[+-]/, '');
    return sum + (term.startsWith('-') ? -1 : 1) * (values[id] ?? 0);
  }, 0);
}