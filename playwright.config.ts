import { defineConfig } from '@playwright/test';

// Tests de bout en bout (écran réel, navigateur) : accès aux modules par rôle et type
// de structure, et actualisation des permissions après changement de rôle/type.
// Lancement : bunx playwright test   (le serveur de dev doit tourner sur :8080)
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    viewport: { width: 1280, height: 1800 },
    headless: true,
  },
});
