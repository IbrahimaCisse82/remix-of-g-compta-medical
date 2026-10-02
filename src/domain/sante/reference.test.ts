import { describe, expect, it } from 'vitest';
import { ageEnJours, calculerDrapeau, choisirReference, deltaCheck, transitionAutorisee, type ValeurReference } from './reference';

const base = { age_min_jours: 0, age_max_jours: 54750, critique_bas: null, critique_haut: null };
const refs: ValeurReference[] = [
  { ...base, sexe: 'M', bas: 13, haut: 17, critique_bas: 7, critique_haut: 20 },
  { ...base, sexe: 'F', bas: 12, haut: 16, critique_bas: 7, critique_haut: 20 },
  { ...base, sexe: null, age_max_jours: 365, bas: 10, haut: 14 },
];

describe('valeurs de référence', () => {
  it('choisit selon le sexe', () => {
    expect(choisirReference(refs, 'F', 10000)?.bas).toBe(12);
    expect(choisirReference(refs, 'M', 10000)?.bas).toBe(13);
  });
  it('sexe exact prioritaire sur une tranche plus étroite', () => {
    expect(choisirReference(refs, 'F', 100)?.bas).toBe(12);
    expect(choisirReference([refs[2]], 'F', 100)?.bas).toBe(10);
  });
  it('aucune référence hors tranche', () => expect(choisirReference([refs[2]], 'M', 1000)).toBeNull());
  it('drapeaux H/L/critiques', () => {
    const r = refs[1];
    expect(calculerDrapeau(14, r)).toBe('N');
    expect(calculerDrapeau(11, r)).toBe('L');
    expect(calculerDrapeau(17, r)).toBe('H');
    expect(calculerDrapeau(6, r)).toBe('LL');
    expect(calculerDrapeau(21, r)).toBe('HH');
    expect(calculerDrapeau(null, r)).toBe('N');
  });
  it('âge en jours', () => expect(ageEnJours('2026-01-01', new Date('2026-01-11T12:00:00Z'))).toBe(10));
  it('delta-check', () => {
    expect(deltaCheck(15, 10)).toEqual({ variation: 50, alerte: true });
    expect(deltaCheck(11, 10)?.alerte).toBe(false);
    expect(deltaCheck(11, null)).toBeNull();
  });
  it('transitions de statut', () => {
    expect(transitionAutorisee('enregistree', 'prelevee')).toBe(true);
    expect(transitionAutorisee('enregistree', 'validee')).toBe(false);
    expect(transitionAutorisee('validee', 'en_analyse')).toBe(false);
  });
});
