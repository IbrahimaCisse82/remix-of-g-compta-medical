/**
 * Affectation du résultat (AUSCGIE art. 143-144 et 346) : réserve légale d'au moins 10 % du bénéfice diminué des
 * pertes antérieures, tant qu'elle n'atteint pas le cinquième du capital ; le reste selon la décision de
 * l'assemblée (réserves, dividendes 465, report à nouveau 121). Une perte est reportée (129) ou imputée.
 * Mêmes règles que la fonction serveur fn_affecter_resultat, qui fait foi.
 */
export interface SituationAffectation {
  /** Résultat en instance d'affectation (130) : bénéfice > 0, perte < 0. */
  resultat: number;
  capital: number;
  reserveLegale: number;
  /** Report à nouveau débiteur (129) existant. */
  pertesAnterieures: number;
}

export function reserveLegaleMinimum(s: SituationAffectation): number {
  if (s.resultat <= 0 || s.capital <= 0) return 0;
  const dix = Math.max(Math.round(0.10 * (s.resultat - Math.max(s.pertesAnterieures, 0))), 0);
  return Math.min(dix, Math.max(Math.round(s.capital / 5 - s.reserveLegale), 0));
}

export interface Repartition { reserveLegale: number; reservesStatutaires: number; reservesFacultatives: number; dividendes: number; reportANouveau: number }

/** Lignes de l'écriture (hors 130, ajouté par le serveur) ; contrôle la somme et le minimum légal. */
export function lignesAffectation(s: SituationAffectation, r: Repartition): { lignes: { compte: string; debit: number; credit: number }[]; erreur: string | null } {
  const lignes: { compte: string; debit: number; credit: number }[] = [];
  if (s.resultat < 0) {
    // Perte : report à nouveau débiteur (imputation sur réserves à saisir dans une écriture distincte).
    lignes.push({ compte: '129', debit: -s.resultat, credit: 0 });
    return { lignes, erreur: null };
  }
  const ajoute = (compte: string, m: number) => { if (m) lignes.push({ compte, debit: m < 0 ? -m : 0, credit: m > 0 ? m : 0 }); };
  ajoute('111', r.reserveLegale); ajoute('112', r.reservesStatutaires); ajoute('1181', r.reservesFacultatives);
  ajoute('465', r.dividendes); ajoute('121', r.reportANouveau);
  const total = r.reserveLegale + r.reservesStatutaires + r.reservesFacultatives + r.dividendes + r.reportANouveau;
  const min = reserveLegaleMinimum(s);
  if (Object.values(r).some(v => v < 0)) return { lignes, erreur: 'Montants négatifs interdits' };
  if (Math.round(total) !== Math.round(s.resultat)) return { lignes, erreur: `Répartition ${total.toLocaleString('fr-FR')} ≠ résultat ${s.resultat.toLocaleString('fr-FR')}` };
  if (r.reserveLegale < min) return { lignes, erreur: `Réserve légale d'au moins ${min.toLocaleString('fr-FR')}` };
  return { lignes, erreur: null };
}
