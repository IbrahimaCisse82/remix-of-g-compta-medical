import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { totp } from './totp';
import { SPECIALITES } from '../../src/domain/sante/specialites';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Codes fictifs dans des chapitres distincts : I99.T* (cardiologie), J99.T* (pneumologie), R99.T* (symptômes).
const CODES = [
  { code: 'I99.TA', libelle: 'Recette spécialité cœur vasculaire' },
  { code: 'J99.TA', libelle: 'Recette spécialité poumon vasculaire' },
  { code: 'R99.TA', libelle: 'Recette spécialité symptôme vasculaire' },
];

describe.skipIf(!url || !key || !service)('Spécialités et CIM-10 (0122)', () => {
  const admin = createClient(url, service);
  let medecin: SupabaseClient, secretaire: SupabaseClient;
  let structure = '', patient = '', praticien = '', consultation = '';
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-spe-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  const codes = async (q: string, toutes = false) => {
    const r = await medecin.rpc('sante_cim10_specialite', { _consultation_id: consultation, _q: q, _toutes: toutes });
    if (r.error) throw r.error;
    return (r.data as { code: string; dans_specialite: boolean }[]).filter(x => x.code.endsWith('.TA')).map(x => `${x.code}${x.dans_specialite ? '' : ' (hors)'}`);
  };
  beforeAll(async () => {
    const o = await compte('operateur');
    await admin.from('plateforme_operateurs').insert({ user_id: o.id, role: 'operateur' });
    const e = await o.c.auth.mfa.enroll({ factorType: 'totp' });
    if (e.error || !e.data) throw e.error;
    const v = await o.c.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
    if (v.error) throw v.error;
    const imp = await o.c.rpc('plateforme_cim10_importer', { _version: 'Recette', _lignes: CODES });
    if (imp.error) throw imp.error;
    const m = await compte('medecin'); medecin = m.c;
    const s = await medecin.rpc('sante_creer_structure', { _nom: 'TEST Spécialités', _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error; structure = s.data as string;
    const p = await medecin.rpc('sante_creer_patient', { _structure_id: structure, _nom: 'TESTSPE', _prenoms: 'Patient', _sexe: 'F' });
    if (p.error) throw p.error; patient = p.data as string;
    const pr = await medecin.from('sante_praticiens').insert({ structure_id: structure, nom: 'Dr Spé', user_id: m.id }).select('id').single();
    if (pr.error) throw pr.error; praticien = pr.data.id;
    const c = await medecin.rpc('sante_demarrer_consultation', { _patient_id: patient, _praticien_id: praticien, _rdv_id: null });
    if (c.error) throw c.error; consultation = c.data as string;
    const sec = await compte('secretaire'); secretaire = sec.c;
    const ms = await admin.from('structure_memberships').insert({ structure_id: structure, user_id: sec.id, statut: 'actif' }).select('id').single();
    if (ms.error) throw ms.error;
    await admin.from('medical_user_roles').insert({ membership_id: ms.data.id, role: 'secretaire' });
  }, 180000);

  it("le référentiel de la base correspond à la liste de l'application", async () => {
    const r = await medecin.from('sante_specialites').select('id').order('ordre');
    expect(r.data?.map(x => x.id)).toEqual(SPECIALITES.map(s => s.id));
  });
  it("sans spécialité : toute la CIM-10", async () => {
    expect(await codes('recette specialite vasculaire')).toEqual(['I99.TA', 'J99.TA', 'R99.TA']);
  });
  it("l'administrateur choisit les spécialités de la structure ; la secrétaire ne peut pas", async () => {
    expect((await secretaire.rpc('sante_structure_specialites_definir', { _structure_id: structure, _specialites: ['cardiologie'] })).error).not.toBeNull();
    expect((await medecin.rpc('sante_structure_specialites_definir', { _structure_id: structure, _specialites: ['inconnue'] })).error).not.toBeNull();
    const r = await medecin.rpc('sante_structure_specialites_definir', { _structure_id: structure, _specialites: ['cardiologie', 'pneumologie'] });
    expect(r.error).toBeNull(); expect(r.data).toBe(2);
    expect(await codes('recette specialite vasculaire')).toEqual(['I99.TA', 'J99.TA', 'R99.TA']);
    const c = await medecin.rpc('sante_cim10_couverture', { _structure_id: structure });
    expect(c.data?.map((x: { specialite_id: string }) => x.specialite_id)).toEqual(['cardiologie', 'pneumologie']);
  });
  it('la spécialité du praticien prime : cardiologie → codes I et symptômes ; « toutes » élargit en signalant le hors-spécialité', async () => {
    expect((await medecin.from('sante_praticiens').update({ specialite_id: 'cardiologie' }).eq('id', praticien)).error).toBeNull();
    expect(await codes('recette specialite vasculaire')).toEqual(['I99.TA', 'R99.TA']);
    expect(await codes('recette specialite vasculaire', true)).toEqual(['I99.TA', 'R99.TA', 'J99.TA (hors)']);
  });
  it('médecine générale : tout est dans la spécialité ; la secrétaire ne peut pas chercher pour la consultation', async () => {
    await medecin.from('sante_praticiens').update({ specialite_id: 'medecine-generale' }).eq('id', praticien);
    expect(await codes('recette specialite vasculaire')).toEqual(['I99.TA', 'J99.TA', 'R99.TA']);
    expect((await secretaire.rpc('sante_cim10_specialite', { _consultation_id: consultation, _q: 'recette' })).error).not.toBeNull();
  });
});
