import { supabase } from '@/integrations/supabase/client';
import { rpcPlateforme } from '@/lib/rpc-plateforme';

/** Accès au référentiel CIM-10, aux diagnostics codés et aux maladies chroniques (0121, hors types générés). */
export type Cim10 = { code: string; libelle: string; chapitre: string | null };
export type DiagnosticCode = { id: string; consultation_id: string; code: string; libelle: string; principal: boolean; created_at: string };
export type MaladieChronique = { id: string; code: string | null; libelle: string; depuis: string | null; statut: 'active' | 'resolue'; note: string | null; created_at: string };

type Reponse<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;
type Requete<T> = { select: (c: string) => Requete<T>; eq: (c: string, v: string) => Requete<T>; order: (c: string, o?: { ascending: boolean }) => Reponse<T> };
const table = <T,>(t: string) => (supabase as unknown as { from: (t: string) => Requete<T> }).from(t);

export const chercherCim10 = (q: string) => rpcPlateforme<Cim10[]>('sante_cim10_chercher', { _q: q, _limite: 15 });
export const coderDiagnostic = (consultationId: string, code: string, principal = false) =>
  rpcPlateforme<string>('sante_diagnostic_coder', { _consultation_id: consultationId, _code: code, _principal: principal });
export const retirerDiagnostic = (id: string) => rpcPlateforme<null>('sante_diagnostic_retirer', { _id: id });

export async function lireDiagnostics(colonne: 'consultation_id' | 'patient_id', valeur: string): Promise<DiagnosticCode[]> {
  const { data, error } = await table<DiagnosticCode>('sante_consultation_diagnostics').select('id, consultation_id, code, libelle, principal, created_at').eq(colonne, valeur).order('created_at');
  return error ? [] : data ?? [];
}

export async function lireChroniques(patientId: string): Promise<MaladieChronique[] | null> {
  const { data, error } = await table<MaladieChronique>('sante_maladies_chroniques').select('id, code, libelle, depuis, statut, note, created_at').eq('patient_id', patientId).order('created_at');
  return error ? null : data ?? [];
}
export const declarerChronique = (a: { patientId: string; code?: string | null; libelle?: string | null; depuis?: string | null; consultationId?: string | null }) =>
  rpcPlateforme<string>('sante_chronique_declarer', { _patient_id: a.patientId, _code: a.code || null, _libelle: a.libelle || null, _depuis: a.depuis || null, _consultation_id: a.consultationId || null });
export const changerStatutChronique = (id: string, statut: 'active' | 'resolue') => rpcPlateforme<null>('sante_chronique_statut', { _id: id, _statut: statut });
