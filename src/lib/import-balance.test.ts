import { describe, expect, it } from 'vitest';
import { calc, CR, PASSIF, calculateActif } from './accounting';
import { decoderTexte, analyserCsv, analyserLignesPositionnees, controlerBalance, ecarterSousTotaux, ecrituresDeReprise, montantTexte, versBalanceApplication, type LigneTexte } from './import-balance';

// Mise en page « Balance des comptes » Sage 100 : six colonnes Débit / Crédit (bords droits ci-dessous).
const X = [324, 416, 504, 596, 685, 776];
const entete: LigneTexte = ['Débit', 'Crédit', 'Débit', 'Crédit', 'Débit', 'Crédit'].map((t, i) => ({ t, x0: X[i] - 25, x1: X[i] }));
const ligne = (compte: string, intitule: string, m: (number | null)[]): LigneTexte => [
  { t: compte, x0: 18, x1: 58 }, { t: intitule, x0: 102, x1: 200 },
  ...m.flatMap((v, i) => v == null ? [] : [{ t: v.toLocaleString('de-DE'), x0: X[i] + 28 - 40, x1: X[i] + 28 }]),
];
const pdf: LigneTexte[] = [
  [{ t: 'LE MEDICAL TEST', x0: 18, x1: 120 }], entete,
  ligne('10100000', 'CAPITAL SOCIAL', [null, 1_000_000, null, null, null, 1_000_000]),
  ligne('24410000', 'MATERIEL DE BUREAU', [3_000_000, null, 500_000, null, 3_500_000, null]),
  ligne('40110000', 'FOURNISSEURS', [9_000_000, 9_500_000, 2_000_000, 2_100_000, null, 600_000]),
  ligne('52100003', 'BANQUE', [2_500_000, null, 5_000_000, 3_400_000, 4_100_000, null]),
  ligne('60550000', 'Fournitures de bureau', [null, null, 1_000_000, null, 1_000_000, null]),
  ligne('605', 'AUTRES ACHATS', [null, null, 1_000_000, null, 1_000_000, null]),          // sous-total Sage
  ligne('70610000', 'SERVICES VENDUS', [null, null, null, 5_000_000, null, 5_000_000]),
  ligne('12100000', 'REPORT A NOUVEAU', [null, 4_000_000, 2_000_000, null, null, 2_000_000]),
  [{ t: 'Totaux de la balance', x0: 200, x1: 300 }],
];

describe('reprise de balance', () => {
  const brut = analyserLignesPositionnees(pdf);
  const { lignes, ecartes } = ecarterSousTotaux(brut);
  it('lit les six colonnes et écarte les sous-totaux', () => {
    expect(brut).toHaveLength(8);
    expect(ecartes.map(e => e.compte)).toEqual(['605']);
    expect(lignes.find(l => l.compte === '40110000')).toMatchObject({ ouvD: 9_000_000, ouvC: 9_500_000, mvtD: 2_000_000, mvtC: 2_100_000, solC: 600_000 });
  });
  it('contrôle les équilibres et la cohérence ouverture + mouvements = solde', () => {
    const { controles } = controlerBalance(lignes);
    expect(controles.every(c => c.ok)).toBe(true);
    const faux = lignes.map(l => l.compte === '52100003' ? { ...l, solD: 1 } : l);
    expect(controlerBalance(faux).controles.filter(c => !c.ok).map(c => c.message).join()).toContain('52100003');
  });
  it('refuse un compte de résultat 13', () => {
    expect(controlerBalance([...lignes, { compte: '1310', intitule: '', ouvD: 0, ouvC: 5, mvtD: 0, mvtC: 0, solD: 0, solC: 5 }]).controles.some(c => !c.ok && c.message.includes('13'))).toBe(true);
  });
  it('produit des écritures équilibrées qui redonnent la balance', () => {
    const { aNouveaux, mouvements } = ecrituresDeReprise(lignes);
    const somme = (l: typeof aNouveaux, k: 'debit' | 'credit') => l.reduce((s, x) => s + x[k], 0);
    expect(somme(aNouveaux, 'debit')).toBe(somme(aNouveaux, 'credit'));
    expect(somme(mouvements, 'debit')).toBe(somme(mouvements, 'credit'));
    expect(aNouveaux.find(l => l.compte === '40110000')).toMatchObject({ debit: 0, credit: 500_000 });
  });
  it('les états de la balance reprise sont équilibrés', () => {
    const b = versBalanceApplication(lignes);
    const cr = calc(b, CR);
    expect(cr.XI).toBe(4_000_000);
    expect(calculateActif(b).net.BZ).toBe(calc(b, PASSIF).DZ);
  });
  it('lit une balance CSV à quatre colonnes (mouvements, soldes)', () => {
    const l = analyserCsv('Compte;Intitulé;Mvt débit;Mvt crédit;Solde débit;Solde crédit\n5211;Banque;100 000;40 000;160 000;0\n101;Capital;0;0;0;100 000\n');
    expect(l[0]).toMatchObject({ compte: '5211', ouvD: 100_000, mvtD: 100_000, mvtC: 40_000 });
    expect(() => analyserCsv('a;b\n1;2')).toThrow(/En-tête/);
  });
  it('lit un export texte Sage sans en-tête (totaux et soldes) en Windows-1252', () => {
    const texte = '10100000\tCAPITAL SOCIAL\t0\t1000000\t0\t1000000\n63270000\tRémunérations\t500\t0\t500\t0\n52100003\tBANQUE\t999500\t0\t999500\t0\n';
    const octets = new Uint8Array([...texte].map(c => c.charCodeAt(0)));
    const l = analyserCsv(decoderTexte(octets.buffer));
    expect(l).toHaveLength(3);
    expect(l[1]).toMatchObject({ intitule: 'Rémunérations', mvtD: 500, solD: 500, ouvD: 0 });
    expect(controlerBalance(l).controles.every(c => c.ok)).toBe(true);
  });
  it('montants Sage et français', () => {
    expect(montantTexte('1.000.000')).toBe(1_000_000);
    expect(montantTexte('1 234,50')).toBe(1234.5);
  });
});
