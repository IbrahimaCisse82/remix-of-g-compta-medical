import { describe, expect, it } from 'vitest';
import { COMPTES_REFERENCE, comptesManquants, lotsInstallation } from './plan-reference';

describe('plan SYSCOHADA de référence', () => {
  it('reprend les comptes mouvementables des classes 1 à 8', () => {
    expect(COMPTES_REFERENCE).toHaveLength(1295);
    expect(COMPTES_REFERENCE.some(c => c.classe === '9' || c.numero.length < 3)).toBe(false);
    expect(new Set(COMPTES_REFERENCE.map(c => c.numero)).size).toBe(COMPTES_REFERENCE.length);
  });
  it('contient les comptes utilisés par la santé et la banque', () => {
    const n = new Set(COMPTES_REFERENCE.map(c => c.numero));
    for (const c of ['4111', '571', '706', '5211', '521']) expect(n.has(c)).toBe(true);
    expect(COMPTES_REFERENCE.find(c => c.numero === '706')?.type_compte).toBe('Résultat');
    expect(COMPTES_REFERENCE.find(c => c.numero === '5211')?.type_compte).toBe('Bilan');
  });
  it('n’ajoute que les comptes absents, par lots', () => {
    expect(comptesManquants(['571', '706'])).toHaveLength(1293);
    const lots = lotsInstallation('e1', ['571'], 500);
    expect(lots.map(l => l.length)).toEqual([500, 500, 294]);
    expect(lots[0][0]).toMatchObject({ entreprise_id: 'e1', actif: true });
    expect(lotsInstallation('e1', COMPTES_REFERENCE.map(c => c.numero))).toHaveLength(0);
  });
});
