/** Règles pures du module Clinique (miroir des contrôles appliqués par la base). */

export type StatutRdv = 'planifie' | 'arrive' | 'en_consultation' | 'termine' | 'annule' | 'absent';

export const LIBELLE_RDV: Record<StatutRdv, string> = {
  planifie: 'Planifié', arrive: 'Arrivé', en_consultation: 'En consultation', termine: 'Terminé', annule: 'Annulé', absent: 'Absent',
};

const TRANSITIONS: Record<StatutRdv, StatutRdv[]> = {
  planifie: ['arrive', 'annule', 'absent'],
  arrive: ['en_consultation', 'annule'],
  en_consultation: ['termine'],
  termine: [], annule: [], absent: [],
};

export function transitionsPossibles(s: StatutRdv): StatutRdv[] { return TRANSITIONS[s]; }
export function transitionAutorisee(de: StatutRdv, vers: StatutRdv): boolean { return TRANSITIONS[de].includes(vers); }

/** Indice de masse corporelle (kg / m²), arrondi à 1 décimale. */
export function imc(poidsKg: number, tailleCm: number): number | null {
  if (!poidsKg || !tailleCm) return null;
  const m = tailleCm / 100;
  return Math.round((poidsKg / (m * m)) * 10) / 10;
}

export function classeImc(v: number): string {
  if (v < 18.5) return 'Maigreur';
  if (v < 25) return 'Normal';
  if (v < 30) return 'Surpoids';
  return 'Obésité';
}

export interface Constantes { ta_sys?: number; ta_dia?: number; pouls?: number; temperature?: number; spo2?: number; glycemie?: number }

/** Alertes adulte indicatives (affichage uniquement, jamais d'interprétation diagnostique). */
export function alertesConstantes(c: Constantes): string[] {
  const a: string[] = [];
  if (c.ta_sys && c.ta_sys >= 140 || c.ta_dia && c.ta_dia >= 90) a.push('Tension artérielle élevée');
  if (c.ta_sys && c.ta_sys < 90) a.push('Tension artérielle basse');
  if (c.temperature && c.temperature >= 38) a.push('Fièvre');
  if (c.temperature && c.temperature < 35.5) a.push('Hypothermie');
  if (c.spo2 && c.spo2 < 94) a.push('Saturation basse');
  if (c.pouls && (c.pouls > 100 || c.pouls < 50)) a.push('Pouls anormal');
  if (c.glycemie && c.glycemie >= 1.26) a.push('Glycémie élevée');
  if (c.glycemie && c.glycemie < 0.7) a.push('Hypoglycémie');
  return a;
}

export interface LigneOrdonnance { medicament: string; posologie: string; duree?: string; quantite?: string; dose_mg_jour?: string }

export function validerOrdonnance(lignes: LigneOrdonnance[]): string[] {
  const e: string[] = [];
  const utiles = lignes.filter(l => l.medicament.trim() || l.posologie.trim());
  if (utiles.length === 0) e.push('Ajoutez au moins un médicament.');
  utiles.forEach((l, i) => {
    if (!l.medicament.trim()) e.push(`Ligne ${i + 1} : médicament manquant.`);
    if (!l.posologie.trim()) e.push(`Ligne ${i + 1} : posologie manquante.`);
  });
  return e;
}

/** Créneaux de la journée (HH:MM) entre deux heures, au pas donné. */
export function creneaux(debutH = 8, finH = 18, pasMin = 20): string[] {
  const out: string[] = [];
  for (let m = debutH * 60; m < finH * 60; m += pasMin) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}
