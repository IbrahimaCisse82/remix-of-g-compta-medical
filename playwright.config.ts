import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Tests de bout en bout (écran réel, navigateur) : accès aux modules par rôle et type
// de structure, et actualisation des permissions après changement de rôle/type.
// Lancement : bunx playwright test (le serveur de dev est démarré automatiquement sur :8080,
// branché sur la base de TEST désignée par SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY).
const NIX_CHROMIUM = '/nix/store/6n79cgani6b8jvqsfki6vizf8dcf65j7-playwright-browsers-with-overrides/chromium_headless_shell-1194/chrome-linux/headless_shell';
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(NIX_CHROMIUM) ? NIX_CHROMIUM : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    viewport: { width: 1280, height: 1800 },
    headless: true,
    // Navigateur fourni par l'environnement de développement (nix) s'il existe ; sinon celui de Playwright (CI).
    launchOptions: chromium ? { executablePath: chromium } : {},
  },
  webServer: {
    command: 'bunx vite --port 8080 --strictPort',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
    },
  },
});
