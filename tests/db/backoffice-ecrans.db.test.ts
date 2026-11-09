import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { totp } from './totp';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe.skipIf(!url || !key || !service)('Back-office : tableau de bord, clients, utilisateurs (0116)', () => {
  const admin = createClient(url, service);
  let medecin: SupabaseClient, operateur: SupabaseClient;
  let emailMedecin = '', structure = '';
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-boe-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id, email };
  }
  beforeAll(async () => {
    const m = await compte('medecin'); medecin = m.c; emailMedecin = m.email;
    const s = await medecin.rpc('sante_creer_structure', { _nom: 'TEST Back-office écrans', _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error; structure = s.data as string;
    const o = await compte('operateur'); operateur = o.c;
    const ins = await admin.from('plateforme_operateurs').insert({ user_id: o.id, role: 'operateur' });
    if (ins.error) throw ins.error;
    const e = await operateur.auth.mfa.enroll({ factorType: 'totp' });
    if (e.error || !e.data) throw e.error;
    const v = await operateur.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
    if (v.error) throw v.error;
  }, 180000);

  it('refusé à un utilisateur ordinaire', async () => {
    expect((await medecin.rpc('plateforme_tableau_bord')).error).not.toBeNull();
    expect((await medecin.rpc('plateforme_clients_lister')).error).not.toBeNull();
    expect((await medecin.rpc('plateforme_utilisateur_chercher', { _email: emailMedecin })).error).not.toBeNull();
    expect((await medecin.rpc('plateforme_est_structure_test', { _structure_id: structure })).error).not.toBeNull();
  });
  it('tableau de bord : comptages seulement', async () => {
    const r = await operateur.rpc('plateforme_tableau_bord');
    expect(r.error).toBeNull();
    expect(Object.keys(r.data).sort()).toEqual(['activite_7j', 'admins_sans_double_auth', 'compta_en_erreur', 'connectes_7j', 'par_type',
      'retours_bloquants', 'retours_nouveaux', 'retours_ouverts', 'structures_reelles', 'structures_test', 'utilisateurs']);
    expect(r.data.structures_test).toBeGreaterThan(0);
  });
  it('clients : les structures de test sont masquées par défaut et visibles sur demande', async () => {
    const sans = await operateur.rpc('plateforme_clients_lister', { _recherche: 'Back-office écrans' });
    expect(sans.error).toBeNull();
    expect((sans.data ?? []).some((c: { structure_id: string }) => c.structure_id === structure)).toBe(false);
    const avec = await operateur.rpc('plateforme_clients_lister', { _recherche: 'Back-office écrans', _inclure_test: true });
    const ligne = (avec.data ?? []).find((c: { structure_id: string }) => c.structure_id === structure);
    expect(ligne).toMatchObject({ type: 'cabinet', est_test: true, membres: 1 });
    expect(Object.keys(ligne)).not.toContain('patients');
  });
  it('utilisateurs : fiche du compte et rattachements, recherche inscrite au journal', async () => {
    expect((await operateur.rpc('plateforme_utilisateur_chercher', { _email: 'p0' })).error).not.toBeNull();
    const r = await operateur.rpc('plateforme_utilisateur_chercher', { _email: emailMedecin });
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ email: emailMedecin, email_confirme: true, double_auth: false, operateur: false });
    expect(r.data[0].rattachements[0]).toMatchObject({ structure: 'TEST Back-office écrans', roles: expect.arrayContaining(['medecin']) });
    const j = await operateur.rpc('plateforme_journal', { _limite: 20 });
    expect((j.data ?? []).some((x: { action: string; details: { recherche?: string } }) => x.action === 'utilisateur_recherche' && x.details.recherche === emailMedecin)).toBe(true);
  });
});
