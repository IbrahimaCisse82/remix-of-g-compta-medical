import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Le référentiel officiel complet est chargé sur la base de test (catégorie N80 présente).
describe.skipIf(!url || !key || !service)('Codes CIM-10 propres à une structure (0127)', () => {
  const admin = createClient(url, service);
  let medecinA: SupabaseClient, medecinB: SupabaseClient, secretaireA: SupabaseClient;
  let structureA = '', structureB = '', consultA = '', consultB = '', patientA = '';
  const suffixe = randomBytes(2).toString('hex').toUpperCase().replace(/[^0-9A-Z]/g, 'Z').slice(0, 2);
  const codeLocal = `N80.Z${suffixe[0]}`;
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-cimloc-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  async function cabinet(label: string) {
    const m = await compte(label);
    const s = await m.c.rpc('sante_creer_structure', { _nom: `TEST Codes ${label}`, _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error;
    const p = await m.c.rpc('sante_creer_patient', { _structure_id: s.data, _nom: 'TESTCIMLOC', _prenoms: label, _sexe: 'F' });
    if (p.error) throw p.error;
    const pr = await m.c.from('sante_praticiens').insert({ structure_id: s.data, nom: `Dr ${label}`, user_id: m.id }).select('id').single();
    if (pr.error) throw pr.error;
    const c = await m.c.rpc('sante_demarrer_consultation', { _patient_id: p.data, _praticien_id: pr.data.id, _rdv_id: null });
    if (c.error) throw c.error;
    return { client: m.c, structure: s.data as string, patient: p.data as string, consultation: c.data as string };
  }
  beforeAll(async () => {
    const a = await cabinet('A'); medecinA = a.client; structureA = a.structure; consultA = a.consultation; patientA = a.patient;
    const b = await cabinet('B'); medecinB = b.client; structureB = b.structure; consultB = b.consultation;
    const sec = await compte('secretaire'); secretaireA = sec.c;
    const ms = await admin.from('structure_memberships').insert({ structure_id: structureA, user_id: sec.id, statut: 'actif' }).select('id').single();
    if (ms.error) throw ms.error;
    await admin.from('medical_user_roles').insert({ membership_id: ms.data.id, role: 'secretaire' });
  }, 180000);

  it('seul l’administrateur ajoute ; le code doit préciser une catégorie officielle sans doublonner l’officiel', async () => {
    expect((await secretaireA.rpc('sante_cim10_code_ajouter', { _structure_id: structureA, _code: codeLocal, _libelle: 'Endométriose de recette locale' })).error).not.toBeNull();
    expect((await medecinA.rpc('sante_cim10_code_ajouter', { _structure_id: structureA, _code: 'N80.1', _libelle: 'Doublon officiel' })).error?.message).toMatch(/existe déjà/);
    expect((await medecinA.rpc('sante_cim10_code_ajouter', { _structure_id: structureA, _code: 'U99.ZZ', _libelle: 'Catégorie absente' })).error?.message).toMatch(/n'existe pas/);
    expect((await medecinA.rpc('sante_cim10_code_ajouter', { _structure_id: structureA, _code: 'N80', _libelle: 'Sans précision' })).error).not.toBeNull();
    const r = await medecinA.rpc('sante_cim10_code_ajouter', { _structure_id: structureA, _code: codeLocal.toLowerCase().replace('.', ''), _libelle: 'Endométriose de recette locale' });
    expect(r.error).toBeNull();
    const l = await medecinA.from('sante_cim10_structure_codes').select('code').eq('structure_id', structureA);
    expect(l.data?.map(x => x.code)).toEqual([codeLocal]);
  });
  it('le code n’est visible et utilisable que dans sa structure', async () => {
    const a = await medecinA.rpc('sante_cim10_specialite', { _consultation_id: consultA, _q: 'endometriose recette locale' });
    expect((a.data ?? []).map((x: { code: string }) => x.code)).toEqual([codeLocal]);
    const b = await medecinB.rpc('sante_cim10_specialite', { _consultation_id: consultB, _q: 'endometriose recette locale' });
    expect(b.data ?? []).toEqual([]);
    expect((await medecinB.from('sante_cim10_structure_codes').select('id').eq('structure_id', structureA)).data ?? []).toHaveLength(0);
    expect((await medecinA.rpc('sante_diagnostic_coder', { _consultation_id: consultA, _code: codeLocal })).error).toBeNull();
    expect((await medecinB.rpc('sante_diagnostic_coder', { _consultation_id: consultB, _code: codeLocal })).error?.message).toMatch(/inconnu/);
    expect((await medecinA.rpc('sante_chronique_declarer', { _patient_id: patientA, _code: codeLocal })).error).toBeNull();
  });
  it('un code désactivé n’est plus proposé ; le diagnostic déjà codé garde son libellé', async () => {
    const l = await medecinA.from('sante_cim10_structure_codes').select('id').eq('structure_id', structureA).single();
    expect((await medecinA.rpc('sante_cim10_code_activer', { _id: l.data!.id, _actif: false })).error).toBeNull();
    const a = await medecinA.rpc('sante_cim10_specialite', { _consultation_id: consultA, _q: 'endometriose recette locale' });
    expect(a.data ?? []).toEqual([]);
    const d = await medecinA.from('sante_consultation_diagnostics').select('code, libelle').eq('consultation_id', consultA);
    expect(d.data).toEqual([{ code: codeLocal, libelle: 'Endométriose de recette locale' }]);
  });
});
