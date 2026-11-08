import { describe, expect, it } from 'vitest';
import { REFS_PRODUCTION, verifierCibleTests } from '../../tests/db/garde-production';

describe('garde-fou des tests de base', () => {
  it('refuse les bases de production (Lovable Cloud et Supabase)', () => {
    for (const ref of REFS_PRODUCTION) expect(() => verifierCibleTests(`https://${ref}.supabase.co`)).toThrow(/PRODUCTION/);
  });
  it('accepte une autre base ou l’absence de configuration', () => {
    expect(() => verifierCibleTests('https://abcdefghijklmnop.supabase.co')).not.toThrow();
    expect(() => verifierCibleTests(undefined)).not.toThrow();
  });
});
