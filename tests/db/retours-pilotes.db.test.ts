import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { totp } from './totp';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe.skipIf(!url || !key || !service)('Retours des pilotes (0115)', () => {
  const admin = createClient(url, service);
  let medecin: SupabaseClient, autre: SupabaseClient, operateur: SupabaseClient;
  let structure = '', autreStructure = '', retour = '';
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-ret-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  beforeAll(async () => {
    const m = await compte('medecin'); medecin = m.c;
    const s = await medecin.rpc('sante_creer_structure', { _nom: 'TEST Retours cabinet', _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error; structure = s.data as string;
    const a = await compte('autre'); autre = a.c;
    const s2 = await autre.rpc('sante_creer_structure', { _nom: 'TEST Retours labo', _type: 'laboratoire', _role_metier: 'biologiste' });
    if (s2.error) throw s2.error; autreStructure = s2.data as string;
    const o = await compte('operateur'); operateur = o.c;
    const ins = await admin.from('plateforme_operateurs').insert({ user_id: o.id, role: 'operateur' });
    if (ins.error) throw ins.error;
    const e = await operateur.auth.mfa.enroll({ factorType: 'totp' });
    if (e.error || !e.data) throw e.error;
    const v = await operateur.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
    if (v.error) throw v.error;
  }, 180000);

  it('un membre envoie un retour rattaché à sa structure, avec ses rôles', async () => {
    const r = await medecin.rpc('retour_envoyer', { _type: 'bug', _message: "L'agenda ne s'affiche pas le lundi", _page: 'sante_agenda', _structure_id: structure, _contexte: { ecran: '1280x800', token: 'ne-doit-pas-rester' } });
    expect(r.error).toBeNull(); retour = r.data as string;
    const v = await admin.from('plateforme_retours').select('structure_id,entreprise_id,roles,contexte,statut').eq('id', retour).single();
    expect(v.data?.structure_id).toBe(structure);
    expect(v.data?.entreprise_id).not.toBeNull();
    expect(v.data?.roles).toContain('medecin');
    expect(v.data?.contexte).toEqual({ ecran: '1280x800' });
    expect(v.data?.statut).toBe('nouveau');
  });
  it("on ne peut pas rattacher un retour à la structure d'un autre", async () => {
    const r = await medecin.rpc('retour_envoyer', { _type: 'question', _message: 'Question test', _structure_id: autreStructure });
    expect(r.error).not.toBeNull();
  });
  it('message vide ou type inconnu refusés', async () => {
    expect((await medecin.rpc('retour_envoyer', { _type: 'bug', _message: '   ' })).error).not.toBeNull();
    expect((await medecin.rpc('retour_envoyer', { _type: 'spam', _message: 'Bonjour à tous' })).error).not.toBeNull();
  });
  it("chacun ne voit que ses retours, et la table n'est pas lisible directement", async () => {
    const mes = await medecin.rpc('retours_mes');
    expect(mes.data?.map((x: { id: string }) => x.id)).toContain(retour);
    const siens = await autre.rpc('retours_mes');
    expect(siens.data?.map((x: { id: string }) => x.id)).not.toContain(retour);
    const direct = await autre.from('plateforme_retours').select('id');
    expect(direct.error !== null || (direct.data ?? []).length === 0).toBe(true);
  });
  it('un utilisateur ordinaire ne peut ni lister ni traiter les retours', async () => {
    expect((await medecin.rpc('plateforme_retours_lister')).error).not.toBeNull();
    expect((await medecin.rpc('plateforme_retour_traiter', { _id: retour, _statut: 'resolu', _priorite: 'basse' })).error).not.toBeNull();
  });
  it("l'opérateur trie et répond ; l'auteur voit la réponse ; le traitement est journalisé", async () => {
    const l = await operateur.rpc('plateforme_retours_lister', { _statut: 'nouveau' });
    expect(l.error).toBeNull();
    const ligne = (l.data ?? []).find((x: { id: string }) => x.id === retour);
    expect(ligne).toMatchObject({ structure_nom: 'TEST Retours cabinet', type: 'bug', page: 'sante_agenda' });
    const t = await operateur.rpc('plateforme_retour_traiter', { _id: retour, _statut: 'planifie', _priorite: 'haute', _reponse: 'Corrigé dans la livraison du 23 novembre.' });
    expect(t.error).toBeNull();
    const mes = await medecin.rpc('retours_mes');
    expect((mes.data ?? []).find((x: { id: string }) => x.id === retour)).toMatchObject({ statut: 'planifie', reponse: 'Corrigé dans la livraison du 23 novembre.' });
    const j = await operateur.rpc('plateforme_journal', { _limite: 50 });
    expect((j.data ?? []).some((x: { action: string; cible_id: string }) => x.action === 'retour_traite' && x.cible_id === retour)).toBe(true);
  });
});
