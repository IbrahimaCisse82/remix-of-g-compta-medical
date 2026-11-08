/**
 * Garde-fou : les tests de base créent, modifient et suppriment des données avec la clé de service.
 * Ils ne doivent JAMAIS viser la base de production (Lovable Cloud, projet otyqiiumbdgaxvkcqpht).
 * Chargé avant chaque fichier de test (vitest.db.config.ts › setupFiles).
 */
export const REF_PRODUCTION = 'otyqiiumbdgaxvkcqpht';
/** Nouvelle production Supabase (G-Santé production, Grow Hub Sarl), créée le 08/11/2026. */
export const REFS_PRODUCTION = [REF_PRODUCTION, 'azusqndpbstvzzohlkba'];

export function verifierCibleTests(url: string | undefined): void {
  const ref = url ? REFS_PRODUCTION.find(r => url.includes(r)) : undefined;
  if (ref) {
    throw new Error(
      `Tests de base refusés : SUPABASE_URL vise la PRODUCTION (${ref}). ` +
      'Utilisez la base de test (voir scripts/db-test/README.md).',
    );
  }
}

verifierCibleTests(process.env.SUPABASE_URL);
