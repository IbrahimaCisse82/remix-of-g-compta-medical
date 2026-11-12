import { useEffect, useState } from 'react';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { COMPTES_REFERENCE, COMPTES_SANTE } from '@/lib/plan-reference';

/** Origine d'un compte du plan d'un dossier (0128) : référentiel SYSCOHADA visé, compte commun de la plateforme,
 *  ou compte propre au dossier (visible de lui seul). */
export type OrigineCompte = 'referentiel' | 'plateforme' | 'propre';
type Installable = { numero: string; origine: 'referentiel' | 'plateforme' };

let cache: Promise<Map<string, OrigineCompte>> | null = null;

/** Liste installable lue en base ; à défaut (base sans 0128), la liste embarquée dans l'application. */
export function chargerOrigines(): Promise<Map<string, OrigineCompte>> {
  cache ??= rpcPlateforme<Installable[]>('plan_reference_comptes', { _tous: true }).then(({ data, error }) => {
    const liste: Installable[] = !error && data?.length ? data
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
