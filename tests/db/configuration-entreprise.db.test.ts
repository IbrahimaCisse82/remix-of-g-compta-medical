import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const run = randomBytes(6).toString('hex');
let admin: SupabaseClient;
const cs: SupabaseClient[] = [], ids: string[] = [], eids: string[] = [];
describe.skipIf(!url || !key || !service)('Configuration et isolation — API réelle', () => {
 beforeAll(async () => {
  if (!url || !key || !service) throw new Error('Configuration absente');
  admin = createClient(url, service, { auth: { persistSession: false } });
  for (const i of [0, 1]) {
   const email = `p0-config-${i}-${run}@gsante.test`, password = randomBytes(24).toString('base64url');
   const user = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (user.error) throw user.error;
   const c = createClient(url, key, { auth: { persistSession: false } });
   const login = await c.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
   const st = await c.rpc('sante_creer_structure', { _nom: `TEST configuration ${i} ${run}`, _type: i ? 'cabinet' : 'laboratoire', _role_metier: i ? 'medecin' : 'biologiste' }); if (st.error) throw st.error;
   cs.push(c); ids.push(st.data);
   const s = await c.from('structures').select('entreprise_id').eq('id', st.data).single(); if (s.error || !s.data.entreprise_id) throw new Error('Entreprise absente'); eids.push(s.data.entreprise_id);
  }
  if (process.env.CONFIG_BROWSER_FIXTURE) writeFileSync(process.env.CONFIG_BROWSER_FIXTURE, JSON.stringify({ storage_key: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`, session: (await cs[0].auth.getSession()).data.session, structure: ids[0] }));
 });
 it('sauvegarde les valeurs et reprend à l’étape 2', async () => {
  const r = await cs[0].rpc('sante_configuration_sauver', { _structure_id: ids[0], _donnees: { nom: `TEST configuration ${run}`, adresse: 'ADRESSE FICTIVE' }, _etape: 1, _revision: 0 });
  expect(r.error).toBeNull(); expect(r.data).toMatchObject({ etape: 1, revision: 1, termine: false });
  const read = await cs[0].from('sante_configuration_brouillons').select('donnees,etape').eq('structure_id', ids[0]).single();
  expect(read.error).toBeNull(); expect(read.data).toEqual({ donnees: { nom: `TEST configuration ${run}`, adresse: 'ADRESSE FICTIVE' }, etape: 1 });
 });
 it('refuse de lire ou modifier le brouillon de l’autre entreprise', async () => {
  const read = await cs[1].from('sante_configuration_brouillons').select('*').eq('structure_id', ids[0]); expect(read.error).toBeNull(); expect(read.data).toEqual([]);
  expect((await cs[1].rpc('sante_configuration_sauver', { _structure_id: ids[0], _donnees: {}, _etape: 0, _revision: 1 })).error).toBeTruthy();
 });
 it('refuse les mises à jour croisées et les liens vers l’autre entreprise', async () => {
  for (const [i,j] of [[0,1],[1,0]]) {
   for (const [table,id] of [['structures',ids[j]],['entreprises',eids[j]]]) {
    const read = await cs[i].from(table).select('id').eq('id',id); expect(read.error).toBeNull(); expect(read.data).toEqual([]);
    const write = await cs[i].from(table).update({ nom: 'INTERDIT' }).eq('id',id).select('id'); expect(write.data ?? []).toEqual([]);
   }
   expect((await cs[i].from('structures').update({ entreprise_id: eids[j] }).eq('id',ids[i])).error).toBeTruthy();
   expect((await cs[i].rpc('lier_structure_entreprise', { _structure_id: ids[i], _entreprise_id: eids[j] })).error).toBeTruthy();
  }
 });
 it('refuse un écrasement depuis une ancienne révision et des champs de droits', async () => {
  expect((await cs[0].rpc('sante_configuration_sauver', { _structure_id: ids[0], _donnees: {}, _etape: 0, _revision: 0 })).error?.code).toBe('40001');
  expect((await cs[0].rpc('sante_configuration_sauver', { _structure_id: ids[0], _donnees: { entreprise_id: eids[1] }, _etape: 1, _revision: 1 })).error).toBeTruthy();
 });
 it('finalise identité santé et entreprise sans modifier l’autre structure', async () => {
  const nom = `TEST configuration validée ${run}`;
  const r = await cs[0].rpc('sante_configuration_sauver', { _structure_id: ids[0], _donnees: { nom, ninea: 'FICTIF' }, _etape: 2, _revision: 1, _terminer: true }); expect(r.error).toBeNull(); expect(r.data.termine).toBe(true);
  const s = await cs[0].from('structures').select('nom,ninea').eq('id',ids[0]).single(); expect(s.data).toEqual({nom,ninea:'FICTIF'});
  const e = await cs[0].from('entreprises').select('nom,ninea').eq('id',eids[0]).single(); expect(e.data).toEqual({nom,ninea:'FICTIF'});
  const other = await cs[1].from('structures').select('nom').eq('id',ids[1]).single(); expect(other.data?.nom).toBe(`TEST configuration 1 ${run}`);
 });
});