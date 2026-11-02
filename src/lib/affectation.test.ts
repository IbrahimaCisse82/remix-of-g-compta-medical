import { describe, expect, it } from 'vitest';
import { lignesAffectation, reserveLegaleMinimum } from './affectation';

describe('affectation du résultat', () => {
  const s = { resultat: 14623270, capital: 1000000, reserveLegale: 0, pertesAnterieures: 9197888 };
  it('réserve légale : 10 % du bénéfice net des pertes, plafonnée au cinquième du capital', () => {
    expect(reserveLegaleMinimum(s)).toBe(200000);
    expect(reserveLegaleMinimum({ ...s, capital: 100000000 })).toBe(542538);
    expect(reserveLegaleMinimum({ ...s, reserveLegale: 200000 })).toBe(0);
    expect(reserveLegaleMinimum({ ...s, capital: 0 })).toBe(0);
  });
  it('répartition équilibrée', () => {
    const r = lignesAffectation(s, { reserveLegale: 200000, reservesStatutaires: 0, reservesFacultatives: 0, dividendes: 5000000, reportANouveau: 9423270 });
    expect(r.erreur).toBeNull();
    expect(r.lignes).toEqual([{ compte: '111', debit: 0, credit: 200000 }, { compte: '465', debit: 0, credit: 5000000 }, { compte: '121', debit: 0, credit: 9423270 }]);
  });
  it('refus : réserve légale insuffisante ou somme différente', () => {
    expect(lignesAffectation(s, { reserveLegale: 0, reservesStatutaires: 0, reservesFacultatives: 0, dividendes: 0, reportANouveau: 14623270 }).erreur).toMatch(/au moins 200/);
    expect(lignesAffectation(s, { reserveLegale: 200000, reservesStatutaires: 0, reservesFacultatives: 0, dividendes: 0, reportANouveau: 1 }).erreur).toMatch(/≠/);
  });
  it('perte : report à nouveau débiteur', () => {
    expect(lignesAffectation({ ...s, resultat: -500000 }, { reserveLegale: 0, reservesStatutaires: 0, reservesFacultatives: 0, dividendes: 0, reportANouveau: 0 }).lignes)
      .toEqual([{ compte: '129', debit: 500000, credit: 0 }]);
  });
});
