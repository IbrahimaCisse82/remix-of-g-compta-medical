// Valeurs de référence biologiques — logique pure, miroir de sante_saisir_resultat côté base.
export type Sexe = 'M' | 'F';
export type Drapeau = 'N' | 'H' | 'L' | 'HH' | 'LL';
export interface ValeurReference {
  sexe: Sexe | null;
  age_min_jours: number;
  age_max_jours: number;
  bas: number | null;
  haut: number | null;
  critique_bas: number | null;
  critique_haut: number | null;
}

export const ageEnJours = (naissance: string | null, ref: Date = new Date()): number => {
  if (!naissance) return 9000;
  const d = new Date(naissance + 'T00:00:00Z');
  const r = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  return Math.floor((r - d.getTime()) / 86_400_000);
};

/** Choisit la référence la plus spécifique : sexe exact prioritaire, puis tranche d'âge la plus étroite. */
export function choisirReference(refs: ValeurReference[], sexe: Sexe, ageJours: number): ValeurReference | null {
  const candidats = refs.filter(r => (r.sexe === null || r.sexe === sexe) && ageJours >= r.age_min_jours && ageJours <= r.age_max_jours);
  candidats.sort((a, b) => Number(a.sexe === null) - Number(b.sexe === null) || (a.age_max_jours - a.age_min_jours) - (b.age_max_jours - b.age_min_jours));
  return candidats[0] ?? null;
}

export function calculerDrapeau(valeur: number | null, ref: ValeurReference | null): Drapeau {
  if (valeur === null || Number.isNaN(valeur) || !ref) return 'N';
  if (ref.critique_bas !== null && valeur < ref.critique_bas) return 'LL';
  if (ref.critique_haut !== null && valeur > ref.critique_haut) return 'HH';
  if (ref.bas !== null && valeur < ref.bas) return 'L';
  if (ref.haut !== null && valeur > ref.haut) return 'H';
  return 'N';
}

export const estCritique = (d: Drapeau) => d === 'HH' || d === 'LL';

export const LIBELLE_DRAPEAU: Record<Drapeau, string> = { N: '', H: '↑ H', L: '↓ L', HH: '⚠ Critique haut', LL: '⚠ Critique bas' };

/** Delta-check : variation relative (%) par rapport au résultat antérieur ; alerte au-delà du seuil. */
export function deltaCheck(actuel: number, precedent: number | null, seuilPct = 50): { variation: number; alerte: boolean } | null {
  if (precedent === null || precedent === 0) return null;
  const variation = Math.round(((actuel - precedent) / Math.abs(precedent)) * 1000) / 10;
  return { variation, alerte: Math.abs(variation) >= seuilPct };
}

export const STATUTS_DEMANDE = {
  enregistree: 'Enregistrée', prelevee: 'Prélevée', recue: 'Reçue', en_analyse: 'En analyse',
  validee_technique: 'Validée (technique)', validee: 'Validée', rejetee: 'Rejetée',
} as const;
export type StatutDemande = keyof typeof STATUTS_DEMANDE;

const TRANSITIONS: Record<StatutDemande, StatutDemande[]> = {
  enregistree: ['prelevee', 'rejetee'], prelevee: ['recue', 'rejetee'], recue: ['en_analyse', 'rejetee'],
  en_analyse: ['validee_technique'], validee_technique: ['validee', 'en_analyse'], validee: [], rejetee: [],
};
export const transitionAutorisee = (de: StatutDemande, vers: StatutDemande) => TRANSITIONS[de].includes(vers);
