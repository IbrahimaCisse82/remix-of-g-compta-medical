/**
 * Recette officielle : Guide d'application du SYSCOHADA révisé (OHADA, mai 2017), Application 127
 * « Modèle type d'un jeu complet d'états financiers », pages 343 à 358.
 * Les balances N-1 et N du guide (pages 343-350) sont passées dans le moteur de l'application ; chaque ligne du
 * bilan, du compte de résultat et du tableau des flux de trésorerie doit égaler le montant publié (pages 356-358).
 * Les balances du guide présentent les mouvements hors à-nouveaux : ils sont ajoutés comme le fait l'import.
 * Codes du passif : ceux du modèle DGID (CD primes, CE écarts de réévaluation, CF réserves indisponibles,
 * CH report à nouveau, CJ résultat, CL subventions, CM provisions réglementées) ; la page 356 du guide décale ces
 * codes d'un rang mais les libellés et les montants sont les mêmes.
 */
import { describe, expect, it } from 'vitest';
import data from './__fixtures__/guide-syscohada-app127-balances.json';
import { calc, calculateActif, CR, PASSIF, type BalanceLine } from './accounting';
import { calculerTft } from './tft-syscohada';
import { controlesSyscohada } from './conformite-syscohada';
import { calculerLiasse } from './liasse-dgid';

const versApplication = (b: typeof data.n): BalanceLine[] => b.map(l => ({ ...l, md: l.md + l.sd, mc: l.mc + l.sc }));
const N = versApplication(data.n), N1 = versApplication(data.n1);

const ACTIF_N = {
  brut: { AD: 4650000, AF: 3050000, AG: 1600000, AI: 1012410344, AJ: 38673950, AK: 741411100, AL: 73328267, AM: 82947027, AN: 76050000, AP: 20000000,
    AQ: 4419790, AS: 4419790, AZ: 1041480134, BA: 2140000, BB: 18560138, BG: 206981960, BH: 857612, BI: 167938821, BJ: 38185527, BK: 227682098,
    BS: 123097127, BT: 123097127, BU: 15000000, BZ: 1407259359 },
  amort: { AI: 321157361, AK: 160048641, AL: 71328267, AM: 35540453, AN: 54240000, AZ: 321157361, BG: 31677520, BI: 31677520, BK: 31677520, BZ: 352834881 },
  net: { AD: 4650000, AF: 3050000, AG: 1600000, AI: 691252983, AJ: 38673950, AK: 581362459, AL: 2000000, AM: 47406574, AN: 21810000, AP: 20000000,
    AQ: 4419790, AS: 4419790, AZ: 720322773, BA: 2140000, BB: 18560138, BG: 175304440, BH: 857612, BI: 136261301, BJ: 38185527, BK: 196004578,
    BS: 123097127, BT: 123097127, BU: 15000000, BZ: 1054424478 },
};
const ACTIF_N1 = { AD: 2650000, AF: 1050000, AG: 1600000, AI: 203544627, AJ: 35173950, AK: 136097141, AL: 0, AM: 32086036, AN: 187500, AQ: 4548658,
  AS: 4548658, AZ: 210743285, BA: 380000, BB: 15868433, BG: 144512218, BH: 700000, BI: 140683833, BJ: 3128385, BK: 160760651, BS: 74584157,
  BT: 74584157, BZ: 446088093 };
const PASSIF_N = { CA: 400000000, CB: -100000000, CE: 3500000, CF: 20000000, CH: 76069991, CJ: 215389710, CL: 2000000, CM: 40000000, CP: 656959701,
  DA: 94699075, DC: 62116366, DD: 156815441, DF: 813775142, DH: 156649942, DJ: 38210222, DK: 42668247, DM: 620000, DP: 238148411, DT: 0,
  DV: 2500925, DZ: 1054424478 };
const PASSIF_N1 = { CA: 100000000, CF: 20000000, CH: 47450317, CJ: 118619674, CP: 286069991, DA: 2200000, DC: 54864697, DD: 57064697,
  DF: 343134688, DH: 399942, DJ: 55894206, DK: 36010298, DM: 10648959, DP: 102953405, DZ: 446088093 };
const CR_N = { TA: 110000000, RA: -75000000, RB: 5000000, XA: 40000000, TB: 1918144745, TC: 12672000, TD: 1130000, XB: 2041946745, TF: 4500000,
  TH: 3436978, TI: 3233550, RC: -928303692, RD: 106416, RE: -158266959, RF: -2414711, RG: -329146672, RH: -72599329, RI: -3135200, RJ: -4263929,
  XC: 485093197, RK: -218217093, XD: 266876104, RL: -26511313, XE: 240364791, TK: 7500000, RM: -3500000, XF: 4000000, XG: 244364791,
  TN: 127119, TO: 2000000, RO: 0, XH: 2127119, RS: -31102200, XI: 215389710 };
const CR_N1 = { TA: 0, TB: 1857424110, TC: 12804000, TD: 1598780, XB: 1871826890, TH: 11486537, TI: 5817880, RC: -954585472, RD: -2830600,
  RE: -161120517, RF: 1884647, RG: -329073556, RH: -60787379, RI: -110000, RJ: -67670, XC: 382440760, RK: -208852251, XD: 173588509,
  RL: -31615755, XE: 141972754, TN: 350000, RO: -291667, XH: 58333, RS: -23411413, XI: 118619674 };
const TFT_N = { ZA: 74584157, FA: 241773904, FB: -2000000, FC: -2691705, FD: -45792222, FE: -21054994, ZB: 170234983, FF: -2000000, FG: -327218000,
  FH: -601175, FI: 367119, FJ: 730043, ZC: -328722013, FK: 200000000, FL: 2000000, FN: -90000000, ZD: 112000000, FO: 100000000, FQ: -5000000,
  ZE: 95000000, ZF: 207000000, ZG: 48512970, ZH: 123097127 };
const TFT_N1 = { ZA: 33595404, FA: 150177096, FC: 945953, FD: -25371738, FE: -27602541, ZB: 98148770, FG: -17971503, FH: -958379, FI: 590000,
  FJ: 1179865, ZC: -17160017, FN: -40000000, ZD: -40000000, ZE: 0, ZF: -40000000, ZG: 40988753, ZH: 74584157 };

const ecarts = (calcule: Record<string, number>, attendu: Record<string, number>) =>
  Object.entries(attendu).filter(([k, v]) => Math.round(calcule[k] ?? 0) !== v).map(([k, v]) => `${k} : ${Math.round(calcule[k] ?? 0)} au lieu de ${v}`);

describe('Guide SYSCOHADA révisé — Application 127 (jeu complet d’états financiers)', () => {
  it('balances du guide équilibrées et extraites sans perte', () => {
    const t = (b: typeof data.n, k: 'sd' | 'sc' | 'md' | 'mc' | 'sfd' | 'sfc') => b.reduce((s, l) => s + l[k], 0);
    expect([t(data.n, 'sd'), t(data.n, 'md'), t(data.n, 'sfd')]).toEqual([825656309, 9736437162, 3382628833]);
    expect([t(data.n1, 'sd'), t(data.n1, 'md'), t(data.n1, 'sfd')]).toEqual([743900145, 6971264571, 2613872627]);
  });
  it('bilan actif N (brut, amortissements, net) et N-1', () => {
    const a = calculateActif(N);
    expect(ecarts(a.brut, ACTIF_N.brut)).toEqual([]);
    expect(ecarts(a.amort, ACTIF_N.amort)).toEqual([]);
    expect(ecarts(a.net, ACTIF_N.net)).toEqual([]);
    expect(ecarts(calculateActif(N1).net, ACTIF_N1)).toEqual([]);
  });
  it('bilan passif N et N-1', () => {
    expect(ecarts(calc(N, PASSIF), PASSIF_N)).toEqual([]);
    expect(ecarts(calc(N1, PASSIF), PASSIF_N1)).toEqual([]);
  });
  it('compte de résultat N et N-1', () => {
    expect(ecarts(calc(N, CR), CR_N)).toEqual([]);
    expect(ecarts(calc(N1, CR), CR_N1)).toEqual([]);
  });
  it('tableau des flux de trésorerie N et N-1', () => {
    expect(ecarts(calculerTft(N).valeurs, TFT_N)).toEqual([]);
    expect(ecarts(calculerTft(N1).valeurs, TFT_N1)).toEqual([]);
  });
  it('contrôles de cohérence satisfaits, hors renumérotation de comptes propre au guide (C02)', () => {
    const c = controlesSyscohada(N, N1);
    const echecs = c.filter(x => !x.ok && x.bloquant !== false).map(x => x.code);
    expect(echecs.filter(x => x !== 'REF-VISA' && x !== 'C02')).toEqual([]);
  });

  it('notes annexes : montants publiés par le guide (pages 360-394)', () => {
    const { cellules } = calculerLiasse({
      entreprise: { id: 'guide', nom: 'SYSTEME COMPTABLE OHADA', sigle: 'SYSCOHADA' } as never,
      exercice: { id: 'n', annee: 2026, date_debut: '2026-01-01', date_fin: '2026-12-31', statut: 'en_cours' } as never,
      balance: N, balanceN1: N1,
    });
    const attendu: Record<string, Record<string, number>> = {
      // 3A : ouverture, diminutions, clôture (augmentations : acquisitions + réévaluation, non distinguées par une balance)
      'Note 3A': { B27: 558633981, C27: 491069175 + 43500000, F27: 51723022, H27: 1041480134, H15: 1012410344, B15: 551435323 },
      'Note 3C': { B22: 347890696, C22: 19259644, D22: 45992979, E22: 321157361, E17: 160048641, E20: 35540453, E21: 54240000 },
      'Note 4': { B16: 4419790, C16: 4548658, B14: 2492790, C14: 2621658 },
      'Note 6': { B17: 18560138, C17: 15868433, B10: 7827856, B11: 5732282 },
      'Note 7': { B17: 167938821, B18: 31677520, B19: 136261301, C19: 140683833 },
      'Note 8': { B19: 38185527, C19: 3128385, B9: 16921663, B13: 20000000 },
      'Note 11': { B9: 121152991, B18: 1944136, B21: 123097127, C21: 74584157 },
      'Note 14': { B21: 20000000, B25: 76069991, D25: 47450317 },
      'Note 16A': { B19: 94699075, C19: 2200000, B41: 62116366, C41: 54864697 },
      'Note 17': { B9: 26695015, C9: 40583900, B12: 11515207, C12: 15310306, B14: 38210222, C14: 55894206 },
      'Note 18': { B15: 6756040, C15: 8113142, B22: 35912207, C22: 27897156, B24: 42668247, C24: 36010298, B17: 31102200 },
      'Note 21': { B30: 2041946745, C30: 1871826890, B37: 2049883723, C37: 1883313427 },
      'Note 22': { B12: 75000000, B17: 928303692, B33: 158266959, C33: 161120517 },
      'Note 23': { B14: 329146672, C14: 329073556 },
      'Note 24': { B24: 72599329, C24: 60787379 },
      'Note 25': { B15: 3135200, C15: 110000 },
      'Note 26': { B18: 4263929, C18: 67670 },
      'Note 27A': { B16: 218217093, C16: 208852251 },
      'Note 29': { B19: 3500000, B30: 7500000 },
      'Note 31': { B17: 2041946745, B18: 270876104, B20: 31102200, B21: 215389710, C21: 118619674 },
      // 34 : en milliers ; FR − BFG = trésorerie nette (écarts de conversion compris)
      'Note 34': { B10: 2041947, B12: 485093, B13: 266876, B18: 215390, B43: 816276, B45: 95953, B46: 208865, B48: 127366, B51: -154510, B54: 123097, B55: 123097, C54: 74584 },
    };
    const ko: string[] = [];
    for (const [note, cases] of Object.entries(attendu)) for (const [addr, v] of Object.entries(cases)) {
      const x = Math.round(Number(cellules[note]?.[addr] ?? 0));
      if (x !== v) ko.push(`${note} ${addr} : ${x} au lieu de ${v}`);
    }
    expect(ko).toEqual([]);
  });
});
