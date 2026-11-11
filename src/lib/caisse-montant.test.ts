import { describe, expect, it } from 'vitest';
import { ancienneteSession, montantCaisse } from './caisse-montant';
describe('Montants de caisse', () => {
  it('conserve un montant entier et accepte le fond nul', () => {
    expect(montantCaisse('10000')).toBe(10000);
    expect(montantCaisse('0')).toBe(0);
  });
  it('refuse un encaissement nul, fractionnaire, négatif ou non fini', () => {
    for (const value of ['0', '0.4', '-1', 'Infinity', 'NaN', '']) expect(() => montantCaisse(value, true)).toThrow();
  });
});
describe('ancienneté de la session de caisse', () => {
  const m = new Date('2026-11-11T20:00:00Z');
  it('signale une caisse ouverte depuis plus de 24 h', () => {
    expect(ancienneteSession('2026-11-11T08:00:00Z', m)).toEqual({ heures: 12, libelle: '12 h', aCloturer: false });
    expect(ancienneteSession('2026-11-10T19:00:00Z', m)).toEqual({ heures: 25, libelle: 'plus d’un jour', aCloturer: true });
    expect(ancienneteSession('2026-10-31T09:00:00Z', m).libelle).toBe('11 jours');
    expect(ancienneteSession('2026-11-11T19:30:00Z', m).libelle).toBe('moins d’une heure');
  });
});
