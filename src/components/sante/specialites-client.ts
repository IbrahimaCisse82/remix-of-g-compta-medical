import { supabase } from '@/integrations/supabase/client';
import { rpcPlateforme } from '@/lib/rpc-plateforme';

export type Couverture = { specialite_id: string; libelle: string; codes: number };
type Rep<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;
type Req<T> = { select: (c: string) => { eq: (c: string, v: string) => Rep<T> } };

export const definirSpecialites = (structureId: string, ids: string[]) => rpcPlateforme<number>('sante_structure_specialites_definir', { _structure_id: structureId, _specialites: ids });
export const couvertureCim10 = (structureId: string) => rpcPlateforme<Couverture[]>('sante_cim10_couverture', { _structure_id: structureId });

/** Spécialités choisies pour la structure ; null si la fonction n'existe pas encore (avant 0122). */
export async function lireSpecialitesStructure(structureId: string): Promise<string[] | null> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => Req<{ specialite_id: string }> }).from('sante_structure_specialites').select('specialite_id').eq('structure_id', structureId);
  return error ? null : (data ?? []).map(x => x.specialite_id);
}
