import { describe, expect, it } from 'vitest';
import { valeurResultat } from './laboratoire-resultat';

describe('Valeurs de laboratoire', () => {
  it('conserve un résultat texte ressemblant à un nombre', () => {
    expect(valeurResultat('texte', '0012')).toEqual({ _valeur_num: null, _valeur_texte: '0012' });
  });
  it('conserve un résultat qualitatif', () => {
    expect(valeurResultat('qualitatif', ' négatif ')).toEqual({ _valeur_num: null, _valeur_texte: 'négatif' });
  });
  it('convertit une décimale numérique sans altérer sa valeur', () => {
    expect(valeurResultat('numerique', '1,25')).toEqual({ _valeur_num: 1.25, _valeur_texte: null });
  });
  it('refuse les nombres non finis et les valeurs vides', () => {
    for (const v of ['Infinity', 'NaN', 'abc', '']) expect(() => valeurResultat('numerique', v)).toThrow();
  });
});