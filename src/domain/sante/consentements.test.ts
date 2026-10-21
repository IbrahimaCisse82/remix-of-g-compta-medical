import { describe, expect, it } from 'vitest';
import {
  MODELES_CONSENTEMENT, etatConsentements, qualiteParDefaut, texteConsentement, verifierSaisieSignature,
} from './consentements';

const REF = new Date('2026-10-21T12:00:00');

describe('modèles de consentement', () => {
  it('chaque type a une version et un texte intégral suffisant pour le serveur (≥ 50 caractères)', () => {
    const types = new Set<string>();
    for (const m of MODELES_CONSENTEMENT) {
      expect(m.version).toMatch(/^v\d+-\d{4}$/);
      expect(m.texte.length).toBeGreaterThan(50);
      types.add(m.type);
    }
    expect([...types].sort()).toEqual(['partage_tiers_payant', 'portail_sms', 'soins', 'traitement_donnees']);
  });

  it('remplace la structure et le patient partout', () => {
    const t = texteConsentement('traitement_donnees', 'Cabinet Test', 'DIOP Awa');
    expect(t).toContain('Cabinet Test');
    expect(t).toContain('DIOP Awa');
    expect(t).not.toMatch(/\{structure\}|\{patient\}/);
  });

  it('a des valeurs de repli si un nom manque', () => {
    expect(texteConsentement('soins', '  ', '')).toContain('la structure');
  });
});

describe('signataire', () => {
  it('propose un parent pour un mineur, le patient sinon', () => {
    expect(qualiteParDefaut('2015-03-01', REF)).toBe('parent');
    expect(qualiteParDefaut('1990-03-01', REF)).toBe('patient');
    expect(qualiteParDefaut(null, REF)).toBe('patient');
  });

  it('bloque une saisie incomplète', () => {
    const e = verifierSaisieSignature({ signataireNom: ' ', qualite: 'patient', traits: 0, texteLu: false }, REF);
    expect(e).toHaveLength(3);
  });

  it('refuse qu’un mineur signe lui-même', () => {
    const e = verifierSaisieSignature({ signataireNom: 'Awa Diop', qualite: 'patient', traits: 2, texteLu: true, dateNaissance: '2012-01-01' }, REF);
    expect(e.join(' ')).toContain('mineur');
    expect(verifierSaisieSignature({ signataireNom: 'Fatou Diop', qualite: 'parent', traits: 2, texteLu: true, dateNaissance: '2012-01-01' }, REF)).toEqual([]);
  });
});

describe('état des consentements', () => {
  it('retient le dernier enregistrement par type (retrait compris)', () => {
    const etat = etatConsentements([
      { type: 'portail_sms', accorde: true, created_at: '2026-10-01T10:00:00Z' },
      { type: 'portail_sms', accorde: false, created_at: '2026-10-15T10:00:00Z' },
      { type: 'soins', accorde: true, created_at: '2026-10-02T10:00:00Z' },
    ]);
    expect(etat.portail_sms.accorde).toBe(false);
    expect(etat.soins.accorde).toBe(true);
  });
});
