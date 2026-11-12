// Back-office de la plateforme (équipe Grow Hub) : logique pure, testée sans navigateur.

export type MoiPlateforme = { operateur: boolean; role: 'proprietaire' | 'operateur' | null; mfa: boolean };
export type EtatAcces = 'chargement' | 'non_connecte' | 'refuse' | 'double_auth' | 'ok';

/** Ce que l'espace /admin doit montrer. Le serveur refuse de toute façon chaque appel non autorisé. */
export function etatAcces(connecte: boolean | null, moi: MoiPlateforme | null | undefined): EtatAcces {
  if (connecte === null) return 'chargement';
  if (!connecte) return 'non_connecte';
  if (moi === undefined) return 'chargement';
  if (!moi || !moi.operateur) return 'refuse';
  if (!moi.mfa) return 'double_auth';
  return 'ok';
}

const ACTIONS: Record<string, string> = {
  operateur_ajoute: 'Opérateur ajouté',
  operateur_modifie: 'Opérateur modifié',
  retour_traite: 'Retour traité',
  utilisateur_recherche: 'Recherche d\'utilisateur',
  support_demande: 'Accès de support demandé',
  support_accorde: 'Accès de support accordé',
  support_refuse: 'Accès de support refusé',
  support_revoque: 'Accès de support révoqué',
  cim10_import: 'CIM-10 chargée',
  compte_commun_defini: 'Compte commun du plan défini',
  plan_version_creee: 'Version du plan comptable créée (brouillon)',
  plan_compte_modifie: 'Compte du plan modifié (brouillon)',
  plan_version_publiee: 'Version du plan comptable publiée',
  plan_version_supprimee: 'Brouillon du plan comptable supprimé',
  cim10_code_defini: 'Code CIM-10 ajouté ou modifié',
  cim10_absents_desactives: 'Codes CIM-10 absents désactivés',
};
export function libelleAction(action: string): string {
  return ACTIONS[action] ?? action.replace(/_/g, ' ');
}

export type ModuleBackoffice = { id: string; libelle: string; lot: 'socle' | 'pilote' | 'commercial'; disponible: boolean };
export const MODULES_BACKOFFICE: ModuleBackoffice[] = [
  { id: 'tableau', libelle: 'Tableau de bord', lot: 'pilote', disponible: true },
  { id: 'retours', libelle: 'Retours pilotes', lot: 'pilote', disponible: true },
  { id: 'clients', libelle: 'Clients', lot: 'pilote', disponible: true },
  { id: 'utilisateurs', libelle: 'Utilisateurs', lot: 'pilote', disponible: true },
  { id: 'support', libelle: 'Support', lot: 'pilote', disponible: true },
  { id: 'erreurs', libelle: 'Erreurs', lot: 'pilote', disponible: true },
  { id: 'operateurs', libelle: 'Opérateurs', lot: 'socle', disponible: true },
  { id: 'journal', libelle: "Journal d'audit", lot: 'socle', disponible: true },
  { id: 'referentiels', libelle: 'Référentiels', lot: 'socle', disponible: true },
];

export type TypeRetour = 'bug' | 'amelioration' | 'question';
export type StatutRetour = 'nouveau' | 'en_cours' | 'planifie' | 'resolu' | 'rejete';
export type PrioriteRetour = 'basse' | 'normale' | 'haute' | 'bloquante';
export const TYPES_RETOUR: { id: TypeRetour; libelle: string }[] = [
  { id: 'bug', libelle: 'Un problème' },
  { id: 'amelioration', libelle: 'Une idée d\'amélioration' },
  { id: 'question', libelle: 'Une question' },
];
export const STATUTS_RETOUR: { id: StatutRetour; libelle: string }[] = [
  { id: 'nouveau', libelle: 'Nouveau' },
  { id: 'en_cours', libelle: 'En cours' },
  { id: 'planifie', libelle: 'Planifié' },
  { id: 'resolu', libelle: 'Résolu' },
  { id: 'rejete', libelle: 'Non retenu' },
];
export const PRIORITES_RETOUR: { id: PrioriteRetour; libelle: string }[] = [
  { id: 'bloquante', libelle: 'Bloquante' },
  { id: 'haute', libelle: 'Haute' },
  { id: 'normale', libelle: 'Normale' },
  { id: 'basse', libelle: 'Basse' },
];
export function libelleStatutRetour(s: string): string {
  return STATUTS_RETOUR.find(x => x.id === s)?.libelle ?? s;
}
export function libelleTypeRetour(t: string): string {
  return TYPES_RETOUR.find(x => x.id === t)?.libelle ?? t;
}

/** Contrôle avant envoi (le serveur refait les mêmes contrôles). */
export function erreurRetour(type: string, message: string): string | null {
  if (!TYPES_RETOUR.some(t => t.id === type)) return 'Choisissez le type de retour.';
  const m = message.trim();
  if (m.length < 5) return 'Décrivez en quelques mots (5 caractères au moins).';
  if (m.length > 4000) return 'Message trop long (4 000 caractères au plus).';
  return null;
}

/** Contexte technique joint au retour : jamais de donnée de patient ni de jeton. */
export function contexteRetour(nav: { userAgent: string; language: string }, ecran: { width: number; height: number }, version: string) {
  return { navigateur: nav.userAgent.slice(0, 200), langue: nav.language, ecran: `${ecran.width}x${ecran.height}`, version };
}

/** « il y a 3 j », « jamais » : dernière connexion lisible. */
export function depuis(date: string | null | undefined, maintenant = new Date()): string {
  if (!date) return 'jamais';
  const minutes = Math.floor((maintenant.getTime() - new Date(date).getTime()) / 60000);
  if (minutes < 60) return 'il y a moins d\'une heure';
  if (minutes < 1440) return `il y a ${Math.floor(minutes / 60)} h`;
  const jours = Math.floor(minutes / 1440);
  return jours < 60 ? `il y a ${jours} j` : `il y a ${Math.floor(jours / 30)} mois`;
}
