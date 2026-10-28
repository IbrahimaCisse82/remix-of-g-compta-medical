import { describe, it, expect } from 'vitest';
import { inRange, aggBalance, calc, ACTIF, PASSIF, CR, TFT, pf, type BalanceLine } from './accounting';

const bl = (compte: string, p: Partial<BalanceLine> = {}): BalanceLine => ({
  compte, intitule: '', sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, ...p,
});

describe('inRange', () => {
  it('matche les préfixes de comptes SYSCOHADA', () => {
    expect(inRange('521000', [['521', '585']])).toBe(true);
    expect(inRange('411100', [['411', '4198']])).toBe(true);
    expect(inRange('7019', [['701', '701']])).toBe(true);
    expect(inRange('4752', [['475', '475']])).toBe(true);
    expect(inRange('701', [['701', '701']])).toBe(true);
    expect(inRange('601', [['701', '708']])).toBe(false);
  });

  it('gère les plages à 1 chiffre (classes)', () => {
    expect(inRange('311', [['31', '39']])).toBe(true);
    expect(inRange('401', [['31', '39']])).toBe(false);
  });
});

describe('aggBalance', () => {
  it("mode auto : soldes pour le bilan (classes 1-5), mouvements pour la gestion", () => {
    const balance = [
      bl('521', { sfd: 1000, sfc: 200 }),   // bilan → solde 800
      bl('701', { mc: 5000 }),               // gestion → mouvement crédit
    ];
    expect(aggBalance(balance, [['521', '521']], 'D')).toBe(800);
    expect(aggBalance(balance, [['701', '701']], 'C', 'n')).toBe(5000);
  });

  it('sens SC : solde signé (report à nouveau négatif possible)', () => {
    const balance = [bl('129', { sfd: 0, sfc: 300 })];
    expect(aggBalance(balance, [['121', '129']], 'SC')).toBe(-300);
  });

  it('mode n1 : utilise les soldes d\'ouverture (sd/sc)', () => {
    const balance = [bl('521', { sd: 700, sc: 100, sfd: 5000 })];
    expect(aggBalance(balance, [['521', '521']], 'D', 'n1')).toBe(700);
  });
});

describe('pf (parsing de montants saisis)', () => {
  it('accepte virgule, espaces et espaces insécables', () => {
    expect(pf('1 250 000')).toBe(1250000);
    expect(pf('1 250,50')).toBe(1250.5);
    expect(pf('')).toBe(0);
  });
});

describe('mapping DSF — Bilan équilibré', () => {
  // Balance synthétique : capital 1 000 000, banque 600 000, stock 400 000
  const balance = [
    bl('101', { sfc: 1000000 }),
    bl('521', { sfd: 600000 }),
    bl('311', { sfd: 400000 }),
  ];

  it('TOTAL ACTIF = TOTAL PASSIF', () => {
    const a = calc(balance, ACTIF);
    const p = calc(balance, PASSIF);
    expect(a.BZ).toBe(1000000);
    expect(p.DZ).toBe(1000000);
    expect(a.BZ).toBe(p.DZ);
  });

  it('agrège correctement les sous-totaux (actif immobilisé, circulant, trésorerie)', () => {
    const a = calc(balance, ACTIF);
    expect(a.AZ).toBe(0);          // pas d\'immobilisations
    expect(a.BB).toBe(400000);     // stocks
    expect(a.BT).toBe(600000);     // trésorerie actif
  });
});

describe('mapping DSF — Compte de résultat', () => {
  // CA 701 = 1 000 000, achats 601 = 400 000, personnel 661 = 200 000, IS 891 = 30 000
  const balance = [
    bl('701', { mc: 1000000 }),
    bl('601', { md: 400000 }),
    bl('661', { md: 200000 }),
    bl('891', { md: 30000 }),
  ];

  it('chaîne de soldes intermédiaires SYSCOHADA', () => {
    const v = calc(balance, CR);
    expect(v.TA).toBe(1000000);
    expect(v.XA).toBe(600000);                       // marge commerciale
    expect(v.XB).toBe(1000000);                      // chiffre d\'affaires
    expect(v.XD).toBe(400000);                       // EBE = VA − personnel
    expect(v.XE).toBe(400000);                       // résultat d\'exploitation
    expect(v.XI).toBe(370000);                       // résultat net après IS
  });

  it('résultat net nul si aucune ligne', () => {
    const v = calc([], CR);
    expect(v.XI).toBe(0);
  });
});

describe('mapping DSF — TFT (contrôle de cohérence)', () => {
  it('trésorerie de clôture = ouverture + variation', () => {
    const balance = [
      bl('521', { sd: 500000, sfd: 650000 }),  // ouverture 500 k, clôture 650 k
    ];
    const extra = calc(balance, CR);
    const v = calc(balance, TFT, extra);
    expect(v.ZA).toBe(500000);                 // trésorerie au 1er janvier
    expect(v.ZH).toBe(v.ZG + v.ZA);            // contrôle ZH = G + A
  });
});
