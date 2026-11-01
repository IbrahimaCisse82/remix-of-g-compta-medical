import { describe, expect, it } from 'vitest';
import type { BalanceLine } from './accounting';
import { calculerTft } from './tft-syscohada';

type Ecriture = [compte: string, debit: number, credit: number][];

/** Balance comme l'application la construit : à-nouveaux compris dans les mouvements, ouverture en sd/sc. */
function balance(ouverture: Record<string, number>, ecritures: Ecriture[]): BalanceLine[] {
  const m = new Map<string, { md: number; mc: number; ouv: number }>();
  const get = (c: string) => m.get(c) ?? (m.set(c, { md: 0, mc: 0, ouv: 0 }), m.get(c)!);
  for (const [c, s] of Object.entries(ouverture)) { const x = get(c); x.ouv = s; if (s > 0) x.md += s; else x.mc -= s; }
  for (const e of ecritures) for (const [c, d, cr] of e) { const x = get(c); x.md += d; x.mc += cr; }
  return [...m.entries()].map(([compte, x]) => {
    const net = x.md - x.mc;
    return { id: compte, exercice_id: 'x', entreprise_id: 'e', compte, intitule: compte, sd: Math.max(x.ouv, 0), sc: Math.max(-x.ouv, 0), md: x.md, mc: x.mc, sfd: Math.max(net, 0), sfc: Math.max(-net, 0) } as BalanceLine;
  });
}
const OUV = { '101': -1_000_000, '521': 1_000_000 };

describe('TFT — scénarios du Guide', () => {
  it('acquisition comptant : décaissement en FG, trésorerie cohérente', () => {
    const r = calculerTft(balance(OUV, [[['2441', 300_000, 0], ['521', 0, 300_000]]]));
    expect(r.valeurs.FG).toBe(-300_000);
    expect(r.valeurs.ZH).toBe(r.tresorerieCloture);
    expect(r.valeurs.ZA).toBe(1_000_000);
  });
  it('acquisition à crédit puis paiement partiel : seul le paiement est décaissé', () => {
    const r = calculerTft(balance(OUV, [[['2441', 300_000, 0], ['4812', 0, 300_000]], [['4812', 100_000, 0], ['521', 0, 100_000]]]));
    expect(r.valeurs.FG).toBe(-100_000);
    expect(r.valeurs.FE).toBe(0);
  });
  it('dotation aux amortissements : hors CAFG, sans effet sur la trésorerie', () => {
    const r = calculerTft(balance({ ...OUV, '2441': 500_000, '521': 500_000 }, [[['6813', 100_000, 0], ['2844', 0, 100_000]]]));
    expect(r.valeurs.FA).toBe(0); expect(r.valeurs.FG).toBe(0); expect(r.valeurs.ZG).toBe(0);
  });
  it('cession à crédit puis encaissement : encaissement en FI le jour du paiement', () => {
    const ouv = { '101': -1_000_000, '2441': 400_000, '2844': -100_000, '521': 700_000 };
    const cession = [['812', 300_000, 0], ['2844', 100_000, 0], ['2441', 0, 400_000], ['485', 350_000, 0], ['822', 0, 350_000]] as Ecriture;
    const r1 = calculerTft(balance(ouv, [cession]));
    expect(r1.valeurs.FI).toBe(0); expect(r1.valeurs.FG).toBe(0); expect(r1.valeurs.FA).toBe(0);
    const r2 = calculerTft(balance(ouv, [cession, [['521', 350_000, 0], ['485', 0, 350_000]]]));
    expect(r2.valeurs.FI).toBe(350_000); expect(r2.valeurs.ZH).toBe(r2.tresorerieCloture);
  });
  it('emprunt et remboursement', () => {
    const r = calculerTft(balance(OUV, [[['521', 2_000_000, 0], ['162', 0, 2_000_000]], [['162', 500_000, 0], ['521', 0, 500_000]]]));
    expect(r.valeurs.FO).toBe(2_000_000); expect(r.valeurs.FQ).toBe(-500_000);
  });
  it('location-acquisition : ni décaissement d’acquisition ni emprunt ; seul le remboursement compte', () => {
    const r = calculerTft(balance(OUV, [[['2416', 900_000, 0], ['172', 0, 900_000]], [['172', 150_000, 0], ['521', 0, 150_000]]]));
    expect(r.valeurs.FG).toBe(0); expect(r.valeurs.FO).toBe(0); expect(r.valeurs.FQ).toBe(-150_000);
  });
  it('capital souscrit, appelé puis versé : seul le versement est encaissé', () => {
    const r = calculerTft(balance(OUV, [[['109', 600_000, 0], ['1013', 0, 600_000]], [['467', 400_000, 0], ['109', 0, 400_000]], [['521', 400_000, 0], ['467', 0, 400_000]]]));
    expect(r.valeurs.FK).toBe(400_000);
  });
  it('affectation du résultat N-1 et dividendes : seul le paiement est décaissé', () => {
    const ouv = { '101': -1_000_000, '1301': -300_000, '521': 1_300_000 };
    const r = calculerTft(balance(ouv, [[['1301', 300_000, 0], ['1111', 0, 100_000], ['465', 0, 200_000]], [['465', 150_000, 0], ['521', 0, 150_000]]]));
    expect(r.valeurs.FN).toBe(-150_000); expect(r.valeurs.FE).toBe(0);
  });
  it('provision pour risques : sans effet sur la CAFG', () => {
    const r = calculerTft(balance(OUV, [[['6911', 80_000, 0], ['191', 0, 80_000]]]));
    expect(r.valeurs.FA).toBe(0); expect(r.ajustementNonMonetaire).toBe(0);
  });
  it('vente à crédit et achat à crédit : CAFG et variations de BFR s’annulent', () => {
    const r = calculerTft(balance(OUV, [[['411', 500_000, 0], ['701', 0, 500_000]], [['601', 300_000, 0], ['401', 0, 300_000]]]));
    expect(r.valeurs.FA).toBe(200_000); expect(r.valeurs.FD).toBe(-500_000); expect(r.valeurs.FE).toBe(300_000); expect(r.valeurs.ZB).toBe(0);
  });
});

describe('TFT — la variation de trésorerie est toujours expliquée (C05)', () => {
  const COMPTES = ['101', '1013', '109', '1111', '121', '1301', '14', '151', '162', '172', '181', '191', '2131', '2441', '2416', '2613', '2844', '2813', '2914', '311', '391', '401', '4041', '4091', '411', '4141', '419', '421', '4431', '4441', '465', '467', '4812', '485', '4856', '488', '4911', '4991', '501', '521', '571', '590', '601', '6031', '605', '622', '661', '671', '6541', '6813', '6911', '6972', '6795', '701', '706', '7542', '771', '7911', '7972', '7795', '799', '812', '822', '826', '851', '861', '891'];
  let graine = 42;
  const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = () => COMPTES[Math.floor(alea() * COMPTES.length)];
  it.each(Array.from({ length: 500 }, (_, i) => i))('jeu aléatoire %i', () => {
    const bilan = COMPTES.filter(c => /^[1-5]/.test(c));
    const ouverture: Record<string, number> = {};
    let somme = 0;
    for (let i = 0; i < 8; i++) { const c = bilan[Math.floor(alea() * bilan.length)]; const x = Math.round((alea() - 0.5) * 1e6); ouverture[c] = (ouverture[c] ?? 0) + x; somme += x; }
    ouverture['571'] = (ouverture['571'] ?? 0) - somme;
    const ecritures: Ecriture[] = Array.from({ length: 25 }, () => { const x = Math.round(alea() * 1e6) + 1; return [[pick(), x, 0], [pick(), 0, x]]; });
    const r = calculerTft(balance(ouverture, ecritures));
    expect(r.valeurs.ZH).toBe(r.tresorerieCloture);
  });
});
