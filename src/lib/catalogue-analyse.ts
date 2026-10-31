export type ReferenceSaisie = { sexe: string; ageMin: string; ageMax: string; bas: string; haut: string; critiqueBas: string; critiqueHaut: string };
export type ReferenceValeur = { sexe: 'M' | 'F' | null; age_min_jours: number; age_max_jours: number; bas: number | null; haut: number | null; critique_bas: number | null; critique_haut: number | null };

const nombre = (v: string): number | null | undefined => {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** Valide une valeur de référence saisie par le biologiste ; aucune borne n'est proposée par défaut. */
export function referenceValide(s: ReferenceSaisie): { valeur: ReferenceValeur } | { erreur: string } {
  const [bas, haut, cb, ch, amin, amax] = [s.bas, s.haut, s.critiqueBas, s.critiqueHaut, s.ageMin, s.ageMax].map(nombre);
  if ([bas, haut, cb, ch, amin, amax].includes(undefined)) return { erreur: 'Valeurs numériques invalides' };
  if (bas == null && haut == null) return { erreur: 'Indiquez au moins une borne normale' };
  if (bas != null && haut != null && bas > haut) return { erreur: 'La borne basse dépasse la borne haute' };
  if (cb != null && ch != null && cb > ch) return { erreur: 'Seuils critiques incohérents' };
  if (cb != null && bas != null && cb > bas) return { erreur: 'Le seuil critique bas doit être inférieur ou égal à la borne basse' };
  if (ch != null && haut != null && ch < haut) return { erreur: 'Le seuil critique haut doit être supérieur ou égal à la borne haute' };
  const min = amin ?? 0, max = amax ?? 150;
  if (min < 0 || max > 150 || min > max) return { erreur: 'Tranche d’âge invalide (0 à 150 ans)' };
  if (s.sexe && s.sexe !== 'M' && s.sexe !== 'F') return { erreur: 'Sexe invalide' };
  return { valeur: { sexe: (s.sexe || null) as 'M' | 'F' | null, age_min_jours: Math.round(min * 365.25), age_max_jours: Math.round(max * 365.25), bas: bas as number | null, haut: haut as number | null, critique_bas: cb as number | null, critique_haut: ch as number | null } };
}
