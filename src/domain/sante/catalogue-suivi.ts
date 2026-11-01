// Suivi de la validation du catalogue d'analyses par le biologiste.
// « À valider » = analyse inactive OU sans paramètre mesuré (elle ne peut pas être prescrite).

export interface AnalyseSuivi {
  id: string;
  code: string;
  libelle: string;
  section: string;
  actif: boolean;
  nb_parametres: number;
}

export type FiltreCatalogue = 'toutes' | 'a_valider' | 'actives';

export const aValider = (a: Pick<AnalyseSuivi, 'actif' | 'nb_parametres'>) => !a.actif || a.nb_parametres === 0;

/** Normalise pour la recherche : minuscules, sans accents. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrerCatalogue<T extends AnalyseSuivi>(analyses: T[], f: { filtre: FiltreCatalogue; section: string; q: string }): T[] {
  const q = norm(f.q.trim());
  return analyses.filter(a =>
    (f.filtre === 'toutes' || (f.filtre === 'a_valider' ? aValider(a) : !aValider(a)))
    && (!f.section || a.section === f.section)
    && (!q || norm(a.code).includes(q) || norm(a.libelle).includes(q)));
}

export interface Avancement { total: number; actives: number; sans_parametre: number; a_valider: number; pourcentage: number }

export function avancementCatalogue(analyses: Pick<AnalyseSuivi, 'actif' | 'nb_parametres'>[]): Avancement {
  const total = analyses.length;
  const a_valider = analyses.filter(aValider).length;
  return {
    total,
    actives: total - a_valider,
    sans_parametre: analyses.filter(a => a.nb_parametres === 0).length,
    a_valider,
    pourcentage: total ? Math.round(((total - a_valider) / total) * 100) : 0,
  };
}

/** Compte les paramètres par analyse à partir des lignes { analyse_id }. */
export function compterParametres(lignes: { analyse_id: string }[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of lignes) r[l.analyse_id] = (r[l.analyse_id] ?? 0) + 1;
  return r;
}
