import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BalanceLine, Entreprise, Exercice } from './accounting';
import { Classeur, dureeMois, genererClasseurDgid, MODELE_DGID } from './export-dgid';
import { calculerLiasse } from './liasse-dgid';

const b = (compte: string, d: Partial<BalanceLine>): BalanceLine => ({ compte, intitule: compte, sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, ...d });
const entreprise = { id: 'e', nom: 'Clinique Test & Fils', sigle: 'CT', ninea: '0012345 2G3', rccm: 'SN-DKR-2024-B-1', tel: '33 800 00 00', adresse: 'Dakar', forme_juridique: 'SARL', secteur: 'Santé', monnaie: 'FCFA' } as Entreprise;
const exercice = { id: 'x', entreprise_id: 'e', annee: 2026, date_debut: '2026-01-01', date_fin: '2026-12-31', statut: 'en_cours' } as Exercice;
const balance = [
  b('101', { sc: 1_000_000, mc: 1_000_000, sfc: 1_000_000 }),
  b('521', { sd: 1_000_000, md: 1_500_000, mc: 300_000, sfd: 1_200_000 }),
  b('2441', { md: 300_000, sfd: 300_000 }),
  b('2844', { mc: 50_000, sfc: 50_000 }),
  b('6813', { md: 50_000, sfd: 50_000 }),
  b('706', { mc: 500_000, sfc: 500_000 }),
];

let c: Classeur; let provisoire: string[]; let duree = 0;
beforeAll(async () => {
  const t0 = Date.now();
  const r = await genererClasseurDgid(readFileSync(`public/${MODELE_DGID}`), { entreprise, exercice, balance, balanceN1: [] });
  duree = Date.now() - t0;
  provisoire = r.provisoire;
  c = await Classeur.ouvrir(r.fichier);
}, 60_000);

const ligne = (onglet: string, col: string, ref: string) => { for (let r = 1; r < 90; r++) if (c.lire(onglet, `${col}${r}`) === ref) return r; throw new Error(ref); };

describe('export Excel modèle DGID', () => {
  it('durée de l’exercice en mois', () => { expect(dureeMois('2026-01-01', '2026-12-31')).toBe(12); expect(dureeMois('2026-07-01', '2026-12-31')).toBe(6); });
  it('reste rapide (retouche du XML, pas de relecture complète)', () => expect(duree).toBeLessThan(10_000));
  it('remplit le bilan par référence (brut, amortissements, net)', () => {
    const B = 'BILAN PAYSAGE', am = ligne(B, 'A', 'AM');
    expect([c.lire(B, `D${am}`), c.lire(B, `E${am}`), c.lire(B, `F${am}`)]).toEqual([300_000, 50_000, 250_000]);
    expect(c.lire(B, `F${ligne(B, 'A', 'BZ')}`)).toBe(1_450_000);
    expect(c.lire(B, `K${ligne(B, 'H', 'DZ')}`)).toBe(1_450_000);
    expect(c.lire(B, `K${ligne(B, 'H', 'CJ')}`)).toBe(450_000);
  });
  it('remplit le compte de résultat et le TFT', () => {
    expect(c.lire('COMPTE DE RESULTAT', `E${ligne('COMPTE DE RESULTAT', 'A', 'XI')}`)).toBe(450_000);
    const T = 'FLUX DE TRESORERIE';
    expect(c.lire(T, `E${ligne(T, 'A', 'ZA')}`)).toBe(1_000_000);
    expect(c.lire(T, `E${ligne(T, 'A', 'FA')}`)).toBe(500_000);
    expect(c.lire(T, `E${ligne(T, 'A', 'FG')}`)).toBe(-300_000);
    expect(c.lire(T, `E${ligne(T, 'A', 'ZH')}`)).toBe(1_200_000);
  });
  it('identifie l’entité, efface les exemples et propage les renvois', () => {
    expect(c.lire('Page de garde', 'L35')).toBe('Clinique Test & Fils');
    expect(c.lire('Page de garde', 'N51')).toBe('0012345 2G3');
    expect(c.lire('Page de garde', 'B17')).toBe('CENTRE DE DEPOT : ');
    // Premier exercice tenu dans l'application (pas de N-1) : C02 est une information, les états ne sont pas provisoires.
    expect(provisoire).toEqual([]);
    expect(String(c.lire('Page de garde', 'B19') ?? '')).not.toContain('ÉTATS PROVISOIRES');
    const R1 = 'Fiche de renseignement R1';
    expect(c.lire(R1, 'T71')).toBeNull();
    expect(c.lire(R1, 'I24')).toBe('SN-DKR-2024-B-1');
    expect(c.lire(R1, 'J4')).toBe('Clinique Test & Fils');
    expect(c.lire('BILAN PAYSAGE', 'D5')).toBe('0012345 2G3');
    expect(c.lire('BILAN PAYSAGE', 'J3')).toBe(46387); // 31/12/2026
  });
  it('marque les états provisoires quand un contrôle bloquant échoue', () => {
    const desequilibre = [b('521', { md: 1_000, sfd: 1_000 }), b('706', { mc: 900, sfc: 900 })];
    const r = calculerLiasse({ entreprise, exercice, balance: desequilibre, balanceN1: [] });
    expect(r.provisoire).toContain('C01');
    expect(String(r.cellules['Page de garde']?.B19)).toContain('ÉTATS PROVISOIRES');
  });
});
