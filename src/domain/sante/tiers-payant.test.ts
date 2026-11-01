import { describe, expect, it } from 'vitest';
import { resteDu, totalLignes, ventiler } from './tiers-payant';

describe('tiers-payant', () => {
  it('additionne les lignes', () => expect(totalLignes([{ prix_unitaire: 10000 }, { quantite: 2, prix_unitaire: 3000 }])).toBe(16000));
  it('sans assurance tout est à la charge du patient', () => expect(ventiler(10000)).toEqual({ net: 10000, organisme: 0, patient: 10000 }));
  it('applique le taux', () => expect(ventiler(10000, 0, { taux: 80 })).toEqual({ net: 10000, organisme: 8000, patient: 2000 }));
  it('applique le plafond', () => expect(ventiler(100000, 0, { taux: 80, plafond: 50000 }).patient).toBe(50000));
  it('remise avant ventilation', () => expect(ventiler(10000, 2000, { taux: 50 }).organisme).toBe(4000));
  it('refuse une remise excessive', () => expect(() => ventiler(1000, 2000)).toThrow());
  it('reste dû jamais négatif', () => expect(resteDu(1000, 1500)).toBe(0));
});

import { bordereauParOrganisme } from './tiers-payant';
describe('bordereau', () => {
  const b = (o: string | null, m: number) => ({ numero: 'F', date: '2026-10-01', patient: 'X', dossier: 'P', organisme: o, part_organisme: m, type: m < 0 ? 'avoir' : 'facture', annulee: false });
  it('groupe par organisme et nette les avoirs', () => {
    const r = bordereauParOrganisme([b('IPM', 8000), b('IPM', -8000), b('IPM', 5000), b('AXA', 3000), b(null, 0)]);
    expect(r.map(g => [g.organisme, g.total])).toEqual([['AXA', 3000], ['IPM', 5000]]);
  });
  it('exclut les factures annulées sans exclure les avoirs valides', () => {
    const r = bordereauParOrganisme([{ ...b('IPM', 8000), annulee: true }, b('IPM', 10000), b('IPM', -2000)]);
    expect(r[0].total).toBe(8000); expect(r[0].lignes).toHaveLength(2);
  });
});
