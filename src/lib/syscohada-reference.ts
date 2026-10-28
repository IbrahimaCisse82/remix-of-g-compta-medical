import reference from '@/data/syscohada-plan-2019.json';
import mapping from '@/data/syscohada-mapping-2019.json';

export const REFERENCE_VERSION = reference.version;
export const REFERENCE_ACCOUNTS = reference.rows;
export const REFERENCE_MAPPING = mapping.rows;
export const UNVALIDATED_MAPPINGS = mapping.rows.filter(r => r.verification.includes('A_VALIDER') || r.verification.includes('PARTIEL'));

export function accountReference(account: string) {
  if (/^(20|6811|1374)/.test(account)) return undefined;
  return reference.rows.filter(r => account === r.compte || (r.compte.length >= 4 && account.startsWith(r.compte)))
    .sort((a, b) => b.compte.length - a.compte.length)[0];
}

/** Restricted arithmetic grammar: no eval, executable expressions or arbitrary identifiers. */
export function referenceFormula(expression: string, values: Record<string, number>): number {
  if (!/^[+-]?[A-Z]{2}(?:[+-][A-Z]{2})*$/.test(expression)) throw new Error(`Formule de référence invalide : ${expression}`);
  return (expression.match(/[+-]?[A-Z]{2}/g) ?? []).reduce((sum, term) => {
    const id = term.replace(/^[+-]/, '');
    return sum + (term.startsWith('-') ? -1 : 1) * (values[id] ?? 0);
  }, 0);
}