/**
 * Garde-fou : les tests de base créent, modifient et suppriment des données avec la clé de service.
 * Ils ne doivent JAMAIS viser la base de production (Lovable Cloud, projet otyqiiumbdgaxvkcqpht).
 * Chargé avant chaque fichier de test (vitest.db.config.ts › setupFiles).
 */
export const REF_PRODUCTION = 'otyqiiumbdgaxvkcqpht';

export function verifierCibleTests(url: string | undefined): void {
  if (url && url.includes(REF_PRODUCTION)) {
    throw new Error(
      `Tests de base refusés : SUPABASE_URL vise la PRODUCTION (${REF_PRODUCTION}). ` +
      'Utilisez la base de test (voir scripts/db-test/README.md).',
    );
  }
}

verifierCibleTests(process.env.SUPABASE_URL);
