import { supabase } from '@/integrations/supabase/client';

/**
 * Couche d'accès aux écritures comptables.
 * Toute création/annulation passe obligatoirement par une fonction serveur :
 * l'équilibre débit = crédit, le verrou de période et les droits d'écriture
 * sont contrôlés en base, jamais par l'interface.
 */

export interface LigneEcriture {
  compte: string;
  intitule?: string;
  libelle?: string;
  debit?: number;
  credit?: number;
}

export type JournalCode = 'AN' | 'AC' | 'VT' | 'BQ' | 'CA' | 'OD' | 'PA';

export interface CreerEcritureInput {
  entrepriseId: string;
  exerciceId: string;
  journalCode: JournalCode | string;
  date: string;
  libelle: string;
  lignes: LigneEcriture[];
  piece?: string | null;
  statut?: 'brouillon' | 'validee';
  origine?: string;
}

export interface BalanceDeriveeLine {
  compte: string;
  intitule: string;
  md: number;
  mc: number;
  sfd: number;
  sfc: number;
}

export interface EcartBalance {
  compte: string;
  md_stockee: number;
  md_calculee: number;
  mc_stockee: number;
  mc_calculee: number;
  ecart_debit: number;
  ecart_credit: number;
}

/** Somme signée des lignes — utilitaire pur, testable hors React. */
export function totauxLignes(lignes: LigneEcriture[]) {
  const debit = round2(lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const credit = round2(lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { debit, credit, equilibre: debit === credit && debit > 0 };
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const JOURNAUX_NORMALISES: JournalCode[] = ['AN', 'AC', 'VT', 'BQ', 'CA', 'OD', 'PA'];

/** Contrôles préalables côté client (confort UX) — la base reste seule juge. */
export function validerEcritureLocalement(input: CreerEcritureInput): string | null {
  if (!JOURNAUX_NORMALISES.includes(input.journalCode as JournalCode)) {
    return `Code journal non normalisé (${JOURNAUX_NORMALISES.join('/')})`;
  }
  if (!input.lignes || input.lignes.length < 2) return 'Une écriture doit comporter au moins deux lignes';
  if (input.lignes.some(l => !l.compte)) return 'Chaque ligne doit porter un compte';
  const t = totauxLignes(input.lignes);
  if (!t.equilibre) return `Écriture déséquilibrée : débit ${t.debit} ≠ crédit ${t.credit}`;
  return null;
}

export async function creerEcriture(input: CreerEcritureInput): Promise<string> {
  const erreur = validerEcritureLocalement(input);
  if (erreur) throw new Error(erreur);

  const { data, error } = await supabase.rpc('fn_creer_ecriture', {
    _entreprise_id: input.entrepriseId,
    _exercice_id: input.exerciceId,
    _journal_code: input.journalCode,
    _date: input.date,
    _libelle: input.libelle,
    _lignes: input.lignes.map(l => ({
      compte: l.compte,
      intitule: l.intitule ?? '',
      libelle: l.libelle ?? input.libelle,
      debit: round2(Number(l.debit) || 0),
      credit: round2(Number(l.credit) || 0),
    })) as any,
    _piece: input.piece ?? null,
    _statut: input.statut ?? 'validee',
    _origine: input.origine ?? 'saisie',
  } as any);

  if (error) throw new Error(error.message);
  return data as unknown as string;
}

export async function contrepasserEcriture(ecritureId: string, motif: string): Promise<string> {
  const { data, error } = await supabase.rpc('fn_contrepasser_ecriture', {
    _ecriture_id: ecritureId,
    _motif: motif,
  } as any);
  if (error) throw new Error(error.message);
  return data as unknown as string;
}

export async function validerEcriture(ecritureId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_valider_ecriture', { _ecriture_id: ecritureId } as any);
  if (error) throw new Error(error.message);
}

export async function rouvrirExercice(exerciceId: string, motif: string): Promise<void> {
  const { error } = await supabase.rpc('fn_rouvrir_exercice', {
    _exercice_id: exerciceId,
    _motif: motif,
  } as any);
  if (error) throw new Error(error.message);
}

/** Balance dérivée du journal et des écritures validées (vue matérialisée). */
export async function getBalanceDerivee(entrepriseId: string, exerciceId: string): Promise<BalanceDeriveeLine[]> {
  const { data, error } = await supabase.rpc('fn_balance', {
    _entreprise_id: entrepriseId,
    _exercice_id: exerciceId,
  } as any);
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map(d => ({
    compte: d.compte,
    intitule: d.intitule ?? '',
    md: Number(d.md) || 0,
    mc: Number(d.mc) || 0,
    sfd: Number(d.sfd) || 0,
    sfc: Number(d.sfc) || 0,
  }));
}

/** Rapport d'écarts balance stockée ↔ balance dérivée (double-tenue). */
export async function getEcartsBalance(entrepriseId: string, exerciceId: string): Promise<EcartBalance[]> {
  const { data, error } = await supabase.rpc('fn_balance_ecarts', {
    _entreprise_id: entrepriseId,
    _exercice_id: exerciceId,
  } as any);
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map(d => ({
    compte: d.compte,
    md_stockee: Number(d.md_stockee) || 0,
    md_calculee: Number(d.md_calculee) || 0,
    mc_stockee: Number(d.mc_stockee) || 0,
    mc_calculee: Number(d.mc_calculee) || 0,
    ecart_debit: Number(d.ecart_debit) || 0,
    ecart_credit: Number(d.ecart_credit) || 0,
  }));
}

/** Rôle applicatif effectif de l'utilisateur sur une entreprise, calculé en base. */
export async function getRoleEntreprise(entrepriseId: string): Promise<'admin' | 'comptable' | 'lecteur' | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.rpc('get_entreprise_role', {
    _user_id: uid,
    _entreprise_id: entrepriseId,
  } as any);
  if (error) return null;
  return (data as any) ?? null;
}

/** Ligne « à plat » telle que produite historiquement par les modules métier. */
export interface LigneJournalPlate {
  entreprise_id: string;
  exercice_id: string;
  date_ecriture: string;
  piece?: string | null;
  journal_code: string;
  libelle?: string | null;
  compte: string;
  intitule?: string | null;
  debit?: number | null;
  credit?: number | null;
}

/**
 * Passerelle pour les modules métier (immobilisations, provisions, paie,
 * facturation, mobile money, import) : regroupe les lignes par pièce puis
 * délègue la création à `fn_creer_ecriture`. Aucun INSERT direct dans le
 * journal — l'équilibre, la période et les droits restent contrôlés en base.
 */
export async function enregistrerLignesJournal(
  lignes: LigneJournalPlate[],
  options?: { statut?: 'brouillon' | 'validee'; origine?: string }
): Promise<string[]> {
  if (!lignes.length) return [];
  const groupes = new Map<string, LigneJournalPlate[]>();
  for (const l of lignes) {
    const cle = [l.entreprise_id, l.exercice_id, l.journal_code, l.date_ecriture, l.piece ?? ''].join('|');
    const arr = groupes.get(cle);
    if (arr) arr.push(l); else groupes.set(cle, [l]);
  }

  const ids: string[] = [];
  for (const groupe of groupes.values()) {
    const tete = groupe[0];
    ids.push(await creerEcriture({
      entrepriseId: tete.entreprise_id,
      exerciceId: tete.exercice_id,
      journalCode: tete.journal_code,
      date: tete.date_ecriture,
      libelle: tete.libelle || tete.piece || 'Écriture',
      piece: tete.piece ?? null,
      statut: options?.statut ?? 'validee',
      origine: options?.origine ?? 'module',
      lignes: groupe.map(l => ({
        compte: l.compte,
        intitule: l.intitule ?? '',
        libelle: l.libelle ?? undefined,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      })),
    }));
  }
  return ids;
}

/** Resynchronise la balance stockée à partir de la balance recalculée par le serveur. */
export async function resynchroniserBalance(entrepriseId: string, exerciceId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_resync_balance', {
    _entreprise_id: entrepriseId,
    _exercice_id: exerciceId,
  } as any);
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
