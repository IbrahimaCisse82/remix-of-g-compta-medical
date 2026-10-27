import { describe, it, expect } from 'vitest';
import { messageErreur } from './erreurs';

describe('messageErreur', () => {
  it('explique un « Accès refusé » nu', () => {
    expect(messageErreur('Accès refusé')).toMatch(/votre rôle ne permet pas/);
  });
  it('traduit un refus de sécurité ligne', () => {
    expect(messageErreur('new row violates row-level security policy for table "x"')).toMatch(/^Accès refusé/);
  });
  it('garde un message déjà explicite', () => {
    const m = 'Fusion refusée : sexe différent entre les deux dossiers';
    expect(messageErreur(m)).toBe(m);
  });
});
