/** Règles pures du dossier patient (sans accès réseau). */

export type Sexe = 'M' | 'F';

export interface NouveauPatient {
  nom: string;
  prenoms: string;
  sexe: Sexe | '';
  date_naissance?: string;
  date_naissance_estimee?: boolean;
  telephone?: string;
}

/** Âge en années révolues à une date donnée. */
export function ageEnAnnees(dateNaissance: string, ref: Date = new Date()): number {
  const d = new Date(dateNaissance + 'T00:00:00');
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age;
}

/** Libellé d'âge adapté (jours / mois pour les nourrissons). */
export function libelleAge(dateNaissance: string, ref: Date = new Date()): string {
  const d = new Date(dateNaissance + 'T00:00:00');
  const jours = Math.floor((ref.getTime() - d.getTime()) / 86_400_000);
  if (jours < 31) return `${jours} j`;
  const ans = ageEnAnnees(dateNaissance, ref);
  if (ans < 2) {
    const mois = (ref.getFullYear() - d.getFullYear()) * 12 + ref.getMonth() - d.getMonth() - (ref.getDate() < d.getDate() ? 1 : 0);
    return `${mois} mois`;
  }
  return `${ans} ans`;
}

/** Téléphone normalisé au format international (+indicatif…). Un numéro sénégalais local (9 chiffres) reçoit le préfixe +221. */
export function normaliserTelephone(tel: string): string {
  const chiffres = tel.replace(/\D/g, '');
  if (chiffres.startsWith('221') && chiffres.length === 12) return '+221' + chiffres.slice(3);
  if (chiffres.length === 9) return '+221' + chiffres;
  return chiffres ? '+' + chiffres : '';
}

/** Vrai si le numéro est un format international plausible (8 à 15 chiffres, indicatif optionnel). */
export function telephoneValide(tel: string): boolean {
  const chiffres = tel.replace(/\D/g, '');
  return chiffres.length >= 8 && chiffres.length <= 15;
}

export function validerPatient(p: NouveauPatient, aujourdHui: Date = new Date()): string[] {
  const erreurs: string[] = [];
  if (p.nom.trim().length < 2) erreurs.push('Nom obligatoire (2 caractères minimum).');
  if (p.prenoms.trim().length < 1) erreurs.push('Prénoms obligatoires.');
  if (p.sexe !== 'M' && p.sexe !== 'F') erreurs.push('Sexe obligatoire.');
  if (p.date_naissance) {
    const d = new Date(p.date_naissance + 'T00:00:00');
    if (isNaN(d.getTime()) || d > aujourdHui) erreurs.push('Date de naissance invalide.');
    else if (ageEnAnnees(p.date_naissance, aujourdHui) > 130) erreurs.push('Date de naissance improbable.');
  }
  if (p.telephone && p.telephone.trim()) {
    if (!telephoneValide(p.telephone)) erreurs.push('Téléphone : format international attendu (8 à 15 chiffres, ex. +221 77 000 00 00).');
  }
  return erreurs;
}
