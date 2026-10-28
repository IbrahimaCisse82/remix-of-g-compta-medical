import { describe, expect, it } from 'vitest';
import { lireOrganismesCsv, statutCouverture } from './organismes-import';

describe('Import additif des organismes', () => {
  it('préserve les organismes existants et déduplique le fichier', () => {
    const r = lireOrganismesCsv('nom;type\n IPM Exemple ;ipm\nipm exemple;assurance\nAssurance Démo;assurance\nASSURANCE DÉMO;assurance', ['IPM Exemple']);
    expect(r.rows).toEqual([{ nom: 'Assurance Démo', type: 'assurance' }]);
    expect(r.ignores).toBe(3);
  });
  it('refuse les types inconnus sans inventer de valeur', () => {
    expect(lireOrganismesCsv('nom,type\nExemple,banque', []).erreurs).toEqual(['Ligne 2 : nom ou type invalide.']);
  });
  it('respecte les noms contenant un séparateur entre guillemets', () => {
    expect(lireOrganismesCsv('nom;type\n"IPM; Démo";ipm', []).rows[0].nom).toBe('IPM; Démo');
  });
  it('refuse un fichier sans les colonnes requises', () => {
    expect(() => lireOrganismesCsv('organisme;type\nExemple;ipm', [])).toThrow();
  });
});
describe('Validité informative des couvertures', () => {
  it('inclut les dates de début et de fin', () => {
    expect(statutCouverture({date_debut:'2026-10-28',date_fin:'2026-10-28'}, '2026-10-28')).toBe('Valide');
  });
  it('distingue couverture future et expirée', () => {
    expect(statutCouverture({date_debut:'2026-10-29'}, '2026-10-28')).toBe('À venir');
    expect(statutCouverture({date_fin:'2026-10-27'}, '2026-10-28')).toBe('Expirée');
  });
});