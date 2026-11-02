import { describe, expect, it } from 'vitest';
import { acomptesDisponibles, controlerReglement, facturesOuvertes, journalTresorerie, joursRetard, resteDu, trancheRetard, type FactureOuverte } from './reglements-tiers';

const f = (p: Partial<FactureOuverte>): FactureOuverte => ({ id: 'a', numero: 'FA-1', tiers_id: 't1', date_facture: '2026-10-01', date_echeance: '2026-10-31',
  total_ttc: 1000, montant_paye: 0, statut: 'validee', comptabilisee: true, ...p });

describe('règlements tiers', () => {
  it('reste dû et factures ouvertes triées par échéance', () => {
    expect(resteDu(f({ total_ttc: 660800, montant_paye: 100000 }))).toBe(560800);
    const liste = facturesOuvertes([
      f({ id: '1', numero: 'B', date_echeance: '2026-12-01' }),
      f({ id: '2', numero: 'A', date_echeance: '2026-11-01' }),
      f({ id: '3', montant_paye: 1000, statut: 'payee' }),
      f({ id: '4', comptabilisee: false }),
      f({ id: '5', statut: 'annulee' }),
    ]);
    expect(liste.map(x => x.id)).toEqual(['2', '1']);
  });

  it('retard et tranches', () => {
    expect(joursRetard(f({ date_echeance: '2026-10-01' }), '2026-11-02')).toBe(32);
    expect(joursRetard(f({ date_echeance: '2026-12-01' }), '2026-11-02')).toBe(0);
    expect(joursRetard(f({ date_echeance: null }), '2026-11-02')).toBe(0);
    expect([0, 12, 45, 70, 200].map(trancheRetard)).toEqual(['non échu', '1-30 j', '31-60 j', '61-90 j', '+90 j']);
  });

  it('journal selon le compte de trésorerie', () => {
    expect(journalTresorerie('5711')).toBe('CA');
    expect(journalTresorerie('5211')).toBe('BQ');
    expect(journalTresorerie('5521')).toBe('BQ');
  });

  it('contrôles de saisie', () => {
    const a = f({ id: 'a', total_ttc: 1000, montant_paye: 400 });
    expect(controlerReglement({ factures: [a], montants: { a: 600 }, acompte: 0, compte: '521' })).toBeNull();
    expect(controlerReglement({ factures: [a], montants: { a: 601 }, acompte: 0, compte: '521' })).toMatch(/restant dû/);
    expect(controlerReglement({ factures: [a], montants: { a: 100 }, acompte: 0, compte: '6011' })).toMatch(/trésorerie/);
    expect(controlerReglement({ factures: [a, f({ id: 'b', tiers_id: 't2' })], montants: { a: 1, b: 1 }, acompte: 0, compte: '521' })).toMatch(/seul tiers/);
    expect(controlerReglement({ factures: [], montants: {}, acompte: 0, compte: '521' })).toMatch(/Aucun/);
    expect(controlerReglement({ factures: [], montants: {}, acompte: 5000, compte: '571' })).toBeNull();
  });

  it('acomptes disponibles', () => {
    const d = acomptesDisponibles(
      [{ id: 'r1', acompte: 50000 }, { id: 'r2', acompte: 0 }, { id: 'r3', acompte: 1000, annule_le: '2026-11-02' }, { id: 'r4', acompte: 300 }],
      [{ reglement_id: 'r1', origine: 'acompte', montant: 20000 }, { reglement_id: 'r1', origine: 'acompte', montant: 5000, annule_le: 'x' },
       { reglement_id: 'r4', origine: 'acompte', montant: 300 }],
    );
    expect(d).toEqual({ r1: 30000 });
  });
});
