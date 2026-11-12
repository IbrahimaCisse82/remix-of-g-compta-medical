import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { COMPTES_REFERENCE, COMPTES_SANTE } from '@/lib/plan-reference';

/** Origine d'un compte du plan d'un dossier (0128) : référentiel SYSCOHADA visé, compte commun de la plateforme,
 *  ou compte propre au dossier (visible de lui seul). */
export type OrigineCompte = 'referentiel' | 'plateforme' | 'propre';
type Installable = { numero: string; origine: 'referentiel' | 'plateforme' };

let cache: Promise<Map<string, OrigineCompte>> | null = null;

type Page = { range: (de: number, a: number) => PromiseLike<{ data: Installable[] | null; error: { message: string } | null }> };
const PAGE = 1000; // l'API renvoie au plus 1 000 lignes par appel : le référentiel en compte davantage

/** Lit tous les comptes installables, page par page. */
async function lireInstallables(): Promise<Installable[] | null> {
  const appel = supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Page;
  const tout: Installable[] = [];
  for (let de = 0; de < 20 * PAGE; de += PAGE) {
    const { data, error } = await appel.call(supabase, 'plan_reference_comptes', { _tous: true }).range(de, de + PAGE - 1);
    if (error) return null;
    tout.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return tout;
}

/** Liste installable lue en base ; à défaut (base sans 0128), la liste embarquée dans l'application. */
export function chargerOrigines(): Promise<Map<string, OrigineCompte>> {
  cache ??= lireInstallables().then(data => {
    const liste: Installable[] = data?.length ? data
      : [...COMPTES_REFERENCE.map(c => ({ numero: c.numero, origine: 'referentiel' as const })), ...COMPTES_SANTE.map(c => ({ numero: c.numero, origine: 'plateforme' as const }))];
    return new Map(liste.map(c => [c.numero, c.origine]));
  }).catch(() => { cache = null; return new Map(); });
  return cache;
}

export const origineDe = (numero: string, origines: Map<string, OrigineCompte>): OrigineCompte => origines.get(numero) ?? 'propre';

export function useOriginesPlan() {
  const [origines, setOrigines] = useState<Map<string, OrigineCompte> | null>(null);
  useEffect(() => { let actif = true; void chargerOrigines().then(m => { if (actif) setOrigines(m); }); return () => { actif = false; }; }, []);
  return origines;
}

export const LIBELLE_ORIGINE: Record<OrigineCompte, string> = { referentiel: 'SYSCOHADA', plateforme: 'Plateforme', propre: 'Propre au dossier' };
