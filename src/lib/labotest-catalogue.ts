import { LABOTEST_ROWS } from '../../supabase/functions/_shared/labotest-data';

export type GrilleLabotest = 'particulier' | 'assurance' | 'ipm' | 'hopital';
export const GRILLES_LABOTEST: { value: GrilleLabotest; label: string }[] = [
  { value: 'particulier', label: 'Particulier · B = 260 FCFA' },
  { value: 'assurance', label: 'Société / Assurance · B = 260 FCFA' },
  { value: 'ipm', label: 'IPM · B = 220 FCFA' },
  { value: 'hopital', label: 'Hôpital Sénégal · B = 200 FCFA' },
];
const normaliser = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function rechercherLabotest(query: string, grille: GrilleLabotest) {
  const terms = normaliser(query).split(/\s+/).filter(Boolean);
  return LABOTEST_ROWS.filter(r => terms.every(t => normaliser(`${r.libelle} ${r.codeSource}`).includes(t)))
    .map(r => ({ ...r, prix: r[grille] }));
}