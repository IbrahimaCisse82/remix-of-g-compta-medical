/**
 * Règlements fournisseurs / clients : calculs d'affichage de l'échéancier et contrôles de saisie.
 * La comptabilisation, le contrôle du reste dû et le lettrage sont faits côté serveur (fn_regler_tiers,
 * fn_imputer_acompte_tiers, fn_annuler_reglement_tiers) ; ces fonctions ne servent qu'à préparer et présenter.
 */
export type SensReglement = 'fournisseur' | 'client';

export interface FactureOuverte {
  id: string;
  numero: string;
  tiers_id: string;
  date_facture: string;
  date_echeance?: string | null;
  total_ttc: number;
  montant_paye: number;
  statut: string;
  comptabilisee: boolean;
  /** Avoir : s'impute en déduction (compensation avec des factures, ou remboursement). */
  avoir?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const resteDu = (f: Pick<FactureOuverte, 'total_ttc' | 'montant_paye'>) => r2(Number(f.total_ttc) - Number(f.montant_paye || 0));

/** Factures réglables : comptabilisées, non annulées, avec un reste dû ; triées par échéance (sans échéance : date de facture). */
export function facturesOuvertes(factures: FactureOuverte[]): FactureOuverte[] {
  return factures
    .filter(f => f.comptabilisee && f.statut !== 'annulee' && f.statut !== 'brouillon' && resteDu(f) > 0)
    .sort((a, b) => (a.date_echeance || a.date_facture).localeCompare(b.date_echeance || b.date_facture) || a.numero.localeCompare(b.numero));
}

/** Jours de retard à une date (0 si non échue ou sans échéance). */
export function joursRetard(f: Pick<FactureOuverte, 'date_echeance'>, aujourdhui: string): number {
  if (!f.date_echeance || f.date_echeance >= aujourdhui) return 0;
  return Math.round((Date.parse(aujourdhui) - Date.parse(f.date_echeance)) / 86400000);
}

/** Tranches d'antériorité usuelles de la balance âgée. */
export function trancheRetard(jours: number): 'non échu' | '1-30 j' | '31-60 j' | '61-90 j' | '+90 j' {
  if (jours <= 0) return 'non échu';
  if (jours <= 30) return '1-30 j';
  if (jours <= 60) return '31-60 j';
  if (jours <= 90) return '61-90 j';
  return '+90 j';
}

/** Journal utilisé par le serveur : caisse (57) en CA, banques et monnaie électronique en BQ. */
export const journalTresorerie = (compte: string) => (compte.startsWith('57') ? 'CA' : 'BQ');
export const estCompteTresorerie = (compte: string) => /^5[2-7]\d*$/.test(compte.trim());

/** Net du règlement : factures moins avoirs, plus l'acompte. > 0 paiement/encaissement, < 0 remboursement, 0 compensation. */
export function netReglement(factures: FactureOuverte[], montants: Record<string, number>, acompte: number): number {
  return r2(factures.reduce((s, f) => s + (f.avoir ? -1 : 1) * r2(montants[f.id] ?? 0), 0) + r2(acompte));
}

/** Contrôle d'une saisie de règlement avant envoi (le serveur refait tous les contrôles). */
export function controlerReglement(input: {
  factures: FactureOuverte[];
  montants: Record<string, number>;
  acompte: number;
  compte: string;
}): string | null {
  if (input.acompte < 0) return 'Acompte négatif';
  const tiers = new Set(input.factures.map(f => f.tiers_id));
  if (tiers.size > 1) return 'Un règlement porte sur un seul tiers';
  let saisi = r2(input.acompte);
  for (const f of input.factures) {
    const m = r2(input.montants[f.id] ?? 0);
    const quoi = f.avoir ? 'Avoir' : 'Facture';
    if (m < 0) return `${quoi} ${f.numero} : montant négatif`;
    if (m > resteDu(f)) return `${quoi} ${f.numero} : ${m} pour ${resteDu(f)} restant`;
    saisi = r2(saisi + m);
  }
  if (saisi <= 0) return 'Aucun montant à régler';
  const net = netReglement(input.factures, input.montants, input.acompte);
  if (net !== 0 && !estCompteTresorerie(input.compte)) return 'Compte de trésorerie attendu (52 banque, 55 monnaie électronique, 57 caisse)';
  return null;
}

export interface ReglementLu { id: string; acompte: number; annule_le?: string | null }
export interface ImputationLue { reglement_id: string; origine: string; montant: number; annule_le?: string | null }

/** Part d'acompte non encore imputée, par règlement. */
export function acomptesDisponibles(reglements: ReglementLu[], imputations: ImputationLue[]): Record<string, number> {
  const res: Record<string, number> = {};
  for (const r of reglements) {
    if (r.annule_le || !(Number(r.acompte) > 0)) continue;
    const impute = imputations.filter(i => i.reglement_id === r.id && i.origine === 'acompte' && !i.annule_le).reduce((s, i) => s + Number(i.montant), 0);
    const reste = r2(Number(r.acompte) - impute);
    if (reste > 0) res[r.id] = reste;
  }
  return res;
}
