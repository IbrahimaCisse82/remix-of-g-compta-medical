/**
 * Consentements patient : textes intégraux versionnés et règles de recueil (sans accès réseau).
 *
 * Les textes ci-dessous sont des modèles de travail. Ils doivent être validés par
 * le juriste / la CDP avant la mise en service (voir roadmap.md, « En attente »).
 * Toute modification de fond impose une nouvelle version : un consentement signé
 * reste lié au texte exact affiché au patient (empreinte SHA-256 côté serveur).
 */

import { ageEnAnnees } from './patient';

export type TypeConsentement = 'traitement_donnees' | 'soins' | 'partage_tiers_payant' | 'portail_sms';
export type QualiteSignataire = 'patient' | 'representant_legal' | 'parent' | 'tuteur';

export interface ModeleConsentement {
  type: TypeConsentement;
  version: string;
  titre: string;
  /** Texte intégral, avec {structure} et {patient} à remplacer. */
  texte: string;
}

export const QUALITES_SIGNATAIRE: { id: QualiteSignataire; label: string }[] = [
  { id: 'patient', label: 'Le patient lui-même' },
  { id: 'parent', label: 'Parent (patient mineur)' },
  { id: 'tuteur', label: 'Tuteur' },
  { id: 'representant_legal', label: 'Représentant légal' },
];

export const MODELES_CONSENTEMENT: ModeleConsentement[] = [
  {
    type: 'traitement_donnees',
    version: 'v2-2026',
    titre: 'Traitement des données de santé',
    texte:
      'Je soussigné(e) autorise {structure} à collecter, conserver et traiter les données personnelles et de santé de {patient} '
      + 'pour la prise en charge médicale, la tenue du dossier patient, la facturation et le respect des obligations légales. '
      + 'Ces données sont accessibles uniquement aux professionnels qui participent à la prise en charge, dans la limite de leur besoin d’en connaître ; '
      + 'chaque accès est enregistré. Elles sont conservées pendant la durée légale applicable au dossier médical, puis détruites ou archivées. '
      + 'Conformément à la loi sénégalaise n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel, '
      + 'je dispose d’un droit d’accès, de rectification et d’opposition pour motif légitime, que je peux exercer auprès de la structure. '
      + 'Je peux saisir la Commission de protection des données personnelles (CDP). '
      + 'Je peux retirer ce consentement à tout moment, sans effet sur les traitements déjà réalisés ni sur ceux imposés par la loi.',
  },
  {
    type: 'soins',
    version: 'v1-2026',
    titre: 'Consentement aux soins',
    texte:
      'Je soussigné(e) déclare avoir reçu de {structure} une information claire sur l’état de santé de {patient}, '
      + 'les examens et soins proposés, leurs bénéfices, leurs risques fréquents ou graves et les alternatives possibles. '
      + 'J’ai pu poser mes questions et j’y ai obtenu des réponses. J’accepte les soins proposés. '
      + 'Je sais que je peux revenir sur cette décision à tout moment en le signalant au praticien.',
  },
  {
    type: 'partage_tiers_payant',
    version: 'v1-2026',
    titre: 'Transmission à l’organisme payeur',
    texte:
      'Je soussigné(e) autorise {structure} à transmettre à l’assurance, à l’IPM ou à la mutuelle de {patient} '
      + 'les informations strictement nécessaires au remboursement ou à la prise en charge des actes : identité, numéro d’adhérent, '
      + 'nature et date des actes, montants. Aucun résultat d’analyse ni diagnostic détaillé n’est transmis sans accord spécifique. '
      + 'Je peux retirer cette autorisation à tout moment ; la part non prise en charge sera alors à régler directement.',
  },
  {
    type: 'portail_sms',
    version: 'v1-2026',
    titre: 'Portail patient et SMS',
    texte:
      'Je soussigné(e) accepte que {structure} envoie à {patient}, au numéro de téléphone indiqué dans le dossier, '
      + 'des SMS de rappel de rendez-vous et des codes d’accès au portail patient, et rende accessibles en ligne les comptes rendus validés '
      + 'et ordonnances, à l’exclusion des résultats sensibles qui sont remis en main propre. '
      + 'L’accès au portail est protégé par un code ou un lien à usage unique. Je peux retirer cet accord à tout moment.',
  },
];

export function modeleConsentement(type: TypeConsentement): ModeleConsentement {
  const m = MODELES_CONSENTEMENT.find(x => x.type === type);
  if (!m) throw new Error(`Modèle de consentement inconnu : ${type}`);
  return m;
}

/** Texte exact présenté et signé (variables remplacées). */
export function texteConsentement(type: TypeConsentement, structure: string, patient: string): string {
  const s = structure.trim() || 'la structure';
  const p = patient.trim() || 'le patient';
  return modeleConsentement(type).texte.split('{structure}').join(s).split('{patient}').join(p);
}

/** Qualité de signataire proposée par défaut selon l'âge (mineur → parent). */
export function qualiteParDefaut(dateNaissance?: string | null, ref: Date = new Date()): QualiteSignataire {
  if (dateNaissance && ageEnAnnees(dateNaissance, ref) < 18) return 'parent';
  return 'patient';
}

export interface SaisieSignature {
  signataireNom: string;
  qualite: QualiteSignataire;
  /** Nombre de traits tracés sur le pavé de signature. */
  traits: number;
  /** Le texte intégral a été affiché jusqu'au bout. */
  texteLu: boolean;
  dateNaissance?: string | null;
}

/** Erreurs bloquantes avant envoi (le serveur revérifie). */
export function verifierSaisieSignature(s: SaisieSignature, ref: Date = new Date()): string[] {
  const e: string[] = [];
  if (!s.texteLu) e.push('Faites lire le texte intégral jusqu’au bout avant de signer.');
  if (s.signataireNom.trim().length < 2) e.push('Indiquez le nom du signataire.');
  if (s.traits < 1) e.push('La signature manuscrite est obligatoire.');
  if (s.qualite === 'patient' && s.dateNaissance && ageEnAnnees(s.dateNaissance, ref) < 18) {
    e.push('Patient mineur : la signature doit être celle d’un parent, tuteur ou représentant légal.');
  }
  return e;
}

/** Dernier état connu par type (un retrait est un nouvel enregistrement refusé). */
export function etatConsentements<T extends { type: string; accorde: boolean; created_at: string }>(rows: T[]): Record<string, T> {
  const etat: Record<string, T> = {};
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) etat[r.type] = r;
  return etat;
}
