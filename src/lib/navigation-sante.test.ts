import { describe, expect, it } from 'vitest';
import { moduleVisible, type RoleMedical, type TypeStructure } from './navigation-sante';
import type { PageId } from '@/stores/app-store';

// Vérifie les modules affichés dans le menu pour chaque combinaison
// type de structure (cabinet / laboratoire / mixte) × rôle utilisateur.

const TYPES: TypeStructure[] = ['cabinet', 'laboratoire', 'mixte'];
const ROLES: RoleMedical[] = [
  'admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur',
  'secretaire', 'caissier', 'comptable', 'lecteur', 'tiers_payant',
];

function visible(id: PageId, type: TypeStructure, roles: RoleMedical[]): boolean {
  return moduleVisible(id, { typeStructure: type, roles });
}

describe('filtrage du menu — type de structure', () => {
  it('un cabinet ne propose ni Laboratoire ni Qualité & réactifs', () => {
    for (const role of ROLES) {
      expect(visible('sante_laboratoire', 'cabinet', [role])).toBe(false);
      expect(visible('sante_qualite', 'cabinet', [role])).toBe(false);
    }
  });

  it('un laboratoire ne propose ni Agenda & consultations ni Pharmacie ni Rétrocessions', () => {
    for (const role of ROLES) {
      expect(visible('sante_agenda', 'laboratoire', [role])).toBe(false);
      expect(visible('stocks', 'laboratoire', [role])).toBe(false);
      expect(visible('sante_retrocessions', 'laboratoire', [role])).toBe(false);
    }
  });

  it('une structure mixte propose à la fois les modules clinique et laboratoire', () => {
    expect(visible('sante_agenda', 'mixte', ['medecin'])).toBe(true);
    expect(visible('sante_laboratoire', 'mixte', ['biologiste'])).toBe(true);
    expect(visible('sante_qualite', 'mixte', ['biologiste'])).toBe(true);
    expect(visible('sante_retrocessions', 'mixte', ['medecin'])).toBe(true);
    expect(visible('stocks', 'mixte', ['medecin'])).toBe(true);
  });

  it("l'accueil santé et les plannings restent visibles pour tout type et tout rôle", () => {
    for (const type of TYPES) {
      for (const role of ROLES) {
        expect(visible('sante_accueil', type, [role])).toBe(true);
        expect(visible('sante_plannings', type, [role])).toBe(true);
      }
    }
  });
});

describe('filtrage du menu — rôle utilisateur', () => {
  it("l'administrateur de structure voit tous les modules de son type de structure", () => {
    const attendus: Record<TypeStructure, PageId[]> = {
      cabinet: ['sante_patients', 'sante_agenda', 'stocks', 'sante_retrocessions', 'sante_facturation', 'sante_pilotage', 'sante_parametres', 'sante_catalogue', 'saisie', 'journal', 'bilan'],
      laboratoire: ['sante_patients', 'sante_laboratoire', 'sante_qualite', 'sante_facturation', 'sante_pilotage', 'sante_parametres', 'sante_catalogue', 'saisie', 'journal', 'bilan'],
      mixte: ['sante_patients', 'sante_agenda', 'stocks', 'sante_laboratoire', 'sante_qualite', 'sante_retrocessions', 'sante_facturation', 'sante_pilotage', 'sante_parametres', 'sante_catalogue', 'saisie', 'journal', 'bilan'],
    };
    for (const type of TYPES) {
      for (const id of attendus[type]) {
        expect(visible(id, type, ['admin_structure'])).toBe(true);
      }
    }
  });

  it('le médecin voit Patients, Agenda et Rétrocessions mais pas la caisse ni la comptabilité', () => {
    expect(visible('sante_patients', 'cabinet', ['medecin'])).toBe(true);
    expect(visible('sante_agenda', 'cabinet', ['medecin'])).toBe(true);
    expect(visible('sante_retrocessions', 'cabinet', ['medecin'])).toBe(true);
    expect(visible('sante_facturation', 'cabinet', ['medecin'])).toBe(false);
    expect(visible('saisie', 'cabinet', ['medecin'])).toBe(false);
    expect(visible('journal', 'cabinet', ['medecin'])).toBe(false);
    expect(visible('sante_parametres', 'cabinet', ['medecin'])).toBe(false);
  });

  it('le biologiste voit Laboratoire et Qualité mais pas la caisse ni les paramètres', () => {
    expect(visible('sante_laboratoire', 'laboratoire', ['biologiste'])).toBe(true);
    expect(visible('sante_qualite', 'laboratoire', ['biologiste'])).toBe(true);
    expect(visible('sante_patients', 'laboratoire', ['biologiste'])).toBe(true);
    expect(visible('sante_facturation', 'laboratoire', ['biologiste'])).toBe(false);
    expect(visible('sante_parametres', 'laboratoire', ['biologiste'])).toBe(false);
    expect(visible('saisie', 'laboratoire', ['biologiste'])).toBe(false);
  });

  it('le technicien voit Laboratoire et Qualité mais pas le Catalogue ni la Facturation', () => {
    expect(visible('sante_laboratoire', 'mixte', ['technicien'])).toBe(true);
    expect(visible('sante_qualite', 'mixte', ['technicien'])).toBe(true);
    expect(visible('sante_catalogue', 'mixte', ['technicien'])).toBe(false);
    expect(visible('sante_facturation', 'mixte', ['technicien'])).toBe(false);
  });

  it('le préleveur voit Laboratoire et Patients mais pas Qualité ni la caisse', () => {
    expect(visible('sante_laboratoire', 'laboratoire', ['preleveur'])).toBe(true);
    expect(visible('sante_patients', 'laboratoire', ['preleveur'])).toBe(true);
    expect(visible('sante_qualite', 'laboratoire', ['preleveur'])).toBe(false);
    expect(visible('sante_facturation', 'laboratoire', ['preleveur'])).toBe(false);
  });

  it('la secrétaire voit Patients et Agenda mais pas la caisse, la comptabilité ni les paramètres', () => {
    expect(visible('sante_patients', 'cabinet', ['secretaire'])).toBe(true);
    expect(visible('sante_agenda', 'cabinet', ['secretaire'])).toBe(true);
    expect(visible('sante_facturation', 'cabinet', ['secretaire'])).toBe(false);
    expect(visible('saisie', 'cabinet', ['secretaire'])).toBe(false);
    expect(visible('journal', 'cabinet', ['secretaire'])).toBe(false);
    expect(visible('sante_parametres', 'cabinet', ['secretaire'])).toBe(false);
  });

  it('le caissier voit Factures & caisse et le Rapprochement mais pas les Patients ni la saisie comptable', () => {
    expect(visible('sante_facturation', 'mixte', ['caissier'])).toBe(true);
    expect(visible('rapprochement', 'mixte', ['caissier'])).toBe(true);
    expect(visible('mobile_money', 'mixte', ['caissier'])).toBe(true);
    expect(visible('sante_patients', 'mixte', ['caissier'])).toBe(false);
    expect(visible('saisie', 'mixte', ['caissier'])).toBe(false);
    expect(visible('journal', 'mixte', ['caissier'])).toBe(false);
  });

  it('le comptable voit toute la comptabilité et la facturation mais pas les Patients ni le Laboratoire', () => {
    expect(visible('saisie', 'mixte', ['comptable'])).toBe(true);
    expect(visible('journal', 'mixte', ['comptable'])).toBe(true);
    expect(visible('bilan', 'mixte', ['comptable'])).toBe(true);
    expect(visible('cloture', 'mixte', ['comptable'])).toBe(true);
    expect(visible('sante_facturation', 'mixte', ['comptable'])).toBe(true);
    expect(visible('sante_patients', 'mixte', ['comptable'])).toBe(false);
    expect(visible('sante_laboratoire', 'mixte', ['comptable'])).toBe(false);
    expect(visible('sante_agenda', 'mixte', ['comptable'])).toBe(false);
  });

  it('le lecteur consulte la comptabilité et le pilotage mais ne voit ni saisie ni données cliniques', () => {
    expect(visible('journal', 'cabinet', ['lecteur'])).toBe(true);
    expect(visible('bilan', 'cabinet', ['lecteur'])).toBe(true);
    expect(visible('sante_pilotage', 'cabinet', ['lecteur'])).toBe(true);
    expect(visible('saisie', 'cabinet', ['lecteur'])).toBe(false);
    expect(visible('cloture', 'cabinet', ['lecteur'])).toBe(false);
    expect(visible('sante_patients', 'cabinet', ['lecteur'])).toBe(false);
    expect(visible('sante_facturation', 'cabinet', ['lecteur'])).toBe(false);
  });

  it('le tiers payant voit Factures & caisse uniquement côté santé, sans patients ni laboratoire', () => {
    expect(visible('sante_facturation', 'mixte', ['tiers_payant'])).toBe(true);
    expect(visible('sante_patients', 'mixte', ['tiers_payant'])).toBe(false);
    expect(visible('sante_laboratoire', 'mixte', ['tiers_payant'])).toBe(false);
    expect(visible('sante_agenda', 'mixte', ['tiers_payant'])).toBe(false);
    expect(visible('saisie', 'mixte', ['tiers_payant'])).toBe(false);
  });
});

describe('filtrage du menu — combinaisons et cas limites', () => {
  it('chaque combinaison type × rôle garde au minimum Accueil et Plannings', () => {
    for (const type of TYPES) {
      for (const role of ROLES) {
        expect(visible('sante_accueil', type, [role])).toBe(true);
        expect(visible('sante_plannings', type, [role])).toBe(true);
      }
    }
  });

  it('les rôles se cumulent : un médecin-caissier voit les modules des deux rôles', () => {
    const roles: RoleMedical[] = ['medecin', 'caissier'];
    expect(visible('sante_agenda', 'cabinet', roles)).toBe(true);
    expect(visible('sante_facturation', 'cabinet', roles)).toBe(true);
    expect(visible('saisie', 'cabinet', roles)).toBe(false);
  });

  it('sans rôle, seuls les modules ouverts à tous restent visibles', () => {
    expect(visible('sante_accueil', 'mixte', [])).toBe(true);
    expect(visible('sante_plannings', 'mixte', [])).toBe(true);
    expect(visible('sante_patients', 'mixte', [])).toBe(false);
    expect(visible('sante_facturation', 'mixte', [])).toBe(false);
    expect(visible('journal', 'mixte', [])).toBe(false);
  });

  it('hors espace santé (structure null), le menu historique est inchangé', () => {
    const ctx = { typeStructure: null, roles: [] as RoleMedical[] };
    const ids: PageId[] = ['sante_patients', 'sante_laboratoire', 'saisie', 'journal', 'bilan', 'sante_parametres'];
    for (const id of ids) {
      expect(moduleVisible(id, ctx)).toBe(true);
    }
  });

  it("le filtre de structure s'applique aussi à l'administrateur (pas de Laboratoire dans un cabinet)", () => {
    expect(visible('sante_laboratoire', 'cabinet', ['admin_structure'])).toBe(false);
    expect(visible('sante_agenda', 'laboratoire', ['admin_structure'])).toBe(false);
  });
});
