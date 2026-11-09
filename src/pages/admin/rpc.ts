import { supabase } from '@/integrations/supabase/client';

/** Appel d'une fonction serveur du back-office (absentes des types générés tant qu'elles ne sont pas en production). */
export async function rpcPlateforme<T>(fonction: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
  const appel = supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }>;
  return appel.call(supabase, fonction, args);
}
