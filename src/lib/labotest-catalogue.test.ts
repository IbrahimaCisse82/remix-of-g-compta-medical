import { describe, expect, it } from 'vitest';
import { rechercherLabotest } from './labotest-catalogue';
describe('Consultation Labotest', () => {
  it('affiche les 192 analyses sans modifier les données source', () => {
    expect(rechercherLabotest('', 'particulier')).toHaveLength(192);
    const r = rechercherLabotest('AFP', 'particulier'); r[0].prix = 0;
    expect(rechercherLabotest('AFP', 'particulier')[0].prix).toBe(20800);
  });
  it('recherche par code et par libellé sans accents', () => {
    expect(rechercherLabotest('AFP', 'ipm').map(r => r.prix)).toEqual([17600]);
    expect(rechercherLabotest('alpha foeto', 'hopital').map(r => r.prix)).toEqual([16000]);
    expect(rechercherLabotest('zzzzzz', 'assurance')).toEqual([]);
  });
  it('conserve les quatre prix AFP', () => {
    expect(['particulier','assurance','ipm','hopital'].map(g => rechercherLabotest('AFP', g as 'particulier')[0].prix)).toEqual([20800,20800,17600,16000]);
  });
});