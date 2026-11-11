import { describe, expect, it } from 'vitest';
import { lireReferentiel, lots, normaliserCode } from './cim10';

describe('CIM-10', () => {
  it('normalise les codes', () => {
    expect(normaliserCode('A000')).toBe('A00.0');
    expect(normaliserCode('e11.9 ')).toBe('E11.9');
    expect(normaliserCode('I10')).toBe('I10');
    expect(normaliserCode('B50-B54')).toBe('B50.B54');
  });
  it('lit un fichier avec en-tête', () => {
    const r = lireReferentiel([['Code', 'Libellé', 'Chapitre'], ['A00', 'Choléra', 'I'], ['A000', 'Choléra à Vibrio cholerae 01', 'I'], ['', '', ''], ['XYZ', 'Invalide', 'I'], ['A00-A09', 'Maladies intestinales infectieuses', 'I']]);
    expect(r.lignes).toEqual([{ code: 'A00', libelle: 'Choléra', chapitre: 'I' }, { code: 'A00.0', libelle: 'Choléra à Vibrio cholerae 01', chapitre: 'I' }]);
    expect(r.ignorees).toBe(2);
  });
  it('lit un fichier sans en-tête (code puis libellés court et long)', () => {
    const r = lireReferentiel([['I10 ', '0', 'HTA essentielle', 'Hypertension essentielle (primitive)'], ['E119', '0', 'Diabète type 2', 'Diabète sucré de type 2, sans complication']]);
    expect(r.lignes.map(l => [l.code, l.libelle])).toEqual([['I10', 'Hypertension essentielle (primitive)'], ['E11.9', 'Diabète sucré de type 2, sans complication']]);
  });
  it('dédoublonne et découpe en lots', () => {
    expect(lireReferentiel([['A00', 'Un'], ['A00', 'Deux']]).lignes).toEqual([{ code: 'A00', libelle: 'Deux' }]);
    expect(lots([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
