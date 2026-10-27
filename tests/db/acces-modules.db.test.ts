/**
 * Accès direct aux modules — pour chaque type de structure (cabinet, laboratoire, mixte)
 * et chaque rôle, on tente d'atteindre les données et fonctions des modules SANS passer
 * par le menu (appels API directs, comme le ferait un utilisateur qui contourne la sidebar).
 * La sidebar n'étant qu'un filtrage d'affichage, ces tests prouvent que la base refuse
 * l'accès aux modules non autorisés (RLS + fonctions SECURITY DEFINER).
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
  patients: Record<TypeStructure, string>;
  praticiens: Record<TypeStructure, string>;
  analyses: Record<TypeStructure, string>;
  users: Record<Role, SupabaseClient>;
}

async function compte(nom: string): Promise<SupabaseClient> {
  const email = `p0-modules-${nom}-${run}@gsante.test`;
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
  const patients = {} as Record<TypeStructure, string>;
  const praticiens = {} as Record<TypeStructure, string>;
  const analyses = {} as Record<TypeStructure, string>;

  for (const type of TYPES) {
    const st = await owner.rpc('sante_creer_structure', { _type: type, _nom: `TEST modules ${type} ${run}`, _role_metier: type === 'laboratoire' ? 'biologiste' : 'medecin' });
    if (st.error) throw st.error;
    structures[type] = st.data as string;
    entreprises[type] = (await admin.from('structures').select('entreprise_id').eq('id', structures[type]).single()).data!.entreprise_id;
    const pr = await admin.from('sante_praticiens').insert({ structure_id: structures[type], nom: 'Dr TEST' }).select('id').single();
    if (pr.error) throw pr.error;
    praticiens[type] = pr.data.id;
    const an = await admin.from('sante_analyses').insert({ structure_id: structures[type], code: 'GLY', libelle: 'Glycémie', section: 'biochimie', tarif: 3000 }).select('id').single();
    if (an.error) throw an.error;
    analyses[type] = an.data.id;
  }

  // Un compte par rôle, membre des TROIS structures avec le même rôle.
  const users = {} as Record<Role, SupabaseClient>;
  for (const role of ROLES) {
    const c = await compte(role);
    const user_id = await uid(c);
    for (const type of TYPES) {
      const m = await admin.from('structure_memberships').insert({ structure_id: structures[type], user_id, statut: 'actif' }).select('id').single();
      if (m.error) throw m.error;
      const r = await admin.from('medical_user_roles').insert({ membership_id: m.data.id, role });
      if (r.error) throw r.error;
    }
    users[role] = c;
  }

  // Données de test : un patient par structure (créé par la secrétaire, rôle autorisé).
  for (const type of TYPES) {
    const p = await users.secretaire.rpc('sante_creer_patient', {
      _structure_id: structures[type], _nom: `MOD${type.toUpperCase().slice(0, 3)}`, _prenoms: `Test${run}`,
      _sexe: 'F', _date_naissance: '1990-01-01', _consentement: true, _ignorer_doublons: true,
    });
    if (p.error) throw p.error;
    patients[type] = p.data as string;
  }
  // Une consultation là où le module clinique est actif (cabinet, mixte).
  for (const type of ['cabinet', 'mixte'] as const) {
    const c = await users.medecin.rpc('sante_demarrer_consultation', { _patient_id: patients[type], _praticien_id: praticiens[type], _rdv_id: null, _motif: 'test' });
    if (c.error) throw c.error;
  }
  // Une demande de labo là où le module laboratoire est actif (laboratoire, mixte).
  for (const type of ['laboratoire', 'mixte'] as const) {
    const d = await users.biologiste.rpc('sante_creer_demande_labo', { _patient_id: patients[type], _analyses: [analyses[type]] });
    if (d.error) throw d.error;
  }
  // Une facture par structure (pour distinguer « refusé » de « vide »).
  for (const type of TYPES) {
    const f = await admin.from('sante_factures').insert({
      structure_id: structures[type], numero: `F-${type}-${run}`, patient_id: patients[type], total: 5000, part_patient: 5000,
    });
    if (f.error) throw f.error;
  }
  return { structures, entreprises, patients, praticiens, analyses, users };
}

/** Nombre de lignes visibles par ce client sur cette table pour cette structure. */
async function lignes(c: SupabaseClient, table: string, col: string, val: string): Promise<number> {
  const { data, error } = await c.from(table).select('id').eq(col, val);
  if (error) return 0; // refus catégorique = 0 ligne visible
  return (data ?? []).length;
}
const refus = (e: { message?: string } | null) => {
  expect(e, 'la fonction doit refuser').toBeTruthy();
  expect(e!.message ?? '').toMatch(/Accès refusé|inactif|Droit insuffisant|Authentification|permission|row-level security/i);
};

describe.skipIf(!actif)('Accès direct aux modules — la base refuse ce que le menu masque', () => {
  let S: Ctx;
  beforeAll(async () => { S = await preparer(); }, 300_000);

  describe('Module Dossier patient (toutes structures)', () => {
    const AUTORISES: Role[] = ['admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire', 'caissier', 'tiers_payant'];
    const REFUSES: Role[] = ['comptable', 'lecteur'];
    for (const type of TYPES) {
      for (const role of AUTORISES) {
        it(`${type} / ${role} : voit le dossier patient`, async () => {
          expect(await lignes(S.users[role], 'sante_patients', 'structure_id', S.structures[type])).toBeGreaterThan(0);
        });
      }
      for (const role of REFUSES) {
        it(`${type} / ${role} : accès direct aux patients refusé`, async () => {
          expect(await lignes(S.users[role], 'sante_patients', 'structure_id', S.structures[type])).toBe(0);
        });
      }
    }
  });

  describe('Module Clinique & consultations (cabinet et mixte uniquement)', () => {
    const AUTORISES: Role[] = ['medecin', 'biologiste'];
    const REFUSES: Role[] = ['admin_structure', 'technicien', 'preleveur', 'secretaire', 'caissier', 'comptable', 'lecteur', 'tiers_payant'];
    for (const type of ['cabinet', 'mixte'] as const) {
      for (const role of AUTORISES) {
        it(`${type} / ${role} : voit les consultations`, async () => {
          expect(await lignes(S.users[role], 'sante_consultations', 'structure_id', S.structures[type])).toBeGreaterThan(0);
        });
      }
      for (const role of REFUSES) {
        it(`${type} / ${role} : accès direct aux consultations refusé`, async () => {
          expect(await lignes(S.users[role], 'sante_consultations', 'structure_id', S.structures[type])).toBe(0);
        });
      }
    }
    it('laboratoire : module clinique inactif, aucune consultation visible même pour le médecin', async () => {
      expect(await lignes(S.users.medecin, 'sante_consultations', 'structure_id', S.structures.laboratoire)).toBe(0);
    });
    it('laboratoire / médecin : démarrer une consultation est refusé par le serveur', async () => {
      const r = await S.users.medecin.rpc('sante_demarrer_consultation', { _patient_id: S.patients.laboratoire, _praticien_id: S.praticiens.laboratoire, _rdv_id: null, _motif: 'intrusion' });
      refus(r.error);
    });
    for (const role of REFUSES) {
      it(`cabinet / ${role} : démarrer une consultation est refusé par le serveur`, async () => {
        const r = await S.users[role].rpc('sante_demarrer_consultation', { _patient_id: S.patients.cabinet, _praticien_id: S.praticiens.cabinet, _rdv_id: null, _motif: 'intrusion' });
        refus(r.error);
      });
    }
  });

  describe('Module Laboratoire (laboratoire et mixte uniquement)', () => {
    const AUTORISES: Role[] = ['admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire'];
    const REFUSES: Role[] = ['caissier', 'comptable', 'lecteur', 'tiers_payant'];
    for (const type of ['laboratoire', 'mixte'] as const) {
      for (const role of AUTORISES) {
        it(`${type} / ${role} : voit les demandes d'analyses`, async () => {
          expect(await lignes(S.users[role], 'sante_demandes_labo', 'structure_id', S.structures[type])).toBeGreaterThan(0);
        });
      }
      for (const role of REFUSES) {
        it(`${type} / ${role} : accès direct aux demandes d'analyses refusé`, async () => {
          expect(await lignes(S.users[role], 'sante_demandes_labo', 'structure_id', S.structures[type])).toBe(0);
        });
      }
    }
    it('cabinet : module laboratoire inactif, aucune demande visible même pour le biologiste', async () => {
      expect(await lignes(S.users.biologiste, 'sante_demandes_labo', 'structure_id', S.structures.cabinet)).toBe(0);
    });
    it('cabinet / biologiste : créer une demande d\'analyse est refusé par le serveur', async () => {
      const r = await S.users.biologiste.rpc('sante_creer_demande_labo', { _patient_id: S.patients.cabinet, _analyses: [S.analyses.cabinet] });
      refus(r.error);
    });
    for (const role of [...REFUSES, 'preleveur'] as Role[]) {
      it(`mixte / ${role} : créer une demande d'analyse est refusé par le serveur`, async () => {
        const r = await S.users[role].rpc('sante_creer_demande_labo', { _patient_id: S.patients.mixte, _analyses: [S.analyses.mixte] });
        refus(r.error);
      });
    }
  });

  describe('Module Facturation & caisse (toutes structures)', () => {
    const AUTORISES: Role[] = ['admin_structure', 'secretaire', 'caissier', 'comptable', 'lecteur', 'tiers_payant'];
    const REFUSES: Role[] = ['technicien', 'preleveur'];
    for (const type of TYPES) {
      for (const role of AUTORISES) {
        it(`${type} / ${role} : voit les factures`, async () => {
          expect(await lignes(S.users[role], 'sante_factures', 'structure_id', S.structures[type])).toBeGreaterThan(0);
        });
      }
      for (const role of REFUSES) {
        it(`${type} / ${role} : accès direct aux factures refusé`, async () => {
          expect(await lignes(S.users[role], 'sante_factures', 'structure_id', S.structures[type])).toBe(0);
        });
      }
    }
  });

  describe('Module Comptabilité (entreprise liée, toutes structures)', () => {
    const AUTORISES: Role[] = ['admin_structure', 'comptable', 'caissier', 'lecteur'];
    const REFUSES: Role[] = ['medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire', 'tiers_payant'];
    for (const type of TYPES) {
      for (const role of AUTORISES) {
        it(`${type} / ${role} : voit l'entreprise comptable`, async () => {
          expect(await lignes(S.users[role], 'entreprises', 'id', S.entreprises[type])).toBe(1);
        });
      }
      for (const role of REFUSES) {
        it(`${type} / ${role} : accès direct à la comptabilité refusé`, async () => {
          expect(await lignes(S.users[role], 'entreprises', 'id', S.entreprises[type])).toBe(0);
        });
      }
    }
  });

  describe('Journaux d\'accès (administrateur de structure uniquement)', () => {
    for (const type of TYPES) {
      it(`${type} / admin_structure : voit le journal d'accès`, async () => {
        const { error } = await S.users.admin_structure.from('medical_access_log').select('id').eq('structure_id', S.structures[type]).limit(1);
        expect(error).toBeNull();
      });
      for (const role of ROLES.filter(r => r !== 'admin_structure')) {
        it(`${type} / ${role} : accès direct au journal d'accès refusé`, async () => {
          expect(await lignes(S.users[role], 'medical_access_log', 'structure_id', S.structures[type])).toBe(0);
        });
      }
    }
  });

  describe('Paramètres de la structure (administrateur uniquement)', () => {
    for (const type of TYPES) {
      for (const role of ROLES.filter(r => r !== 'admin_structure')) {
        it(`${type} / ${role} : modifier la structure est refusé`, async () => {
          const { data } = await S.users[role].from('structures').update({ nom: 'PIRATE' }).eq('id', S.structures[type]).select('id');
          expect(data ?? []).toHaveLength(0);
        });
      }
    }
  });

  describe('Création de patient (accueil) : rôles non autorisés refusés partout', () => {
    const REFUSES: Role[] = ['admin_structure', 'technicien', 'caissier', 'comptable', 'lecteur', 'tiers_payant'];
    for (const type of TYPES) {
      for (const role of REFUSES) {
        it(`${type} / ${role} : créer un patient est refusé par le serveur`, async () => {
          const r = await S.users[role].rpc('sante_creer_patient', {
            _structure_id: S.structures[type], _nom: 'INTRUS', _prenoms: 'X', _sexe: 'M', _consentement: true, _ignorer_doublons: true,
          });
          refus(r.error);
        });
      }
    }
  });
});
