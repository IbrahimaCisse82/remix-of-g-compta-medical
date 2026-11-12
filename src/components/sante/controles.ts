import { supabase } from '@/integrations/supabase/client';
import { rpcPlateforme } from '@/lib/rpc-plateforme';

/** Contrôles programmés (0119) : la table et ses fonctions ne sont pas encore dans les types générés. */
export type Controle = { id: string; patient_id: string; consultation_id: string | null; prevu_le: string; motif: string; statut: 'prevu' | 'realise' | 'annule'; rdv_id: string | null; annule_motif: string | null; created_at: string };
export type ControleARevoir = { controle_id: string; patient_id: string; numero_dossier: string; patient: string; telephone: string | null; prevu_le: string; en_retard: boolean; motif: string | null; praticien: string | null; rdv_debut: string | null; rdv_statut: string | null };

type Requete = { select: (c: string) => Requete; eq: (c: string, v: string) => Requete; order: (c: string, o?: { ascending: boolean }) => Requete; limit: (n: number) => Promise<{ data: Controle[] | null; error: { message: string } | null }> };
const table = () => (supabase as unknown as { from: (t: string) => Requete }).from('sante_controles');

export async function lireControles(f: { patientId?: string; consultationId?: string }): Promise<Controle[]> {
  let q = table().select('id, patient_id, consultation_id, prevu_le, motif, statut, rdv_id, annule_motif, created_at');
  if (f.patientId) q = q.eq('patient_id', f.patientId);
  if (f.consultationId) q = q.eq('consultation_id', f.consultationId);
  const { data, error } = await q.order('prevu_le', { ascending: false }).limit(200);
  return error ? [] : data ?? [];
}

export const programmerControle = (a: { consultationId: string; date: string; motif: string; heure?: string; duree?: number }) =>
  rpcPlateforme<string>('sante_programmer_controle', { _consultation_id: a.consultationId, _prevu_le: a.date, _motif: a.motif.trim(), _heure: a.heure || null, _duree_min: a.duree ?? 20 });

export const annulerControle = (id: string, motif: string) => rpcPlateforme<null>('sante_annuler_controle', { _controle_id: id, _motif: motif });

export const controlesARevoir = (structureId: string, horizon = 7) =>
  rpcPlateforme<ControleARevoir[]>('sante_controles_a_revoir', { _structure_id: structureId, _horizon_jours: horizon });

/** Message lisible pour une erreur serveur (les messages de 0119 sont déjà en français). */
export const messageErreur = (e: { message: string }) =>
  /chevauch|overlap/i.test(e.message) ? 'Ce créneau est déjà pris chez ce praticien : choisissez une autre heure ou programmez sans heure.' : e.message;
