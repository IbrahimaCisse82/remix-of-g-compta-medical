import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAIE_PARAMS, calculerPaie, calculerIRAnnuelParPart,
  calculerTRIMF, getTauxAnciennete, type Employee,
} from './paie';

const emp = (over: Partial<Employee> = {}): Employee => ({
  matricule: 'E001', prenom: 'A', nom: 'B', sexe: 'M',
  situation_famille: 'Célibataire', femmes: 0, enfants: 0,
  statut: 'employés', contrat: 'CDI',
  date_entree: '2020-01-01', salaire_base: 300000, sursalaire: 0,
  ...over,
});

describe('Paie — barème IRPP Sénégal', () => {
  it('renvoie 0 pour base ≤ 630 000 FCFA', () => {
    expect(calculerIRAnnuelParPart(600000)).toBe(0);
    expect(calculerIRAnnuelParPart(630000)).toBe(0);
  });
  it('applique la tranche 20% entre 630k et 1.5M', () => {
    expect(calculerIRAnnuelParPart(1000000)).toBeCloseTo((1000000 - 630000) * 0.20);
  });
  it('applique la tranche 40% au-delà de 13.5M', () => {
    expect(calculerIRAnnuelParPart(14000000)).toBeCloseTo(4359000 + 500000 * 0.40);
  });
});

describe('Paie — TRIMF', () => {
  it('renvoie 900/12 pour très bas revenus', () => {
    expect(calculerTRIMF(30000, 1)).toBeCloseTo(75);
  });
  it('utilise la tranche 12 000 F par part pour 200k brut', () => {
    expect(calculerTRIMF(200000, 1)).toBeCloseTo(12000 / 12);
  });
});

describe('Paie — ancienneté', () => {
  it('renvoie 0% avant 2 ans', () => {
    expect(getTauxAnciennete(1)).toBe(0);
  });
  it('renvoie n% pour n années', () => {
    expect(getTauxAnciennete(5)).toBeCloseTo(0.05);
  });
});

describe('Paie — bulletin complet', () => {
  const ref = new Date('2026-06-30');

  it('calcule un net cohérent pour un employé simple', () => {
    const b = calculerPaie(emp({ salaire_base: 300000, date_entree: '2024-06-30' }), DEFAULT_PAIE_PARAMS, ref);
    expect(b.brut).toBeGreaterThanOrEqual(300000);
    expect(b.net_payer).toBeGreaterThan(0);
    expect(b.net_payer).toBeLessThan(b.brut + b.transport);
    expect(b.charges_patronales).toBeGreaterThan(0);
  });

  it('applique IPRES RCC uniquement aux cadres', () => {
    const nonCadre = calculerPaie(emp({ statut: 'employés' }), DEFAULT_PAIE_PARAMS, ref);
    const cadre = calculerPaie(emp({ statut: 'cadres' }), DEFAULT_PAIE_PARAMS, ref);
    expect(nonCadre.ipres_rc_s).toBe(0);
    expect(cadre.ipres_rc_s).toBeGreaterThan(0);
  });

  it('respecte le plafond IPRES régime général', () => {
    const b = calculerPaie(emp({ salaire_base: 2000000 }), DEFAULT_PAIE_PARAMS, ref);
    const p = DEFAULT_PAIE_PARAMS.IPRES_RG;
    const expectedS = (p.plafond as number) * p.taux * p.tauxSalarial;
    expect(b.ipres_rg_s).toBeCloseTo(expectedS, 0);
  });

  it('applique 1.5 parts au marié sans enfant', () => {
    const b = calculerPaie(emp({ situation_famille: 'Marié(e)' }), DEFAULT_PAIE_PARAMS, ref);
    expect(b.parts_ir).toBe(1.5);
  });
});
