import { describe, expect, it } from 'vitest';
import { ajouterJours, ajouterMois, estWeekEnd, jourOuvre, jourSemaine, bornes, chronologie, courbesConstantes, echeance, tendance, validerControle } from './suivi';

describe('courbes de constantes', () => {
  const mesures = [
    { created_at: '2026-10-20T09:00:00Z', ta_sys: 160, ta_dia: 95, poids: 82, glycemie: null },
    { created_at: '2026-09-01T09:00:00Z', ta_sys: 170, ta_dia: 100, poids: '83,5', temperature: 37 },
    { created_at: '2026-11-05T09:00:00Z', ta_sys: 140, ta_dia: 85, glycemie: 1.2 },
  ];
  it('garde les constantes mesurées au moins deux fois, dans l’ordre chronologique', () => {
    const c = courbesConstantes(mesures);
    expect(c.map(x => x.id)).toEqual(['ta', 'poids']);
    expect(c[0].series[0].points.map(p => p.valeur)).toEqual([170, 160, 140]);
    expect(c[1].series[0].points.map(p => p.valeur)).toEqual([83.5, 82]);
  });
  it('inclut la zone normale dans les bornes', () => {
    const [min, max] = bornes(courbesConstantes(mesures)[0]);
    expect(min).toBeLessThan(60); expect(max).toBeGreaterThan(170);
  });
  it('donne la tendance des deux dernières mesures', () => {
    expect(tendance([{ date: 'a', valeur: 160 }, { date: 'b', valeur: 140 }])).toBe('baisse');
    expect(tendance([{ date: 'a', valeur: 82 }, { date: 'b', valeur: 82.5 }])).toBe('stable');
    expect(tendance([{ date: 'a', valeur: 85 }, { date: 'b', valeur: 83.5 }])).toBe('baisse');
    expect(tendance([{ date: 'a', valeur: 1 }])).toBeNull();
  });
});

describe('dates de contrôle', () => {
  it('ajoute jours et mois sans déborder', () => {
    expect(ajouterJours('2026-12-28', 7)).toBe('2027-01-04');
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28');
    expect(ajouterMois('2026-11-11', 3)).toBe('2027-02-11');
  });
  it('valide la saisie', () => {
    expect(validerControle({ date: '2026-11-25', heure: '', motif: 'Contrôle TA' }, '2026-11-11')).toEqual([]);
    expect(validerControle({ date: '2026-11-10', heure: '', motif: 'Contrôle TA' }, '2026-11-11')).toHaveLength(1);
    expect(validerControle({ date: '2026-11-25', heure: '25:00', motif: 'x' }, '2026-11-11')).toHaveLength(2);
    expect(validerControle({ date: '', heure: '', motif: 'Contrôle' }, '2026-11-11')).toEqual(['Choisissez la date du contrôle.']);
  });
  it('décrit l’échéance', () => {
    expect(echeance('2026-11-09', '2026-11-11')).toEqual({ libelle: 'En retard de 2 jours', etat: 'retard' });
    expect(echeance('2026-11-11', '2026-11-11').etat).toBe('jour');
    expect(echeance('2026-11-12', '2026-11-11').libelle).toBe('Demain');
    expect(echeance('2026-12-11', '2026-11-11')).toEqual({ libelle: 'Dans 30 jours', etat: 'futur' });
  });
});

it('classe la chronologie du plus récent au plus ancien', () => {
  const c = chronologie([
    { type: 'ordonnance', date: '2026-10-01T10:00:00Z', id: 'o', numero: 'ORD-1', medicaments: 2 },
    { type: 'controle', date: '2026-11-20', id: 'k', motif: 'TA', statut: 'prevu', prevu_le: '2026-11-20' },
    { type: 'consultation', date: '2026-10-01T09:00:00Z', id: 'c', motif: 'HTA', diagnostic: 'HTA', conduite: null, praticien: 'Dr A', statut: 'cloturee' },
  ]);
  expect(c.map(e => e.id)).toEqual(['k', 'o', 'c']);
});

describe('jours ouvrés', () => {
  it('reporte samedi et dimanche au lundi', () => {
    expect(jourSemaine('2026-12-12')).toBe('samedi');
    expect(estWeekEnd('2026-12-12')).toBe(true);
    expect(jourOuvre('2026-12-12')).toBe('2026-12-14');
    expect(jourOuvre('2026-12-13')).toBe('2026-12-14');
    expect(jourOuvre('2026-12-11')).toBe('2026-12-11');
  });
});
