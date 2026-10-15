import { describe, expect, it } from 'vitest';
import { parseAutomate } from './automate';

describe('import automate', () => {
  it('lit point-virgule et tabulation, garde la virgule décimale', () => {
    expect(parseAutomate('GLY;1,05\nuree\t0.32')).toEqual([{ code: 'GLY', valeur: '1,05' }, { code: 'UREE', valeur: '0.32' }]);
  });
  it('ignore commentaires, lignes vides et lignes sans valeur', () => {
    expect(parseAutomate('# export\n\nGLY;\nCREA;9')).toEqual([{ code: 'CREA', valeur: '9' }]);
  });
});
