/** Personnel : plannings, gardes, astreintes — règles pures (le serveur revérifie, migration 0052). */

export type TypeCreneau = 'poste' | 'garde' | 'astreinte' | 'conge' | 'absence' | 'formation';

export const TYPES_CRENEAU: { id: TypeCreneau; label: string; classe: string; paie: boolean }[] = [
  { id: 'poste', label: 'Poste', classe: 'border-primary/50 bg-primary/10', paie: false },
  { id: 'garde', label: 'Garde', classe: 'border-destructive/50 bg-destructive/10', paie: true },
  { id: 'astreinte', label: 'Astreinte', classe: 'border-accent/60 bg-accent/10', paie: true },
  { id: 'conge', label: 'Congé', classe: 'border-border bg-bg3', paie: false },
  { id: 'absence', label: 'Absence', classe: 'border-border bg-bg3', paie: false },
  { id: 'formation', label: 'Formation', classe: 'border-border bg-bg3', paie: false },
];

export interface Creneau { id?: string; debut: string; fin: string; employee_id?: string | null; membership_id?: string | null; statut?: string }

/** Date + heure locales → ISO. Une heure de fin ≤ heure de début sur la même date = lendemain (garde de nuit). */
export function construireCreneau(date: string, heureDebut: string, heureFin: string, dateFin?: string): { debut: string; fin: string } {
  const d = new Date(`${date}T${heureDebut}:00`);
  let f = new Date(`${dateFin || date}T${heureFin}:00`);
  if (!dateFin && f <= d) f = new Date(f.getTime() + 86_400_000);
  return { debut: d.toISOString(), fin: f.toISOString() };
}

export function dureeHeures(c: { debut: string; fin: string }): number {
  return Math.round(((new Date(c.fin).getTime() - new Date(c.debut).getTime()) / 3_600_000) * 10) / 10;
}

const memePersonne = (a: Creneau, b: Creneau) =>
  (!!a.employee_id && a.employee_id === b.employee_id) || (!!a.membership_id && a.membership_id === b.membership_id);

/** Contrôles avant enregistrement, dont le chevauchement avec les créneaux déjà connus. */
export function verifierCreneau(c: Creneau, existants: Creneau[]): string | null {
  if (!c.employee_id && !c.membership_id) return 'Choisissez une personne.';
  const d = new Date(c.debut).getTime(), f = new Date(c.fin).getTime();
  if (Number.isNaN(d) || Number.isNaN(f)) return 'Dates invalides.';
  if (f <= d) return 'La fin doit être postérieure au début.';
  if (f - d > 31 * 86_400_000) return 'Un créneau ne peut pas dépasser 31 jours.';
  const conflit = existants.find(x => x.id !== c.id && x.statut !== 'annule' && memePersonne(x, c)
    && new Date(x.debut).getTime() < f && d < new Date(x.fin).getTime());
  return conflit ? 'Chevauchement : cette personne a déjà un créneau sur cette période.' : null;
}

/** Créneaux terminés, non validés, qui comptent pour le récapitulatif (et la paie pour gardes/astreintes). */
export function aValider<T extends { fin: string; statut: string; type: string }>(creneaux: T[], maintenant: Date = new Date()): T[] {
  return creneaux.filter(c => c.statut === 'prevu' && new Date(c.fin) <= maintenant && ['poste', 'garde', 'astreinte'].includes(c.type));
}

/** Jours d'un mois (1–12) au format AAAA-MM-JJ. */
export function joursDuMois(annee: number, mois: number): string[] {
  const n = new Date(annee, mois, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${annee}-${String(mois).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}
