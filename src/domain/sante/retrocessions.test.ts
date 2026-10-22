import { describe, expect, it } from 'vitest';
import { bornesMois, libellePeriode, moisPrecedent, verifierPaiement, verifierTaux } from './retrocessions';

describe('périodes', () => {
  it('donne les bornes d’un mois, années bissextiles comprises', () => {
    expect(bornesMois(2026, 10)).toEqual({ debut: '2026-10-01', fin: '2026-10-31' });
    expect(bornesMois(2028, 2)).toEqual({ debut: '2028-02-01', fin: '2028-02-29' });
  });
  it('propose le mois précédent, y compris en janvier', () => {
    expect(moisPrecedent(new Date(2026, 9, 22))).toEqual({ debut: '2026-09-01', fin: '2026-09-30' });
    expect(moisPrecedent(new Date(2027, 0, 5))).toEqual({ debut: '2026-12-01', fin: '2026-12-31' });
  });
  it('libelle un mois entier ou une période libre', () => {
    expect(libellePeriode('2026-09-01', '2026-09-30')).toBe('septembre 2026');
    expect(libellePeriode('2026-09-01', '2026-09-15')).toBe('du 01/09/2026 au 15/09/2026');
  });
});

describe('contrôles', () => {
  it('borne le taux entre 0 et 100', () => {
    expect(verifierTaux('60')).toBeNull();
    expect(verifierTaux('12,5')).toBeNull();
    expect(verifierTaux('101')).toMatch(/entre 0 et 100/);
    expect(verifierTaux('')).toMatch(/invalide/);
  });
  it('exige une référence sauf en espèces', () => {
    expect(verifierPaiement('especes', '')).toBeNull();
    expect(verifierPaiement('virement', ' ')).toMatch(/référence/);
    expect(verifierPaiement('cheque', 'CHQ 0012')).toBeNull();
  });
});
