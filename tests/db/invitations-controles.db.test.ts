import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

// Invitations (0081) : rôle compatible avec le type de structure, pas de doublon en attente, réservé à l'administrateur.
const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY, key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run = randomBytes(8).toString('hex');
let admin: SupabaseClient, owner: SupabaseClient, etranger: SupabaseClient;
let cabinet = '', labo = '';

describe.skipIf(!url || !service || !key)('Invitations — contrôles serveur', () => {
  beforeAll(async () => {
    if (!url || !service || !key) throw new Error('Configuration absente');
    admin = createClient(url, service);
    async function compte(n: string) {
      const email = `p0-invit-${n}-${run}@gsante.test`, password = randomBytes(24).toString('base64url');
      const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (u.error || !u.data.user) throw new Error('Compte absent');
      const c = createClient(url, key, { auth: { persistSession: false } });
      const login = await c.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
      return c;
    }
    owner = await compte('owner'); etranger = await compte('etranger');
    const c = await owner.rpc('sante_creer_structure', { _type: 'cabinet', _nom: `TEST invitations cabinet ${run}`, _role_metier: 'admin_structure' }); if (c.error) throw c.error; cabinet = c.data;
    const l = await owner.rpc('sante_creer_structure', { _type: 'laboratoire', _nom: `TEST invitations labo ${run}`, _role_metier: 'admin_structure' }); if (l.error) throw l.error; labo = l.data;
  });

  it('refuse un rôle incompatible avec le type de structure', async () => {
    expect((await owner.rpc('create_medical_invitation', { _structure_id: cabinet, _email: `x-${run}@exemple.sn`, _role: 'biologiste' })).error?.message).toMatch(/incompatible/);
    expect((await owner.rpc('create_medical_invitation', { _structure_id: labo, _email: `x-${run}@exemple.sn`, _role: 'medecin' })).error?.message).toMatch(/incompatible/);
  });
  it('renvoie l’invitation déjà en attente au lieu d’un doublon ; un second rôle crée une seconde invitation', async () => {
    const a = await owner.rpc('create_medical_invitation', { _structure_id: cabinet, _email: ` Dr.${run}@Exemple.SN `, _role: 'medecin' });
    const b = await owner.rpc('create_medical_invitation', { _structure_id: cabinet, _email: `dr.${run}@exemple.sn`, _role: 'medecin' });
    const c = await owner.rpc('create_medical_invitation', { _structure_id: cabinet, _email: `dr.${run}@exemple.sn`, _role: 'admin_structure' });
    expect(a.error).toBeNull(); expect(b.data).toBe(a.data); expect(c.data).not.toBe(a.data);
  });
  it('refuse une adresse invalide et un non-administrateur', async () => {
    expect((await owner.rpc('create_medical_invitation', { _structure_id: cabinet, _email: 'pas une adresse', _role: 'secretaire' })).error?.message).toMatch(/invalide/);
    expect((await etranger.rpc('create_medical_invitation', { _structure_id: cabinet, _email: `y-${run}@exemple.sn`, _role: 'secretaire' })).error?.message).toMatch(/Accès refusé/);
  });
});
