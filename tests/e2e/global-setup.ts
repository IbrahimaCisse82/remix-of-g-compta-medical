/**
 * Préparation des tests écran : comptes dédiés (jamais les comptes de démonstration),
 * une structure par type (cabinet, laboratoire, mixte), un compte par rôle × type,
 * et un fichier de session navigateur par compte (tests/e2e/.auth/, ignoré par git).
 * Idempotent : les comptes et structures existants sont réutilisés.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPA = process.env.SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)!;
export const actif = Boolean(SUPA && SERVICE && ANON);

export const ROLES = [
  'admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur',
  'secretaire', 'caissier', 'comptable', 'lecteur', 'tiers_payant',
] as const;
export type Role = typeof ROLES[number];
export const TYPES = ['cabinet', 'laboratoire', 'mixte'] as const;
export type TypeStructure = typeof TYPES[number];

export const AUTH_DIR = path.join(__dirname, '.auth');
export const stateFile = (role: string, type: string) => path.join(AUTH_DIR, `${role}--${type}.json`);

const email = (nom: string) => `e2e-${nom}@gsante.test`;

async function compte(admin: SupabaseClient, nom: string): Promise<SupabaseClient> {
  const password = randomBytes(24).toString('base64url');
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const ex = list?.users.find(u => u.email === email(nom));
  if (ex) await admin.auth.admin.updateUserById(ex.id, { password });
  else {
    const { error } = await admin.auth.admin.createUser({ email: email(nom), password, email_confirm: true });
    if (error) throw error;
  }
  const c = createClient(SUPA, ANON, { auth: { persistSession: false } });
  // Le service d'authentification limite le débit des connexions : temporisation + nouvelles tentatives.
  let error: { message: string } | null = null;
  for (let essai = 0; essai < 6; essai++) {
    await new Promise(r => setTimeout(r, 1500));
    const r = await c.auth.signInWithPassword({ email: email(nom), password });
    error = r.error;
    if (!error) return c;
    if (!/rate limit/i.test(error.message)) throw error;
  }
  throw error;
}

async function sauverSession(c: SupabaseClient, fichier: string) {
  const { data } = await c.auth.getSession();
  if (!data.session) throw new Error('session absente');
  const ref = new URL(SUPA).hostname.split('.')[0];
  writeFileSync(fichier, JSON.stringify({
    cookies: [],
    origins: [{ origin: 'http://localhost:8080', localStorage: [{ name: `sb-${ref}-auth-token`, value: JSON.stringify(data.session) }] }],
  }, null, 2));
}

export default async function globalSetup() {
  if (!actif) {
    console.warn('[e2e] Variables SUPABASE_* absentes : tests écran ignorés.');
    return;
  }
  mkdirSync(AUTH_DIR, { recursive: true });
  const admin = createClient(SUPA, SERVICE, { auth: { persistSession: false } });

  // Une structure par type, créée via la fonction d'onboarding réelle.
  const owner = await compte(admin, 'owner');
  const structures = {} as Record<TypeStructure, string>;
  for (const type of TYPES) {
    const nom = `E2E ${type}`;
    const ex = await admin.from('structures').select('id').eq('nom', nom).maybeSingle();
    if (ex.data) { structures[type] = ex.data.id; continue; }
    const st = await owner.rpc('sante_creer_structure', { _type: type, _nom: nom, _role_metier: type === 'laboratoire' ? 'biologiste' : 'medecin' });
    if (st.error) throw st.error;
    structures[type] = st.data as string;
  }
  // Structure dédiée au test de changement de type.
  const bascule = await admin.from('structures').select('id').eq('nom', 'E2E bascule').maybeSingle();
  let basculeId = bascule.data?.id as string | undefined;
  if (!basculeId) {
    const st = await owner.rpc('sante_creer_structure', { _type: 'cabinet', _nom: 'E2E bascule', _role_metier: 'medecin' });
    if (st.error) throw st.error;
    basculeId = st.data as string;
  }

  // Un compte par rôle × type, membre de la seule structure de ce type.
  for (const role of ROLES) {
    for (const type of TYPES) {
      const c = await compte(admin, `${role}-${type}`);
      const user_id = (await c.auth.getUser()).data.user!.id;
      const m = await admin.from('structure_memberships').upsert(
        { structure_id: structures[type], user_id, statut: 'actif' }, { onConflict: 'structure_id,user_id' },
      ).select('id').single();
      if (m.error) throw m.error;
      await admin.from('medical_user_roles').delete().eq('membership_id', m.data.id);
      const r = await admin.from('medical_user_roles').insert({ membership_id: m.data.id, role });
      if (r.error) throw r.error;
      await sauverSession(c, stateFile(role, type));
    }
  }

  // Comptes dédiés aux tests d'actualisation (changement de rôle / de type).
  const changeRole = await compte(admin, 'change-role');
  const crId = (await changeRole.auth.getUser()).data.user!.id;
  const crm = await admin.from('structure_memberships').upsert(
    { structure_id: structures.cabinet, user_id: crId, statut: 'actif' }, { onConflict: 'structure_id,user_id' },
  ).select('id').single();
  await admin.from('medical_user_roles').delete().eq('membership_id', crm.data!.id);
  await admin.from('medical_user_roles').insert({ membership_id: crm.data!.id, role: 'secretaire' });
  await sauverSession(changeRole, stateFile('change', 'role'));

  const changeType = await compte(admin, 'change-type');
  const ctId = (await changeType.auth.getUser()).data.user!.id;
  const ctm = await admin.from('structure_memberships').upsert(
    { structure_id: basculeId!, user_id: ctId, statut: 'actif' }, { onConflict: 'structure_id,user_id' },
  ).select('id').single();
  await admin.from('medical_user_roles').delete().eq('membership_id', ctm.data!.id);
  await admin.from('medical_user_roles').insert({ membership_id: ctm.data!.id, role: 'admin_structure' });
  await admin.from('structures').update({ type: 'cabinet' }).eq('id', basculeId!);
  await sauverSession(changeType, stateFile('change', 'type'));

  console.log('[e2e] Comptes et structures prêts.');
}
