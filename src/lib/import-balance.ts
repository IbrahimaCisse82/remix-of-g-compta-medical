/**
 * Reprise d'une balance des comptes (Sage 100 « Balance des comptes », export CSV d'un autre logiciel)
 * dans l'exercice ouvert : les soldes d'ouverture deviennent une écriture d'à-nouveaux (journal AN, au
 * premier jour de l'exercice) et les mouvements de la période une écriture d'opérations diverses
 * (journal OD, au dernier jour). La balance de l'application reproduit alors exactement celle du fichier.
 *
 * Contrôles avant import : équilibre de chaque paire de colonnes, cohérence ouverture + mouvements =
 * solde pour chaque compte, sous-totaux du fichier écartés (ex. « 62 SERVICES EXTERIEURS »), comptes
 * de résultat 13 refusés (le résultat est déterminé par la clôture).
 */
import type { BalanceLine } from './accounting';

export interface LigneBalanceImport {
  compte: string;
  intitule: string;
  ouvD: number; ouvC: number;
  mvtD: number; mvtC: number;
  solD: number; solC: number;
}

/** Élément de texte positionné (PDF) : contenu et abscisses gauche / droite. */
export interface ElementTexte { t: string; x0: number; x1: number }
export type LigneTexte = ElementTexte[];

const MONTANT = /^-?\d{1,3}(?:[.\s  ]\d{3})*(?:,\d+)?$|^-?\d+(?:[.,]\d+)?$/;
const COMPTE = /^\d{2,12}$/;
export const montantTexte = (s: string) => {
  const t = s.trim().replace(/[\s  ]/g, '');
  // « 1.000.000 » (séparateur de milliers point, format Sage) ou « 1000000,50 ».
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return Number(t.replace(/\./g, '').replace(',', '.')) || 0;
};

const normaliser = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Balance au format colonnes (PDF) : la ligne d'en-tête « Débit Crédit Débit Crédit Débit Crédit »
 * fixe la position des six colonnes ; chaque montant est rangé dans la colonne dont le bord droit est
 * le plus proche du sien. Avec quatre colonnes, ce sont les mouvements et les soldes.
 */
export function analyserLignesPositionnees(lignes: LigneTexte[]): LigneBalanceImport[] {
  let colonnes: number[] | null = null;
  const sortie: LigneBalanceImport[] = [];
  for (const ligne of lignes) {
    const entetes = ligne.filter(e => /^(debit|credit)$/.test(normaliser(e.t.trim())));
    if (entetes.length >= 4) { colonnes = entetes.map(e => e.x1); continue; }
    if (!colonnes || !ligne.length) continue;
    const premier = ligne[0].t.trim().split(/\s+/)[0];
    if (!COMPTE.test(premier)) continue;
    const montants: number[] = new Array(colonnes.length).fill(0);
    const libelle: string[] = [ligne[0].t.trim().slice(premier.length).trim()];
    for (const e of ligne.slice(1)) {
      const t = e.t.trim();
      if (MONTANT.test(t) && e.x0 > colonnes[0] - 160) {
        let i = 0;
        colonnes.forEach((x, k) => { if (Math.abs(x - e.x1) < Math.abs(colonnes![i] - e.x1)) i = k; });
        montants[i] += montantTexte(t);
      } else libelle.push(t);
    }
    sortie.push(versLigne(premier, libelle.filter(Boolean).join(' '), montants));
  }
  return sortie;
}

function versLigne(compte: string, intitule: string, m: number[]): LigneBalanceImport {
  if (m.length >= 6) return { compte, intitule, ouvD: m[0], ouvC: m[1], mvtD: m[2], mvtC: m[3], solD: m[4], solC: m[5] };
  if (m.length >= 4) {
    // Mouvements et soldes seulement : l'ouverture se déduit (solde − mouvements).
    const ouv = (m[2] - m[3]) - (m[0] - m[1]);
    return { compte, intitule, ouvD: Math.max(ouv, 0), ouvC: Math.max(-ouv, 0), mvtD: m[0], mvtC: m[1], solD: m[2], solC: m[3] };
  }
  // Soldes seuls : repris comme mouvements de la période.
  return { compte, intitule, ouvD: 0, ouvC: 0, mvtD: m[0] ?? 0, mvtC: m[1] ?? 0, solD: m[0] ?? 0, solC: m[1] ?? 0 };
}

/** Balance CSV / texte tabulé : colonne Compte, Intitulé puis 2, 4 ou 6 colonnes Débit / Crédit. */
export function analyserCsv(texte: string): LigneBalanceImport[] {
  const sep = texte.includes('\t') ? '\t' : texte.split('\n')[0].includes(';') ? ';' : ',';
  const lignes = texte.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()));
  const iEntete = lignes.findIndex(l => l.some(c => /^compte|n.*compte/.test(normaliser(c))) && l.some(c => normaliser(c).includes('debit')));
  if (iEntete < 0) throw new Error('En-tête introuvable : colonnes « Compte », « Débit », « Crédit » attendues');
  const entete = lignes[iEntete].map(normaliser);
  const iCompte = entete.findIndex(c => /compte/.test(c) && !/intitule|libelle/.test(c));
  const iIntitule = entete.findIndex(c => /intitule|libelle/.test(c));
  const iMontants = entete.map((c, i) => /debit|credit/.test(c) ? i : -1).filter(i => i >= 0);
  if (![2, 4, 6].includes(iMontants.length)) throw new Error(`Colonnes Débit / Crédit : ${iMontants.length} trouvées, 2, 4 ou 6 attendues`);
  return lignes.slice(iEntete + 1).filter(l => COMPTE.test(l[iCompte] ?? ''))
    .map(l => versLigne(l[iCompte], l[iIntitule] ?? '', iMontants.map(i => montantTexte(l[i] ?? '0'))));
}

/** Écarte les sous-totaux du fichier : un compte dont le numéro préfixe un autre compte de la balance. */
export function ecarterSousTotaux(lignes: LigneBalanceImport[]): { lignes: LigneBalanceImport[]; ecartes: LigneBalanceImport[] } {
  const comptes = lignes.map(l => l.compte);
  const ecartes = lignes.filter(l => comptes.some(c => c !== l.compte && c.startsWith(l.compte)));
  return { lignes: lignes.filter(l => !ecartes.includes(l)), ecartes };
}

export interface ControleImport { ok: boolean; message: string; bloquant: boolean }

export function controlerBalance(lignes: LigneBalanceImport[]): { totaux: Record<string, number>; controles: ControleImport[] } {
  const t = { ouvD: 0, ouvC: 0, mvtD: 0, mvtC: 0, solD: 0, solC: 0 };
  for (const l of lignes) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += l[k];
  const egal = (a: number, b: number) => Math.abs(a - b) < 1;
  const incoherents = lignes.filter(l => !egal((l.ouvD - l.ouvC) + (l.mvtD - l.mvtC), l.solD - l.solC));
  const resultat = lignes.filter(l => /^13/.test(l.compte) && (l.ouvD || l.ouvC || l.mvtD || l.mvtC));
  const controles: ControleImport[] = [
    { ok: lignes.length > 0, message: `${lignes.length} comptes lus`, bloquant: true },
    { ok: egal(t.ouvD, t.ouvC), message: `Ouverture : débit ${t.ouvD} / crédit ${t.ouvC}`, bloquant: true },
    { ok: egal(t.mvtD, t.mvtC), message: `Mouvements : débit ${t.mvtD} / crédit ${t.mvtC}`, bloquant: true },
    { ok: egal(t.solD, t.solC), message: `Soldes : débit ${t.solD} / crédit ${t.solC}`, bloquant: true },
    { ok: incoherents.length === 0, message: incoherents.length ? `Ouverture + mouvements ≠ solde : ${incoherents.map(l => l.compte).join(', ')}` : 'Ouverture + mouvements = solde pour chaque compte', bloquant: true },
    { ok: resultat.length === 0, message: resultat.length ? `Comptes de résultat 13 (${resultat.map(l => l.compte).join(', ')}) : affectez le résultat en report à nouveau (12) avant la reprise` : 'Aucun compte de résultat 13', bloquant: true },
  ];
  return { totaux: t, controles };
}

/** Balance au format de l'application (aperçu des états avant import). */
export function versBalanceApplication(lignes: LigneBalanceImport[]): BalanceLine[] {
  return lignes.map(l => {
    const ouv = l.ouvD - l.ouvC, sd = Math.max(ouv, 0), sc = Math.max(-ouv, 0);
    const md = sd + l.mvtD, mc = sc + l.mvtC, n = md - mc;
    return { compte: l.compte, intitule: l.intitule, sd, sc, md, mc, sfd: Math.max(n, 0), sfc: Math.max(-n, 0) };
  });
}

export interface LigneEcritureImport { compte: string; intitule: string; libelle: string; debit: number; credit: number }

/** Écritures de reprise : à-nouveaux (soldes d'ouverture nets) et mouvements de la période. */
export function ecrituresDeReprise(lignes: LigneBalanceImport[]): { aNouveaux: LigneEcritureImport[]; mouvements: LigneEcritureImport[] } {
  const aNouveaux: LigneEcritureImport[] = [], mouvements: LigneEcritureImport[] = [];
  for (const l of lignes) {
    const ouv = Math.round((l.ouvD - l.ouvC) * 100) / 100;
    if (ouv) aNouveaux.push({ compte: l.compte, intitule: l.intitule, libelle: 'Reprise des soldes d’ouverture', debit: Math.max(ouv, 0), credit: Math.max(-ouv, 0) });
    if (l.mvtD) mouvements.push({ compte: l.compte, intitule: l.intitule, libelle: 'Reprise des mouvements de la période', debit: l.mvtD, credit: 0 });
    if (l.mvtC) mouvements.push({ compte: l.compte, intitule: l.intitule, libelle: 'Reprise des mouvements de la période', debit: 0, credit: l.mvtC });
  }
  return { aNouveaux, mouvements };
}

/** Lecture d'un PDF de balance : texte positionné ligne par ligne (pdf.js chargé à la demande). */
export async function lignesPdf(donnees: ArrayBuffer): Promise<LigneTexte[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(donnees) }).promise;
  const sortie: LigneTexte[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const contenu = await page.getTextContent();
    const parY = new Map<number, ElementTexte[]>();
    for (const it of contenu.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      const x0 = it.transform[4];
      (parY.get(y) ?? parY.set(y, []).get(y)!).push({ t: it.str, x0, x1: x0 + it.width });
    }
    for (const y of [...parY.keys()].sort((a, b) => b - a)) sortie.push(parY.get(y)!.sort((a, b) => a.x0 - b.x0));
  }
  return sortie;
}
