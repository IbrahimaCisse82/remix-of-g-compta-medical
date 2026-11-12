import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomInt } from 'node:crypto';
import { totp } from './totp';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// La publication d'une version (propriétaire) change le plan en vigueur de toute la base : elle est vérifiée à part,
// dans une transaction annulée. Ici : brouillon, modifications, écarts, refus, et mises à jour CIM-10.
describe.skipIf(!url || !key || !service)('Mise à jour des référentiels en back-office (0129)', () => {
  const admin = createClient(url, service);
  let operateur: SupabaseClient, utilisateur: SupabaseClient;
  const version = `TEST_PLAN_${randomBytes(4).toString('hex').toUpperCase()}`;
  const sousCompte = `7061${randomInt(900, 999)}`;
  const codeCim = `N80.Y${randomInt(0, 9)}`;
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-refmaj-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  beforeAll(async () => {
    const o = await compte('operateur'); operateur = o.c;
    const ins = await admin.from('plateforme_operateurs').insert({ user_id: o.id, role: 'operateur' });
    if (ins.error) throw ins.error;
    const f = await operateur.auth.mfa.enroll({ factorType: 'totp' });
    if (f.error || !f.data) throw f.error;
    const v = await operateur.auth.mfa.challengeAndVerify({ factorId: f.data.id, code: totp(f.data.totp.secret) });
    if (v.error) throw v.error;
    utilisateur = (await compte('utilisateur')).c;
  }, 120000);
  afterAll(async () => {
    await operateur?.rpc('plateforme_plan_version_supprimer', { _version: version });
    await admin.from('sante_cim10').delete().eq('code', codeCim);
  });

  it('un brouillon copie la version en vigueur ; seul un opérateur le crée', async () => {
    expect((await utilisateur.rpc('plateforme_plan_version_creer', { _version: version })).error).not.toBeNull();
    const r = await operateur.rpc('plateforme_plan_version_creer', { _version: version.toLowerCase(), _note: 'Recette' });
    expect(r.error).toBeNull();
    expect(r.data).toBe(version);
    const v = await operateur.rpc('plateforme_plan_versions');
    const b = (v.data.versions as { version: string; statut: string; ecarts: Record<string, number> }[]).find(x => x.version === version);
    expect(b?.statut).toBe('brouillon');
    expect(b?.ecarts).toEqual({ ajouts: 0, modifications: 0, retraits: 0 });
    expect(v.data.proprietaire).toBe(false);
  });
  it('on ajoute, renomme et retire des comptes du brouillon ; l’écart est calculé', async () => {
    const modifier = (a: Record<string, unknown>) => operateur.rpc('plateforme_plan_compte_modifier', { _version: version, ...a });
    expect((await modifier({ _numero: sousCompte, _intitule: 'Prestations de recette', _sens: 'C' })).error).toBeNull();
    expect((await modifier({ _numero: '701', _intitule: 'Ventes de marchandises (recette)' })).error).toBeNull();
    expect((await modifier({ _numero: '701', _retirer: true })).error?.message).toMatch(/sous-comptes/);
    expect((await modifier({ _numero: '70A1', _intitule: 'Numéro invalide' })).error).not.toBeNull();
    expect((await modifier({ _numero: '7', _intitule: 'Classe' })).error).not.toBeNull();
    const e = await operateur.rpc('plateforme_plan_ecarts', { _version: version });
    expect(e.error).toBeNull();
    const parNumero = new Map((e.data as { numero: string; nature: string; intitule_apres: string }[]).map(x => [x.numero, x]));
    expect(parNumero.get(sousCompte)?.nature).toBe('ajout');
    expect(parNumero.get('701')?.intitule_apres).toBe('Ventes de marchandises (recette)');
    expect((await modifier({ _numero: sousCompte, _retirer: true })).error).toBeNull();
    const e2 = await operateur.rpc('plateforme_plan_ecarts', { _version: version });
    expect((e2.data as { numero: string }[]).map(x => x.numero)).toEqual(['701']);
  });
  it('une version visée n’est jamais modifiée ; la publication est réservée au propriétaire', async () => {
    const v = await operateur.rpc('plateforme_plan_versions');
    const enVigueur = v.data.en_vigueur as string;
    expect((await operateur.rpc('plateforme_plan_compte_modifier', { _version: enVigueur, _numero: '701', _intitule: 'Interdit' })).error?.message).toMatch(/visée/);
    expect((await operateur.rpc('plateforme_plan_version_publier', { _version: version, _expert: 'Expert de recette' })).error?.message).toMatch(/propriétaire/);
    expect((await operateur.rpc('plateforme_plan_version_supprimer', { _version: enVigueur })).error).not.toBeNull();
    const j = await admin.from('plateforme_audit').select('action').like('cible_id', `${version}%`);
    expect(new Set(j.data?.map(x => x.action))).toEqual(new Set(['plan_version_creee', 'plan_compte_modifie']));
  });
  it('CIM-10 : un opérateur ajoute, corrige et désactive un code ; la recherche back-office voit les codes désactivés', async () => {
    expect((await utilisateur.rpc('plateforme_cim10_code_definir', { _code: codeCim, _libelle: 'Interdit' })).error).not.toBeNull();
    expect((await operateur.rpc('plateforme_cim10_code_definir', { _code: 'U98.1', _libelle: 'Sans catégorie' })).error?.message).toMatch(/catégorie/);
    const a = await operateur.rpc('plateforme_cim10_code_definir', { _code: codeCim.replace('.', ''), _libelle: 'Endométriose de recette plateforme' });
    expect(a.error).toBeNull();
    expect(a.data).toMatchObject({ code: codeCim, cree: true });
    const k = await admin.from('sante_cim10').select('chapitre, version, actif').eq('code', codeCim).single();
    expect(k.data).toMatchObject({ version: 'Ajouts plateforme', actif: true });
    expect(k.data?.chapitre).toBeTruthy();
    expect((await operateur.rpc('plateforme_cim10_code_definir', { _code: codeCim, _libelle: 'Endométriose de recette corrigée', _actif: false })).error).toBeNull();
    expect((await utilisateur.rpc('sante_cim10_chercher', { _q: 'endometriose recette corrigee' })).data ?? []).toEqual([]);
    const r = await operateur.rpc('plateforme_cim10_chercher', { _q: 'endometriose recette corrigee' });
    expect(r.data).toEqual([expect.objectContaining({ code: codeCim, actif: false })]);
    const j = await admin.from('plateforme_audit').select('details').eq('action', 'cim10_code_defini').eq('cible_id', codeCim).order('id');
    expect(j.data?.[1]?.details.avant.libelle).toBe('Endométriose de recette plateforme');
  });
  it('CIM-10 : désactivation des codes absents d’une version — aperçu pour l’opérateur, application par le propriétaire', async () => {
    const versions = await admin.from('sante_cim10').select('version').like('version', 'CIM-10 FR%').limit(1);
    const v = versions.data?.[0]?.version as string;
    const apercu = await operateur.rpc('plateforme_cim10_desactiver_absents', { _version: v });
    expect(apercu.error).toBeNull();
    expect(apercu.data.applique).toBe(false);
    expect(apercu.data.codes_version).toBeGreaterThan(1000);
    expect((await operateur.rpc('plateforme_cim10_desactiver_absents', { _version: v, _appliquer: true })).error?.message).toMatch(/propriétaire/);
    expect((await operateur.rpc('plateforme_cim10_desactiver_absents', { _version: 'Version vide' })).error?.message).toMatch(/incomplet/);
  });
});
