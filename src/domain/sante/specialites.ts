/** Spécialités médicales proposées (identiques au référentiel sante_specialites de la base, 0122). */
export const SPECIALITES = [
  { id: 'medecine-generale', libelle: 'Médecine générale' },
  { id: 'pediatrie', libelle: 'Pédiatrie et néonatologie' },
  { id: 'urgences', libelle: 'Urgences' },
  { id: 'gynecologie-obstetrique', libelle: 'Gynécologie et obstétrique' },
  { id: 'cardiologie', libelle: 'Cardiologie' },
  { id: 'pneumologie', libelle: 'Pneumologie' },
  { id: 'endocrinologie', libelle: 'Endocrinologie, diabétologie, nutrition' },
  { id: 'gastro-enterologie', libelle: 'Gastro-entérologie et hépatologie' },
  { id: 'infectiologie', libelle: 'Infectiologie et maladies tropicales' },
  { id: 'neurologie', libelle: 'Neurologie' },
  { id: 'psychiatrie', libelle: 'Psychiatrie' },
  { id: 'dermatologie', libelle: 'Dermatologie' },
  { id: 'rhumatologie', libelle: 'Rhumatologie' },
  { id: 'traumatologie-orthopedie', libelle: 'Traumatologie et orthopédie' },
  { id: 'nephrologie-urologie', libelle: 'Néphrologie et urologie' },
  { id: 'hematologie', libelle: 'Hématologie' },
  { id: 'oncologie', libelle: 'Oncologie' },
  { id: 'ophtalmologie', libelle: 'Ophtalmologie' },
  { id: 'orl', libelle: 'ORL' },
  { id: 'stomatologie', libelle: 'Stomatologie et chirurgie dentaire' },
  { id: 'chirurgie-generale', libelle: 'Chirurgie générale et viscérale' },
] as const;

export type SpecialiteId = (typeof SPECIALITES)[number]['id'];
export const libelleSpecialite = (id: string | null | undefined) => SPECIALITES.find(s => s.id === id)?.libelle ?? null;
