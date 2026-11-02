import { describe, expect, it } from 'vitest';
import { cleOperation, effetSolde, lignesMobileMoney, lireCsvMobileMoney } from './mobile-money';

const moyen = { compte_associe: '5211', libelle: 'Wave' };
const base = { reference: 'W1', contrepartie: null, telephone: null, libelle: null, date_operation: '2026-11-02' };

describe('Mobile Money', () => {
  it('encaissement : frais déduits de la somme reçue, créance soldée du montant payé', () => {
    const l = lignesMobileMoney({ ...base, sens: 'entree', montant: 10000, frais: 100 }, moyen, { compte: '411', intitule: 'Clients' }, 'Enc', 'Frais');
    expect(l).toEqual([
      expect.objectContaining({ compte: '5211', debit: 9900, credit: 0 }),
      expect.objectContaining({ compte: '6318', debit: 100, credit: 0 }),
      expect.objectContaining({ compte: '411', debit: 0, credit: 10000 }),
    ]);
    expect(effetSolde({ sens: 'entree', montant: 10000, frais: 100 })).toBe(9900);
  });
  it('décaissement : frais ajoutés à la sortie', () => {
    const l = lignesMobileMoney({ ...base, sens: 'sortie', montant: 5000, frais: 50 }, moyen, { compte: '401', intitule: 'Fournisseurs' }, 'Pai', 'Frais');
    const d = l.reduce((s, x) => s + x.debit, 0), c = l.reduce((s, x) => s + x.credit, 0);
    expect(d).toBe(c);
    expect(l.find(x => x.compte === '5211')?.credit).toBe(5050);
    expect(effetSolde({ sens: 'sortie', montant: 5000, frais: 50 })).toBe(-5050);
  });
  it('refuse des frais supérieurs à l’encaissement', () => {
    expect(() => lignesMobileMoney({ ...base, sens: 'entree', montant: 100, frais: 100 }, moyen, { compte: '411', intitule: '' }, '', '')).toThrow();
  });
  it('lit un CSV point-virgule avec décimales à virgule et montants signés', () => {
    const { operations, erreurs } = lireCsvMobileMoney('﻿Date;Référence;Montant;Frais;Libellé\n02/11/2026;T1;10 000,00;100,00;Consultation\n03/11/2026;T2;-2 500;25;Achat\nxx;T3;1;0;\n');
    expect(erreurs).toEqual(['Ligne 4 : date illisible']);
    expect(operations).toEqual([
      expect.objectContaining({ date_operation: '2026-11-02', sens: 'entree', montant: 10000, frais: 100, reference: 'T1' }),
      expect.objectContaining({ date_operation: '2026-11-03', sens: 'sortie', montant: 2500, frais: 25 }),
    ]);
  });
  it('lit un CSV virgule avec colonne sens et guillemets', () => {
    const { operations } = lireCsvMobileMoney('date,type,montant,description\n2026-11-02,Paiement,3000,"Loyer, novembre"\n');
    expect(operations[0]).toMatchObject({ sens: 'sortie', montant: 3000, libelle: 'Loyer, novembre' });
  });
  it('clé de doublon stable', () => {
    expect(cleOperation('m', { date_operation: '2026-11-02', sens: 'entree', montant: 10000, reference: ' T1 ' }))
      .toBe(cleOperation('m', { date_operation: '2026-11-02', sens: 'entree', montant: 10000.001, reference: 't1' }));
  });
});
