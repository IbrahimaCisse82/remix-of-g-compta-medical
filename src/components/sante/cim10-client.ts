import { supabase } from '@/integrations/supabase/client';
import { rpcPlateforme } from '@/lib/rpc-plateforme';

/** Accès au référentiel CIM-10, aux diagnostics codés et aux maladies chroniques (0121, hors types générés). */
export type Cim10 = { code: string; libelle: string; chapitre: string | null; dans_specialite?: boolean };
export type DiagnosticCode = { id: string; consultation_id: string; code: string; libelle: string; principal: boolean; created_at: string; hors_specialite?: boolean };
export type ModeCim10 = 'recommande' | 'strict';
export type MaladieChronique = { id: string; code: string | null; libelle: string; depuis: string | null; statut: 'active' | 'resolue'; note: string | null; created_at: string };

type Reponse<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;
type Requete<T> = { select: (c: string) => Requete<T>; eq: (c: string, v: string) => Requete<T>; order: (c: string, o?: { ascending: boolean }) => Reponse<T> };
const table = <T,>(t: string) => (supabase as unknown as { from: (t: string) => Requete<T> }).from(t);

export const chercherCim10 = (q: string) => rpcPlateforme<Cim10[]>('sante_cim10_chercher', { _q: q, _limite: 15 });
/** Recherche en consultation : codes de la spécialité (et, en mode recommandé, communs) ; « toutes » ajoute les autres, marqués. */
export async function chercherCim10Consultation(consultationId: string, q: string, toutes = false) {
  const r = await rpcPlateforme<Cim10[]>('sante_cim10_specialite', { _consultation_id: consultationId, _q: q, _toutes: toutes, _limite: 15 });
  return r.error && /sante_cim10_specialite|function/i.test(r.error.message) ? chercherCim10(q) : r;
}
/** Recherche depuis le dossier patient : spécialité du médecin connecté, à défaut celles de la structure. */
export async function chercherCim10Patient(patientId: string, q: string) {
  const r = await rpcPlateforme<Cim10[]>('sante_cim10_patient', { _patient_id: patientId, _q: q, _limite: 15 });
  return r.error && /sante_cim10_patient|function/i.test(r.error.message) ? chercherCim10(q) : r;
}

export const coderDiagnostic = (consultationId: string, code: string, principal = false) =>
  rpcPlateforme<string>('sante_diagnostic_coder', { _consultation_id: consultationId, _code: code, _principal: principal });
export const retirerDiagnostic = (id: string) => rpcPlateforme<null>('sante_diagnostic_retirer', { _id: id });

export async function lireDiagnostics(colonne: 'consultation_id' | 'patient_id', valeur: string): Promise<DiagnosticCode[]> {
  const { data, error } = await table<DiagnosticCode>('sante_consultation_diagnostics').select('*').eq(colonne, valeur).order('created_at');
  return error ? [] : data ?? [];
}

export async function lireChroniques(patientId: string): Promise<MaladieChronique[] | null> {
  const { data, error } = await table<MaladieChronique>('sante_maladies_chroniques').select('id, code, libelle, depuis, statut, note, created_at').eq('patient_id', patientId).order('created_at');
  return error ? null : data ?? [];
}
export const declarerChronique = (a: { patientId: string; code?: string | null; libelle?: string | null; depuis?: string | null; consultationId?: string | null }) =>
  rpcPlateforme<string>('sante_chronique_declarer', { _patient_id: a.patientId, _code: a.code || null, _libelle: a.libelle || null, _depuis: a.depuis || null, _consultation_id: a.consultationId || null });
export const changerStatutChronique = (id: string, statut: 'active' | 'resolue') => rpcPlateforme<null>('sante_chronique_statut', { _id: id, _statut: statut });

export const modeCim10 = (structureId: string) => rpcPlateforme<ModeCim10>('sante_cim10_mode', { _structure_id: structureId });
export const definirModeCim10 = (structureId: string, mode: ModeCim10) => rpcPlateforme<null>('sante_cim10_mode_definir', { _structure_id: structureId, _mode: mode });
export const statistiquesCim10 = (structureId: string) => rpcPlateforme<{ codages: number; hors_specialite: number }[]>('sante_cim10_statistiques', { _structure_id: structureId });

/** Codes propres à la structure (0127) : ajoutés par l'administrateur, visibles seulement dans sa structure. */
export type CodeStructure = { id: string; code: string; libelle: string; actif: boolean; created_at: string };
export async function lireCodesStructure(structureId: string): Promise<CodeStructure[] | null> {
  const { data, error } = await table<CodeStructure>('sante_cim10_structure_codes').select('id, code, libelle, actif, created_at').eq('structure_id', structureId).order('created_at');
  return error ? null : data ?? [];
}
export const ajouterCodeStructure = (structureId: string, code: string, libelle: string) =>
  rpcPlateforme<string>('sante_cim10_code_ajouter', { _structure_id: structureId, _code: code, _libelle: libelle });
export const activerCodeStructure = (id: string, actif: boolean) => rpcPlateforme<null>('sante_cim10_code_activer', { _id: id, _actif: actif });
