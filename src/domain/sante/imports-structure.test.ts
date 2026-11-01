import { describe, expect, it } from 'vitest';
import { lireActes, lireEquipe, lireRole, MODELE_ACTES, MODELE_EQUIPE, roleCompatible } from './imports-structure';

describe('import de l’équipe', () => {
  it('reconnaît les rôles écrits en français', () => {
    expect(lireRole('Médecin')).toBe('medecin');
    expect(lireRole('administrateur')).toBe('admin_structure');
    expect(lireRole('tiers payant')).toBe('tiers_payant');
    expect(lireRole('plombier')).toBeNull();
  });
  it('applique la même compatibilité que la base', () => {
    expect(roleCompatible('biologiste', 'cabinet')).toBe(false);
    expect(roleCompatible('medecin', 'laboratoire')).toBe(false);
    expect(roleCompatible('medecin', 'mixte')).toBe(true);
  });
  it('le modèle se relit : une invitation par rôle', () => {
    const r = lireEquipe(MODELE_EQUIPE, 'cabinet', []);
    expect(r.erreurs).toEqual([]);
    expect(r.invitations.map(x => x.role)).toEqual(['secretaire', 'medecin', 'admin_structure']);
    expect(r.personnes).toBe(2);
  });
  it('refuse e-mail invalide, rôle inconnu ou incompatible ; ignore ce qui est déjà en attente', () => {
    const t = 'nom;email;roles\nA;pas-un-mail;secrétaire\nB;b@x.sn;plombier\nC;c@x.sn;médecin\nD;d@x.sn;biologiste+technicien';
    const r = lireEquipe(t, 'laboratoire', [{ email: 'D@x.sn', role: 'technicien' }]);
    expect(r.erreurs).toHaveLength(3);
    expect(r.erreurs[2]).toMatch(/impossible dans un laboratoire/);
    expect(r.invitations).toEqual([{ nom: 'D', email: 'd@x.sn', role: 'biologiste' }]);
    expect(r.ignorees).toBe(1);
  });
  it('exige les colonnes du modèle', () => {
    expect(() => lireEquipe('nom;mail\nA;a@x.sn', 'cabinet', [])).toThrow(/email et roles/);
  });
});

describe('import des actes', () => {
  it('lit tarifs avec espaces et FCFA, codes en majuscules', () => {
    const r = lireActes('code;libelle;tarif;categorie\ncs;Consultation;15 000 FCFA;consultation\nECG;Électrocardiogramme;10000;');
    expect(r.erreurs).toEqual([]);
    expect(r.actes).toEqual([
      { code: 'CS', libelle: 'Consultation', tarif: 15000, categorie: 'consultation' },
      { code: 'ECG', libelle: 'Électrocardiogramme', tarif: 10000, categorie: null },
    ]);
  });
  it('refuse tarif vide ou décimal, code en double, libellé manquant', () => {
    const r = lireActes('code;libelle;tarif\nCS;Consultation;\nCS2;Visite;1500,5\nCS3;Visite;2000\nCS3;Doublon;2000\nX;;100');
    expect(r.erreurs).toHaveLength(4);
    expect(r.actes.map(a => a.code)).toEqual(['CS3']);
  });
  it('le modèle a des tarifs vides à compléter', () => {
    expect(lireActes(MODELE_ACTES).erreurs).toHaveLength(2);
  });
});
