import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
describe.skipIf(!url || !key || !service)('Journal e-mails : endpoint réel', () => {
  let owner: SupabaseClient, reader: SupabaseClient;
  let structure = '', other = '';
  beforeAll(async () => {
    const admin = createClient(url, service);
    async function account(label: string) {
      const password = randomBytes(24).toString('base64url');
      const email = `p0-email-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
      const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (user.error || !user.data.user) throw user.error ?? new Error('Compte absent');
      const client = createClient(url, key, { auth: { persistSession: false } });
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
      return { client, id: user.data.user.id };
    }
    const a = await account('admin'); owner = a.client;
    const result = await owner.rpc('sante_creer_structure', { _nom: 'TEST Journal e-mails', _type: 'cabinet', _role_metier: 'medecin' });
    if (result.error) throw result.error; structure = result.data;
    const b = await account('lecteur'); reader = b.client;
    const membership = await admin.from('structure_memberships').insert({ structure_id: structure, user_id: b.id, statut: 'actif' }).select('id').single();
    if (membership.error) throw membership.error;
    const role = await admin.from('medical_user_roles').insert({ membership_id: membership.data.id, role: 'lecteur' });
    if (role.error) throw role.error;
    const c = await account('autre');
    const s = await c.client.rpc('sante_creer_structure', { _nom: 'TEST Autre journal', _type: 'laboratoire', _role_metier: 'biologiste' });
    if (s.error) throw s.error; other = s.data;
  }, 120000);
  it('un administrateur consulte sa structure sans exposer les e-mails de connexion', async () => {
    const result = await owner.functions.invoke('email-journal', { body: { structure_id: structure } });
    expect(result.error).toBeNull(); expect(result.data.events).toEqual([]);
  });
  it('le lecteur est refusé par le serveur', async () => {
    const result = await reader.functions.invoke('email-journal', { body: { structure_id: structure } });
    expect(result.error?.context.status).toBe(403);
  });
  it('un administrateur ne consulte pas une autre structure', async () => {
    const result = await owner.functions.invoke('email-journal', { body: { structure_id: other } });
    expect(result.error?.context.status).toBe(403);
  });
  it('un visiteur sans session est refusé', async () => {
    const result = await createClient(url, key).functions.invoke('email-journal', { body: { structure_id: structure } });
    expect(result.error?.context.status).toBe(401);
  });
});