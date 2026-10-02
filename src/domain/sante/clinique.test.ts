import { describe, it, expect } from 'vitest';
import { alertesConstantes, classeImc, creneaux, imc, transitionAutorisee, validerOrdonnance } from './clinique';

describe('module clinique', () => {
  it('transitions de rendez-vous', () => {
    expect(transitionAutorisee('planifie', 'arrive')).toBe(true);
    expect(transitionAutorisee('arrive', 'en_consultation')).toBe(true);
    expect(transitionAutorisee('planifie', 'termine')).toBe(false);
    expect(transitionAutorisee('termine', 'planifie')).toBe(false);
    expect(transitionAutorisee('absent', 'arrive')).toBe(false);
  });
  it('IMC', () => {
    expect(imc(70, 175)).toBe(22.9);
    expect(imc(0, 175)).toBeNull();
    expect(classeImc(31)).toBe('Obésité');
    expect(classeImc(17)).toBe('Maigreur');
  });
  it('alertes constantes', () => {
    expect(alertesConstantes({ ta_sys: 160, ta_dia: 95, temperature: 38.5 })).toEqual(['Tension artérielle élevée', 'Fièvre']);
    expect(alertesConstantes({ ta_sys: 120, ta_dia: 80, temperature: 37, spo2: 98 })).toEqual([]);
  });
  it('ordonnance', () => {
    expect(validerOrdonnance([{ medicament: '', posologie: '' }])).toEqual(['Ajoutez au moins un médicament.']);
    expect(validerOrdonnance([{ medicament: 'Paracétamol', posologie: '' }])).toEqual(['Ligne 1 : posologie manquante.']);
    expect(validerOrdonnance([{ medicament: 'Paracétamol', posologie: '1 cp x3/j' }])).toEqual([]);
  });
  it('créneaux', () => {
    expect(creneaux(8, 9, 20)).toEqual(['08:00', '08:20', '08:40']);
  });
});
