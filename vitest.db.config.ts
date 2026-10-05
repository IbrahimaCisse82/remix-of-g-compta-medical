import { defineConfig } from "vitest/config";

// Tests de sécurité de la base (comptes de test réels, API réelle). Séparés des tests unitaires.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.db.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
