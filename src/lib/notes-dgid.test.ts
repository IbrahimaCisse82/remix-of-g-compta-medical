import { describe, expect, it } from 'vitest';
import { calculateActif, calc, CR, PASSIF, type BalanceLine } from './accounting';
import { calculerNotes, evaluer, periode, variationPct } from './notes-dgid';

type Ecriture = [compte: string, debit: number, credit: number][];
/** Balance comme l'application la construit : à-nouveaux compris dans les mouvements. */
function balance(ouverture: Record<string, number>, ecritures: Ecriture[]): BalanceLine[] {
  const m = new Map<string, { md: number; mc: number; ouv: number }>();
  const get = (c: string) => m.get(c) ?? (m.set(c, { md: 0, mc: 0, ouv: 0 }), m.get(c)!);
  for (const [c, s] of Object.entries(ouverture)) { const x = get(c); x.ouv = s; if (s > 0) x.md += s; else x.mc -= s; }
  for (const e of ecritures) for (const [c, d, cr] of e) { const x = get(c); x.md += d; x.mc += cr; }
  return [...m.entries()].map(([compte, x]) => {
    const net = x.md - x.mc;
    return { compte, intitule: compte, sd: Math.max(x.ouv, 0), sc: Math.max(-x.ouv, 0), md: x.md, mc: x.mc, sfd: Math.max(net, 0), sfc: Math.max(-net, 0) } as BalanceLine;
  });
}

const OUV = { '1013': -2_000_000, '1621': -500_000, '2441': 800_000, '2844': -200_000, '2451': 1_200_000, '311': 150_000, '391': -10_000, '4111': 300_000, '4011': -250_000, '5211': 410_000, '571': 100_000 };
const ECR: Ecriture[] = [
  [['2442', 600_000, 0], ['4812', 0, 600_000]],          // achat matériel informatique à crédit
  [['4812', 400_000, 0], ['5211', 0, 400_000]],          // paiement partiel
  [['6813', 150_000, 0], ['2844', 0, 150_000]],          // dotation amortissements
  [['4111', 2_360_000, 0], ['7061', 0, 2_000_000], ['4431', 0, 360_000]],
  [['5211', 1_900_000, 0], ['4111', 0, 1_900_000]],
  [['6011', 700_000, 0], ['4011', 0, 700_000]], [['4011', 650_000, 0], ['5211', 0, 650_000]],
  [['6031', 40_000, 0], ['311', 0, 40_000]],
  [['6611', 500_000, 0], ['4221', 0, 500_000]], [['4221', 500_000, 0], ['5211', 0, 500_000]],
  [['6641', 80_000, 0], ['4311', 0, 80_000]],
  [['6221', 120_000, 0], ['5211', 0, 120_000]], [['6411', 30_000, 0], ['5211', 0, 30_000]],
  [['6712', 45_000, 0], ['5211', 0, 45_000]], [['1621', 100_000, 0], ['5211', 0, 100_000]],
  [['6594', 25_000, 0], ['4911', 0, 25_000]],             // dépréciation clients
  [['571', 300_000, 0], ['5211', 0, 300_000]],
];
const bal = balance(OUV, ECR);
const notes = calculerNotes(bal, []);
const v = (f: string, a: string) => notes[f]?.[a] ?? null;
const a = calculateActif(bal), p = calc(bal, PASSIF), cr = calc(bal, CR);

describe('notes annexes — rapprochement avec les états', () => {
  it('3A : brut à la clôture = brut du bilan (actif immobilisé)', () => {
    expect(v('Note 3A', 'H27')).toBe(a.brut.AZ);
    expect(v('Note 3A', 'B21')).toBe(800_000);            // ouverture matériel
    expect(v('Note 3A', 'C21')).toBe(600_000);            // acquisition
    expect(v('Note 3A', 'H22')).toBe(1_200_000);          // transport
  });
  it('3C : amortissements à la clôture = amortissements du bilan', () => {
    expect(v('Note 3C', 'B20')).toBe(200_000); expect(v('Note 3C', 'C20')).toBe(150_000); expect(v('Note 3C', 'E24')).toBe(a.amort.AZ);
  });
  it('6, 7, 11, 17, 18 : totaux = postes du bilan', () => {
    expect(v('Note 6', 'B20')).toBe(a.net.BB);
    expect(v('Note 7', 'B19')).toBe(a.net.BI);
    expect(v('Note 11', 'B24')).toBe(a.net.BS);
    expect(v('Note 17', 'B14')).toBe(p.DJ);
    expect(v('Note 18', 'B24')).toBe(p.DK);
    expect(v('Note 16A', 'B19')).toBe(400_000);
    expect(v('Note 5', 'B28')).toBe(200_000);             // fournisseur d'investissement restant dû
  });
  it('N-1 issu des soldes d’ouverture et variation en %', () => {
    expect(v('Note 6', 'C9')).toBe(150_000);
    expect(v('Note 6', 'D9')).toBe('-26,7 %');
    expect(variationPct(0, 0)).toBeNull();
  });
  it('21 à 27A : totaux = postes du compte de résultat', () => {
    expect(v('Note 21', 'B30')).toBe(cr.XB);
    expect(v('Note 22', 'B12')).toBe(-cr.RA);
    expect(v('Note 24', 'B24')).toBe(-cr.RH);
    expect(v('Note 25', 'B15')).toBe(-cr.RI);
    expect(v('Note 27A', 'B16')).toBe(-cr.RK);
    expect(v('Note 29', 'B9')).toBe(45_000);
  });
  it('28 : ouverture + dotations − reprises = clôture', () => {
    expect(v('Note 28', 'B15')).toBe(10_000); expect(v('Note 28', 'C18')).toBe(25_000); expect(v('Note 28', 'I18')).toBe(25_000);
    expect(v('Note 28', 'I27')).toBe(35_000);
  });
  it('34 : fiche de synthèse en milliers, trésorerie nette contrôlée', () => {
    expect(v('Note 34', 'B10')).toBe(Math.round(cr.XB / 1000));
    expect(v('Note 34', 'B54')).toBe(v('Note 34', 'B55'));
  });
  it('31 : résultat net de l’exercice', () => expect(v('Note 31', 'B21')).toBe(cr.XI));
  it('expressions : exclusions, lignes et milliers', () => {
    const pr = periode(bal);
    expect(evaluer(pr, 'SD:4111 - SC:4911')).toBe(a.net.BI);
    expect(evaluer(pr, 'K:SD:2441,2442')).toBe(1400);
    expect(evaluer(pr, 'SD:24!2442')).toBe(2_000_000);
  });
});
