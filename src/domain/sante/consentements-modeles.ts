// Bibliothèque de textes de consentement : règles d'affichage et de saisie côté écran.
// Les contrôles qui comptent (administrateur, MFA, immuabilité, structure) sont faits en base.

export type TypeConsentement = 'traitement_donnees' | 'soins' | 'partage_tiers_payant' | 'portail_sms';

export const TYPES_CONSENTEMENT: { id: TypeConsentement; label: string }[] = [
  { id: 'traitement_donnees', label: 'Traitement des données' },
  { id: 'soins', label: 'Soins' },
  { id: 'partage_tiers_payant', label: 'Partage tiers payant' },
  { id: 'portail_sms', label: 'Portail patient' },
];

export const libelleType = (t: string) => TYPES_CONSENTEMENT.find(x => x.id === t)?.label ?? t;

export interface ModeleConsentement {
  id: string;
  type: string;
  version: string;
  titre: string;
  texte: string;
  texte_sha256: string;
  valide_par: string | null;
  actif: boolean;
  created_at: string;
  archive_le: string | null;
}

export interface SaisieModele { type: string; version: string; titre: string; texte: string }

/** Erreurs de saisie avant envoi (mêmes seuils que la base). */
export function verifierModele(s: SaisieModele, existants: Pick<ModeleConsentement, 'type' | 'version'>[]): string[] {
  const e: string[] = [];
  if (!TYPES_CONSENTEMENT.some(t => t.id === s.type)) e.push('Choisissez le type de consentement.');
  if (s.version.trim().length < 2) e.push('Indiquez un numéro de version (2 caractères minimum, ex. v1.0).');
  else if (existants.some(m => m.type === s.type && m.version === s.version.trim())) e.push(`La version « ${s.version.trim()} » existe déjà pour ce type : choisissez un nouveau numéro.`);
  if (s.titre.trim().length < 3) e.push('Indiquez un titre (3 caractères minimum).');
  if (s.texte.trim().length < 50) e.push('Collez le texte intégral validé (50 caractères minimum).');
  return e;
}

/** Textes proposés à la signature : actifs, regroupés par type, version la plus récente d'abord. */
export function modelesEnVigueur(modeles: ModeleConsentement[]): ModeleConsentement[] {
  return modeles
    .filter(m => m.actif)
    .sort((a, b) => a.type.localeCompare(b.type) || b.created_at.localeCompare(a.created_at));
}

/** Suggestion de version suivante pour un type (v1.0 → v1.1, v2 → v3, sinon v1.0). */
export function versionSuivante(modeles: Pick<ModeleConsentement, 'type' | 'version' | 'created_at'>[], type: string): string {
  const derniers = modeles.filter(m => m.type === type).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!derniers.length) return 'v1.0';
  const v = derniers[0].version;
  const m = v.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v}-2`;
}

/** Empreinte courte affichée (les 12 premiers caractères suffisent à comparer à l'œil). */
export const empreinteCourte = (sha: string) => sha.slice(0, 12);
