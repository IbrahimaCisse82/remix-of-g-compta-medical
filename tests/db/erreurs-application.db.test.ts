import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { totp } from './totp';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe.skipIf(!url || !key || !service)("Erreurs de l'application (0118)", () => {
  const admin = createClient(url, service);
  let utilisateur: SupabaseClient, operateur: SupabaseClient;
  const marque = `TestErreur-${randomBytes(4).toString('hex')}`;
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-err-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  beforeAll(async () => {
    utilisateur = (await compte('user')).c;
    const o = await compte('operateur'); operateur = o.c;
    const ins = await admin.from('plateforme_operateurs').insert({ user_id: o.id, role: 'operateur' });
    if (ins.error) throw ins.error;
    const e = await operateur.auth.mfa.enroll({ factorType: 'totp' });
    if (e.error || !e.data) throw e.error;
    const v = await operateur.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
    if (v.error) throw v.error;
  }, 180000);

  it('un utilisateur signale ; les doublons du jour sont regroupés ; les données personnelles sont retirées', async () => {
    const msg = `${marque} échec pour awa@exemple.sn au +221 77 123 45 67`;
    for (let i = 0; i < 3; i++) {
      const r = await utilisateur.rpc('erreur_signaler', { _message: msg, _pile: 'Error\n    at f (app.js:12:5)', _page: 'sante_agenda' });
      expect(r.error).toBeNull();
    }
    const l = await admin.from('plateforme_erreurs').select('message,occurrences,utilisateurs').like('message', `${marque}%`);
    expect(l.data).toHaveLength(1);
    expect(l.data![0].occurrences).toBe(3);
    expect(l.data![0].utilisateurs).toHaveLength(1);
    expect(l.data![0].message).not.toMatch(/awa@|77 123/);
  });
  it("aucun accès direct ; la liste est réservée aux opérateurs", async () => {
    const d = await utilisateur.from('plateforme_erreurs').select('id');
    expect(d.error !== null || (d.data ?? []).length === 0).toBe(true);
    expect((await utilisateur.rpc('plateforme_erreurs_lister')).error).not.toBeNull();
    const o = await operateur.rpc('plateforme_erreurs_lister', { _jours: 1 });
    expect(o.error).toBeNull();
    expect((o.data ?? []).some((x: { message: string; occurrences: number }) => x.message.startsWith(marque) && x.occurrences === 3)).toBe(true);
  });
  it('le tableau de bord compte les erreurs des dernières 24 h', async () => {
    const t = await operateur.rpc('plateforme_tableau_bord');
    expect(t.data.erreurs_24h).toBeGreaterThanOrEqual(3);
  });
  it('un visiteur non connecté ne peut rien signaler', async () => {
    const anonyme = createClient(url, key, { auth: { persistSession: false } });
    expect((await anonyme.rpc('erreur_signaler', { _message: 'x' })).error).not.toBeNull();
  });
});
