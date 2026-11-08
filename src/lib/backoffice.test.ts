import { describe, expect, it } from 'vitest';
import { etatAcces, libelleAction, MODULES_BACKOFFICE } from './backoffice';

describe('accès au back-office', () => {
  it('attend la session puis la réponse du serveur', () => {
    expect(etatAcces(null, undefined)).toBe('chargement');
    expect(etatAcces(true, undefined)).toBe('chargement');
  });
  it('renvoie vers la connexion sans session', () => {
    expect(etatAcces(false, undefined)).toBe('non_connecte');
  });
  it('refuse un utilisateur qui n\'est pas opérateur', () => {
    expect(etatAcces(true, { operateur: false, role: null, mfa: true })).toBe('refuse');
    expect(etatAcces(true, null)).toBe('refuse');
  });
  it('exige la double authentification avant tout écran', () => {
    expect(etatAcces(true, { operateur: true, role: 'proprietaire', mfa: false })).toBe('double_auth');
    expect(etatAcces(true, { operateur: true, role: 'operateur', mfa: true })).toBe('ok');
  });
});

describe('libellés', () => {
  it('traduit les actions connues et lisibilise les autres', () => {
    expect(libelleAction('operateur_ajoute')).toBe('Opérateur ajouté');
    expect(libelleAction('abonnement_active')).toBe('abonnement active');
  });
  it('seuls les modules du socle sont disponibles à ce stade', () => {
    expect(MODULES_BACKOFFICE.filter(m => m.disponible).map(m => m.id)).toEqual(['operateurs', 'journal']);
  });
});
