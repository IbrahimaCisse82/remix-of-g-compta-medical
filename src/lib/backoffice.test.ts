import { describe, expect, it } from 'vitest';
<<<<<<< HEAD
import { contexteRetour, erreurRetour, etatAcces, libelleAction, libelleStatutRetour, MODULES_BACKOFFICE } from './backoffice';
=======
import { etatAcces, libelleAction, MODULES_BACKOFFICE } from './backoffice';
>>>>>>> origin/main

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
<<<<<<< HEAD
  it('modules disponibles : retours, opérateurs, journal', () => {
    expect(MODULES_BACKOFFICE.filter(m => m.disponible).map(m => m.id)).toEqual(['retours', 'operateurs', 'journal']);
  });
});

describe('retours des pilotes', () => {
  it('valide le type et la longueur', () => {
    expect(erreurRetour('bug', 'Le bouton ne marche pas')).toBeNull();
    expect(erreurRetour('autre', 'Le bouton ne marche pas')).toMatch(/type/);
    expect(erreurRetour('question', '  ok ')).toMatch(/5 caractères/);
    expect(erreurRetour('amelioration', 'x'.repeat(4001))).toMatch(/trop long/);
  });
  it('libellés de statut', () => {
    expect(libelleStatutRetour('rejete')).toBe('Non retenu');
    expect(libelleStatutRetour('inconnu')).toBe('inconnu');
  });
  it('le contexte technique ne contient que navigateur, langue, écran et version', () => {
    const c = contexteRetour({ userAgent: 'x'.repeat(300), language: 'fr-SN' }, { width: 1280, height: 800 }, '1.0');
    expect(Object.keys(c).sort()).toEqual(['ecran', 'langue', 'navigateur', 'version']);
    expect(c.navigateur).toHaveLength(200);
    expect(c.ecran).toBe('1280x800');
=======
  it('seuls les modules du socle sont disponibles à ce stade', () => {
    expect(MODULES_BACKOFFICE.filter(m => m.disponible).map(m => m.id)).toEqual(['operateurs', 'journal']);
>>>>>>> origin/main
  });
});
