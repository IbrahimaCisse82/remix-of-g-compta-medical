import { describe, expect, it } from 'vitest';
import { referenceValide } from './catalogue-analyse';

const base = { sexe: '', ageMin: '0', ageMax: '150', bas: '', haut: '', critiqueBas: '', critiqueHaut: '' };

describe('valeurs de référence saisies par le biologiste', () => {
  it('refuse une saisie sans borne normale', () => {
    expect(referenceValide(base)).toEqual({ erreur: 'Indiquez au moins une borne normale' });
  });
  it('refuse une borne basse supérieure à la borne haute', () => {
    expect(referenceValide({ ...base, bas: '5', haut: '3' })).toHaveProperty('erreur');
  });
  it('refuse un seuil critique bas au-dessus de la borne basse', () => {
    expect(referenceValide({ ...base, bas: '3', haut: '5', critiqueBas: '4' })).toHaveProperty('erreur');
  });
  it('accepte la virgule décimale et convertit les âges en jours', () => {
    const r = referenceValide({ ...base, sexe: 'F', ageMin: '18', ageMax: '65', bas: '0,7', haut: '1,1', critiqueBas: '0,4', critiqueHaut: '2,5' });
    expect(r).toEqual({ valeur: { sexe: 'F', age_min_jours: 6575, age_max_jours: 23741, bas: 0.7, haut: 1.1, critique_bas: 0.4, critique_haut: 2.5 } });
  });
  it('refuse une tranche d’âge inversée', () => {
    expect(referenceValide({ ...base, ageMin: '40', ageMax: '20', bas: '1' })).toHaveProperty('erreur');
  });
});
