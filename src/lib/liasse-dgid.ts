/**
 * Liasse SYSCOHADA révisé complète, cellule par cellule du modèle DGID : identification (page de
 * garde, fiche R1), bilan, compte de résultat, TFT et notes annexes, tout calculé depuis la balance.
 * Source unique de l'export Excel (export-dgid.ts) et de l'impression PDF (pdf-export.ts).
 */
import { calc, calculateActif, CR, PASSIF, type BalanceLine, type Entreprise, type Exercice } from './accounting';
import { controlesSyscohada } from './conformite-syscohada';
import { balanceN1Effective, calculerNotes } from './notes-dgid';
import { calculerTft } from './tft-syscohada';

export interface DonneesDgid {
  entreprise: Entreprise;
  exercice: Exercice;
  balance: BalanceLine[];
  balanceN1: BalanceLine[];
}

export type ValeurLiasse = number | string | Date | null;
export type CellulesLiasse = Record<string, Record<string, ValeurLiasse>>;

const date = (iso: string) => { const [a, m, j] = iso.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)); };
export function dureeMois(debut: string, fin: string): number {
  const d = date(debut), f = date(fin);
  f.setUTCDate(f.getUTCDate() + 1);
  return (f.getUTCFullYear() - d.getUTCFullYear()) * 12 + f.getUTCMonth() - d.getUTCMonth();
}
const arrondi = (x: number | undefined) => Math.round(x ?? 0);

/** Lignes du modèle DGID : référence → numéro de ligne. */
const ACTIF_LIGNES = ['AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AP', 'AQ', 'AR', 'AS', 'AZ', 'BA', 'BB', 'BG', 'BH', 'BI', 'BJ', 'BK', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BZ']
  .map((ref, i) => [ref, 9 + i] as const);
const PASSIF_LIGNES = [...['CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CJ', 'CL', 'CM', 'CP', 'DA', 'DB', 'DC', 'DD', 'DF', 'DH', 'DI', 'DJ', 'DK', 'DM', 'DN', 'DP']
  .map((ref, i) => [ref, 9 + i] as const), ['DQ', 33], ['DR', 34], ['DT', 35], ['DV', 36], ['DZ', 37]] as const;
const CR_LIGNES = ['TA', 'RA', 'RB', 'XA', 'TB', 'TC', 'TD', 'XB', 'TE', 'TF', 'TG', 'TH', 'TI', 'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ', 'XC', 'RK', 'XD',
  'TJ', 'RL', 'XE', 'TK', 'TL', 'TM', 'RM', 'RN', 'XF', 'XG', 'TN', 'TO', 'RO', 'RP', 'XH', 'RQ', 'RS', 'XI'].map((ref, i) => [ref, 8 + i] as const);
const TFT_LIGNES: [string, number][] = [['ZA', 8], ['FA', 10], ['FB', 11], ['FC', 12], ['FD', 13], ['FE', 14], ['VO', 15], ['ZB', 16], ['FF', 18], ['FG', 19],
  ['FH', 20], ['FI', 21], ['FJ', 22], ['ZC', 23], ['FK', 25], ['FL', 26], ['FM', 27], ['FN', 28], ['ZD', 29], ['FO', 31], ['FP', 32], ['FQ', 33],
  ['ZE', 34], ['ZF', 35], ['ZG', 36], ['ZH', 37]];

/** Données d'exemple du modèle DGID à effacer. */
const EXEMPLES: Record<string, string[]> = {
  'Fiche de renseignement R1': ['W24', 'G28', 'Q36', 'Y36', 'AA36', 'AE36', 'D48', 'D52', 'D56', 'S64', 'AK64', 'D69', 'T71', 'AD71', 'D72', 'D75'],
  "Activités de l'entreprise R2": ['F14', 'G14', 'F16', 'G16', 'F18', 'G18', 'F20', 'G20', 'F22', 'G22', 'E25', 'F25', 'G25', 'H25', 'Q16', 'B33', 'D33', 'E33', 'F33', 'G33', 'H33', 'I33', 'M33'],
};

export function calculerLiasse(d: DonneesDgid): { cellules: CellulesLiasse; provisoire: string[] } {
  const { entreprise: e, exercice: x, balance, balanceN1 } = d;
  const n1 = balanceN1.length > 0;
  const c: CellulesLiasse = {};
  const ecrire = (feuille: string, addr: string, v: ValeurLiasse) => { (c[feuille] ??= {})[addr] = v; };
  const provisoire = controlesSyscohada(balance, balanceN1).filter(k => k.bloquant && !k.ok).map(k => k.code);

  // Identification
  const PG = 'Page de garde';
  ecrire(PG, 'B17', 'CENTRE DE DEPOT : ');
  if (provisoire.length) ecrire(PG, 'B19', `ÉTATS PROVISOIRES — contrôles non satisfaits : ${provisoire.join(', ')}`);
  ecrire(PG, 'M27', date(x.date_fin));
  ecrire(PG, 'L35', e.nom || '');
  ecrire(PG, 'H41', e.sigle || '');
  ecrire(PG, 'J46', e.adresse || '');
  ecrire(PG, 'N51', e.ninea || '');
  const R1 = 'Fiche de renseignement R1';
  const veille = date(x.date_debut); veille.setUTCDate(veille.getUTCDate() - 1);
  for (const [feuille, cellules] of Object.entries(EXEMPLES)) for (const a of cellules) ecrire(feuille, a, null);
  ecrire(R1, 'AH10', dureeMois(x.date_debut, x.date_fin));
  ecrire(R1, 'Y13', date(x.date_debut));
  ecrire(R1, 'AH13', date(x.date_fin));
  ecrire(R1, 'Q20', n1 ? veille : null);
  ecrire(R1, 'AL20', n1 ? 12 : null);
  ecrire(R1, 'I24', e.rccm || null);
  ecrire(R1, 'G36', e.tel || null);
  ecrire(R1, 'D40', e.adresse || null);
  ecrire(R1, 'D44', e.secteur || null);
  // Désignation de l'entité : en-tête des états ; les notes renvoient à celle de la note 1.
  for (const o of ['BILAN PAYSAGE', 'COMPTE DE RESULTAT', 'FLUX DE TRESORERIE', 'Note 1']) ecrire(o, 'A4', e.nom || '');

  // États
  // Bilan N-1 : exercice précédent, ou à défaut soldes d'ouverture de N.
  const bilanN1 = balanceN1Effective(balance, balanceN1);
  const aN = calculateActif(balance), aN1 = calculateActif(bilanN1);
  const pN = calc(balance, PASSIF), pN1 = calc(bilanN1, PASSIF);
  const crN = calc(balance, CR), crN1 = calc(balanceN1, CR);
  // TFT N-1 : il faut les soldes d'ouverture de N-1 ; une balance N-1 reprise sans à-nouveaux ne le permet pas.
  const tftN1 = n1 && balanceN1.some(l => (l.sd || 0) || (l.sc || 0));
  const tN = calculerTft(balance).valeurs, tN1 = tftN1 ? calculerTft(balanceN1).valeurs : {};
  const B = 'BILAN PAYSAGE';
  for (const [ref, r] of ACTIF_LIGNES) {
    ecrire(B, `D${r}`, arrondi(aN.brut[ref])); ecrire(B, `E${r}`, arrondi(aN.amort[ref]));
    ecrire(B, `F${r}`, arrondi(aN.net[ref])); ecrire(B, `G${r}`, arrondi(aN1.net[ref]));
  }
  for (const [ref, r] of PASSIF_LIGNES) { ecrire(B, `K${r}`, arrondi(pN[ref])); ecrire(B, `L${r}`, arrondi(pN1[ref])); }
  for (const [ref, r] of CR_LIGNES) { ecrire('COMPTE DE RESULTAT', `E${r}`, arrondi(crN[ref])); ecrire('COMPTE DE RESULTAT', `F${r}`, n1 ? arrondi(crN1[ref]) : 0); }
  for (const [ref, r] of TFT_LIGNES) { ecrire('FLUX DE TRESORERIE', `E${r}`, arrondi(tN[ref])); ecrire('FLUX DE TRESORERIE', `F${r}`, tftN1 ? arrondi(tN1[ref]) : null); }

  // Notes annexes
  const notes = calculerNotes(balance, balanceN1);
  if (!tftN1) for (const r of [57, 58, 59, 60]) { notes['Note 34'][`C${r}`] = null; notes['Note 34'][`D${r}`] = null; }
  for (const [feuille, cellules] of Object.entries(notes))
    for (const [addr, v] of Object.entries(cellules)) ecrire(feuille, addr, typeof v === 'number' ? Math.round(v) : v);
  return { cellules: c, provisoire };
}

/**
 * Évalue les formules simples du modèle : renvoi (='Feuille'!$A$1), somme (=SUM(B10:B12)) et
 * additions / soustractions de cellules (=+B43+B44). Renvoie undefined pour toute autre forme.
 */
export function evaluerFormule(formule: string, feuille: string, lire: (feuille: string, addr: string) => number | string | null): number | string | null | undefined {
  const f = formule.replace(/^=/, '').replace(/\$/g, '').trim();
  const ref = String.raw`(?:'((?:[^']|'')+)'!)?([A-Z]{1,3}\d+)`;
  const seul = new RegExp(`^\\+?${ref}$`).exec(f);
  if (seul) return lire(seul[1] ? seul[1].replace(/''/g, "'") : feuille, seul[2]);
  const nombre = (v: number | string | null) => typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
  const somme = /^SUM\(([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)\)$/.exec(f);
  const col = (l: string) => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const lettre = (n: number): string => (n > 26 ? lettre(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26));
  if (somme) {
    let t = 0;
    for (let c = col(somme[1]); c <= col(somme[3]); c++) for (let r = Number(somme[2]); r <= Number(somme[4]); r++) t += nombre(lire(feuille, `${lettre(c)}${r}`));
    return t;
  }
  if (/^[+-]?[A-Z]{1,3}\d+([+-][A-Z]{1,3}\d+)*$/.test(f)) {
    return [...f.matchAll(/([+-]?)([A-Z]{1,3}\d+)/g)].reduce((t, m) => t + (m[1] === '-' ? -1 : 1) * nombre(lire(feuille, m[2])), 0);
  }
  return undefined;
}
