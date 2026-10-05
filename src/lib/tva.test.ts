import { describe, it, expect } from 'vitest';
import { ht, tvaFromTtc, ttc, calculerTva } from './tva';

describe('TVA — helpers', () => {
  it('ht() extrait le HT correctement à 18%', () => {
    expect(ht(1180, 0.18)).toBeCloseTo(1000, 2);
  });
  it('tvaFromTtc() donne le montant TVA', () => {
    expect(tvaFromTtc(1180, 0.18)).toBeCloseTo(180, 2);
  });
  it('ttc() applique la TVA', () => {
    expect(ttc(1000, 0.18)).toBeCloseTo(1180, 2);
  });
});

describe('TVA — déclaration', () => {
  const params = [{ compte_tva_collectee: '4431', compte_tva_deductible: '4452', taux: 0.18 }];
  const balance = [
    { compte: '4431', sfd: 0, sfc: 500000 },   // collectée = 500k
    { compte: '4452', sfd: 200000, sfc: 0 },   // déductible = 200k
    { compte: '6011', sfd: 800000, sfc: 0 },   // hors périmètre
  ];

  it('calcule TVA nette = collectée - déductible', () => {
    const r = calculerTva(balance, params, 0);
    expect(r.collectee).toBe(500000);
    expect(r.deductible).toBe(200000);
    expect(r.nette).toBe(300000);
    expect(r.aPayer).toBe(300000);
  });

  it('déduit un crédit de TVA reportable précédent', () => {
    const r = calculerTva(balance, params, 100000);
    expect(r.aPayer).toBe(200000);
  });

  it('renvoie un crédit reportable si nette < crédit précédent', () => {
    const r = calculerTva(balance, params, 400000);
    expect(r.aPayer).toBe(-100000);
  });
});

import { ventilerTvaDeductible } from './tva';
describe('TVA déductible (structures de santé)', () => {
  it('assujetti : tout récupérable', () => expect(ventilerTvaDeductible(1800, 1)).toEqual({ deductible: 1800, nonDeductible: 0 }));
  it('exonéré : rien de récupérable', () => expect(ventilerTvaDeductible(1800, 0)).toEqual({ deductible: 0, nonDeductible: 1800 }));
  it('prorata 40 %', () => expect(ventilerTvaDeductible(1800, 0.4)).toEqual({ deductible: 720, nonDeductible: 1080 }));
});
