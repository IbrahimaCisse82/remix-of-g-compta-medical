import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAIE_PARAMS, calculerPaie, calculerIRAnnuelParPart,
  calculerTRIMF, getTauxAnciennete, genererEcrituresPaie, type Employee,
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
  it('compte aussi la première tranche par part', () => {
    expect(calculerTRIMF(30000, 2)).toBeCloseTo(150);
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
  it('plafonne à 25 %', () => {
    expect(getTauxAnciennete(32)).toBeCloseTo(0.25);
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

describe('primes de garde (lien G-Santé › Personnel)', () => {
  it('entrent dans le brut et donc dans les cotisations', () => {
    const emp = { matricule: 'G1', prenom: 'Awa', nom: 'Test', sexe: 'F' as const, situation_famille: 'Célibataire', femmes: 0, enfants: 0, statut: 'employés', contrat: 'CDI', salaire_base: 200000, sursalaire: 0 };
    const sans = calculerPaie(emp, DEFAULT_PAIE_PARAMS, new Date(2026, 9, 28));
    const avec = calculerPaie({ ...emp, prime_gardes: 20000 }, DEFAULT_PAIE_PARAMS, new Date(2026, 9, 28));
    expect(avec.prime_gardes).toBe(20000);
    expect(avec.brut - sans.brut).toBe(20000);
    expect(avec.ipres_rg_s).toBeGreaterThan(sans.ipres_rg_s);
    expect(calculerPaie({ ...emp, prime_gardes: -5 }, DEFAULT_PAIE_PARAMS).prime_gardes).toBe(0);
  });
});

describe('Paie — écriture du journal PA (SYSCOHADA révisé)', () => {
  const ref = new Date('2026-02-28');
  const lot = [calculerPaie(emp({ salaire_base: 312345 }), DEFAULT_PAIE_PARAMS, ref), calculerPaie(emp({ statut: 'cadres', salaire_base: 987654, enfants: 2 }), DEFAULT_PAIE_PARAMS, ref)];
  const lignes = genererEcrituresPaie(lot, '2026-02', 'x', 'e');

  it('est équilibrée, en FCFA entiers et datée de la fin du mois', () => {
    const d = lignes.reduce((s, l) => s + l.debit, 0), c = lignes.reduce((s, l) => s + l.credit, 0);
    expect(d).toBe(c);
    expect(lignes.every(l => Number.isInteger(l.debit) && Number.isInteger(l.credit))).toBe(true);
    expect(new Set(lignes.map(l => l.date_ecriture))).toEqual(new Set(['2026-02-28']));
  });
  it('impute sur les comptes du plan révisé', () => {
    const comptes = new Set(lignes.map(l => l.compte));
    for (const x of ['6611', '6634', '6641', '6413', '4471', '4313', '4311', '4312', '4472', '422']) expect(comptes.has(x)).toBe(true);
    for (const x of ['421000', '648000', '432100', '431100', '664200']) expect(comptes.has(x)).toBe(false);
  });
  it('fait apparaître le net dû à quelques francs près du total des bulletins', () => {
    const net = lignes.find(l => l.compte === '422')!.credit;
    expect(Math.abs(net - lot.reduce((s, b) => s + b.net_payer, 0))).toBeLessThanOrEqual(5);
  });
});

describe('IR : réduction pour charges de famille (CGI art. 173-174)', () => {
  it('exemple chiffré : cadre marié, conjoint sans revenu, 2 enfants, 3 ans, base 400 000', () => {
    const b = calculerPaie(emp({
      situation_famille: 'Marié(e)', femmes: 1, enfants: 2, statut: 'cadres',
      date_entree: '2023-06-01', salaire_base: 400000,
    }), DEFAULT_PAIE_PARAMS, new Date('2026-06-30'));
    expect(b.brut).toBe(412000);
    expect(b.parts_ir).toBe(3);
    expect(b.ir).toBe(44950);          // (939 400 − 400 000 minimum de réduction) / 12
    expect(b.trimf).toBe(2000);        // 12 000 × 2 parts / 12
    expect(b.ipres_rg_s).toBeCloseTo(23072);
    expect(b.ipres_rc_s).toBeCloseTo(9888);
  });
  it('n’applique pas de quotient : célibataire et marié ont le même impôt brut', () => {
    const c = calculerPaie(emp({ salaire_base: 600000 }), DEFAULT_PAIE_PARAMS, new Date('2021-06-30'));
    expect(c.parts_ir).toBe(1);
    // 600 000 × 12 = 7 200 000 − 900 000 = 6 300 000 → 924 000 + 2 300 000 × 35 % = 1 729 000 / 12
    expect(c.ir).toBe(Math.round(1729000 / 12));
  });
  it('plafonne les parts à 5', () => {
    const b = calculerPaie(emp({ situation_famille: 'Marié(e)', femmes: 1, enfants: 9 }), DEFAULT_PAIE_PARAMS, new Date('2026-06-30'));
    expect(b.parts_ir).toBe(5);
  });
  it('veuf avec enfant : 1,5 + 0,5 par enfant', () => {
    const b = calculerPaie(emp({ situation_famille: 'Veuf(ve)', enfants: 1 }), DEFAULT_PAIE_PARAMS, new Date('2026-06-30'));
    expect(b.parts_ir).toBe(2);
  });
});
