import Papa from 'papaparse';

export interface BankOperation { date: string; libelle: string; reference: string; montant: number }
export interface BankMapping { date: number; libelle: number; reference: number; debit: number; credit: number; montant: number }
export function readBankCsv(text: string) {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error(`CSV invalide : ${result.errors[0].message}`);
  if (result.data.length < 2) throw new Error('Le relevé doit contenir un en-tête et des opérations.');
  const [headers, ...rows] = result.data;
  const normal = headers.map(h => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase());
  const find = (names: string[]) => normal.findIndex(h => names.includes(h));
  const mapping: BankMapping = { date: find(['date', 'date operation', 'date opération', 'date comptable']), libelle: find(['libelle', 'description', 'label']), reference: find(['reference', 'ref', 'piece']), debit: find(['debit', 'sortie']), credit: find(['credit', 'entree']), montant: find(['montant', 'amount']) };
  return { headers, rows, mapping };
}
export function bankAmount(value: string): number {
  let s = value.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!s) return 0;
  if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Montant invalide : ${value}`);
  const n = Number(s);
  if (!Number.isFinite(n) || Math.abs(n) > 999999999999) throw new Error('Montant hors limites');
  return n;
}
export function bankDate(value: string): string {
  const s = value.trim();
  const fr = /^(\d{2})[/.\-](\d{2})[/.\-](\d{4})$/.exec(s);
  const iso = fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Date invalide : ${s}`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error(`Date invalide : ${s}`);
  return iso;
}
export function mapBankRows(rows: string[][], mapping: BankMapping, mode: 'debit_credit' | 'montant', start: string, end: string): { operations: BankOperation[]; errors: string[] } {
  const operations: BankOperation[] = [], errors: string[] = [];
  if (mapping.date < 0 || mapping.libelle < 0 || (mode === 'montant' ? mapping.montant < 0 : mapping.debit < 0 || mapping.credit < 0)) return { operations, errors: ['Sélectionnez les colonnes obligatoires.'] };
  rows.forEach((r, i) => {
    try {
      const date = bankDate(r[mapping.date] ?? '');
      if (date < start || date > end) throw new Error('Date hors exercice');
      const libelle = (r[mapping.libelle] ?? '').trim();
      if (!libelle) throw new Error('Libellé vide');
      let montant: number;
      if (mode === 'montant') montant = bankAmount(r[mapping.montant] ?? '');
      else {
        const debit = bankAmount(r[mapping.debit] ?? ''), credit = bankAmount(r[mapping.credit] ?? '');
        if (debit < 0 || credit < 0 || (debit > 0 && credit > 0)) throw new Error('Débit et crédit incompatibles');
        montant = credit - debit;
      }
      if (!montant) throw new Error('Montant nul');
      operations.push({ date, libelle, reference: mapping.reference < 0 ? '' : (r[mapping.reference] ?? '').trim(), montant });
    } catch (e) { errors.push(`Ligne ${i + 2} : ${e instanceof Error ? e.message : 'invalide'}`); }
  });
  return { operations, errors };
}
export interface MatchLine { id: string; date_ecriture: string; debit: number; credit: number }
export function bankCandidates(operation: Pick<BankOperation, 'date' | 'montant'>, lines: MatchLine[], used: Set<string>): MatchLine[] {
  return lines.filter(j => !used.has(j.id) && Math.round((j.debit - j.credit) * 100) === Math.round(operation.montant * 100) && Math.abs(Date.parse(operation.date) - Date.parse(j.date_ecriture)) <= 5 * 86400000);
}