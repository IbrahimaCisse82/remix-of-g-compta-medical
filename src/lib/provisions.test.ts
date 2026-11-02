import { describe, it, expect } from 'vitest';
import {
  NATURES_PROVISIONS, natureProvision,
  lignesDotationProvision, lignesRepriseProvision,
  validerMontantReprise, encoursProvisions,
} from './provisions';

const ctx = { entreprise_id: 'e1', exercice_id: 'x1', date: '2026-12-31' };
const prov = {
  code: 'LIT01', libelle: 'Litige fiscal',
  compte_provision: '191', compte_dotation: '6911', compte_reprise: '7911',
  montant_actuel: 500000,
};

describe('catalogue des natures', () => {
  it('couvre les 6 natures SYSCOHADA avec des comptes distincts', () => {
    expect(NATURES_PROVISIONS).toHaveLength(6);
    const cps = NATURES_PROVISIONS.map(n => n.cp);
    expect(new Set(cps).size).toBe(6);
  });

  it('chaque nature a dotation en charge (6/8) et reprise en produit (7/8)', () => {
    for (const n of NATURES_PROVISIONS) {
      expect(n.cd).toMatch(/^[68]/);
      expect(n.cr).toMatch(/^[78]/);
    }
  });

  it('natureProvision retrouve une nature par code', () => {
    expect(natureProvision('depreciation_creance')?.cp).toBe('491');
    expect(natureProvision('inconnu')).toBeUndefined();
  });
});

describe('lignesDotationProvision', () => {
  it('génère une écriture OD équilibrée (D dotation / C provision)', () => {
    const lignes = lignesDotationProvision(prov, ctx);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({ journal_code: 'OD', compte: '6911', debit: 500000, credit: 0 });
    expect(lignes[1]).toMatchObject({ journal_code: 'OD', compte: '191', debit: 0, credit: 500000 });
    const d = lignes.reduce((s, l) => s + l.debit, 0);
    const c = lignes.reduce((s, l) => s + l.credit, 0);
    expect(d).toBe(c);
  });
});

describe('reprises', () => {
  it('validerMontantReprise borne le montant à l\'encours', () => {
    expect(validerMontantReprise(100, 500)).toBeNull();
    expect(validerMontantReprise(0, 500)).toBe('Montant invalide');
    expect(validerMontantReprise(-10, 500)).toBe('Montant invalide');
    expect(validerMontantReprise(501, 500)).toBe('Montant invalide');
  });

  it('lignesRepriseProvision : D provision / C reprise, équilibrée', () => {
    const lignes = lignesRepriseProvision(prov, 200000, ctx);
    expect(lignes[0]).toMatchObject({ compte: '191', debit: 200000 });
    expect(lignes[1]).toMatchObject({ compte: '7911', credit: 200000 });
    expect(lignes.reduce((s, l) => s + l.debit, 0)).toBe(lignes.reduce((s, l) => s + l.credit, 0));
  });

  it('lignesRepriseProvision rejette un montant supérieur à l\'encours', () => {
    expect(() => lignesRepriseProvision(prov, 600000, ctx)).toThrow();
  });
});

describe('encoursProvisions', () => {
  it('exclut les provisions totalement reprises', () => {
    expect(encoursProvisions([
      { statut: 'active', montant_actuel: 100 },
      { statut: 'reprise_partielle', montant_actuel: 50 },
      { statut: 'reprise_totale', montant_actuel: 0 },
    ])).toBe(150);
  });
});
