import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomBytes } from 'node:crypto';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Code TOTP (RFC 6238, SHA-1, 30 s, 6 chiffres) à partir du secret base32 renvoyé par l'enrôlement. */
function totp(secret: string, decalage = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const cle = Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)));
  const compteur = Buffer.alloc(8); compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + decalage));
  const h = createHmac('sha1', cle).update(compteur).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

describe.skipIf(!url || !key || !service)('Back-office : opérateurs et journal (0114)', () => {
  const admin = createClient(url, service);
  let proprio: SupabaseClient, client: SupabaseClient, proprioSansMfa: SupabaseClient;
  let emailClient = '', idProprio = '';
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-bo-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id, email, password };
  }
  beforeAll(async () => {
    const p = await compte('proprio'); idProprio = p.id;
    const ins = await admin.from('plateforme_operateurs').insert({ user_id: p.id, role: 'proprietaire' });
    if (ins.error) throw ins.error;
    // Session sans double authentification (avant enrôlement).
    proprioSansMfa = p.c;
    // Enrôlement TOTP puis session aal2.
    proprio = createClient(url, key, { auth: { persistSession: false } });
    const l = await proprio.auth.signInWithPassword({ email: p.email, password: p.password });
    if (l.error) throw l.error;
    const e = await proprio.auth.mfa.enroll({ factorType: 'totp' });
    if (e.error || !e.data) throw e.error;
    const v = await proprio.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
    if (v.error) throw v.error;
    const c = await compte('client'); client = c.c; emailClient = c.email;
  }, 120000);

  it('un utilisateur ordinaire n\'est pas opérateur et ne lit ni le journal ni la liste', async () => {
    const moi = await client.rpc('plateforme_moi');
    expect(moi.data).toMatchObject({ operateur: false });
    expect((await client.rpc('plateforme_journal')).error).not.toBeNull();
    expect((await client.rpc('plateforme_operateurs_lister')).error).not.toBeNull();
  });
  it('aucun accès direct aux tables de la plateforme', async () => {
    const r1 = await client.from('plateforme_operateurs').select('*');
    const r2 = await client.from('plateforme_audit').select('*');
    expect(r1.error !== null || (r1.data ?? []).length === 0).toBe(true);
    expect(r2.error !== null || (r2.data ?? []).length === 0).toBe(true);
    const w = await client.from('plateforme_operateurs').insert({ user_id: idProprio, role: 'operateur' });
    expect(w.error).not.toBeNull();
  });
  it('un opérateur sans double authentification est refusé', async () => {
    const moi = await proprioSansMfa.rpc('plateforme_moi');
    expect(moi.data).toMatchObject({ operateur: true, mfa: false });
    expect((await proprioSansMfa.rpc('plateforme_journal')).error).not.toBeNull();
  });
  it('le propriétaire en double authentification ajoute un opérateur, tracé au journal', async () => {
    const moi = await proprio.rpc('plateforme_moi');
    expect(moi.data).toMatchObject({ operateur: true, role: 'proprietaire', mfa: true });
    const d = await proprio.rpc('plateforme_operateur_definir', { _email: emailClient, _role: 'operateur', _actif: true });
    expect(d.error).toBeNull();
    const liste = await proprio.rpc('plateforme_operateurs_lister');
    expect(liste.data?.map((o: { email: string }) => o.email)).toContain(emailClient);
    const j = await proprio.rpc('plateforme_journal', { _limite: 20 });
    expect(j.error).toBeNull();
    expect(j.data?.some((l: { action: string; cible_id: string }) => l.action === 'operateur_ajoute' && l.cible_id === d.data)).toBe(true);
  });
  it('un opérateur (non propriétaire) ne peut pas nommer d\'opérateur', async () => {
    const r = await client.rpc('plateforme_operateur_definir', { _email: emailClient, _role: 'proprietaire', _actif: true });
    expect(r.error).not.toBeNull();
  });
  it('le dernier propriétaire actif ne peut pas se retirer', async () => {
    // Base de test partagée : on neutralise les propriétaires laissés par d'autres exécutions.
    const autres = await admin.from('plateforme_operateurs').update({ actif: false }).eq('role', 'proprietaire').neq('user_id', idProprio);
    expect(autres.error).toBeNull();
    const r = await proprio.rpc('plateforme_operateur_definir', { _email: (await admin.auth.admin.getUserById(idProprio)).data.user!.email!, _role: 'operateur', _actif: true });
    expect(r.error?.message).toMatch(/propriétaire actif/);
  });
  it('le journal ne se modifie ni ne se supprime, même avec la clé de service', async () => {
    const u = await admin.from('plateforme_audit').update({ action: 'falsifie' }).gte('id', 0);
    const d = await admin.from('plateforme_audit').delete().gte('id', 0);
    expect(u.error).not.toBeNull(); expect(d.error).not.toBeNull();
  });
});
