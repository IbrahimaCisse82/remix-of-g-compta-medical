import { describe, expect, it } from 'vitest';
import { realiseParMois } from './budget';

describe('réalisé budgétaire', () => {
  const lignes = [
    { compte: '6011', date_ecriture: '2026-01-15', debit: 1000, credit: 0 },
    { compte: '6012', date_ecriture: '2026-01-20', debit: 500, credit: 0 },
    { compte: '6011', date_ecriture: '2026-02-01', debit: 0, credit: 200 },
    { compte: '706', date_ecriture: '2026-03-05', debit: 0, credit: 8000 },
    { compte: '6052', date_ecriture: '2026-01-05', debit: 999, credit: 0 },
  ];
  it('agrège les sous-comptes d’une racine', () => {
    const r = realiseParMois('601', lignes);
    expect(r[0]).toBe(1500);
    expect(r[1]).toBe(-200);
  });
  it('lit les produits au crédit', () => {
    expect(realiseParMois('70', lignes)[2]).toBe(8000);
  });
});
