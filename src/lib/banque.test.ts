import { describe, it, expect } from 'vitest';
import { bankAmount, bankCandidates, bankDate, mapBankRows, readBankCsv } from './banque';
describe('Import et rapprochement bancaire', () => {
  it('lit les champs CSV contenant séparateurs et retours à la ligne', () => {
    const { rows } = readBankCsv('Date;Libellé;Débit;Crédit\n27/10/2026;"Virement; reçu\nBanque";;10000');
    expect(rows).toHaveLength(1); expect(rows[0][1]).toBe('Virement; reçu\nBanque');
  });
  it('inverse le débit bancaire pour la comptabilité', () => {
    const parsed = readBankCsv('Date;Libellé;Débit;Crédit\n27/10/2026;Frais;1 500,50;\n28/10/2026;Virement;;10 000');
    const result = mapBankRows(parsed.rows, parsed.mapping, 'debit_credit', '2026-01-01', '2026-12-31');
    expect(result.errors).toEqual([]); expect(result.operations.map(o => o.montant)).toEqual([-1500.5, 10000]);
  });
  it('conserve le sens du montant signé', () => {
    const parsed = readBankCsv('Date;Libellé;Montant\n2026-10-27;Frais;-500');
    expect(mapBankRows(parsed.rows, parsed.mapping, 'montant', '2026-01-01', '2026-12-31').operations[0].montant).toBe(-500);
  });
  it('rejette dates impossibles et montants malformés', () => {
    expect(() => bankDate('31/02/2026')).toThrow(); expect(() => bankAmount('12abc')).toThrow(); expect(bankAmount('1.500,50')).toBe(1500.5);
  });
  it('bloque les lignes hors exercice sans import silencieux', () => {
    const parsed = readBankCsv('Date;Libellé;Montant\n2025-10-27;Frais;-500');
    const result = mapBankRows(parsed.rows, parsed.mapping, 'montant', '2026-01-01', '2026-12-31');
    expect(result.errors).toHaveLength(1); expect(result.operations).toHaveLength(0);
  });
  it('ne propose que le même montant signé dans cinq jours, sans réutilisation', () => {
    const lines = [ { id: 'a', date_ecriture: '2026-10-22', debit: 10000, credit: 0 }, { id: 'b', date_ecriture: '2026-10-21', debit: 10000, credit: 0 }, { id: 'c', date_ecriture: '2026-10-27', debit: 0, credit: 10000 } ];
    expect(bankCandidates({ date: '2026-10-27', montant: 10000 }, lines, new Set()).map(j => j.id)).toEqual(['a']);
    expect(bankCandidates({ date: '2026-10-27', montant: 10000 }, lines, new Set(['a']))).toEqual([]);
  });
});