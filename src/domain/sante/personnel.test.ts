import { describe, expect, it } from 'vitest';
import { aValider, construireCreneau, dureeHeures, joursDuMois, verifierCreneau } from './personnel';

describe('construireCreneau', () => {
  it('une garde de nuit se termine le lendemain', () => {
    const c = construireCreneau('2026-10-20', '20:00', '08:00');
    expect(dureeHeures(c)).toBe(12);
    expect(new Date(c.fin).getDate()).toBe(21);
  });
  it('respecte une date de fin explicite (congé)', () => {
    expect(dureeHeures(construireCreneau('2026-10-20', '00:00', '00:00', '2026-10-25'))).toBe(120);
  });
});

describe('verifierCreneau', () => {
  const garde = { id: 'g', employee_id: 'e1', statut: 'prevu', ...construireCreneau('2026-10-20', '20:00', '08:00') };
  it('détecte le chevauchement pour la même personne seulement', () => {
    const poste = { employee_id: 'e1', ...construireCreneau('2026-10-21', '07:00', '15:00') };
    expect(verifierCreneau(poste, [garde])).toMatch(/Chevauchement/);
    expect(verifierCreneau({ ...poste, employee_id: 'e2' }, [garde])).toBeNull();
  });
  it('enchaîner sans recouvrement est permis', () => {
    expect(verifierCreneau({ employee_id: 'e1', ...construireCreneau('2026-10-21', '08:00', '16:00') }, [garde])).toBeNull();
  });
  it('ignore les créneaux annulés et le créneau modifié lui-même', () => {
    expect(verifierCreneau({ ...garde }, [garde])).toBeNull();
    expect(verifierCreneau({ employee_id: 'e1', ...construireCreneau('2026-10-20', '22:00', '23:00') }, [{ ...garde, statut: 'annule' }])).toBeNull();
  });
  it('refuse personne absente, durée nulle ou trop longue', () => {
    expect(verifierCreneau({ debut: garde.debut, fin: garde.fin }, [])).toMatch(/personne/);
    expect(verifierCreneau({ employee_id: 'e1', debut: garde.debut, fin: garde.debut }, [])).toMatch(/postérieure/);
    expect(verifierCreneau({ employee_id: 'e1', ...construireCreneau('2026-10-01', '00:00', '00:00', '2026-11-15') }, [])).toMatch(/31 jours/);
  });
});

describe('aValider / joursDuMois', () => {
  it('ne propose que les créneaux de travail terminés et non validés', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    const r = aValider([
      { id: 1, type: 'garde', statut: 'prevu', fin: '2026-10-21T08:00:00Z' },
      { id: 2, type: 'garde', statut: 'prevu', fin: '2026-10-23T08:00:00Z' },
      { id: 3, type: 'conge', statut: 'prevu', fin: '2026-10-21T08:00:00Z' },
      { id: 4, type: 'poste', statut: 'effectue', fin: '2026-10-21T08:00:00Z' },
    ], now);
    expect(r.map(x => x.id)).toEqual([1]);
  });
  it('liste les jours du mois', () => {
    expect(joursDuMois(2026, 2)).toHaveLength(28);
    expect(joursDuMois(2026, 10)[30]).toBe('2026-10-31');
  });
});
