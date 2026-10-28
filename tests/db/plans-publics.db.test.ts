import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
describe.skipIf(!url || !key || !service)('Offres publiques : lecture ciblée', () => {
  it('un visiteur voit exactement les offres actives, même sans filtre client', async () => {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const visitor = createClient(url, key, { auth: { persistSession: false } });
    const all = await admin.from('plans_abonnement').select('id,actif');
    const publicRows = await visitor.from('plans_abonnement').select('id,actif');
    expect(all.error).toBeNull(); expect(publicRows.error).toBeNull();
    expect(publicRows.data?.every(row => row.actif === true)).toBe(true);
    expect(publicRows.data?.map(row => row.id).sort()).toEqual(all.data?.filter(row => row.actif === true).map(row => row.id).sort());
  });
  it('un appel direct visant les offres retirées ne renvoie rien', async () => {
    const visitor = createClient(url, key, { auth: { persistSession: false } });
    const rows = await visitor.from('plans_abonnement').select('id').eq('actif', false);
    expect(rows.error).toBeNull(); expect(rows.data).toEqual([]);
  });
});