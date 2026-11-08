/**
 * Contenu du catalogue selon le type de structure : un cabinet facture des actes, un laboratoire des analyses,
 * une structure mixte les deux. Évite qu'un cabinet voie la nomenclature et les tarifs d'analyses (Labotest),
 * ou qu'un laboratoire voie les actes médicaux.
 */
export type TypeStructure = 'cabinet' | 'laboratoire' | 'mixte';

export interface SectionsCatalogue {
  actes: boolean;
  analyses: boolean;
  /** Nomenclature Labotest (prix d'analyses de démonstration). */
  nomenclatureLabo: boolean;
  /** Option « laboratoire avec un seul biologiste » (validation technique et biologique). */
  validationBiologique: boolean;
}

export function sectionsCatalogue(type: TypeStructure | string | null | undefined): SectionsCatalogue {
  const actes = type !== 'laboratoire';
  const analyses = type !== 'cabinet';
  return { actes, analyses, nomenclatureLabo: analyses, validationBiologique: analyses };
}

export function titreCatalogue(s: SectionsCatalogue): string {
  if (s.actes && s.analyses) return 'Praticiens, actes et analyses';
  return s.analyses ? 'Praticiens et analyses' : 'Praticiens et actes';
}
