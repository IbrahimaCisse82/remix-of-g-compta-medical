/** Suivi médical : courbes de constantes, échéances de contrôle et chronologie du dossier. */

export type Mesure = { created_at: string } & Partial<Record<CleConstante, number | string | null>>;
export type CleConstante = 'ta_sys' | 'ta_dia' | 'pouls' | 'temperature' | 'poids' | 'spo2' | 'glycemie';
export type Point = { date: string; valeur: number };
export type Courbe = { id: string; titre: string; unite: string; series: { cle: CleConstante; libelle: string; points: Point[] }[]; normale?: [number, number] };

/** Courbes affichées, dans l'ordre de lecture habituel du médecin. */
type DefCourbe = Omit<Courbe, 'series'> & { cles: [CleConstante, string][] };
export const COURBES: DefCourbe[] = [
  { id: 'ta', titre: 'Tension artérielle', unite: 'mmHg', cles: [['ta_sys', 'Systolique'], ['ta_dia', 'Diastolique']], normale: [60, 140] },
  { id: 'poids', titre: 'Poids', unite: 'kg', cles: [['poids', 'Poids']] },
  { id: 'glycemie', titre: 'Glycémie', unite: 'g/L', cles: [['glycemie', 'Glycémie']], normale: [0.7, 1.1] },
  { id: 'temperature', titre: 'Température', unite: '°C', cles: [['temperature', 'Température']], normale: [36, 37.5] },
  { id: 'pouls', titre: 'Pouls', unite: 'bpm', cles: [['pouls', 'Pouls']], normale: [50, 100] },
  { id: 'spo2', titre: 'Saturation', unite: '%', cles: [['spo2', 'SpO₂']], normale: [95, 100] },
];

const nombre = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Construit les courbes ayant au moins deux mesures (une seule valeur ne montre pas d'évolution). */
export function courbesConstantes(mesures: Mesure[]): Courbe[] {
  const triees = [...mesures].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return COURBES.map(({ cles, ...c }) => ({
    ...c,
    series: cles.map(([cle, libelle]) => ({
      cle, libelle,
      points: triees.flatMap(m => { const v = nombre(m[cle]); return v === null ? [] : [{ date: m.created_at, valeur: v }]; }),
    })),
  })).filter(c => c.series.some(s => s.points.length >= 2));
}

/** Bornes verticales d'une courbe : valeurs et zone normale visibles, avec une marge de 10 %. */
export function bornes(c: Courbe): [number, number] {
  const valeurs = c.series.flatMap(s => s.points.map(p => p.valeur));
  let min = Math.min(...valeurs), max = Math.max(...valeurs);
  if (c.normale) { min = Math.min(min, c.normale[0]); max = Math.max(max, c.normale[1]); }
  if (min === max) { min -= 1; max += 1; }
  const marge = (max - min) * 0.1;
  return [min - marge, max + marge];
}

/** Tendance entre les deux dernières mesures d'une série (variation de moins de 1 % : stable). */
export function tendance(points: Point[]): 'hausse' | 'baisse' | 'stable' | null {
  if (points.length < 2) return null;
  const [a, b] = points.slice(-2).map(p => p.valeur);
  const ecart = b - a;
  if (Math.abs(ecart) <= Math.abs(a) * 0.01) return 'stable';
  return ecart > 0 ? 'hausse' : 'baisse';
}

/** Ajoute n jours à une date AAAA-MM-JJ (calcul en UTC, sans dérive d'heure d'été). */
export function ajouterJours(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Ajoute n mois en restant dans le mois visé (31 janvier + 1 mois = 28 ou 29 février). */
export function ajouterMois(date: string, n: number): string {
  const [a, m, j] = date.split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + n, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

export const DELAIS_CONTROLE: { libelle: string; calcul: (d: string) => string }[] = [
  { libelle: '1 sem.', calcul: d => ajouterJours(d, 7) },
  { libelle: '15 j', calcul: d => ajouterJours(d, 15) },
  { libelle: '1 mois', calcul: d => ajouterMois(d, 1) },
  { libelle: '3 mois', calcul: d => ajouterMois(d, 3) },
  { libelle: '6 mois', calcul: d => ajouterMois(d, 6) },
];

export type SaisieControle = { date: string; heure: string; motif: string };

/** Contrôles faits avant l'appel au serveur (qui refait les siens). */
export function validerControle(s: SaisieControle, aujourdhui: string): string[] {
  const erreurs: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) erreurs.push('Choisissez la date du contrôle.');
  else if (s.date < aujourdhui) erreurs.push('La date du contrôle est déjà passée.');
  else if (s.date > ajouterJours(aujourdhui, 400)) erreurs.push('Date trop lointaine (13 mois au plus).');
  if (s.heure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.heure)) erreurs.push('Heure invalide.');
  const motif = s.motif.trim();
  if (motif.length < 3) erreurs.push('Indiquez le motif du contrôle.');
  else if (motif.length > 300) erreurs.push('Motif trop long (300 caractères au plus).');
  return erreurs;
}

/** Échéance d'un contrôle prévu, en mots. */
export function echeance(prevu: string, aujourdhui: string): { libelle: string; etat: 'retard' | 'jour' | 'proche' | 'futur' } {
  const jours = Math.round((Date.parse(`${prevu}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / 86_400_000);
  if (jours < 0) return { libelle: jours === -1 ? 'En retard d’1 jour' : `En retard de ${-jours} jours`, etat: 'retard' };
  if (jours === 0) return { libelle: 'Aujourd’hui', etat: 'jour' };
  if (jours === 1) return { libelle: 'Demain', etat: 'proche' };
  return { libelle: `Dans ${jours} jours`, etat: jours <= 7 ? 'proche' : 'futur' };
}

export type EvenementSuivi =
  | { type: 'consultation'; date: string; id: string; motif: string | null; diagnostic: string | null; conduite: string | null; praticien: string | null; statut: string; codes?: { code: string; libelle: string; principal: boolean }[] }
  | { type: 'ordonnance'; date: string; id: string; numero: string; medicaments: number }
  | { type: 'controle'; date: string; id: string; motif: string; statut: string; prevu_le: string };

/** Chronologie du plus récent au plus ancien ; un contrôle est daté par sa date prévue. */
export function chronologie(evenements: EvenementSuivi[]): EvenementSuivi[] {
  return [...evenements].sort((a, b) => b.date.localeCompare(a.date));
}

/** Date du jour à Dakar (UTC toute l'année), au format AAAA-MM-JJ. */
export const aujourdhuiDakar = (maintenant = new Date()) => maintenant.toISOString().slice(0, 10);
