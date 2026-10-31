import { describe, expect, it } from 'vitest';
import { estDestructive, libelleAction } from './Confirmation';

describe('confirmation intégrée', () => {
  it('nomme le bouton selon l’action demandée', () => {
    expect(libelleAction('Supprimer cet article ?')).toBe('Supprimer');
    expect(libelleAction('Clôturer la consultation ? Elle ne pourra plus être modifiée.')).toBe('Clôturer');
    expect(libelleAction('Confirmer la fusion ? Les antécédents…')).toBe('Confirmer la fusion');
    expect(libelleAction('Télécharger le FEC ?')).toBe('Confirmer');
  });
  it('signale les actions destructives', () => {
    expect(estDestructive('Supprimer cette facture ?')).toBe(true);
    expect(estDestructive('Révoquer l’accès de x ?')).toBe(true);
    expect(estDestructive('Clôturer la consultation ?')).toBe(false);
  });
});
