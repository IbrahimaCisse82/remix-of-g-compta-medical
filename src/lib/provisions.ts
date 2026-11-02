// ─── PROVISIONS & DÉPRÉCIATIONS — logique métier pure (SYSCOHADA révisé) ──
// Natures normalisées : comptes de provision (19X/29X/39X/491), dotations (6X)
// et reprises (7X). Fonctions pures, testables unitairement.

export type NatureCode =
  | 'exploitation'
  | 'financiere'
  | 'hao'
  | 'depreciation_immo'
  | 'depreciation_stock'
  | 'depreciation_creance';

export interface NatureProvision {
  code: NatureCode;
  label: string;
  /** Compte de provision / dépréciation (crédité à la dotation). */
  cp: string;
  /** Compte de dotation (débité). */
  cd: string;
  /** Compte de reprise (crédité à la reprise). */
  cr: string;
}

export const NATURES_PROVISIONS: NatureProvision[] = [
  { code: 'exploitation', label: "Provision risques et charges d'exploitation", cp: '191', cd: '6911', cr: '7911' },
  { code: 'financiere', label: 'Provision risques et charges financières', cp: '194', cd: '6971', cr: '7971' },
  { code: 'hao', label: 'Provision risques et charges HAO', cp: '198', cd: '854', cr: '864' },
  { code: 'depreciation_immo', label: 'Dépréciation immobilisations (29X)', cp: '291', cd: '6913', cr: '7913' },
  { code: 'depreciation_stock', label: 'Dépréciation stocks (39X)', cp: '391', cd: '6593', cr: '7593' },
  { code: 'depreciation_creance', label: 'Dépréciation créances (491)', cp: '491', cd: '6594', cr: '7594' },
];

export function natureProvision(code: string): NatureProvision | undefined {
  return NATURES_PROVISIONS.find(n => n.code === code);
}

export interface LigneEcriture {
  entreprise_id: string;
  exercice_id: string;
  date_ecriture: string;
  piece: string;
  journal_code: string;
  libelle: string;
  compte: string;
  intitule: string;
  debit: number;
  credit: number;
}

export interface ProvisionRef {
  code: string;
  libelle: string;
  compte_provision: string;
  compte_dotation: string;
  compte_reprise: string;
  montant_actuel: number;
}

export interface CtxEcriture {
  entreprise_id: string;
  exercice_id: string;
  date: string;
}

/** Lignes OD de dotation : débit dotation / crédit provision. */
export function lignesDotationProvision(p: ProvisionRef, ctx: CtxEcriture): LigneEcriture[] {
  const piece = `PROV-${p.code}`;
  const libelle = `Dotation provision ${p.code} — ${p.libelle}`;
  return [
    { ...ctx, date_ecriture: ctx.date, piece, journal_code: 'OD', libelle, compte: p.compte_dotation, intitule: 'Dotations aux provisions', debit: p.montant_actuel, credit: 0 },
    { ...ctx, date_ecriture: ctx.date, piece, journal_code: 'OD', libelle, compte: p.compte_provision, intitule: 'Provisions', debit: 0, credit: p.montant_actuel },
  ];
}

/** Message d'erreur si le montant de reprise est invalide, sinon null. */
export function validerMontantReprise(montant: number, montantActuel: number): string | null {
  if (!(montant > 0) || montant > montantActuel) return 'Montant invalide';
  return null;
}

/** Lignes OD de reprise : débit provision / crédit reprise. */
export function lignesRepriseProvision(p: ProvisionRef, montant: number, ctx: CtxEcriture): LigneEcriture[] {
  const err = validerMontantReprise(montant, p.montant_actuel);
  if (err) throw new Error(err);
  const piece = `REP-${p.code}`;
  const libelle = `Reprise provision ${p.code} — ${p.libelle}`;
  return [
    { ...ctx, date_ecriture: ctx.date, piece, journal_code: 'OD', libelle, compte: p.compte_provision, intitule: 'Provisions', debit: montant, credit: 0 },
    { ...ctx, date_ecriture: ctx.date, piece, journal_code: 'OD', libelle, compte: p.compte_reprise, intitule: 'Reprises sur provisions', debit: 0, credit: montant },
  ];
}

/** Encours total des provisions non totalement reprises. */
export function encoursProvisions(list: Array<{ statut: string; montant_actuel: number }>): number {
  return list
    .filter(p => p.statut !== 'reprise_totale')
    .reduce((s, p) => s + p.montant_actuel, 0);
}

/**
 * Provision déjà comptabilisée pour une provision donnée : crédits − débits de son compte de provision sur les
 * pièces PROV-<code>-… (dotations) et REP-<code>-… (reprises), tous exercices confondus.
 */
export function provisionComptabilisee(code: string, compteProvision: string, lignes: Array<{ piece: string | null; compte: string; debit: number; credit: number }>): number {
  const rattachee = (piece: string | null) => !!piece && (piece.startsWith(`PROV-${code}-`) || piece.startsWith(`REP-${code}-`));
  return Math.round(lignes.filter(l => l.compte === compteProvision && rattachee(l.piece))
    .reduce((s, l) => s + Number(l.credit || 0) - Number(l.debit || 0), 0) * 100) / 100;
}

/** Pièce de dotation de l'exercice : PROV-<code>-<année>, puis -2, -3… pour un complément dans le même exercice. */
export function pieceDotation(code: string, annee: number, piecesExistantes: string[]): string {
  const base = `PROV-${code}-${annee}`;
  if (!piecesExistantes.includes(base)) return base;
  let n = 2;
  while (piecesExistantes.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
