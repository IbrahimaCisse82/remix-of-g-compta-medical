import { describe, expect, it } from 'vitest';
import { montantCaisse } from './caisse-montant';
describe('Montants de caisse', () => {
  it('conserve un montant entier et accepte le fond nul', () => {
    expect(montantCaisse('10000')).toBe(10000);
    expect(montantCaisse('0')).toBe(0);
  });
  it('refuse un encaissement nul, fractionnaire, négatif ou non fini', () => {
    for (const value of ['0', '0.4', '-1', 'Infinity', 'NaN', '']) expect(() => montantCaisse(value, true)).toThrow();
  });
});