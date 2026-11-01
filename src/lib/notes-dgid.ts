/**
 * Notes annexes SYSCOHADA révisé (système normal) calculées depuis la balance, cellule par cellule du
 * modèle DGID (onglets « Note 1 » à « Note 36 »).
 *
 * Chaque ligne d'un tableau est décrite par une expression sur les comptes du plan 2019 :
 *   SD:411,412!4116   soldes débiteurs de clôture des comptes commençant par 411 ou 412, hors 4116
 *   SC: / S:          soldes créditeurs / solde net (débit − crédit) de clôture
 *   OD: / OC: / OS:   mêmes soldes à l'ouverture de la période
 *   MD: / MC:         mouvements débit / crédit de la période, à-nouveaux exclus
 *   CH: / PR:         charges (débit − crédit) / produits (crédit − débit) de la période
 *   CR:XB / BIL:BZ / TFT:ZB   valeur d'un poste des états (même exercice)
 *   L17               valeur de la ligne 17 du même tableau (même colonne)
 * Les termes se combinent par « + » et « - » ; « K: » divise par 1 000 (fiche de synthèse).
 *
 * Références : formules de la plaquette Sage 100 « États comptables et fiscaux » V14 (notes),
 * corrigées et ré-alignées sur la présentation du modèle DGID et sur le plan de comptes 2019.
 * Ce qui ne figure pas dans une balance (effectifs, actionnaires, sûretés, engagements de retraite,
 * quantités, commentaires) reste à compléter dans le classeur.
 */
import { calc, calculateActif, CR, PASSIF, type BalanceLine } from './accounting';
import { calculerTft } from './tft-syscohada';

export type ValeurCellule = number | string | null;
export type CellulesNotes = Record<string, Record<string, ValeurCellule>>;

/** Une période de calcul : balance et valeurs des états correspondants. */
export interface Periode {
  lignes: BalanceLine[];
  etats: Record<string, number>;
}

/** Période N-1 : balance de l'exercice précédent, ou à défaut les soldes d'ouverture de N (bilan seulement). */
export function balanceN1Effective(balance: BalanceLine[], balanceN1: BalanceLine[]): BalanceLine[] {
  if (balanceN1.length) return balanceN1;
  return balance.filter(l => /^[1-5]/.test(l.compte) && ((l.sd || 0) || (l.sc || 0)))
    .map(l => ({ ...l, sfd: l.sd || 0, sfc: l.sc || 0, md: l.sd || 0, mc: l.sc || 0, sd: 0, sc: 0 }));
}

export function periode(lignes: BalanceLine[]): Periode {
  const a = calculateActif(lignes);
  const etats: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.net)) etats[`BIL:${k}`] = v;
  for (const [k, v] of Object.entries(calc(lignes, PASSIF))) etats[`BIL:${k}`] = v;
  for (const [k, v] of Object.entries(calc(lignes, CR))) etats[`CR:${k}`] = v;
  for (const [k, v] of Object.entries(calculerTft(lignes).valeurs)) etats[`TFT:${k}`] = v;
  return { lignes, etats };
}

const correspond = (compte: string, spec: string) => {
  const [inclus, ...exclus] = spec.split('!');
  return inclus.split(',').some(p => p && compte.startsWith(p.trim())) && !exclus.some(p => compte.startsWith(p.trim()));
};

function terme(p: Periode, t: string, lignesCalculees: Record<number, number>): number {
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const ref = /^L(\d+)$/.exec(t);
  if (ref) return lignesCalculees[Number(ref[1])] ?? 0;
  if (/^(CR|BIL|TFT):[A-Z]{2}$/.test(t)) return p.etats[t] ?? 0;
  const [fn, spec] = t.split(':');
  let s = 0;
  for (const l of p.lignes) {
    if (!correspond(String(l.compte), spec)) continue;
    const clo = (l.sfd || 0) - (l.sfc || 0), ouv = (l.sd || 0) - (l.sc || 0);
    switch (fn) {
      case 'SD': s += Math.max(clo, 0); break;
      case 'SC': s += Math.max(-clo, 0); break;
      case 'S': s += clo; break;
      case 'OD': s += Math.max(ouv, 0); break;
      case 'OC': s += Math.max(-ouv, 0); break;
      case 'OS': s += ouv; break;
      case 'MD': s += (l.md || 0) - (l.sd || 0); break;
      case 'MC': s += (l.mc || 0) - (l.sc || 0); break;
      case 'CH': s += (l.md || 0) - (l.mc || 0); break;
      case 'PR': s += (l.mc || 0) - (l.md || 0); break;
      default: throw new Error(`Fonction inconnue dans une note : ${fn}`);
    }
  }
  return s;
}

/** Évalue une expression « SD:31 + SD:32 - L17 ». */
export function evaluer(p: Periode, expr: string, lignes: Record<number, number> = {}): number {
  const milliers = expr.startsWith('K:');
  const corps = milliers ? expr.slice(2) : expr;
  const morceaux = corps.trim().split(/\s+([+-])\s+/);
  let total = 0, signe = 1;
  morceaux.forEach((m, i) => {
    if (i % 2 === 1) { signe = m === '-' ? -1 : 1; return; }
    const neg = m.startsWith('-') && !/^-\d/.test(m);
    total += signe * (neg ? -1 : 1) * terme(p, neg ? m.slice(1) : m, lignes);
  });
  return milliers ? Math.round(total / 1000) : total;
}

const somme = (debut: number, fin: number, sauf: number[] = []) =>
  Array.from({ length: fin - debut + 1 }, (_, i) => debut + i).filter(r => !sauf.includes(r)).map(r => `L${r}`).join(' + ');

type Lignes = [ligne: number, expr: string][];

/** Pourcentage de variation présenté en texte (« 12,5 % »), vide si N-1 est nul. */
export function variationPct(n: number, n1: number): string | null {
  if (!n1 || (!n && !n1)) return null;
  const v = Math.round(((n - n1) / Math.abs(n1)) * 1000) / 10;
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`;
}

interface ColonnesNN1 { n: string; n1: string; pct?: string; abs?: string }

/** Tableau « année N / année N-1 / variation ». */
function tableauNN1(sortie: CellulesNotes, feuille: string, c: ColonnesNN1, lignes: Lignes, pN: Periode, pN1: Periode) {
  const vN: Record<number, number> = {}, vN1: Record<number, number> = {};
  for (const [r, e] of lignes) { vN[r] = evaluer(pN, e, vN); vN1[r] = evaluer(pN1, e, vN1); }
  const f = (sortie[feuille] ??= {});
  for (const [r] of lignes) {
    f[`${c.n}${r}`] = vN[r] || null;
    f[`${c.n1}${r}`] = vN1[r] || null;
    if (c.abs) f[`${c.abs}${r}`] = (vN[r] - vN1[r]) || null;
    if (c.pct) f[`${c.pct}${r}`] = variationPct(vN[r], vN1[r]);
  }
}

/** Tableau de mouvements d'une seule période : chaque colonne a sa propre expression (gabarit « {} » = comptes de la ligne). */
function tableauMouvements(sortie: CellulesNotes, feuille: string, colonnes: Record<string, string>, lignes: [number, string][], totaux: [number, number[]][], p: Periode) {
  const f = (sortie[feuille] ??= {});
  const val: Record<string, Record<number, number>> = {};
  for (const [col, gabarit] of Object.entries(colonnes)) {
    val[col] = {};
    for (const [r, comptes] of lignes) {
      const expr = gabarit.replace(/\{\}/g, comptes).replace(/\{L\}/g, `L${r}`);
      val[col][r] = gabarit.startsWith('=') ? 0 : comptes ? evaluer(p, expr) : 0;
    }
  }
  for (const [r, composants] of totaux)
    for (const col of Object.keys(colonnes))
      if (!colonnes[col].startsWith('=')) val[col][r] = composants.reduce((s, x) => s + (val[col][x] ?? 0), 0);
  // Colonnes calculées « =B + C - F » : sur les valeurs des autres colonnes de la même ligne.
  for (const [col, gabarit] of Object.entries(colonnes)) {
    if (!gabarit.startsWith('=')) continue;
    for (const [r] of [...lignes, ...totaux.map(t => [t[0], ''] as [number, string])]) {
      val[col][r] = gabarit.slice(1).trim().split(/\s+([+-])\s+/).reduce<{ s: number; sg: number }>((acc, m, i) => {
        if (i % 2 === 1) { acc.sg = m === '-' ? -1 : 1; return acc; }
        acc.s += acc.sg * (val[m]?.[r] ?? 0); return acc;
      }, { s: 0, sg: 1 }).s;
    }
  }
  for (const col of Object.keys(colonnes)) {
    for (const [r, comptes] of lignes) if (comptes || colonnes[col].startsWith('=')) f[`${col}${r}`] = val[col][r] || null;
    for (const [r] of totaux) f[`${col}${r}`] = val[col][r] || null;
  }
}

/** Calcule toutes les notes chiffrables à partir des balances N et N-1. */
export function calculerNotes(balance: BalanceLine[], balanceN1: BalanceLine[]): CellulesNotes {
  const pN = periode(balance), pN1 = periode(balanceN1Effective(balance, balanceN1));
  const s: CellulesNotes = {};
  const nn1 = (feuille: string, c: ColonnesNN1, lignes: Lignes) => tableauNN1(s, feuille, c, lignes, pN, pN1);
  const BCD = { n: 'B', n1: 'C', pct: 'D' };

  // ── Note 3A : immobilisations brutes (comptes alignés sur les postes du bilan) ──
  const brut = { B: 'OS:{}', C: 'MD:{}', F: 'MC:{}', H: '=B + C + D + E - F - G' };
  tableauMouvements(s, 'Note 3A', brut, [
    [11, '211,2181,2191'], [12, '212,213,214,2193'], [13, '215,216'], [14, '217,2182,2183,2184,2188,2198'],
    [16, '22!2281'], [17, '2281'], [18, '231,232,233,237,2391,2393!2315!2325'], [19, '2315,2325'],
    [20, '234,235,238,2392,2394,2395,2398'], [21, '241,242,243,244,246,247,248,249!2495'], [22, '245,2495'],
    [23, '251,252'], [25, '261,262,263,265,266,268'], [26, '271,272,273,274,275,276,277,278'],
  ], [[10, [11, 12, 13, 14]], [15, [16, 17, 18, 19, 20, 21, 22]], [24, [25, 26]], [27, [11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26]]], pN);

  // ── Note 3C : amortissements ──
  tableauMouvements(s, 'Note 3C', { B: 'OC:{}', C: 'MC:{}', D: 'MD:{}', E: '=B + C - D' }, [
    [10, '2811'], [11, '2812,2813,2814'], [12, '2815,2816'], [13, '2817,2818'],
    [15, '282!2828'], [16, '2828'], [17, '2831,2832,2833,2837!28315!28325'], [18, '28315,28325'],
    [19, '2834,2835,2838'], [20, '2841,2842,2843,2844,2846,2847,2848'], [21, '2845'],
  ], [[14, [10, 11, 12, 13]], [22, [15, 16, 17, 18, 19, 20, 21]], [24, [10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21]]], pN);

  // ── Note 3D : cessions (valeur comptable nette et prix ; brut et amortissements à détailler) ──
  {
    const f = (s['Note 3D'] ??= {});
    const lig: [number, string, string][] = [[14, '811,6541', '821,7541'], [20, '812,6542', '822,7542'], [23, '816', '826']];
    let vnc = 0, prix = 0;
    for (const [r, ch, pr] of lig) {
      const d = evaluer(pN, `CH:${ch}`), e = evaluer(pN, `PR:${pr}`);
      vnc += d; prix += e;
      f[`D${r}`] = d || null; f[`E${r}`] = e || null; f[`F${r}`] = (e - d) || null;
    }
    f.D25 = vnc || null; f.E25 = prix || null; f.F25 = (prix - vnc) || null;
  }

  // ── Note 4 : immobilisations financières ──
  nn1('Note 4', BCD, [[9, 'SD:26'], [10, 'SD:271,277,278'], [11, 'SD:272'], [12, 'SD:273'], [13, 'SD:274'], [14, 'SD:275'], [15, 'SD:276'],
    [16, somme(9, 15)], [17, 'SC:296'], [18, 'SC:297'], [19, 'L16 - L17 - L18']]);

  // ── Note 5 : actif et dettes circulants HAO ──
  nn1('Note 5', BCD, [[10, 'SD:485'], [11, 'SD:488'], [12, 'L10 + L11'], [13, 'SC:498'], [14, 'L12 - L13']]);
  nn1('Note 5', { n: 'B', n1: 'D', pct: 'F' }, [[24, 'SC:481'], [25, 'SC:482'], [26, 'SC:483'], [27, 'SC:484,4998'], [28, somme(24, 27)]]);

  // ── Notes 6 à 11 : actif circulant et trésorerie actif ──
  nn1('Note 6', BCD, [[9, 'SD:31'], [10, 'SD:32'], [11, 'SD:33'], [12, 'SD:34'], [13, 'SD:35'], [14, 'SD:36'], [15, 'SD:37'], [16, 'SD:38'],
    [17, somme(9, 16)], [18, 'SC:39'], [20, 'L17 - L18']]);
  nn1('Note 7', BCD, [[9, 'SD:411,413'], [10, 'SD:412'], [13, 'SD:414'], [14, 'SD:415'], [15, 'SD:416'], [16, 'SD:418'],
    [17, somme(9, 16)], [18, 'SC:491'], [19, 'L17 - L18'],
    [20, 'SC:4191'], [21, 'SC:4192'], [22, 'SC:419!4191!4192 + SC:411,412,413,414,415,416,418'], [23, 'L20 + L21 + L22']]);
  nn1('Note 8', BCD, [[9, 'SD:42'], [10, 'SD:43'], [11, 'SD:44'], [12, 'SD:45'], [13, 'SD:46'], [14, 'SD:475'], [15, 'SD:471,472,473,474,476,477'],
    [16, 'SD:185'], [17, 'SD:186,187'], [18, 'SD:188'], [19, somme(9, 18)], [20, 'SC:492,493,494,495,496,497'], [21, 'L19 - L20']]);
  nn1('Note 9', BCD, [[9, 'SD:501'], [10, 'SD:502'], [11, 'SD:503'], [12, 'SD:504'], [13, 'SD:505'], [14, 'SD:506'], [15, 'SD:508'],
    [16, somme(9, 15)], [17, 'SC:590'], [19, 'L16 - L17']]);
  nn1('Note 10', BCD, [[9, 'SD:511'], [10, 'SD:512'], [11, 'SD:513'], [12, 'SD:514'], [13, 'SD:515'], [14, 'SD:518'],
    [15, somme(9, 14)], [16, 'SC:591'], [18, 'L15 - L16']]);
  nn1('Note 11', BCD, [[9, 'SD:521'], [10, 'SD:522'], [11, 'SD:525'], [12, 'SD:523,524'], [13, 'SD:526'], [14, 'SD:531'], [15, 'SD:532,533,538'],
    [16, 'SD:536'], [17, 'SD:54'], [18, 'SD:57'], [19, 'SD:55'], [20, 'SD:58'], [21, somme(9, 20)], [22, 'SC:592,593,594'], [24, 'L21 - L22']]);

  // ── Note 12 : transferts de charges ──
  nn1('Note 12', { n: 'B', n1: 'D', pct: 'F' }, [[26, 'PR:781'], [29, 'PR:787']]);

  // ── Notes 13 à 15 : capitaux propres ──
  s['Note 13'] = { ...(s['Note 13'] ?? {}), F18: evaluer(pN, 'SD:109') || null, F19: evaluer(pN, 'SC:101,102,103,104') || null };
  nn1('Note 14', { n: 'B', n1: 'D', abs: 'F' }, [[9, 'SC:1051'], [10, 'SC:1052'], [11, 'SC:1053'], [12, 'SC:1054'], [13, 'SC:105!1051!1052!1053!1054'],
    [14, somme(9, 13)], [16, 'SC:111'], [17, 'SC:112'], [18, 'SC:1131'], [19, 'SC:1132'], [20, 'SC:113!1131!1132'], [21, somme(16, 20)],
    [23, 'SC:118'], [25, '-S:121,129']]);
  nn1('Note 15A', { n: 'C', n1: 'D', abs: 'E', pct: 'F' }, [[9, 'SC:1411'], [10, 'SC:1412'], [11, 'SC:1413'], [12, 'SC:1414'], [13, 'SC:1415'],
    [14, 'SC:1416'], [15, 'SC:1417'], [16, 'SC:141!1411!1412!1413!1414!1415!1416!1417 + SC:148'], [17, somme(9, 16)],
    [19, 'SC:151'], [20, 'SC:152'], [21, 'SC:154'], [22, 'SC:155'], [23, 'SC:156'], [24, 'SC:157'], [25, 'SC:153,158'], [26, somme(19, 25)],
    [28, 'L17 + L26']]);

  // ── Note 16A : dettes financières, location-acquisition, provisions pour risques ──
  nn1('Note 16A', { n: 'B', n1: 'C', abs: 'D', pct: 'E' }, [[9, 'SC:161'], [10, 'SC:162'], [11, 'SC:163'], [12, 'SC:164'], [13, 'SC:165'],
    [14, 'SC:166'], [15, 'SC:167'], [16, 'SC:168'], [17, 'SC:181,182,183'], [18, 'SC:184'], [19, somme(9, 18)],
    [21, 'SC:172'], [22, 'SC:173'], [23, 'SC:174'], [24, 'SC:176'], [25, 'SC:178,175,177,179'], [26, somme(21, 25)],
    [28, 'SC:191'], [29, 'SC:192'], [30, 'SC:193'], [31, 'SC:194'], [32, 'SC:195'], [33, 'SC:196'], [35, 'SC:197'], [36, 'SC:1981'],
    [37, 'SC:1983'], [38, 'SC:1984'], [39, 'SC:1985'], [40, 'SC:198!1981!1983!1984!1985 + SC:199'], [41, somme(28, 40)]]);

  // ── Notes 17 à 20 : passif circulant et trésorerie passif ──
  nn1('Note 17', BCD, [[9, 'SC:401,404!4012'], [10, 'SC:402!4022'], [11, 'SC:4012,4022'], [12, 'SC:408!4082'], [13, 'SC:4082'], [14, somme(9, 13)],
    [16, 'SD:409!4092'], [17, 'SD:4092'], [18, 'SD:401,402,404,408'], [19, somme(16, 18)]]);
  nn1('Note 18', { n: 'B', n1: 'C', abs: 'D', pct: 'E' }, [[9, 'SC:4281'], [10, 'SC:422'], [11, 'SC:421,423,424,425,426,427,428!4281'], [12, 'SC:431'],
    [13, 'SC:432'], [14, 'SC:433,438'], [15, somme(9, 14)], [17, 'SC:441'], [18, 'SC:442'], [19, 'SC:443,444,445'], [20, 'SC:447'],
    [21, 'SC:446,448,449'], [22, somme(17, 21)], [24, 'L15 + L22']]);
  nn1('Note 19', { n: 'B', n1: 'C', abs: 'D', pct: 'E' }, [[9, 'SC:45'], [11, 'SC:461'], [12, 'SC:462'], [13, 'SC:465'], [14, 'SC:466'],
    [15, 'SC:463,467,469'], [16, somme(11, 15)], [18, 'SC:4712'], [19, 'SC:4713'], [20, 'SC:4715'], [21, 'SC:4716'], [22, 'SC:4726'],
    [23, 'SC:475'], [24, 'SC:471,472,473,474,476,477!4712!4713!4715!4716!4726'], [25, somme(18, 24)], [27, 'SC:185'], [28, 'SC:186,187'],
    [29, 'SC:188'], [30, somme(27, 29)], [32, 'L9 + L16 + L25 + L30'], [34, 'SC:499,599']]);
  nn1('Note 20', BCD, [[9, 'SC:564'], [10, 'SC:565'], [11, 'L9 + L10'], [13, 'SC:521'], [14, 'SC:522'], [15, 'SC:523,524,525,53'], [16, 'SC:526'],
    [17, 'SC:561,566'], [18, somme(13, 17)], [20, 'L11 + L18']]);

  // ── Notes 21 à 27A : compte de résultat ──
  nn1('Note 21', BCD, [
    [9, 'PR:701!7012!7013!7014!7015'], [10, 'PR:7012'], [11, 'PR:7013,7014'], [12, 'PR:7015'], [13, somme(9, 12)],
    [15, 'PR:702,703,704!7022!7023!7024!7025!7032!7033!7034!7035!7042!7043!7044!7045'], [16, 'PR:7022,7032,7042'],
    [17, 'PR:7023,7024,7033,7034,7043,7044'], [18, 'PR:7025,7035,7045'], [19, somme(15, 18)],
    [21, 'PR:705,706!7052!7053!7054!7055!7062!7063!7064!7065'], [22, 'PR:7052,7062'], [23, 'PR:7053,7054,7063,7064'], [24, 'PR:7055,7065'],
    [25, somme(21, 24)], [27, 'PR:707'], [30, 'L13 + L19 + L25 + L27'],
    [32, 'CR:TF'], [33, 'CR:TG'], [34, 'CR:TH'], [35, 'L32 + L33 + L34'], [37, 'L30 + L35']]);
  nn1('Note 22', BCD, [
    [9, 'CH:601!6012!6013!6014'], [10, 'CH:6012'], [11, 'CH:6013,6014'], [12, somme(9, 11)],
    [14, 'CH:602!6022!6023!6024'], [15, 'CH:6022'], [16, 'CH:6023,6024'], [17, somme(14, 16)],
    [19, 'CH:6041'], [20, 'CH:6042'], [21, 'CH:6043'], [22, 'CH:6044,6046'], [23, 'CH:6051'], [24, 'CH:6052'], [25, 'CH:6053'],
    [26, 'CH:6054'], [27, 'CH:6047,6055'], [28, 'CH:6056'], [29, 'CH:6057,6058'], [30, 'CH:608!6085!6089'], [31, 'CH:6045,6085'],
    [32, 'CH:6049,6059,6089'], [33, somme(19, 32)]]);
  nn1('Note 23', BCD, [[9, 'CH:612'], [10, 'CH:613'], [11, 'CH:614'], [12, 'CH:616'], [13, 'CH:61!612!613!614!616'], [14, somme(9, 13)]]);
  nn1('Note 24', BCD, [[9, 'CH:621'], [10, 'CH:622'], [11, 'CH:623'], [12, 'CH:624'], [13, 'CH:625'], [14, 'CH:626'], [15, 'CH:627'], [16, 'CH:628'],
    [17, 'CH:631'], [18, 'CH:632'], [19, 'CH:633'], [20, 'CH:634'], [21, 'CH:635'],
    [22, 'CH:62,63!621!622!623!624!625!626!627!628!631!632!633!634!635'], [24, somme(9, 22)]]);
  nn1('Note 25', BCD, [[9, 'CH:641'], [10, 'CH:645'], [11, 'CH:646'], [12, 'CH:647'], [13, 'CH:64!641!645!646!647'], [15, somme(9, 13)]]);
  nn1('Note 26', BCD, [[9, 'CH:6511'], [10, 'CH:651!6511'], [11, 'CH:652'], [12, 'CH:654'], [13, 'CH:6581'], [14, 'CH:6582,6583'],
    [15, 'CH:65!651!652!654!6581!6582!6583!659'], [16, 'CH:659'], [18, somme(9, 16)]]);
  nn1('Note 27A', BCD, [[9, 'CH:661,662'], [10, 'CH:663'], [11, 'CH:664'], [12, 'CH:666'], [13, 'CH:667'], [14, 'CH:668'], [16, somme(9, 14)]]);

  // ── Note 28 : provisions et dépréciations inscrites au bilan (ouverture + dotations − reprises = clôture) ──
  {
    const lignes28: [number, string, 'exp' | 'fin' | 'hao'][] = [
      [10, '15', 'hao'], [11, '19', 'exp'], [12, '29', 'exp'],
      [15, '39', 'exp'], [16, '498', 'exp'], [17, '490', 'exp'], [18, '491', 'exp'], [19, '492,493,494,495,496,497', 'exp'],
      [20, '590', 'fin'], [21, '591', 'fin'], [22, '592,593,594', 'fin'], [23, '499', 'exp'], [24, '599', 'fin'],
    ];
    const f = (s['Note 28'] ??= {});
    const tot: Record<string, Record<number, number>> = {};
    const ajoute = (col: string, r: number, v: number) => { (tot[col] ??= {})[r] = (tot[col][r] ?? 0) + v; };
    for (const [r, comptes, nature] of lignes28) {
      const ouv = evaluer(pN, `OC:${comptes}`), dot = evaluer(pN, `MC:${comptes}`), rep = evaluer(pN, `MD:${comptes}`);
      const [cd, cr] = nature === 'exp' ? ['C', 'F'] : nature === 'fin' ? ['D', 'G'] : ['E', 'H'];
      const valeurs: Record<string, number> = { B: ouv, [cd]: dot, [cr]: rep, I: ouv + dot - rep };
      const groupe = r <= 12 ? 13 : 25;
      for (const [col, v] of Object.entries(valeurs)) { f[`${col}${r}`] = v || null; ajoute(col, groupe, v); ajoute(col, 27, v); }
    }
    for (const r of [13, 25, 27]) for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) f[`${col}${r}`] = tot[col]?.[r] || null;
  }

  // ── Notes 29 et 30 : financier et HAO ──
  nn1('Note 29', BCD, [[9, 'CH:671'], [10, 'CH:672'], [11, 'CH:673'], [12, 'CH:674'], [13, 'CH:675'], [14, 'CH:676'], [15, 'CH:6771'],
    [16, 'CH:6772'], [17, 'CH:678'], [18, 'CH:679'], [19, somme(9, 18)],
    [21, 'PR:771'], [22, 'PR:772'], [23, 'PR:773'], [24, 'PR:774'], [25, 'PR:775'], [26, 'PR:776'], [27, 'PR:777'], [28, 'PR:778'], [29, 'PR:779'],
    [30, somme(21, 29)], [32, 'L30 - L19']]);
  nn1('Note 30', BCD, [[9, 'CH:831,833,837'], [12, 'CH:834'], [13, 'CH:835'], [14, 'CH:836'], [15, 'CH:839'], [16, 'CH:85'], [17, 'CH:87'],
    [18, 'L9 + L12 + L13 + L14 + L15 + L16 + L17'],
    [19, 'PR:841,843,844,847'], [22, 'PR:845'], [23, 'PR:846'], [24, 'PR:848'], [25, 'PR:849'], [26, 'PR:86'], [27, 'PR:88'],
    [28, 'L19 + L22 + L23 + L24 + L25 + L26 + L27'], [30, 'L28 - L18']]);

  // ── Note 31 : résultats (exercices N et N-1) ──
  {
    const f = (s['Note 31'] ??= {});
    const lig: [number, string][] = [[10, 'SC:101,102,103,104'], [17, 'CR:XB'], [18, 'CR:XG - CR:TJ - CR:TL - CR:RL - CR:RN'], [19, '-CR:RQ'],
      [20, '-CR:RS'], [21, 'CR:XI'], [28, 'CH:661,662,663'], [29, 'CH:664,668'], [30, 'CH:667']];
    for (const [r, e] of lig) { f[`B${r}`] = evaluer(pN, e) || null; f[`C${r}`] = evaluer(pN1, e) || null; }
  }

  // ── Note 34 : fiche de synthèse (en milliers) ──
  {
    const lig: Lignes = [
      [10, 'K:CR:XB'], [11, 'K:CR:XA'], [12, 'K:CR:XC'], [13, 'K:CR:XD'], [14, 'K:CR:XE'], [15, 'K:CR:XF'], [16, 'K:CR:XG'], [17, 'K:CR:XH'], [18, 'K:CR:XI'],
      [20, 'K:CR:XD'], [21, 'K:CH:654'], [22, 'K:PR:754'], [23, 'L20 + L21 - L22'],
      [24, 'K:PR:771,772,773,774,775,777,778'], [25, 'K:PR:776'], [26, 'K:PR:787'], [27, 'K:PR:841,843,844,845,846,847,88'], [28, 'K:PR:848'],
      [29, 'K:CH:671,672,673,674,675,677,678'], [30, 'K:CH:676'], [31, 'K:CH:831,833,834,835,836,837'], [32, 'K:CH:87'], [33, 'K:CH:89'],
      [34, 'L23 + L24 + L25 + L26 + L27 + L28 - L29 - L30 - L31 - L32 - L33'], [35, 'K:MD:465'], [36, 'L34 - L35'],
      [41, 'K:BIL:CP'], [42, 'K:BIL:DD'], [43, 'L41 + L42'], [44, 'K:-BIL:AZ'], [45, 'L43 + L44'],
      [46, 'K:BIL:BB + BIL:BG'], [47, 'K:-BIL:DP + BIL:DH'], [48, 'L46 + L47'], [49, 'K:BIL:BA'], [50, 'K:-BIL:DH'], [51, 'L49 + L50'],
      [52, 'L48 + L51'], [54, 'L45 - L52'], [55, 'K:BIL:BT - BIL:DT'],
      [57, 'K:TFT:ZB'], [58, 'K:TFT:ZC'], [59, 'K:TFT:ZF'], [60, 'L57 + L58 + L59'],
      [62, 'K:BIL:DD + BIL:DT'], [63, 'K:BIL:DD + BIL:DT - BIL:BT'],
    ];
    nn1('Note 34', BCD, lig);
    const f = s['Note 34'];
    const taux = (num: number, den: number) => den ? `${(Math.round(num / den * 1000) / 10).toLocaleString('fr-FR')} %` : null;
    f.A38 = "Rentabilité économique = Résultat d'exploitation (a) / (Capitaux propres + dettes financières)";
    f.A39 = 'Rentabilité financière = Résultat net / Capitaux propres';
    for (const [col, p] of [['B', pN], ['C', pN1]] as const) {
      f[`${col}38`] = taux(p.etats['CR:XE'] ?? 0, (p.etats['BIL:CP'] ?? 0) + (p.etats['BIL:DD'] ?? 0));
      f[`${col}39`] = taux(p.etats['CR:XI'] ?? 0, p.etats['BIL:CP'] ?? 0);
    }
  }
  return s;
}
