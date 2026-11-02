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

describe('lettrage entre exercices et anciens paiements', () => {
  const L = (id: string, p: Partial<import('./lettrage').LigneTiers>) => ({ id, compte: '401901', debit: 0, credit: 0, ...p });
  it('une ligne sans auxiliaire rejoint un tiers, jamais deux tiers', async () => {
    const { compatibles, controlerSelection } = await import('./lettrage');
    expect(compatibles([L('a', { compte_auxiliaire: 'FRN901' }), L('b', {})])).toBe(true);
    expect(compatibles([L('a', { compte_auxiliaire: 'FRN901' }), L('b', { compte_auxiliaire: 'FRN902' })])).toBe(false);
    expect(compatibles([L('a', {}), L('b', { compte: '401902' })])).toBe(false);
    expect(controlerSelection([L('a', { compte_auxiliaire: 'FRN901', credit: 100 }), L('b', { debit: 100 })], new Set())).toBeNull();
  });
  it('propositions par pièce : facture, ancien règlement REG- et à-nouveau détaillé', async () => {
    const { propositionsParPiece } = await import('./lettrage');
    const lignes = [
      L('f', { piece: 'FA-TEST-001', libelle: 'Facture TEST', credit: 660800, compte_auxiliaire: 'FRN901' }),
      L('r1', { piece: 'REG-FA-TEST-001', libelle: 'Règlement FA-TEST-001 — TEST', debit: 100000 }),
      L('r2', { piece: 'RF-2026-0002', libelle: 'RF-2026-0002 — facture FA-TEST-001', debit: 560800, compte_auxiliaire: 'FRN901' }),
      L('x', { piece: 'FA-TEST-0010', libelle: 'Autre', credit: 5000 }),
      L('an', { piece: 'AN-CLOTURE-2025', libelle: 'A-nouveau 2025 — FA-9 — Facture FA-9', credit: 300, compte: '411901' }),
      L('p9', { piece: 'RC-2026-0001', libelle: 'RC-2026-0001 — facture FA-9', debit: 300, compte: '411901' }),
    ];
    const g = propositionsParPiece(lignes, new Set());
    expect(g.map(x => x.map(l => l.id).sort())).toEqual([['f', 'r1', 'r2'], ['an', 'p9']]);
    expect(propositionsParPiece(lignes, new Set(['r1']))).toEqual([[lignes[4], lignes[5]]]);
  });
});
