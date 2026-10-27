/**
 * Fonctions serveur — appels directs (sans passer par l'écran) pour chaque rôle × type
 * de structure : les opérations interdites doivent être refusées par la base.
 * Couvre ce que tests/db/acces-modules.db.test.ts ne couvrait pas encore :
 * statut tiers payant, réglages d'accès (bris de glace), plannings, import bancaire,
 * et l'actualisation immédiate des droits après ajout/retrait d'un rôle.
 *
 * Lancement : bun run test:db
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const URL = process.env.SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)!;
const actif = Boolean(URL && SERVICE && ANON);
const run = randomBytes(6).toString('hex');

const ROLES = [
  'admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur',
  'secretaire', 'caissier', 'comptable', 'lecteur', 'tiers_payant',
] as const;
type Role = typeof ROLES[number];
const TYPES = ['cabinet', 'laboratoire', 'mixte'] as const;
type TypeStructure = typeof TYPES[number];

const admin = actif ? createClient(URL, SERVICE, { auth: { persistSession: false } }) : (null as unknown as SupabaseClient);

interface Ctx {
  structures: Record<TypeStructure, string>;
  entreprises: Record<TypeStructure, string>;
  factures: Record<TypeStructure, string>;
  memberships: Record<TypeStructure, Record<Role, string>>;
  users: Record<Role, SupabaseClient>;
}

async function compte(nom: string): Promise<SupabaseClient> {
  const email = `p0-fn-${nom}-${run}@gsante.test`;
  const password = randomBytes(24).toString('base64url');
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error) throw u.error;
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const l = await c.auth.signInWithPassword({ email, password });
  if (l.error) throw l.error;
  return c;
}
const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id;

async function preparer(): Promise<Ctx> {
  const owner = await compte('owner');
  const structures = {} as Record<TypeStructure, string>;
  const entreprises = {} as Record<TypeStructure, string>;
  const factures = {} as Record<TypeStructure, string>;
  const memberships = {} as Record<TypeStructure, Record<Role, string>>;
  const users = {} as Record<Role, SupabaseClient>;

  for (const type of TYPES) {
    const st = await owner.rpc('sante_creer_structure', { _type: type, _nom: `TEST fn ${type} ${run}`, _role_metier: type === 'laboratoire' ? 'biologiste' : 'medecin' });
    if (st.error) throw st.error;
    structures[type] = st.data as string;
    entreprises[type] = (await admin.from('structures').select('entreprise_id').eq('id', structures[type]).single()).data!.entreprise_id;
  }
  for (const role of ROLES) {
    const c = await compte(role);
    const user_id = await uid(c);
    users[role] = c;
    for (const type of TYPES) {
      const m = await admin.from('structure_memberships').insert({ structure_id: structures[type], user_id, statut: 'actif' }).select('id').single();
      if (m.error) throw m.error;
      const r = await admin.from('medical_user_roles').insert({ membership_id: m.data.id, role });
      if (r.error) throw r.error;
      (memberships[type] ??= {} as Record<Role, string>)[role] = m.data.id;
    }
  }
  for (const type of TYPES) {
    const p = await users.secretaire.rpc('sante_creer_patient', {
      _structure_id: structures[type], _nom: `FN${type.toUpperCase().slice(0, 3)}`, _prenoms: `Test${run}`,
      _sexe: 'M', _consentement: true, _ignorer_doublons: true,
    });
    if (p.error) throw p.error;
    const f = await admin.from('sante_factures').insert({
      structure_id: structures[type], numero: `FF-${type}-${run}`, patient_id: p.data as string, total: 8000, part_patient: 8000,
    }).select('id').single();
    if (f.error) throw f.error;
    factures[type] = f.data.id;
  }
  return { structures, entreprises, factures, memberships, users };
}

const refusAvec = (e: { message?: string } | null, motif: RegExp) => {
  expect(e, 'la fonction doit refuser').toBeTruthy();
  expect(e!.message ?? '').toMatch(motif);
};

describe.skipIf(!actif)('Fonctions serveur — opérations interdites refusées par rôle et type', () => {
  let S: Ctx;
  beforeAll(async () => { S = await preparer(); }, 300_000);

  describe('Statut tiers payant (envoi/rejet/règlement organisme)', () => {
    const REFUSES: Role[] = ['medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire', 'lecteur'];
    for (const type of TYPES) {
      for (const role of REFUSES) {
        it(`${type} / ${role} : changer le statut tiers est refusé`, async () => {
          const r = await S.users[role].rpc('sante_statut_tiers', { _facture_id: S.factures[type], _statut: 'envoye' });
          refusAvec(r.error, /Droit insuffisant|Accès refusé/i);
        });
      }
    }
  });

  describe('Réglages d\'accès (bris de glace, accès élargi) : administrateur uniquement', () => {
    for (const type of TYPES) {
      it(`${type} / admin_structure : peut régler l'accès`, async () => {
        const r = await S.users.admin_structure.rpc('sante_config_acces', { _structure_id: S.structures[type], _tous: false, _seuil: 3, _renouv: 1 });
        expect(r.error).toBeNull();
      });
      for (const role of ROLES.filter(r => r !== 'admin_structure')) {
        it(`${type} / ${role} : réglage refusé`, async () => {
          const r = await S.users[role].rpc('sante_config_acces', { _structure_id: S.structures[type], _tous: true, _seuil: 99, _renouv: 99 });
          refusAvec(r.error, /administrateur|Accès refusé/i);
        });
      }
    }
  });

  describe('Plannings & gardes : écriture réservée à l\'administrateur', () => {
    const debut = new Date(Date.now() + 86_400_000).toISOString();
    const fin = new Date(Date.now() + 90_000_000).toISOString();
    for (const type of TYPES) {
      it(`${type} / admin_structure : ajoute une plage`, async () => {
        const r = await S.users.admin_structure.from('sante_plannings').insert({
          structure_id: S.structures[type], membership_id: S.memberships[type].admin_structure, type: 'poste', debut, fin,
        });
        expect(r.error).toBeNull();
      });
      for (const role of ROLES.filter(r => r !== 'admin_structure')) {
        it(`${type} / ${role} : ajout direct refusé`, async () => {
          const r = await S.users[role].from('sante_plannings').insert({
            structure_id: S.structures[type], membership_id: S.memberships[type][role], type: 'poste', debut, fin,
          });
          expect(r.error, 'l\'ajout doit être refusé').toBeTruthy();
        });
      }
    }
  });

  describe('Import bancaire : réservé à la comptabilité', () => {
    const REFUSES: Role[] = ['medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire', 'caissier', 'lecteur', 'tiers_payant'];
    for (const type of TYPES) {
      for (const role of REFUSES) {
        it(`${type} / ${role} : import de relevé refusé`, async () => {
          const r = await S.users[role].rpc('banque_importer', {
            _entreprise_id: S.entreprises[type], _exercice_id: randomBytes(16).toString('hex'),
            _compte: '521000', _nom_fichier: 'pirate.csv', _empreinte: `pirate-${run}`, _solde_initial: 0, _operations: [],
          });
          refusAvec(r.error, /Accès refusé|comptable|Droit/i);
        });
      }
    }
  });

  describe('Actualisation immédiate des droits après changement de rôle', () => {
    it('retrait du rôle secrétaire : la création de patient est refusée aussitôt', async () => {
      const c = await compte('bascule');
      const user_id = await uid(c);
      const m = await admin.from('structure_memberships').insert({ structure_id: S.structures.cabinet, user_id, statut: 'actif' }).select('id').single();
      const role = await admin.from('medical_user_roles').insert({ membership_id: m.data!.id, role: 'secretaire' }).select('id').single();

      const ok = await c.rpc('sante_creer_patient', { _structure_id: S.structures.cabinet, _nom: 'AVANT', _prenoms: 'Bascule', _sexe: 'F', _consentement: true, _ignorer_doublons: true });
      expect(ok.error).toBeNull();

      await admin.from('medical_user_roles').delete().eq('id', role.data!.id);
      const apres = await c.rpc('sante_creer_patient', { _structure_id: S.structures.cabinet, _nom: 'APRES', _prenoms: 'Bascule', _sexe: 'F', _consentement: true, _ignorer_doublons: true });
      refusAvec(apres.error, /Accès refusé/i);
      expect(await (async () => (await c.from('sante_patients').select('id').eq('structure_id', S.structures.cabinet)).data?.length ?? 0)()).toBe(0);
    });

    it('ajout du rôle comptable : la comptabilité devient lisible aussitôt', async () => {
      const c = await compte('promotion');
      const user_id = await uid(c);
      const m = await admin.from('structure_memberships').insert({ structure_id: S.structures.mixte, user_id, statut: 'actif' }).select('id').single();
      await admin.from('medical_user_roles').insert({ membership_id: m.data!.id, role: 'medecin' });

      const avant = await c.from('entreprises').select('id').eq('id', S.entreprises.mixte);
      expect(avant.data ?? []).toHaveLength(0);

      await admin.from('medical_user_roles').insert({ membership_id: m.data!.id, role: 'comptable' });
      const apres = await c.from('entreprises').select('id').eq('id', S.entreprises.mixte);
      expect(apres.data ?? []).toHaveLength(1);
    });
  });
});
