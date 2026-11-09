import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
// 0113 : un client lit son abonnement mais ne peut ni le créer, ni le modifier, ni le supprimer.
describe.skipIf(!url || !key || !service)('Abonnements en lecture seule pour les clients', () => {
  let owner: SupabaseClient; let entreprise = ''; let plan = ''; let abonnement = '';
  beforeAll(async () => {
    const admin = createClient(url, service);
    const password = randomBytes(24).toString('base64url');
    const email = `p0-abo-${randomBytes(6).toString('hex')}@gsante.test`;
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (user.error) throw user.error;
    owner = createClient(url, key, { auth: { persistSession: false } });
    const login = await owner.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    const s = await owner.rpc('sante_creer_structure', { _nom: 'TEST Verrou abonnements', _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error;
    const st = await admin.from('structures').select('entreprise_id').eq('id', s.data).single();
    if (st.error) throw st.error; entreprise = st.data.entreprise_id;
    const p = await admin.from('plans_abonnement').select('id').eq('actif', true).limit(1).single();
    if (p.error) throw p.error; plan = p.data.id;
    const a = await admin.from('abonnements').insert({ entreprise_id: entreprise, plan_id: plan, statut: 'essai' }).select('id').single();
    if (a.error) throw a.error; abonnement = a.data.id;
  }, 120000);
  it("l'administrateur client lit son abonnement", async () => {
    const r = await owner.from('abonnements').select('id,statut').eq('entreprise_id', entreprise);
    expect(r.error).toBeNull(); expect(r.data?.map(x => x.id)).toEqual([abonnement]);
  });
  it("il ne peut pas s'en créer un", async () => {
    const r = await owner.from('abonnements').insert({ entreprise_id: entreprise, plan_id: plan, statut: 'actif' });
    expect(r.error).not.toBeNull();
  });
  it("il ne peut pas le prolonger ni l'activer", async () => {
    const r = await owner.from('abonnements').update({ statut: 'actif', date_fin: '2099-12-31' }).eq('id', abonnement).select('id');
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
    const admin = createClient(url, service);
    const v = await admin.from('abonnements').select('statut,date_fin').eq('id', abonnement).single();
    expect(v.data).toEqual({ statut: 'essai', date_fin: null });
  });
  it('il ne peut pas le supprimer', async () => {
    await owner.from('abonnements').delete().eq('id', abonnement);
    const admin = createClient(url, service);
    const v = await admin.from('abonnements').select('id').eq('id', abonnement);
    expect(v.data?.length).toBe(1);
  });
});
