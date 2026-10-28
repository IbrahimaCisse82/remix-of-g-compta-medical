import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run = randomBytes(8).toString('hex');
let admin: SupabaseClient;
const clients: SupabaseClient[] = [];
const ids: string[] = [];
describe.skipIf(!url || !service || !key)('Répertoire partagé — API réelle', () => {
  beforeAll(async () => {
    if (!url || !service || !key) throw new Error('Configuration absente');
    admin = createClient(url, service, { auth: { persistSession: false } });
    for (const type of ['laboratoire', 'cabinet', 'cabinet']) {
      const email = `p0-repertoire-${type}-${clients.length}-${run}@gsante.test`;
      const password = randomBytes(24).toString('base64url');
      const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (user.error) throw user.error;
      const client = createClient(url, key, { auth: { persistSession: false } });
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
      const st = await client.rpc('sante_creer_structure', { _type: type, _nom: `TEST répertoire ${clients.length} ${run}`, _role_metier: type === 'laboratoire' ? 'biologiste' : 'medecin' });
      if (st.error) throw st.error;
      clients.push(client); ids.push(st.data);
    }
    const group = await admin.from('sante_repertoire_partages').insert(ids.slice(0, 2).map(structure_id => ({ structure_id, groupe_id: runUUID() })));
    if (group.error) throw group.error;
    if (process.env.REPERTOIRE_BROWSER_FIXTURE) {
      const sessions = await Promise.all(clients.slice(0, 2).map(async (c, i) => ({ session: (await c.auth.getSession()).data.session, structure: ids[i], nom: `TEST répertoire ${i} ${run}` })));
      writeFileSync(process.env.REPERTOIRE_BROWSER_FIXTURE, JSON.stringify({ sessions, storage_key: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`, organisme: `IPM Écran ${run}` }));
    }
  });
  const groupId = crypto.randomUUID();
  function runUUID() { return groupId; }
  it('partage les ajouts laboratoire vers cabinet et cabinet vers laboratoire', async () => {
    for (const [source, target] of [[0, 1], [1, 0]]) {
      const nom = `IPM partagé ${source} ${run}`;
      const added = await clients[source].from('sante_organismes').insert({ structure_id: ids[source], nom, type: 'ipm', compte_auxiliaire: '411PRIVATE', bascule_patient_autorisee: true });
      expect(added.error).toBeNull();
      const local = await clients[target].from('sante_organismes').select('*').eq('structure_id', ids[target]).eq('nom', nom).single();
      expect(local.error).toBeNull();
      expect(local.data).toMatchObject({ nom, type: 'ipm', compte_auxiliaire: null, bascule_patient_autorisee: false });
    }
  });
  it('ne partage rien avec une structure hors groupe', async () => {
    const result = await clients[2].from('sante_organismes').select('id').eq('structure_id', ids[2]).like('nom', `%${run}%`);
    expect(result.error).toBeNull(); expect(result.data).toEqual([]);
    const directory = await clients[2].from('sante_repertoire_organismes').select('id').eq('groupe_id', groupId);
    expect(directory.error).toBeNull(); expect(directory.data).toEqual([]);
  });
  it('refuse l’inscription directe dans un groupe et la lecture croisée des fiches locales', async () => {
    expect((await clients[2].from('sante_repertoire_partages').insert({ structure_id: ids[2], groupe_id: groupId })).error).toBeTruthy();
    const foreign = await clients[0].from('sante_organismes').select('id').eq('structure_id', ids[1]);
    expect(foreign.error).toBeNull(); expect(foreign.data).toEqual([]);
  });
  it('ne propage pas les réglages locaux ni les modifications', async () => {
    const nom = `IPM partagé 0 ${run}`;
    const changed = await clients[1].from('sante_organismes').update({ actif: false, compte_auxiliaire: '411LOCAL' }).eq('structure_id', ids[1]).eq('nom', nom);
    expect(changed.error).toBeNull();
    const original = await clients[0].from('sante_organismes').select('actif,compte_auxiliaire').eq('structure_id', ids[0]).eq('nom', nom).single();
    expect(original.error).toBeNull(); expect(original.data).toEqual({ actif: true, compte_auxiliaire: '411PRIVATE' });
  });
});