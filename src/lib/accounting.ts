import { REFERENCE_MAPPING, referenceFormula } from './syscohada-reference';
// ─── FORMATTING ────────────────────────────────────────
export const fmt = (n: number | null | undefined, dash = true): string => {
  if (n === null || n === undefined) return dash ? '—' : '';
  const v = typeof n === 'number' ? n : parseFloat(String(n));
  if (isNaN(v)) return dash ? '—' : '';
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

export const fmtSigned = (n: number | null | undefined): string => {
  if (n == null) return '—';
  const a = Math.abs(Math.round(n)).toLocaleString('fr-FR');
  return n < 0 ? `(${a})` : a;
};

export const fmtPct = (n: number | null | undefined): string => {
  if (!n || isNaN(n) || !isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)} %`;
};

export const pf = (s: string | number): number =>
  parseFloat(String(s || '0').replace(/[\s\u00a0]/g, '').replace(',', '.')) || 0;

export const isBilan = (c: string): boolean => /^[1-5]/.test(String(c || '').trim());

export const inRange = (compte: string, ranges: string[][]): boolean => {
  const c = String(compte).trim();
  return ranges.some(([f, t]) => {
    if (f === t) return c.startsWith(f);
    const low = f.padEnd(16, '0');
    const high = t.padEnd(16, '9');
    const value = c.padEnd(16, '0');
    return value >= low && value <= high;
  });
};

// ─── TYPES ─────────────────────────────────────────────
export interface BalanceLine {
  compte: string;
  intitule: string;
  sd: number; sc: number;
  md: number; mc: number;
  sfd: number; sfc: number;
  poste_cible?: string | null;
  id?: string;
  exercice_id?: string;
  entreprise_id?: string;
}

export interface JournalLine {
  id: string;
  exercice_id: string;
  entreprise_id: string;
  date_ecriture: string;
  piece: string;
  journal_code: string;
  libelle: string;
  compte: string;
  intitule: string;
  debit: number;
  credit: number;
  /** Écriture (en-tête) dont la ligne est issue — null pour les lignes historiques. */
  ecriture_id?: string | null;
  /** Numéro séquentiel serveur persistant de l'écriture (export FEC). */
  ecriture_numero?: string | null;
  /** Compte auxiliaire (tiers) de la ligne — export FEC. */
  compte_auxiliaire?: string | null;
  /** Libellé du tiers auxiliaire — export FEC. */
  auxiliaire_libelle?: string | null;
}


export interface PlanCompte {
  id: string;
  entreprise_id: string;
  numero: string;
  intitule: string;
  classe: string;
  sens: string;
  type_compte: string;
  actif: boolean;
}

export interface Entreprise {
  id: string;
  nom: string;
  sigle: string;
  ninea: string;
  rccm: string;
  tel: string;
  adresse: string;
  forme_juridique: string;
  secteur: string;
  monnaie: string;
  cabinet_id?: string;
}

export interface Exercice {
  id: string;
  entreprise_id: string;
  annee: number;
  date_debut: string;
  date_fin: string;
  statut: 'en_cours' | 'cloture';
}

// ─── MAPPING DEFINITION ────────────────────────────────
export interface MapLine {
  id: string;
  label: string;
  type?: 'sect' | 'total' | 'gtotal';
  c?: string[][];
  s?: string;
  m?: string;
  refs?: string[];
  f?: (v: Record<string, number>) => number;
  srcCR?: string;
  exclusions?: string[];
  signedMovement?: boolean;
  sign?: number;
  creditNet?: boolean;
}

// ─── AGGREGATION ──────────────────────────────────────
export function aggBalance(balance: BalanceLine[], ranges: string[][], sens: string, mode = 'auto'): number {
  let sum = 0;
  for (const l of balance) {
    if (!inRange(l.compte, ranges)) continue;
    const sdN = (l.sfd || 0) - (l.sfc || 0);
    const sdN1 = (l.sd || 0) - (l.sc || 0);
    let val = 0;
    switch (mode) {
      case 'n':
        val = sens === 'D' ? l.md || 0 : sens === 'C' ? l.mc || 0 : (l.md || 0) - (l.mc || 0);
        break;
      case 'n1':
        val = sens === 'D' ? l.sd || 0 : sens === 'C' ? l.sc || 0 : sdN1;
        break;
      case 'solde':
        val = sens === 'D' ? Math.max(sdN, 0) : sens === 'C' ? Math.max(-sdN, 0) : sdN;
        break;
      case 'solde_n1':
        val = sens === 'D' ? Math.max(sdN1, 0) : sens === 'C' ? Math.max(-sdN1, 0) : sdN1;
        break;
      default:
        if (isBilan(l.compte)) {
          val = sens === 'D' ? Math.max(sdN, 0) : sens === 'C' ? Math.max(-sdN, 0) : sdN;
        } else {
          val = sens === 'D' ? l.md || 0 : sens === 'C' ? l.mc || 0 : (l.md || 0) - (l.mc || 0);
        }
    }
    sum += val;
  }
  return sum;
}

export function aggVar(balance: BalanceLine[], ranges: string[][], sens: string): number {
  let sN = 0, sN1 = 0;
  for (const l of balance) {
    if (!inRange(l.compte, ranges)) continue;
    const sdN = (l.sfd || 0) - (l.sfc || 0);
    const sdN1 = (l.sd || 0) - (l.sc || 0);
    if (sens === 'D') { sN += Math.max(sdN, 0); sN1 += Math.max(sdN1, 0); }
    else if (sens === 'C') { sN += Math.max(-sdN, 0); sN1 += Math.max(-sdN1, 0); }
    else { sN += sdN; sN1 += sdN1; }
  }
  return sN - sN1;
}

export function calc(balance: BalanceLine[], def: MapLine[], extra: Record<string, number> = {}): Record<string, number> {
  if (def === ACTIF) return calculateActif(balance).net;
  if (def === TFT) extra = { ...calc(balance, CR), ...extra };
  const v: Record<string, number> = { ...extra };
  for (const l of def) {
    if (l.type || l.srcCR || !l.c) continue;
    const eligible = balance.filter(b => !l.exclusions?.some(p => b.compte.startsWith(p)));
    if (l.signedMovement) v[l.id] = eligible.filter(b => inRange(b.compte, l.c ?? [])).reduce((sum, b) => sum + (b.mc || 0) - (b.md || 0), 0);
    else if (l.creditNet) v[l.id] = -aggBalance(eligible, l.c, 'SC');
    else if (l.m === 'var') v[l.id] = aggVar(eligible, l.c, l.s || 'D');
    else v[l.id] = aggBalance(eligible, l.c, l.s || 'D', l.m || 'auto') * (l.sign ?? 1);
  }
  for (const l of def) { if (l.srcCR) v[l.id] = extra[l.srcCR] ?? 0; }
  for (let i = 0; i < 10; i++) {
    for (const l of def) {
      if (l.type === 'sect') continue;
      if (!l.f && !l.refs) continue;
      const val = l.f ? l.f(v) : l.refs?.reduce((s, r) => s + (v[r] ?? 0), 0);
      if (val !== undefined && !Number.isNaN(val)) v[l.id] = val;
    }
  }
  if (def === PASSIF && !balance.some(b => /^13/.test(b.compte) && (b.sfd || b.sfc))) {
    v.CJ = calc(balance, CR).XI ?? 0;
    for (let i = 0; i < 3; i++) for (const l of def) {
      if (l.refs) v[l.id] = l.refs.reduce((sum, id) => sum + (v[id] ?? 0), 0);
      else if (l.f) v[l.id] = l.f(v);
    }
  }
  return v;
}

// ══════════════════════════════════════════════════════════
// SYSCOHADA RÉVISÉ — RÉFÉRENCES OFFICIELLES DSF
// ══════════════════════════════════════════════════════════

export const ACTIF: MapLine[] = [
  { id: 'S_II', label: 'ACTIF IMMOBILISÉ', type: 'sect' },
  // Immobilisations incorporelles
  { id: 'AD', label: 'IMMOBILISATIONS INCORPORELLES', type: 'total', refs: ['AE', 'AF', 'AG', 'AH'] },
  { id: 'AE', label: 'Frais de développement et de prospection', c: [['211', '211']], s: 'D' },
  { id: 'AF', label: 'Brevets, licences, logiciels, droits similaires', c: [['212', '215']], s: 'D' },
  { id: 'AG', label: 'Fonds commercial et droit au bail', c: [['216', '217']], s: 'D' },
  { id: 'AH', label: 'Autres immobilisations incorporelles', c: [['211', '211'], ['218', '219']], s: 'D' },
  // Immobilisations corporelles
  { id: 'AI', label: 'IMMOBILISATIONS CORPORELLES', type: 'total', refs: ['AJ', 'AK', 'AL', 'AM', 'AN'] },
  { id: 'AJ', label: 'Terrains', c: [['221', '229']], s: 'D' },
  { id: 'AK', label: 'Bâtiments', c: [['231', '239']], s: 'D' },
  { id: 'AL', label: 'Aménagements, agencements et installations', c: [['241', '243']], s: 'D' },
  { id: 'AM', label: 'Matériel, mobilier et actifs biologiques', c: [['244', '244'], ['246', '248']], s: 'D' },
  { id: 'AN', label: 'Matériel de transport', c: [['245', '245']], s: 'D' },
  { id: 'AP', label: 'Avances et acomptes sur immobilisations', c: [['25', '259']], s: 'D' },
  // Immobilisations financières
  { id: 'AQ', label: 'IMMOBILISATIONS FINANCIÈRES', type: 'total', refs: ['AR', 'AS'] },
  { id: 'AR', label: 'Titres de participation', c: [['261', '263']], s: 'D' },
  { id: 'AS', label: 'Autres immobilisations financières', c: [['264', '269'], ['271', '279']], s: 'D' },
  { id: 'AZ', label: 'TOTAL ACTIF IMMOBILISÉ (I)', type: 'gtotal', refs: ['AD', 'AI', 'AP', 'AQ'] },

  { id: 'S_AC', label: 'ACTIF CIRCULANT', type: 'sect' },
  { id: 'BA', label: 'Actif circulant HAO', c: [['475', '475']], s: 'D' },
  { id: 'BB', label: 'Stocks et en-cours', c: [['31', '39']], s: 'D' },
  // Créances et emplois assimilés
  { id: 'BG', label: 'CRÉANCES ET EMPLOIS ASSIMILÉS', type: 'total', refs: ['BH', 'BI', 'BJ'] },
  { id: 'BH', label: 'Fournisseurs, avances versées', c: [['4091', '4098']], s: 'D' },
  { id: 'BI', label: 'Clients', c: [['411', '4198']], s: 'D' },
  // Non-compensation : les fournisseurs au solde débiteur figurent à l'actif
  { id: 'BJ', label: 'Autres créances', c: [['401', '408'], ['42', '47']], s: 'D' },
  { id: 'BK', label: 'TOTAL ACTIF CIRCULANT (II)', type: 'gtotal', refs: ['BA', 'BB', 'BG'] },

  { id: 'S_TA', label: 'TRÉSORERIE — ACTIF', type: 'sect' },
  { id: 'BQ', label: 'Titres de placement', c: [['50', '509']], s: 'D' },
  { id: 'BR', label: 'Valeurs à encaisser', c: [['511', '519']], s: 'D' },
  { id: 'BS', label: 'Banques, chèques postaux, caisse', c: [['521', '585']], s: 'D' },
  { id: 'BT', label: 'TOTAL TRÉSORERIE ACTIF (III)', type: 'total', refs: ['BQ', 'BR', 'BS'] },

  { id: 'BU', label: 'Écart de conversion actif', c: [['478', '478']], s: 'D' },
  { id: 'BZ', label: 'TOTAL GÉNÉRAL ACTIF (I+II+III)', type: 'gtotal', refs: ['AZ', 'BK', 'BT', 'BU'] },
];

const PASSIF_LAYOUT: MapLine[] = [
  { id: 'S_CP', label: 'CAPITAUX PROPRES', type: 'sect' },
  { id: 'CA', label: 'Capital', c: [['101', '104']], s: 'C' },
  { id: 'CB', label: 'Apporteurs capital non appelé (−)', c: [['109', '109']], s: 'D' },
  { id: 'CD', label: 'Écarts de réévaluation', c: [['106', '106']], s: 'C' },
  { id: 'CE', label: 'Primes liées au capital social', c: [['105', '105'], ['107', '108']], s: 'C' },
  { id: 'CF', label: 'Réserves indisponibles', c: [['111', '113']], s: 'C' },
  { id: 'CG', label: 'Réserves libres', c: [['114', '119']], s: 'C' },
  { id: 'CH', label: 'Report à nouveau (+/−)', c: [['121', '129']], s: 'SC' },
  { id: 'CJ', label: 'Résultat net de l\'exercice (+/−)', c: [['130', '139']], s: 'SC' },
  { id: 'CL', label: "Subvention d'investissement", c: [['14', '149']], s: 'C' },
  { id: 'CM', label: 'Provisions réglementées', c: [['15', '159']], s: 'C' },
  { id: 'CP', label: 'TOTAL CAPITAUX PROPRES (I)', type: 'gtotal', refs: ['CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CJ', 'CL', 'CM'] },

  { id: 'S_DF', label: 'DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES', type: 'sect' },
  { id: 'DA', label: 'Emprunts et dettes financières', c: [['161', '169']], s: 'C' },
  { id: 'DB', label: 'Dettes de location-acquisition', c: [['17', '179']], s: 'C' },
  { id: 'DC', label: 'Provisions pour risques et charges', c: [['19', '199']], s: 'C' },
  { id: 'DD', label: 'TOTAL DETTES FINANCIÈRES (II)', type: 'total', refs: ['DA', 'DB', 'DC'] },
  { id: 'DF', label: 'TOTAL RESSOURCES STABLES (I+II)', type: 'gtotal', refs: ['CP', 'DD'] },

  { id: 'S_PC', label: 'PASSIF CIRCULANT', type: 'sect' },
  { id: 'DH', label: 'Dettes circulantes HAO', c: [['481', '489']], s: 'C' },
  { id: 'DI', label: 'Clients, avances reçues', c: [['4191', '4198']], s: 'C' },
  { id: 'DJ', label: "Fournisseurs d'exploitation", c: [['401', '408']], s: 'C' },
  { id: 'DK', label: 'Dettes fiscales et sociales', c: [['421', '459']], s: 'C' },
  // Non-compensation : les clients au solde créditeur figurent au passif
  { id: 'DM', label: 'Autres dettes', c: [['411', '418'], ['46', '478']], s: 'C' },
  { id: 'DN', label: 'Risques provisionnés', c: [['499', '499']], s: 'C' },
  { id: 'DP', label: 'TOTAL PASSIF CIRCULANT (III)', type: 'gtotal', refs: ['DH', 'DI', 'DJ', 'DK', 'DM', 'DN'] },

  { id: 'S_TP', label: 'TRÉSORERIE — PASSIF', type: 'sect' },
  { id: 'DQ', label: "Banques, crédits d'escompte", c: [['561', '564']], s: 'C' },
  // Tout compte de trésorerie au solde créditeur (découvert) bascule en trésorerie-passif
  { id: 'DR', label: 'Banques, crédits de trésorerie et découvert', c: [['521', '559'], ['565', '569']], s: 'C' },
  { id: 'DT', label: 'TOTAL TRÉSORERIE PASSIF (IV)', type: 'total', refs: ['DQ', 'DR'] },

  { id: 'DV', label: 'Écart de conversion passif', c: [['479', '479']], s: 'C' },
  { id: 'DZ', label: 'TOTAL GÉNÉRAL PASSIF (I+II+III+IV)', type: 'gtotal', refs: ['CP', 'DD', 'DP', 'DT', 'DV'] },
];

const CR_LAYOUT: MapLine[] = [
  { id: 'TA', label: 'Ventes de marchandises', c: [['701', '701']], s: 'C', m: 'n' },
  { id: 'RA', label: '(−) Achats de marchandises', c: [['601', '601']], s: 'D', m: 'n' },
  { id: 'RB', label: '(±) Variation de stocks de marchandises', c: [['6031', '6031']], s: 'SC', m: 'n' },
  { id: 'XA', label: 'MARGE COMMERCIALE (Somme TA à RB)', type: 'gtotal', f: v => v.TA - v.RA - v.RB },

  { id: 'TB', label: 'Ventes de produits fabriqués', c: [['702', '702']], s: 'C', m: 'n' },
  { id: 'TC', label: 'Travaux, services vendus', c: [['703', '706']], s: 'C', m: 'n' },
  { id: 'TD', label: 'Produits accessoires', c: [['707', '708']], s: 'C', m: 'n' },
  { id: 'XB', label: "CHIFFRE D'AFFAIRES (A+B+C+D)", type: 'gtotal', f: v => v.TA + v.TB + v.TC + v.TD },

  { id: 'TE', label: '(±) Production stockée (ou déstockage)', c: [['73', '739']], s: 'SC', m: 'n' },
  { id: 'TF', label: 'Production immobilisée', c: [['72', '729']], s: 'C', m: 'n' },
  { id: 'TG', label: "Subventions d'exploitation", c: [['75', '759']], s: 'C', m: 'n' },
  { id: 'TH', label: 'Autres produits', c: [['71', '719']], s: 'C', m: 'n' },
  { id: 'TI', label: "Transferts de charges d'exploitation", c: [['781', '781']], s: 'C', m: 'n' },

  { id: 'RC', label: '(−) Achats de matières premières et fournitures liées', c: [['602', '602']], s: 'D', m: 'n' },
  { id: 'RD', label: '(±) Variation de stocks de matières premières', c: [['6032', '6032']], s: 'SC', m: 'n' },
  { id: 'RE', label: '(−) Autres achats', c: [['604', '609']], s: 'D', m: 'n' },
  { id: 'RF', label: '(±) Variation de stocks d\'autres approvisionnements', c: [['6033', '6039']], s: 'SC', m: 'n' },
  { id: 'RG', label: '(−) Transports', c: [['61', '619']], s: 'D', m: 'n' },
  { id: 'RH', label: '(−) Services extérieurs', c: [['62', '629']], s: 'D', m: 'n' },
  { id: 'RI', label: '(−) Impôts et taxes', c: [['63', '639']], s: 'D', m: 'n' },
  { id: 'RJ', label: '(−) Autres charges', c: [['64', '649']], s: 'D', m: 'n' },

  { id: 'XC', label: 'VALEUR AJOUTÉE (XB+RA+RB) + (Somme TE à RJ)', type: 'gtotal', f: v => v.XA + v.TB + v.TC + v.TD + v.TE + v.TF + v.TG + v.TH + v.TI - v.RC - v.RD - v.RE - v.RF - v.RG - v.RH - v.RI - v.RJ },

  { id: 'RK', label: '(−) Charges de personnel', c: [['66', '669']], s: 'D', m: 'n' },
  { id: 'XD', label: "EXCÉDENT BRUT D'EXPLOITATION (XC+RK)", type: 'gtotal', f: v => v.XC - v.RK },

  { id: 'TJ', label: 'Reprises d\'amortissements, provisions et dépréciations', c: [['791', '795']], s: 'C', m: 'n' },
  { id: 'RL', label: '(−) Dotations aux amortissements, provisions et dépréciations', c: [['681', '681'], ['691', '693']], s: 'D', m: 'n' },

  { id: 'XE', label: "RÉSULTAT D'EXPLOITATION (XD+TJ+RL)", type: 'gtotal', f: v => v.XD + v.TJ - v.RL },

  { id: 'TK', label: 'Revenus financiers et assimilés', c: [['77', '779']], s: 'C', m: 'n' },
  { id: 'TL', label: 'Reprises de provisions et dépréciations financières', c: [['796', '796'], ['787', '787']], s: 'C', m: 'n' },
  { id: 'TM', label: "Transferts de charges financières", c: [['797', '797']], s: 'C', m: 'n' },
  { id: 'RM', label: '(−) Frais financiers et charges assimilés', c: [['67', '679']], s: 'D', m: 'n' },
  { id: 'RN', label: '(−) Dotations aux provisions et dépréciations financières', c: [['697', '697']], s: 'D', m: 'n' },

  { id: 'XF', label: 'RÉSULTAT FINANCIER (Somme TK à RN)', type: 'gtotal', f: v => v.TK + v.TL + v.TM - v.RM - v.RN },
  { id: 'XG', label: 'RÉSULTAT DES ACTIVITÉS ORDINAIRES (XE+XF)', type: 'gtotal', f: v => v.XE + v.XF },

  { id: 'TN', label: "Produits des cessions d'immobilisations", c: [['82', '829']], s: 'C', m: 'n' },
  { id: 'TO', label: 'Autres produits HAO', c: [['84', '849'], ['86', '869'], ['88', '889']], s: 'C', m: 'n' },
  { id: 'RO', label: "(−) Valeurs comptables des cessions d'immobilisations", c: [['81', '819']], s: 'D', m: 'n' },
  { id: 'RP', label: '(−) Autres charges HAO', c: [['83', '839'], ['85', '859']], s: 'D', m: 'n' },

  { id: 'XH', label: 'RÉSULTAT HAO (Somme TN à RP)', type: 'gtotal', f: v => v.TN + v.TO - v.RO - v.RP },

  { id: 'RQ', label: '(−) Participation des travailleurs', c: [['87', '879']], s: 'D', m: 'n' },
  { id: 'RS', label: '(−) Impôts sur le résultat', c: [['89', '899']], s: 'D', m: 'n' },

  { id: 'XI', label: "RÉSULTAT NET (XG+XH+RQ+RS)", type: 'gtotal', f: v => v.XG + v.XH - v.RQ - v.RS },
];

export const TFT: MapLine[] = [
  { id: 'S_OP', label: 'FLUX DE TRÉSORERIE PROVENANT DES ACTIVITÉS OPÉRATIONNELLES', type: 'sect' },
  { id: 'ZA', label: "Trésorerie nette au 1er janvier (Trésorerie actif N-1 − Trésorerie passif N-1)", f: (v) => v._ZA_actif - v._ZA_passif - v._ZA_472 },
  { id: '_ZA_actif', label: '', c: [['50','58']], s: 'D', m: 'solde_n1' },
  { id: '_ZA_passif', label: '', c: [['52','53'],['561','566']], s: 'C', m: 'solde_n1' },
  { id: '_ZA_472', label: '', c: [['472','472']], s: 'SC', m: 'solde_n1' },
  { id: 'FA', label: "Capacité d'Autofinancement Globale (CAFG)", f: (v) => v._FA_XD + v._FA_654 - v._FA_754 + v._FA_XF + v._FA_TO + v._FA_RP + v._FA_RQ + v._FA_RS },
  { id: '_FA_XD', label: '', srcCR: 'XD' },
  { id: '_FA_XF', label: '', srcCR: 'XF' },
  { id: '_FA_TO', label: '', srcCR: 'TO' },
  { id: '_FA_RP', label: '', srcCR: 'RP' },
  { id: '_FA_RQ', label: '', srcCR: 'RQ' },
  { id: '_FA_RS', label: '', srcCR: 'RS' },
  { id: '_FA_654', label: '', c: [['654','654']], s: 'D', m: 'n' },
  { id: '_FA_754', label: '', c: [['754','754']], s: 'C', m: 'n' },
  { id: '_FA_dot', label: '', c: [['681', '681'], ['691', '693']], s: 'D', m: 'n' },
  { id: '_FA_rep', label: '', c: [['791', '795'], ['796', '796'], ['787', '787']], s: 'C', m: 'n' },
  { id: '_FA_vnc', label: '', c: [['81', '819']], s: 'D', m: 'n' },
  { id: '_FA_pci', label: '', c: [['82', '829']], s: 'C', m: 'n' },
  { id: 'FB', label: '(−) Variation de l\'actif circulant HAO', c: [['488', '488']], s: 'D', m: 'var' },
  { id: 'FC', label: '(−) Variation des stocks', c: [['31', '38']], s: 'D', m: 'var' },
  { id: 'FD', label: '(−) Variation des créances', c: [['401','47']], exclusions: ['414','467','458','4494','475','472','478','479','481','482','485'], s: 'D', m: 'var' },
  { id: 'FE', label: '(+) Variation du passif circulant', c: [['401','499']], exclusions: ['404','481','482','467','475','472','478','479'], s: 'C', m: 'var' },
  { id: 'VO', label: 'Variations du BFR lié aux activités opérationnelles (FB+FC+FD+FE)', type: 'total', refs: ['FB', 'FC', 'FD', 'FE'] },
  { id: 'ZB', label: 'FLUX DE TRÉSORERIE PROVENANT DES ACTIVITÉS OPÉRATIONNELLES (A)', type: 'gtotal', f: v => v.FA - v.FB - v.FC - v.FD + v.FE },

  { id: 'S_IV', label: "FLUX DE TRÉSORERIE PROVENANT DES ACTIVITÉS D'INVESTISSEMENT", type: 'sect' },
  { id: 'FF', label: "(−) Décaissements liés aux acquisitions d'immobilisations incorporelles", c: [['21','21']], s: 'D', m: 'var' },
  { id: 'FG', label: "(−) Décaissements liés aux acquisitions d'immobilisations corporelles", c: [['22', '24']], s: 'D', m: 'var' },
  { id: 'FH', label: "(−) Décaissements liés aux acquisitions d'immobilisations financières", c: [['26', '27']], s: 'D', m: 'var' },
  { id: 'FI', label: "(+) Encaissements liés aux cessions d'immobilisations incorporelles et corporelles", c: [['821','825'],['754','754']], s: 'C', m: 'n' },
  { id: 'FJ', label: "(+) Encaissements liés aux cessions d'immobilisations financières", c: [['826', '829']], s: 'C', m: 'n' },
  { id: 'ZC', label: "FLUX DE TRÉSORERIE PROVENANT DES ACTIVITÉS D'INVESTISSEMENT (B)", type: 'gtotal', f: v => -v.FF - v.FG - v.FH + v.FI + v.FJ },

  { id: 'S_FN', label: 'FLUX DE TRÉSORERIE PROVENANT DES ACTIVITÉS DE FINANCEMENT', type: 'sect' },
  { id: 'FK', label: '(+) Augmentation de capital par apports nouveaux', c: [['101', '103']], s: 'C', m: 'n' },
  { id: 'FL', label: '(+) Subventions d\'investissement reçues', c: [['14', '149']], s: 'C', m: 'n' },
  { id: 'FM', label: '(−) Prélèvements sur le capital', c: [['101', '103']], s: 'D', m: 'n' },
  { id: 'FN', label: '(−) Dividendes versés', c: [['465', '465']], s: 'D', m: 'n' },
  { id: 'ZD', label: 'Flux de trésorerie provenant des capitaux propres (D)', type: 'total', f: v => v.FK + v.FL - v.FM - v.FN },
  { id: 'FO', label: '(+) Emprunts', c: [['161', '169']], s: 'C', m: 'n' },
  { id: 'FP', label: '(+) Autres dettes financières', c: [['18','18']], exclusions: ['183'], s: 'C', m: 'n' },
  { id: 'FQ', label: '(−) Remboursements des emprunts et autres dettes financières', c: [['16','18']], exclusions: ['166','176','183'], s: 'D', m: 'n' },
  { id: 'ZE', label: 'Flux de trésorerie provenant des capitaux étrangers (E)', type: 'total', f: v => v.FO + v.FP - v.FQ },
  { id: 'ZF', label: 'FLUX DE TRÉSORERIE PROVENANT DES ACTIVITÉS DE FINANCEMENT (F=D+E)', type: 'gtotal', refs: ['ZD', 'ZE'] },

  { id: 'ZG', label: 'VARIATION DE LA TRÉSORERIE NETTE DE LA PÉRIODE (G=A+B+F)', type: 'gtotal', refs: ['ZB', 'ZC', 'ZF'] },

  { id: 'ZH', label: 'Trésorerie nette au 31 décembre (G+A) — Contrôle', type: 'gtotal', f: v => v.ZG + v.ZA },
];


function mappedLayout(layout: MapLine[], state: string): MapLine[] {
  return layout.map(line => {
    const row = REFERENCE_MAPPING.find(r => r.etat === state && r.poste === line.id);
    if (!row) return line;
    if (row.comptes_prefixes.startsWith('FORMULE:')) return { id: line.id, label: row.libelle, type: line.type, f: v => referenceFormula(row.comptes_prefixes.slice(8), v) };
    return {
      id: line.id, label: row.libelle,
      c: row.comptes_prefixes.split(';').map(p => [p, p]),
      exclusions: row.exclusions.split(';').filter(Boolean),
      s: row.sens_solde.startsWith('D') ? 'D' : 'C',
      signedMovement: state === 'RESULTAT',
      creditNet: row.sens_solde === 'net',
      sign: row.signe === '-1' ? -1 : 1,
    };
  });
}
export const CR = mappedLayout(CR_LAYOUT, 'RESULTAT');
export const PASSIF = mappedLayout(PASSIF_LAYOUT, 'BILAN_PASSIF');

export function calculateActif(balance: BalanceLine[]) {
  const brut: Record<string, number> = {}, amort: Record<string, number> = {};
  const issues: string[] = [];
  for (const line of balance) {
    const amount = (line.sfd || 0) - (line.sfc || 0);
    if (!amount) continue;
    const column = /^(28|29|39|49|59)/.test(line.compte) ? 'amort_deprec' : 'brut';
    const candidates = REFERENCE_MAPPING.filter(r => r.etat === 'BILAN_ACTIF' && r.colonne === column)
      .flatMap(r => r.comptes_prefixes.split(';').filter(p => line.compte.startsWith(p.replace('*',''))).map(p => ({ row: r, prefix: p })));
    const longest = Math.max(0, ...candidates.map(c => c.prefix.replace('*','').length));
    let selected = candidates.filter(c => c.prefix.replace('*','').length === longest);
    if (selected.some(c => c.prefix.includes('*'))) {
      selected = selected.filter(c => c.row.poste === line.poste_cible);
      if (selected.length !== 1) { issues.push(`C08 : ${line.compte} exige un poste cible`); continue; }
    }
    const unique = [...new Set(selected.map(c => c.row.poste))];
    if (unique.length > 1) { issues.push(`C07 : ${line.compte} alimente plusieurs postes`); continue; }
    const id = unique[0];
    if (!id) continue;
    const values = column === 'brut' ? brut : amort;
    values[id] = (values[id] ?? 0) + Math.max(column === 'brut' ? amount : -amount, 0);
  }
  for (let i=0;i<4;i++) for (const l of ACTIF) if (l.refs) {
    brut[l.id] = l.refs.reduce((s,id) => s+(brut[id] ?? 0),0);
    amort[l.id] = l.refs.reduce((s,id) => s+(amort[id] ?? 0),0);
  }
  const net = Object.fromEntries(ACTIF.filter(l => l.type !== 'sect').map(l => [l.id, (brut[l.id] ?? 0)-(amort[l.id] ?? 0)]));
  return { brut, amort, net, issues };
}
