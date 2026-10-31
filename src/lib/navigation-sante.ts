import type { PageId } from '@/stores/app-store';
import { moduleInDelivery } from './delivery-scope';

// Filtrage d'affichage du menu latéral selon le type de structure santé
// (cabinet / laboratoire / mixte) et les rôles médicaux de l'utilisateur.
// Ce filtrage ne remplace PAS les protections d'accès : les politiques RLS
// et les contrôles serveur restent la seule barrière de sécurité.

export type TypeStructure = 'cabinet' | 'laboratoire' | 'mixte';
export type RoleMedical =
  | 'admin_structure'
  | 'medecin'
  | 'biologiste'
  | 'technicien'
  | 'preleveur'
  | 'secretaire'
  | 'caissier'
  | 'comptable'
  | 'lecteur'
  | 'tiers_payant';

export interface ContexteNavigation {
  /** null = espace comptable seul ou démo : aucun filtrage (comportement historique). */
  typeStructure: TypeStructure | null;
  roles: RoleMedical[];
}

interface RegleVisibilite {
  /** Types de structure pour lesquels le module existe. Absent = tous. */
  structures?: TypeStructure[];
  /** Rôles autorisés à voir le module. Absent = tous les rôles. admin_structure voit toujours tout. */
  roles?: RoleMedical[];
}

const CLINIQUE: TypeStructure[] = ['cabinet', 'mixte'];
const LABO: TypeStructure[] = ['laboratoire', 'mixte'];

const COMPTA_LECTURE: RoleMedical[] = ['admin_structure', 'comptable', 'lecteur'];
const COMPTA_ECRITURE: RoleMedical[] = ['admin_structure', 'comptable'];
// Le caissier consulte la trésorerie ; les écritures restent réservées à l'administrateur et au comptable (serveur).
const TRESORERIE: RoleMedical[] = ['admin_structure', 'comptable', 'caissier'];
const EQUIPE_CLINIQUE: RoleMedical[] = ['admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire'];

export const VISIBILITE_MODULES: Partial<Record<PageId, RegleVisibilite>> = {
  // ─── Clinique & soins ───
  sante_patients: { roles: EQUIPE_CLINIQUE },
  sante_agenda: { structures: CLINIQUE, roles: ['admin_structure', 'medecin', 'secretaire'] },
  // Gestion du stock (articles, entrées, inventaire) : écriture comptable du dossier. Médecin et secrétaire voient
  // le stock disponible au moment de la délivrance, dans la consultation.
  stocks: { structures: CLINIQUE, roles: ['admin_structure', 'comptable'] },
  sante_plannings: {}, // tout membre consulte les plannings ; l'écriture reste réservée côté serveur
  sante_retrocessions: { structures: CLINIQUE, roles: ['admin_structure', 'medecin', 'comptable'] },

  // ─── Laboratoire & qualité ───
  sante_laboratoire: { structures: LABO, roles: EQUIPE_CLINIQUE },
  sante_qualite: { structures: LABO, roles: ['admin_structure', 'biologiste', 'technicien'] },

  // ─── Facturation & tiers-payant ───
  sante_facturation: { roles: ['admin_structure', 'caissier', 'tiers_payant', 'comptable'] },
  facturation: { roles: COMPTA_ECRITURE },
  factures_dgid: { roles: COMPTA_ECRITURE },
  fournisseurs: { roles: COMPTA_ECRITURE },

  // ─── Pilotage ───
  sante_pilotage: { roles: ['admin_structure', 'medecin', 'biologiste', 'comptable', 'lecteur'] },
  dashboard: { roles: COMPTA_LECTURE },
  clients: { roles: COMPTA_ECRITURE },
  cabinet_mgmt: { roles: COMPTA_ECRITURE },
  kpi_collab: { roles: COMPTA_ECRITURE },
  abonnements_clients: { roles: COMPTA_ECRITURE },

  // ─── Comptabilité SYSCOHADA ───
  saisie: { roles: COMPTA_ECRITURE },
  validation: { roles: COMPTA_ECRITURE },
  import: { roles: COMPTA_ECRITURE },
  abonnement: { roles: COMPTA_ECRITURE },
  cloture: { roles: COMPTA_ECRITURE },
  rapprochement: { roles: TRESORERIE },
  mobile_money: { roles: TRESORERIE },
  journal: { roles: COMPTA_LECTURE },
  grandlivre: { roles: COMPTA_LECTURE },
  lettrage: { roles: COMPTA_LECTURE },
  balance: { roles: COMPTA_LECTURE },
  balance_agee: { roles: COMPTA_LECTURE },
  anomalies: { roles: COMPTA_LECTURE },
  audit: { roles: COMPTA_LECTURE },
  immobilisations: { roles: COMPTA_LECTURE },
  provisions: { roles: COMPTA_LECTURE },
  paie: { roles: COMPTA_LECTURE },
  tva: { roles: COMPTA_LECTURE },
  echeancier: { roles: COMPTA_LECTURE },
  analytique: { roles: COMPTA_LECTURE },
  budget: { roles: COMPTA_LECTURE },
  bilan: { roles: COMPTA_LECTURE },
  resultat: { roles: COMPTA_LECTURE },
  tft: { roles: COMPTA_LECTURE },
  note34: { roles: COMPTA_LECTURE },
  liasse: { roles: COMPTA_LECTURE },
  plan: { roles: COMPTA_LECTURE },
  exercices: { roles: COMPTA_LECTURE },

  // ─── Documents & partage ───
  documents: { roles: COMPTA_ECRITURE },
  portail: { roles: COMPTA_ECRITURE },

  // ─── Structure & paramètres ───
  sante_parametres: { roles: ['admin_structure'] },
  sante_catalogue: { roles: ['admin_structure', 'medecin', 'biologiste', 'caissier'] },
  mon_abonnement: { roles: ['admin_structure'] },
  parametres: { roles: ['admin_structure'] },
};

/** Un module est visible si la structure le propose ET si un rôle de l'utilisateur l'autorise. */
export function moduleVisible(id: PageId, ctx: ContexteNavigation): boolean {
  if (!moduleInDelivery(id)) return false;
  if (ctx.typeStructure === null) return true; // espace comptable seul / démo : comportement inchangé
  const regle = VISIBILITE_MODULES[id];
  if (!regle) return true;
  if (regle.structures && !regle.structures.includes(ctx.typeStructure)) return false;
  if (regle.roles) {
    if (ctx.roles.includes('admin_structure')) return true;
    const roles = regle.roles;
    if (!ctx.roles.some(r => roles.includes(r))) return false;
  }
  return true;
}

export function filtrerModules<T extends { id: PageId }>(items: T[], ctx: ContexteNavigation): T[] {
  return items.filter(i => moduleVisible(i.id, ctx));
}
