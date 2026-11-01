import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const run = randomBytes(6).toString('hex');
let c: SupabaseClient; let sid = '';

describe.skipIf(!url || !key || !service)('Fiche analyse — activation et références', () => {
  beforeAll(async () => {
    const admin = createClient(url!, service!, { auth: { persistSession: false } });
    const email = `p0-catalogue-${run}@gsante.test`; const password = randomBytes(24).toString('base64url');
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (u.error) throw u.error;
    c = createClient(url!, key!, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password }); if (l.error) throw l.error;
    const s = await c.rpc('sante_creer_structure', { _nom: `TEST catalogue ${run}`, _type: 'laboratoire', _role_metier: 'biologiste' }); if (s.error) throw s.error;
    sid = s.data;
  });
  it('refuse d’activer une analyse sans paramètre, puis l’accepte après ajout d’un paramètre', async () => {
    const a = await c.from('sante_analyses').insert({ structure_id: sid, code: `T${run}`, libelle: 'Analyse recette', section: 'biochimie', tarif: 1000, actif: false }).select('id').single();
    expect(a.error).toBeNull();
    expect((await c.from('sante_analyses').update({ actif: true }).eq('id', a.data!.id)).error?.message).toMatch(/au moins un paramètre/);
    expect((await c.from('sante_analyses').update({ section: 'hematologie' }).eq('id', a.data!.id)).error).toBeNull();
    const p = await c.from('sante_analyse_parametres').insert({ structure_id: sid, analyse_id: a.data!.id, code: 'P1', libelle: 'Paramètre recette', type: 'numerique' }).select('id').single();
    expect(p.error).toBeNull();
    expect((await c.from('sante_analyses').update({ actif: true }).eq('id', a.data!.id)).error).toBeNull();
    expect((await c.from('sante_valeurs_reference').insert({ structure_id: sid, parametre_id: p.data!.id, bas: 5, haut: 3 })).error?.message).toMatch(/borne basse/);
    expect((await c.from('sante_valeurs_reference').insert({ structure_id: sid, parametre_id: p.data!.id, sexe: 'F', bas: 1, haut: 3, critique_bas: 0.5, critique_haut: 6 })).error).toBeNull();
  });
});
