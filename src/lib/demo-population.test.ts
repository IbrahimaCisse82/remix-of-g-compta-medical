import { describe, expect, it } from 'vitest';
import { populateDemo } from '../../supabase/functions/_shared/demo-population';

describe('Isolation de la démonstration', () => {
  it('refuse un compte réel avant toute lecture ou écriture métier', async () => {
    let accessed = false;
    const db = { auth: { getUser: async () => ({ data: { user: { id: 'real', email: 'real@example.com' } }, error: null }) }, from: () => { accessed = true; throw new Error('unexpected access'); } };
    await expect(populateDemo(db)).rejects.toThrow('Dedicated demo account required');
    expect(accessed).toBe(false);
  });
  it('refuse une session absente avant toute écriture', async () => {
    let accessed = false;
    const db = { auth: { getUser: async () => ({ data: { user: null }, error: null }) }, from: () => { accessed = true; throw new Error('unexpected access'); } };
    await expect(populateDemo(db)).rejects.toThrow('Dedicated demo account required');
    expect(accessed).toBe(false);
  });
});