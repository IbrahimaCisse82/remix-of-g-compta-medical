/**
 * Actualisation des permissions : après un changement de rôle ou de type de structure
 * (fait côté serveur, comme le ferait un administrateur), l'utilisateur recharge
 * l'application et le menu reflète immédiatement ses nouveaux droits — ni plus, ni moins.
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { stateFile } from './global-setup';

const URL = process.env.SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const actif = Boolean(URL && SERVICE);
const admin = actif ? createClient(URL, SERVICE, { auth: { persistSession: false } }) : (null as never);

async function ouvrirEspaceSante(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
  await expect(page.getByText('Accueil santé', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await deplierGroupes(page);
}

// Les modules sont rangés dans des groupes repliables : tout déplier avant de vérifier.
// La liste est relue à chaque tour car le menu se re-rend après chaque clic.
async function deplierGroupes(page: Page) {
  const menu = page.locator('aside');
  for (let i = 0; i < 15; i++) {
    const ferme = menu.locator('button[aria-expanded="false"]').first();
    if ((await ferme.count()) === 0) break;
    await ferme.click();
  }
}

test.describe('Actualisation après changement de rôle', () => {
  test.use({ storageState: stateFile('change', 'role') });
  test.skip(!actif || !existsSync(stateFile('change', 'role')), 'préparation absente');

  test('secrétaire → comptable : le menu se met à jour au rechargement', async ({ page }) => {
    await ouvrirEspaceSante(page);
    const menu = page.locator('aside');
    await expect(menu.getByText('Patients', { exact: true }).first()).toBeVisible();
    await expect(menu.getByText('Journal', { exact: true })).toHaveCount(0);

    // L'administrateur change le rôle côté serveur : secrétaire → comptable.
    const { data: st } = await admin.from('structures').select('id').eq('nom', 'E2E cabinet').single();
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const userId = list.data.users.find(u => u.email === 'e2e-change-role@gsante.test')!.id;
    const { data: m } = await admin.from('structure_memberships').select('id').eq('structure_id', st!.id).eq('user_id', userId!).single();
    await admin.from('medical_user_roles').delete().eq('membership_id', m!.id);
    await admin.from('medical_user_roles').insert({ membership_id: m!.id, role: 'comptable' });

    // Rechargement : les permissions affichées suivent le nouveau rôle.
    await page.reload();
    await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
    await expect(page.getByText('Accueil santé', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await deplierGroupes(page);
    await expect(menu.getByText('Patients', { exact: true })).toHaveCount(0);
    await expect(menu.getByText('Journal', { exact: true }).first()).toBeVisible();
    await expect(menu.getByText('Factures & caisse', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Actualisation après changement de type de structure', () => {
  test.use({ storageState: stateFile('change', 'type') });
  test.skip(!actif || !existsSync(stateFile('change', 'type')), 'préparation absente');

  test('cabinet → laboratoire : les modules affichés suivent le nouveau type', async ({ page }) => {
    await ouvrirEspaceSante(page);
    const menu = page.locator('aside');
    await expect(menu.getByText('Agenda & consultations', { exact: true }).first()).toBeVisible();
    await expect(menu.getByText('Laboratoire', { exact: true })).toHaveCount(0);

    // Le type de la structure bascule côté serveur : cabinet → laboratoire.
    const { data: st } = await admin.from('structures').select('id').eq('nom', 'E2E bascule').single();
    await admin.from('structures').update({ type: 'laboratoire' }).eq('id', st!.id);

    await page.reload();
    await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
    await expect(page.getByText('Accueil santé', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await deplierGroupes(page);
    await expect(menu.getByText('Laboratoire', { exact: true }).first()).toBeVisible();
    await expect(menu.getByText('Qualité & réactifs', { exact: true }).first()).toBeVisible();
    await expect(menu.getByText('Agenda & consultations', { exact: true })).toHaveCount(0);
    await expect(menu.getByText('Pharmacie & consommables', { exact: true })).toHaveCount(0);

    // Remise en l'état pour les prochains lancements.
    await admin.from('structures').update({ type: 'cabinet' }).eq('id', st!.id);
  });
});
