import { describe, expect, it } from 'vitest';
import { REF_PRODUCTION, verifierCibleTests } from '../../tests/db/garde-production';

describe('garde-fou des tests de base', () => {
  it('refuse la base de production', () => {
    expect(() => verifierCibleTests(`https://${REF_PRODUCTION}.supabase.co`)).toThrow(/PRODUCTION/);
  });
  it('accepte une autre base ou l’absence de configuration', () => {
    expect(() => verifierCibleTests('https://abcdefghijklmnop.supabase.co')).not.toThrow();
    expect(() => verifierCibleTests(undefined)).not.toThrow();
  });
});
