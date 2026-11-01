import { describe, expect, it } from 'vitest';
import { libelleType, modelesEnVigueur, verifierModele, versionSuivante, type ModeleConsentement } from './consentements-modeles';

const T = 'Je consens au traitement de mes données de santé par la structure. '.repeat(2);
const m = (o: Partial<ModeleConsentement>): ModeleConsentement => ({
  id: 'x', type: 'soins', version: 'v1.0', titre: 'Soins', texte: T, texte_sha256: 'abc', valide_par: null,
  actif: true, created_at: '2026-10-01T00:00:00Z', archive_le: null, ...o,
});

describe('bibliothèque de consentements', () => {
  it('accepte une saisie complète', () => {
    expect(verifierModele({ type: 'soins', version: 'v1.0', titre: 'Soins', texte: T }, [])).toEqual([]);
  });
  it('refuse type, version, titre et texte trop courts', () => {
    expect(verifierModele({ type: '', version: 'v', titre: 'ab', texte: 'court' }, [])).toHaveLength(4);
  });
  it('refuse une version déjà utilisée pour le même type, pas pour un autre type', () => {
    const ex = [m({ type: 'soins', version: 'v1.0' })];
    expect(verifierModele({ type: 'soins', version: ' v1.0 ', titre: 'Soins', texte: T }, ex)[0]).toMatch(/existe déjà/);
    expect(verifierModele({ type: 'traitement_donnees', version: 'v1.0', titre: 'Données', texte: T }, ex)).toEqual([]);
  });
  it('ne propose à la signature que les textes actifs, le plus récent d’abord', () => {
    const r = modelesEnVigueur([
      m({ id: 'a', version: 'v1.0', actif: false }),
      m({ id: 'b', version: 'v1.1', created_at: '2026-10-02T00:00:00Z' }),
      m({ id: 'c', version: 'v1.2', created_at: '2026-10-03T00:00:00Z' }),
    ]);
    expect(r.map(x => x.id)).toEqual(['c', 'b']);
  });
  it('suggère la version suivante', () => {
    expect(versionSuivante([], 'soins')).toBe('v1.0');
    expect(versionSuivante([m({ version: 'v1.0' }), m({ version: 'v1.4', created_at: '2026-10-05T00:00:00Z' })], 'soins')).toBe('v1.5');
    expect(versionSuivante([m({ version: 'v2' })], 'soins')).toBe('v3');
    expect(versionSuivante([m({ version: 'initiale' })], 'soins')).toBe('initiale-2');
  });
  it('affiche un libellé lisible', () => {
    expect(libelleType('partage_tiers_payant')).toBe('Partage tiers payant');
    expect(libelleType('inconnu')).toBe('inconnu');
  });
});
