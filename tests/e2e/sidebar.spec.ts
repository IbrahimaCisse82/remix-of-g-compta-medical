/**
 * Bout en bout écran : pour chaque rôle × type de structure, l'utilisateur se connecte
 * (session réelle) et tente d'atteindre les modules. Le menu ne doit proposer que les
 * modules autorisés ; les modules interdits sont absents (et la base les refuse de toute
 * façon — voir tests/db/acces-modules.db.test.ts).
 *
 * Attentes figées d'après la matrice de visibilité (src/lib/navigation-sante.ts) :
 *   P = présent quel que soit le type, C = cabinet/mixte seulement,
 *   L = laboratoire/mixte seulement, X = jamais pour ce rôle.
 */
import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { ROLES, TYPES, stateFile, type Role, type TypeStructure } from './global-setup';

type Vis = 'P' | 'C' | 'L' | 'X';
// [libellé du menu, visibilité par rôle]
const LABELS: [string, Record<Role, Vis>][] = [
  ['Patients', { admin_structure: 'P', medecin: 'P', biologiste: 'P', technicien: 'P', preleveur: 'P', secretaire: 'P', caissier: 'X', comptable: 'X', lecteur: 'X', tiers_payant: 'X' }],
  ['Agenda & consultations', { admin_structure: 'C', medecin: 'C', biologiste: 'X', technicien: 'X', preleveur: 'X', secretaire: 'C', caissier: 'X', comptable: 'X', lecteur: 'X', tiers_payant: 'X' }],
  ['Pharmacie & consommables', { admin_structure: 'C', medecin: 'C', biologiste: 'X', technicien: 'X', preleveur: 'X', secretaire: 'C', caissier: 'X', comptable: 'X', lecteur: 'X', tiers_payant: 'X' }],
  ['Plannings & gardes', { admin_structure: 'P', medecin: 'P', biologiste: 'P', technicien: 'P', preleveur: 'P', secretaire: 'P', caissier: 'P', comptable: 'P', lecteur: 'P', tiers_payant: 'P' }],
  ['Rétrocessions', { admin_structure: 'C', medecin: 'C', biologiste: 'X', technicien: 'X', preleveur: 'X', secretaire: 'X', caissier: 'X', comptable: 'C', lecteur: 'X', tiers_payant: 'X' }],
  ['Laboratoire', { admin_structure: 'L', medecin: 'L', biologiste: 'L', technicien: 'L', preleveur: 'L', secretaire: 'L', caissier: 'X', comptable: 'X', lecteur: 'X', tiers_payant: 'X' }],
  ['Qualité & réactifs', { admin_structure: 'L', medecin: 'X', biologiste: 'L', technicien: 'L', preleveur: 'X', secretaire: 'X', caissier: 'X', comptable: 'X', lecteur: 'X', tiers_payant: 'X' }],
  ['Factures & caisse', { admin_structure: 'P', medecin: 'X', biologiste: 'X', technicien: 'X', preleveur: 'X', secretaire: 'X', caissier: 'P', comptable: 'P', lecteur: 'X', tiers_payant: 'P' }],
  ['Tableaux de bord santé', { admin_structure: 'P', medecin: 'P', biologiste: 'P', technicien: 'X', preleveur: 'X', secretaire: 'X', caissier: 'X', comptable: 'P', lecteur: 'P', tiers_payant: 'X' }],
  ['Journal', { admin_structure: 'P', medecin: 'X', biologiste: 'X', technicien: 'X', preleveur: 'X', secretaire: 'X', caissier: 'X', comptable: 'P', lecteur: 'P', tiers_payant: 'X' }],
  ["Saisie d'écritures", { admin_structure: 'P', medecin: 'X', biologiste: 'X', technicien: 'X', preleveur: 'X', secretaire: 'X', caissier: 'X', comptable: 'P', lecteur: 'X', tiers_payant: 'X' }],
  ['Rapprochement', { admin_structure: 'P', medecin: 'X', biologiste: 'X', technicien: 'X', preleveur: 'X', secretaire: 'X', caissier: 'P', comptable: 'P', lecteur: 'X', tiers_payant: 'X' }],
  ['Catalogue & tarifs', { admin_structure: 'P', medecin: 'P', biologiste: 'P', technicien: 'X', preleveur: 'X', secretaire: 'X', caissier: 'P', comptable: 'X', lecteur: 'X', tiers_payant: 'X' }],
  ['Structure & équipe', { admin_structure: 'P', medecin: 'X', biologiste: 'X', technicien: 'X', preleveur: 'X', secretaire: 'X', caissier: 'X', comptable: 'X', lecteur: 'X', tiers_payant: 'X' }],
];

const visible = (v: Vis, type: TypeStructure) =>
  v === 'P' || (v === 'C' && type !== 'laboratoire') || (v === 'L' && type !== 'cabinet');

async function ouvrirEspaceSante(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
  await expect(page.getByText('Accueil santé', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
}

for (const role of ROLES) {
  for (const type of TYPES) {
    test.describe(`${type} / ${role}`, () => {
      test.use({ storageState: stateFile(role, type) });
      test.skip(!existsSync(stateFile(role, type)), 'préparation absente (variables SUPABASE_*)');

      test('le menu ne propose que les modules autorisés', async ({ page }) => {
        await ouvrirEspaceSante(page);
        const menu = page.locator('aside');
        // Les modules sont rangés dans des groupes repliables : tout déplier avant de vérifier.
        for (const groupe of await menu.locator('button[aria-expanded="false"]').all()) {
          await groupe.click();
        }
        for (const [label, parRole] of LABELS) {
          const attendu = visible(parRole[role], type);
          const item = menu.getByText(label, { exact: true });
          if (attendu) await expect(item.first(), `${label} doit être visible`).toBeVisible();
          else await expect(item, `${label} doit être absent`).toHaveCount(0);
        }
      });
    });
  }
}
