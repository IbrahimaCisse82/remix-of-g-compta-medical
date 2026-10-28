import { describe, expect, it } from 'vitest';
import { nombreQualite } from './qualite-valeurs';
describe('Valeurs qualité et réactifs', () => {
  it('conserve les quantités décimales saisies avec virgule', () => expect(nombreQualite('1,5', true)).toBe(1.5));
  it('refuse une quantité vide, nulle, négative ou non finie', () => {
    for (const s of ['', '0', '-1', 'Infinity', 'NaN']) expect(() => nombreQualite(s, true)).toThrow();
  });
  it('autorise une mesure finie égale à zéro', () => expect(nombreQualite('0')).toBe(0));
});