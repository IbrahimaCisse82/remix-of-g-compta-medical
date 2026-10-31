import { describe, expect, it } from 'vitest';
import { chargerTout } from './pagination';

const source = Array.from({ length: 2345 }, (_, i) => i);
const page = (de: number, a: number) => Promise.resolve({ data: source.slice(de, a + 1), error: null });

describe('chargerTout', () => {
  it('lit toutes les pages au-delà de 1 000 lignes', async () => {
    expect(await chargerTout(page)).toEqual(source);
    expect(await chargerTout(page, 1000)).toHaveLength(2345);
  });
  it('s’arrête sur une page exactement pleine suivie d’une page vide', async () => {
    const mille = Array.from({ length: 1000 }, (_, i) => i);
    expect(await chargerTout((de, a) => Promise.resolve({ data: mille.slice(de, a + 1), error: null }))).toHaveLength(1000);
  });
  it('remonte l’erreur', async () => {
    await expect(chargerTout(() => Promise.resolve({ data: null, error: { message: 'refus' } }))).rejects.toThrow('refus');
  });
});
