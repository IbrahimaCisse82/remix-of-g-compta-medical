/** Rétrocessions d'honoraires — règles pures (sans accès réseau). Le calcul fait foi côté serveur (migration 0051). */

export type CategorieRetro = 'toutes' | 'consultation' | 'acte' | 'analyses' | 'autres';

export const CATEGORIES_RETRO: { id: CategorieRetro; label: string }[] = [
  { id: 'toutes', label: 'Toutes catégories (par défaut)' },
  { id: 'consultation', label: 'Consultations' },
  { id: 'acte', label: 'Actes' },
  { id: 'analyses', label: 'Analyses réalisées' },
  { id: 'autres', label: 'Autres prestations' },
];

export const MODES_PAIEMENT = [
  { id: 'virement', label: 'Virement', reference: true },
  { id: 'cheque', label: 'Chèque', reference: true },
  { id: 'mobile_money', label: 'Mobile Money', reference: true },
  { id: 'especes', label: 'Espèces', reference: false },
] as const;
export type ModePaiement = typeof MODES_PAIEMENT[number]['id'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Premier et dernier jour d'un mois (mois 1–12). */
export function bornesMois(annee: number, mois: number): { debut: string; fin: string } {
  return { debut: iso(new Date(annee, mois - 1, 1)), fin: iso(new Date(annee, mois, 0)) };
}

/** Mois précédent la date de référence : période habituelle d'un relevé. */
export function moisPrecedent(ref: Date = new Date()): { debut: string; fin: string } {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return bornesMois(d.getFullYear(), d.getMonth() + 1);
}

export function verifierTaux(v: string): string | null {
  const t = Number(v.replace(',', '.'));
  if (v.trim() === '' || Number.isNaN(t)) return 'Taux invalide';
  if (t < 0 || t > 100) return 'Le taux doit être compris entre 0 et 100 %';
  return null;
}

export function verifierPaiement(mode: ModePaiement, reference: string): string | null {
  const m = MODES_PAIEMENT.find(x => x.id === mode);
  if (!m) return 'Mode de paiement invalide';
  if (m.reference && reference.trim() === '') return 'Indiquez la référence du paiement (n° de virement, de chèque ou de transaction).';
  return null;
}

/** Libellé de période lisible : « octobre 2026 » pour un mois entier, sinon « du … au … ». */
export function libellePeriode(debut: string, fin: string): string {
  const d = new Date(debut + 'T00:00:00'), f = new Date(fin + 'T00:00:00');
  const finDuMois = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate() === f.getDate();
  if (d.getDate() === 1 && finDuMois && d.getMonth() === f.getMonth() && d.getFullYear() === f.getFullYear()) {
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  return `du ${d.toLocaleDateString('fr-FR')} au ${f.toLocaleDateString('fr-FR')}`;
}
