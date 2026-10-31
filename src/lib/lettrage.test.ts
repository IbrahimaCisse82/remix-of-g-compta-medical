import { describe, expect, it } from 'vitest';
import { controlerSelection, pairesAutomatiques, prochainCode } from './lettrage';

const l = (id: string, compte: string, aux: string | null, debit = 0, credit = 0) => ({ id, compte, compte_auxiliaire: aux, debit, credit });

describe('lettrage des tiers', () => {
  it('ne rapproche jamais deux tiers différents de même montant', () => {
    const lignes = [l('f1', '4111', 'P1', 10000), l('r2', '4111', 'P2', 0, 10000), l('r1', '4111', 'P1', 0, 10000)];
    expect(pairesAutomatiques(lignes, new Set()).map(([d, c]) => [d.id, c.id])).toEqual([['f1', 'r1']]);
  });
  it('ignore les lignes déjà lettrées', () => {
    const lignes = [l('f1', '4111', 'P1', 5000), l('r1', '4111', 'P1', 0, 5000)];
    expect(pairesAutomatiques(lignes, new Set(['r1']))).toHaveLength(0);
  });
  it('contrôle la sélection manuelle', () => {
    expect(controlerSelection([l('a', '4111', 'P1', 100)], new Set())).toMatch(/deux lignes/);
    expect(controlerSelection([l('a', '4111', 'P1', 100), l('b', '4111', 'P2', 0, 100)], new Set())).toMatch(/même tiers/);
    expect(controlerSelection([l('a', '4111', 'P1', 100), l('b', '4111', 'P1', 0, 90)], new Set())).toMatch(/soldée/);
    expect(controlerSelection([l('a', '4111', 'P1', 100), l('b', '4111', 'P1', 0, 100)], new Set(['b']))).toMatch(/déjà lettrée/);
    expect(controlerSelection([l('a', '4111', 'P1', 100.1), l('b', '4111', 'P1', 0, 60.05), l('c', '4111', 'P1', 0, 40.05)], new Set())).toBeNull();
  });
  it('attribue des codes uniques, même après un délettrage', () => {
    expect(prochainCode(['L0001', 'L0003', 'A0007'], 'L')).toBe('L0004');
    expect(prochainCode([], 'A')).toBe('A0001');
    expect(prochainCode(['A0001'], 'A', new Set(['A0002']))).toBe('A0003');
  });
});
