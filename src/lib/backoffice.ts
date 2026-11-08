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
};
export function libelleAction(action: string): string {
  return ACTIONS[action] ?? action.replace(/_/g, ' ');
}

export type ModuleBackoffice = { id: string; libelle: string; lot: 'socle' | 'pilote' | 'commercial'; disponible: boolean };
export const MODULES_BACKOFFICE: ModuleBackoffice[] = [
  { id: 'tableau', libelle: 'Tableau de bord', lot: 'pilote', disponible: false },
  { id: 'retours', libelle: 'Retours pilotes', lot: 'pilote', disponible: false },
  { id: 'clients', libelle: 'Clients', lot: 'pilote', disponible: false },
  { id: 'utilisateurs', libelle: 'Utilisateurs', lot: 'pilote', disponible: false },
  { id: 'support', libelle: 'Support', lot: 'pilote', disponible: false },
  { id: 'operateurs', libelle: 'Opérateurs', lot: 'socle', disponible: true },
  { id: 'journal', libelle: "Journal d'audit", lot: 'socle', disponible: true },
];
