import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const enabled = Boolean(url && service && key);
let admin: SupabaseClient;
let caller: SupabaseClient;
let userId = '';
const run = randomBytes(8).toString('hex');

describe.skipIf(!enabled)('Création atomique Santé — API réelle', () => {
  beforeAll(async () => {
    if (!url || !service || !key) throw new Error('Configuration des tests absente');
    admin = createClient(url, service, { auth: { persistSession: false } });
    caller = createClient(url, key, { auth: { persistSession: false } });
    const email = `p0-onboarding-${run}@gsante.test`;
    const password = randomBytes(24).toString('base64url');
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error || new Error('Compte test absent');
    userId = created.data.user.id;
    const login = await caller.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
  });

  const cases = [
    ['cabinet', 'medecin', 'sante_clinique', ['sante_patients', 'sante_clinique', 'sante_tiers_payant']],
    ['laboratoire', 'biologiste', 'sante_laboratoire', ['sante_patients', 'sante_laboratoire', 'sante_tiers_payant', 'sante_portail_resultats']],
    ['mixte', 'secretaire', 'sante_mixte', ['sante_patients', 'sante_clinique', 'sante_laboratoire', 'sante_tiers_payant', 'sante_portail_resultats']],
  ] as const;

  for (const [type, role, secteur, modules] of cases) {
    it(`${type} : modules du type actifs et seulement administrateur + rôle choisi`, async () => {
      const result = await caller.rpc('sante_creer_structure', { _type: type, _nom: `TEST onboarding ${type} ${run}`, _role_metier: role });
      expect(result.error).toBeNull();
      expect(typeof result.data).toBe('string');
      const structure = await caller.from('structures').select('entreprise_id,created_by').eq('id', result.data).single();
      expect(structure.error).toBeNull();
      expect(structure.data?.created_by).toBe(userId);
      const membership = await caller.from('structure_memberships').select('id,statut').eq('structure_id', result.data).eq('user_id', userId).single();
      expect(membership.data?.statut).toBe('actif');
      const roles = await caller.from('medical_user_roles').select('role').eq('membership_id', membership.data?.id);
      expect(roles.error).toBeNull();
      expect(roles.data?.map(r => r.role).sort()).toEqual(['admin_structure', role].sort());
      const company = await caller.from('entreprises').select('secteur_activite,user_id').eq('id', structure.data?.entreprise_id).single();
      expect(company.data).toMatchObject({ secteur_activite: secteur, user_id: userId });
      const active = await caller.from('entreprise_modules').select('module,actif,date_activation').eq('entreprise_id', structure.data?.entreprise_id);
      expect(active.error).toBeNull();
      expect(active.data?.map(m => m.module).sort()).toEqual([...modules].sort());
      expect(active.data?.every(m => m.actif && m.date_activation)).toBe(true);
      const patient = await caller.rpc('sante_creer_patient', { _structure_id: result.data, _nom: 'TEST', _prenoms: `Onboarding${run}`, _sexe: 'F', _consentement: true });
      expect(patient.error).toBeNull();
      expect(typeof patient.data).toBe('string');
    });
  }

  it('administration uniquement ne donne pas le droit de créer un patient', async () => {
    const st = await caller.rpc('sante_creer_structure', { _type: 'cabinet', _nom: `TEST admin seul ${run}`, _role_metier: 'admin_structure' });
    expect(st.error).toBeNull();
    const pat = await caller.rpc('sante_creer_patient', { _structure_id: st.data, _nom: 'TEST', _prenoms: 'Interdit', _sexe: 'M' });
    expect(pat.error).toBeTruthy();
    const rows = await admin.from('sante_patients').select('id').eq('structure_id', st.data);
    expect(rows.data).toEqual([]);
  });

  it('rôle incompatible : aucun dossier de structure partiel', async () => {
    const nom = `TEST incompatible ${run}`;
    const r = await caller.rpc('sante_creer_structure', { _type: 'laboratoire', _nom: nom, _role_metier: 'medecin' });
    expect(r.error).toBeTruthy();
    expect((await admin.from('structures').select('id').eq('nom', nom)).data).toEqual([]);
    expect((await admin.from('entreprises').select('id').eq('nom', nom)).data).toEqual([]);
  });

  it('ne modifie pas une entreprise générale existante', async () => {
    const fixture = await admin.from('entreprises').insert({ nom: `TEST entreprise générale ${run}`, user_id: userId, secteur_activite: 'general' }).select('id,nom,secteur_activite').single();
    expect(fixture.error).toBeNull();
    const created = await caller.rpc('sante_creer_structure', { _type: 'mixte', _nom: `TEST nouvelle entreprise ${run}`, _role_metier: 'secretaire' });
    expect(created.error).toBeNull();
    const after = await admin.from('entreprises').select('id,nom,secteur_activite').eq('id', fixture.data?.id).single();
    expect(after.data).toEqual(fixture.data);
    expect((await admin.from('entreprise_modules').select('id').eq('entreprise_id', fixture.data?.id)).data).toEqual([]);
  });

  it('anonyme ne peut pas créer une structure', async () => {
    if (!url || !key) throw new Error('Configuration absente');
    const anon = createClient(url, key, { auth: { persistSession: false } });
    const r = await anon.rpc('sante_creer_structure', { _type: 'cabinet', _nom: `TEST anon ${run}` });
    expect(r.error).toBeTruthy();
    expect((await admin.from('structures').select('id').eq('nom', `TEST anon ${run}`)).data).toEqual([]);
  });
});