import type { RoleMedical } from '@/lib/navigation-sante';

/**
 * Qui peut faire quoi à l'écran. Copie des contrôles serveur (has_any_medical_role
 * dans les fonctions sante_*) : sert uniquement à ne pas afficher un bouton qui
 * serait refusé. La base reste seule décisionnaire.
 */
export const DROITS_SANTE = {
  prelever: ['preleveur', 'technicien', 'biologiste'],
  traiter_echantillon: ['technicien', 'biologiste'],
  saisir_resultat: ['technicien', 'biologiste'],
  valider_technique: ['technicien', 'biologiste'],
  valider_biologique: ['biologiste'],
  rectifier_resultat: ['biologiste'],
  gerer_caisse: ['admin_structure', 'caissier', 'secretaire'],
  creer_facture: ['admin_structure', 'secretaire', 'caissier', 'medecin', 'biologiste'],
  remettre_cheques: ['admin_structure', 'caissier'],
  accorder_remise: ['admin_structure'],
  annuler_facture: ['admin_structure'],
  analyse_chiffre_affaires: ['admin_structure', 'comptable'],
} as const satisfies Record<string, readonly RoleMedical[]>;

export type ActionSante = keyof typeof DROITS_SANTE;

export function peut(roles: readonly RoleMedical[], action: ActionSante): boolean {
  const autorises: readonly RoleMedical[] = DROITS_SANTE[action];
  return roles.some(r => autorises.includes(r));
}

/**
 * Affiche un résultat numérique en français sans jamais masquer la précision saisie :
 * au moins `decimales` chiffres après la virgule, davantage si la valeur en comporte.
 */
export function formaterResultat(valeur: number, decimales: number): string {
  const min = Math.max(0, Math.min(4, Math.trunc(decimales || 0)));
  const partie = String(valeur).split('.')[1] ?? '';
  const max = Math.max(min, Math.min(4, partie.length));
  return valeur.toLocaleString('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: false });
}
