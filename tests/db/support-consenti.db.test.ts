import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { totp } from './totp';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe.skipIf(!url || !key || !service)('Accès de support consenti et minuté (0117)', () => {
  const admin = createClient(url, service);
  let adminStructure: SupabaseClient, operateur: SupabaseClient, intrus: SupabaseClient;
  let structure = '', idOperateur = '', patient = '', acces = '';
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-sup-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  beforeAll(async () => {
    const a = await compte('admin'); adminStructure = a.c;
    const s = await adminStructure.rpc('sante_creer_structure', { _nom: 'TEST Support consenti', _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error; structure = s.data as string;
    const p = await admin.from('sante_patients').insert({ structure_id: structure, numero_dossier: `SUP-${randomBytes(4).toString('hex')}`, nom: 'TESTSUPPORT', prenoms: 'Patient', sexe: 'F', date_naissance: '1990-01-01' }).select('id').single();
    if (p.error) throw p.error; patient = p.data.id;
    const o = await compte('operateur'); operateur = o.c; idOperateur = o.id;
    const ins = await admin.from('plateforme_operateurs').insert({ user_id: o.id, role: 'operateur' });
    if (ins.error) throw ins.error;
    const e = await operateur.auth.mfa.enroll({ factorType: 'totp' });
    if (e.error || !e.data) throw e.error;
    const v = await operateur.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
    if (v.error) throw v.error;
    intrus = (await compte('intrus')).c;
  }, 180000);

  it("l'opérateur demande ; une seule demande ouverte à la fois", async () => {
    const d = await operateur.rpc('plateforme_support_demander', { _structure_id: structure, _motif: 'Vérifier le paramétrage des tarifs', _duree_heures: 2 });
    expect(d.error).toBeNull(); acces = d.data as string;
    expect((await operateur.rpc('plateforme_support_demander', { _structure_id: structure, _motif: 'Deuxième demande', _duree_heures: 2 })).error).not.toBeNull();
  });
  it('un utilisateur ordinaire ne peut ni demander ni décider', async () => {
    expect((await intrus.rpc('plateforme_support_demander', { _structure_id: structure, _motif: 'Je veux entrer', _duree_heures: 72 })).error).not.toBeNull();
    expect((await intrus.rpc('support_decider', { _id: acces, _accepter: true })).error).not.toBeNull();
    expect((await intrus.rpc('support_demandes_structure', { _structure_id: structure })).error).not.toBeNull();
  });
  it("l'administrateur voit la demande et l'accorde : rôle lecteur, durée fixée", async () => {
    const l = await adminStructure.rpc('support_demandes_structure', { _structure_id: structure });
    expect((l.data ?? []).map((x: { id: string }) => x.id)).toContain(acces);
    const d = await adminStructure.rpc('support_decider', { _id: acces, _accepter: true });
    expect(d.error).toBeNull();
    const a = await admin.from('plateforme_acces_support').select('statut,expire_le,membership_id').eq('id', acces).single();
    expect(a.data?.statut).toBe('accorde');
    const heures = (new Date(a.data!.expire_le).getTime() - Date.now()) / 3600000;
    expect(heures).toBeGreaterThan(1.9); expect(heures).toBeLessThanOrEqual(2);
    const r = await admin.from('medical_user_roles').select('role').eq('membership_id', a.data!.membership_id);
    expect(r.data?.map(x => x.role)).toEqual(['lecteur']);
  });
  it("pendant l'accès, l'opérateur ne voit aucun dossier patient", async () => {
    const p = await operateur.from('sante_patients').select('id').eq('id', patient);
    expect(p.data ?? []).toHaveLength(0);
  });
  it("à l'échéance, l'accès prend fin et le rattachement temporaire disparaît", async () => {
    await admin.from('plateforme_acces_support').update({ expire_le: new Date(Date.now() - 60000).toISOString() }).eq('id', acces);
    const a0 = await admin.from('plateforme_acces_support').select('membership_id').eq('id', acces).single();
    const n = await admin.rpc('plateforme_support_expirer');
    expect(n.error).toBeNull();
    const a = await admin.from('plateforme_acces_support').select('statut').eq('id', acces).single();
    expect(a.data?.statut).toBe('expire');
    const m = await admin.from('structure_memberships').select('id').eq('id', a0.data!.membership_id);
    expect(m.data).toHaveLength(0);
    const autres = await admin.from('structure_memberships').select('id').eq('structure_id', structure).eq('user_id', idOperateur);
    expect(autres.data).toHaveLength(0);
  });
  it("refus et révocation sont tracés au journal", async () => {
    const d = await operateur.rpc('plateforme_support_demander', { _structure_id: structure, _motif: 'Nouvelle vérification', _duree_heures: 1 });
    expect(d.error).toBeNull();
    expect((await adminStructure.rpc('support_decider', { _id: d.data, _accepter: false })).error).toBeNull();
    const d2 = await operateur.rpc('plateforme_support_demander', { _structure_id: structure, _motif: 'Troisième vérification', _duree_heures: 1 });
    expect((await adminStructure.rpc('support_decider', { _id: d2.data, _accepter: true })).error).toBeNull();
    expect((await adminStructure.rpc('support_revoquer', { _id: d2.data })).error).toBeNull();
    const j = await operateur.rpc('plateforme_journal', { _limite: 50 });
    const actions = (j.data ?? []).filter((x: { cible_id: string }) => x.cible_id === structure).map((x: { action: string }) => x.action);
    expect(actions).toEqual(expect.arrayContaining(['support_demande', 'support_accorde', 'support_refuse', 'support_revoque']));
  });
});
