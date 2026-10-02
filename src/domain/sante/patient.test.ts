import { describe, it, expect } from 'vitest';
import { ageEnAnnees, libelleAge, normaliserTelephone, validerPatient } from './patient';

const REF = new Date('2026-10-02T12:00:00');

describe('dossier patient', () => {
  it('calcule l’âge révolu', () => {
    expect(ageEnAnnees('1990-10-02', REF)).toBe(36);
    expect(ageEnAnnees('1990-10-03', REF)).toBe(35);
  });
  it('libellé d’âge nourrisson', () => {
    expect(libelleAge('2026-09-22', REF)).toBe('10 j');
    expect(libelleAge('2026-01-15', REF)).toBe('8 mois');
    expect(libelleAge('2000-01-01', REF)).toBe('26 ans');
  });
  it('normalise le téléphone', () => {
    expect(normaliserTelephone('+221 77 123 45 67')).toBe('771234567');
    expect(normaliserTelephone('77-123-45-67')).toBe('771234567');
  });
  it('valide les champs obligatoires', () => {
    expect(validerPatient({ nom: 'D', prenoms: '', sexe: '' }, REF)).toHaveLength(3);
    expect(validerPatient({ nom: 'Diop', prenoms: 'Awa', sexe: 'F', date_naissance: '2030-01-01' }, REF)).toContain('Date de naissance invalide.');
    expect(validerPatient({ nom: 'Diop', prenoms: 'Awa', sexe: 'F', telephone: '12' }, REF)).toContain('Téléphone : 9 chiffres attendus.');
    expect(validerPatient({ nom: 'Diop', prenoms: 'Awa', sexe: 'F', date_naissance: '1990-05-05', telephone: '771234567' }, REF)).toEqual([]);
  });
});
