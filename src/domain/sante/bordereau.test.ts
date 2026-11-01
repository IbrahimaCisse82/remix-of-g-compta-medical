import { describe, expect, it } from 'vitest';
import { enLettres, htmlBordereau, periodeFr } from './bordereau';

describe('enLettres', () => {
  it.each([
    [0, 'zéro'], [1, 'un'], [17, 'dix-sept'], [21, 'vingt et un'], [71, 'soixante et onze'], [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'], [99, 'quatre-vingt-dix-neuf'], [100, 'cent'], [200, 'deux cents'], [201, 'deux cent un'],
    [1000, 'mille'], [2400, 'deux mille quatre cents'], [80000, 'quatre-vingt mille'], [200000, 'deux cent mille'],
    [1250000, 'un million deux cent cinquante mille'], [3000000, 'trois millions'], [3000, 'trois mille'], [6000, 'six mille'],
    [300000, 'trois cent mille'], [480000, 'quatre cent quatre-vingt mille'], [200000000, 'deux cents millions'],
  ])('%i → %s', (n, attendu) => expect(enLettres(n)).toBe(attendu));
  it('signale un total négatif', () => expect(enLettres(-3000)).toBe('moins trois mille'));
});

describe('htmlBordereau', () => {
  const html = htmlBordereau(
    { nom: 'Clinique <Test>', ninea: '123', adresse: 'Dakar' }, 'IPM Santé', '2026-11',
    [{ numero: 'FAC1', date: '2026-11-01', patient: 'FALL Awa', dossier: 'P1', organisme: 'IPM Santé', part_organisme: 2400, type: 'facture', annulee: false, total: 3000, taux: 80, adherent: 'ADH-1', bon: 'BON-9', prestations: 'Glycémie à jeun' }],
    2400, new Date('2026-11-02T10:00:00'));
  it('présente la période, les dates et les montants en français', () => {
    expect(periodeFr('2026-11')).toBe('novembre 2026');
    expect(html).toContain('Période : novembre 2026');
    expect(html).toContain('01/11/2026');
    expect(html).toContain('deux mille quatre cents francs CFA');
  });
  it('reprend adhérent, bon, prestations, taux et échappe les données', () => {
    for (const t of ['ADH-1', 'BON-9', 'Glycémie à jeun', '80 %', 'NINEA 123', 'Clinique &lt;Test&gt;']) expect(html).toContain(t);
    expect(html).not.toContain('<Test>');
  });
});
