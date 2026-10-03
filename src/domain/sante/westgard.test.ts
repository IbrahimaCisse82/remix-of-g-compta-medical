import { describe, expect, it } from 'vitest';
import { alertesReactif, evaluerWestgard, zScore } from './westgard';

describe('Westgard', () => {
  it('z-score', () => expect(zScore(12, 10, 1)).toBe(2));
  it('accepté dans ±2s', () => expect(evaluerWestgard(1.5, 0.2).statut).toBe('accepte'));
  it('alerte 1-2s', () => expect(evaluerWestgard(2.5, 0)).toEqual({ statut: 'alerte', regles: ['1-2s'] }));
  it('rejet 1-3s', () => expect(evaluerWestgard(-3.2, null).regles).toContain('1-3s'));
  it('rejet 2-2s', () => expect(evaluerWestgard(2.3, 2.1).regles).toEqual(['2-2s']));
  it('rejet R-4s', () => expect(evaluerWestgard(2.4, -2.1).regles).toContain('R-4s'));
  it('retour à la cible après un rejet = accepté', () => expect(evaluerWestgard(0, 6).statut).toBe('accepte'));
  it('pas de 2-2s si côtés opposés', () => expect(evaluerWestgard(2.3, -1).statut).toBe('alerte'));
});

describe('alertes réactifs', () => {
  const now = new Date('2026-10-01T12:00:00');
  it('seuil et péremption', () => {
    expect(alertesReactif([{ quantite_restante: 5, peremption: '2026-10-15' }], 10, now)).toEqual(['Stock sous le seuil', 'Péremption < 30 jours']);
    expect(alertesReactif([{ quantite_restante: 50, peremption: '2026-09-01' }, { quantite_restante: 50, peremption: '2027-09-01' }], 10, now)).toEqual(['Lot périmé en stock']);
    expect(alertesReactif([{ quantite_restante: 50, peremption: '2027-09-01' }], 10, now)).toEqual([]);
  });
});
