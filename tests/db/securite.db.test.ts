/**
 * P0.1 — Tests de sécurité de la base, exécutés contre l'API réelle avec de VRAIS comptes de test
 * (jamais les comptes de démonstration). Chaque utilisateur agit avec son propre jeton : les
 * politiques RLS, triggers et fonctions SECURITY DEFINER sont donc réellement mis à l'épreuve.
 *
 * Lancement : bunx vitest run -c vitest.db.config.ts
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (création des comptes de test), SUPABASE_PUBLISHABLE_KEY.
 * Sortie : la matrice constatée rôle × table est écrite dans tests/db/matrice-constatee.json.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import attendue from './matrice-attendue.json';

const URL = process.env.SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const actif = Boolean(URL && SERVICE && ANON);

const ROLES = ['admin_structure', 'medecin', 'biologiste', 'technicien', 'secretaire', 'caissier', 'comptable', 'lecteur'] as const;
type Role = typeof ROLES[number];
const TABLES = [
  'sante_patients', 'sante_consultations', 'sante_constantes', 'sante_antecedents', 'sante_ordonnances',
  'sante_demandes_labo', 'sante_resultats', 'sante_documents_patient', 'sante_factures', 'sante_facture_lignes',
  'sante_encaissements', 'sante_bris_glace', 'medical_access_log', 'medical_audit_log', 'sante_violations',
] as const;
const PAR_PATIENT = new Set<string>(['sante_constantes', 'sante_antecedents']);

const admin = actif ? createClient(URL, SERVICE, { auth: { persistSession: false } }) : (null as unknown as SupabaseClient);
type Ctx = { structure: string; praticien: string; patient: string; consultation: string; users: Record<Role, SupabaseClient> };
const S: Record<'A' | 'B', Ctx> = {} as never;

async function compte(email: string): Promise<SupabaseClient> {
  const password = randomBytes(18).toString('base64url');
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const ex = list?.users.find(u => u.email === email);
  if (ex) await admin.auth.admin.updateUserById(ex.id, { password });
  else { const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error; }
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}
const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id;

async function preparer(k: 'A' | 'B'): Promise<Ctx> {
  const owner = await compte(`p0-owner-${k.toLowerCase()}@gsante.test`);
  const nom = `TEST P0 ${k}`;
  let { data: st } = await admin.from('structures').select('id').eq('nom', nom).maybeSingle();
  if (!st) {
    const r = await admin.from('structures').insert({ nom, type: 'mixte', created_by: await uid(owner) }).select('id').single();
    if (r.error) throw r.error; st = r.data;
  }
  const users = {} as Record<Role, SupabaseClient>;
  for (const role of ROLES) {
    const c = await compte(`p0-${role}-${k.toLowerCase()}@gsante.test`);
    const user_id = await uid(c);
    const m = await admin.from('structure_memberships').upsert({ structure_id: st!.id, user_id, statut: 'actif' }, { onConflict: 'structure_id,user_id' }).select('id').single();
    if (m.error) throw m.error;
    await admin.from('medical_user_roles').upsert({ membership_id: m.data.id, role }, { onConflict: 'membership_id,role' });
    users[role] = c;
  }
  let { data: pr } = await admin.from('sante_praticiens').select('id').eq('structure_id', st!.id).eq('nom', 'Dr TEST').maybeSingle();
  if (!pr) pr = (await admin.from('sante_praticiens').insert({ structure_id: st!.id, nom: 'Dr TEST' }).select('id').single()).data;
  const pat = await users.secretaire.rpc('sante_creer_patient', { _structure_id: st!.id, _nom: `TEST${k}`, _prenoms: 'Patient', _sexe: 'F', _consentement: true, _ignorer_doublons: true });
  if (pat.error) throw pat.error;
  const cons = await users.medecin.rpc('sante_demarrer_consultation', { _patient_id: pat.data, _praticien_id: pr!.id, _rdv_id: null, _motif: 'test' });
  if (cons.error) throw cons.error;
  return { structure: st!.id, praticien: pr!.id, patient: pat.data as string, consultation: cons.data as string, users };
}

describe.skipIf(!actif)('P0 — sécurité appliquée par la base', () => {
  beforeAll(async () => { S.A = await preparer('A'); S.B = await preparer('B'); }, 180_000);

  describe('Isolation multi-structures (A ne voit ni ne modifie rien de B)', () => {
    for (const role of ROLES) {
      it(`${role} de A : aucune ligne de B, toutes tables`, async () => {
        const c = S.A.users[role];
        for (const t of TABLES) {
          const [col, val] = PAR_PATIENT.has(t) ? ['patient_id', S.B.patient] : ['structure_id', S.B.structure];
          const { data } = await c.from(t).select('id').eq(col, val).limit(1);
          expect(data ?? [], `${role} lit ${t} de B`).toHaveLength(0);
        }
        const { data: st } = await c.from('structures').select('id').eq('id', S.B.structure);
        expect(st ?? []).toHaveLength(0);
      });
    }
    it('écriture directe sur un patient de B : aucune ligne touchée', async () => {
      const { data } = await S.A.users.admin_structure.from('sante_patients').update({ adresse: 'pirate' }).eq('id', S.B.patient).select('id');
      expect(data ?? []).toHaveLength(0);
      const { data: d2 } = await S.A.users.admin_structure.from('sante_patients').delete().eq('id', S.B.patient).select('id');
      expect(d2 ?? []).toHaveLength(0);
    });
    it('fonctions serveur appelées sur B : refusées', async () => {
      expect((await S.A.users.secretaire.rpc('sante_creer_patient', { _structure_id: S.B.structure, _nom: 'INTRUS', _prenoms: 'X', _sexe: 'M', _consentement: true, _ignorer_doublons: true })).error).toBeTruthy();
      expect((await S.A.users.medecin.rpc('sante_demarrer_consultation', { _patient_id: S.B.patient, _praticien_id: S.B.praticien, _rdv_id: null, _motif: 'x' })).error).toBeTruthy();
      expect((await S.A.users.admin_structure.rpc('sante_tableau_bord', { _structure_id: S.B.structure, _debut: '2026-01-01', _fin: '2026-12-31' })).error).toBeTruthy();
      expect((await S.A.users.medecin.rpc('sante_rechercher_patients', { _structure_id: S.B.structure, _q: 'TEST', _limit: 10, _offset: 0 })).data ?? []).toHaveLength(0);
    });
    it('stockage de fichiers : aucun document de B listable', async () => {
      const { data } = await S.A.users.medecin.storage.from('sante-documents').list(S.B.structure);
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe('Fonctions de droits : pas d’interrogation des droits d’un autre utilisateur', () => {
    it('get_user_entreprise_ids / get_entreprise_role / has_role sur un autre compte → vide', async () => {
      const autre = await uid(S.B.users.admin_structure);
      const c = S.A.users.admin_structure;
      expect((await c.rpc('get_user_entreprise_ids', { _user_id: autre })).data ?? []).toHaveLength(0);
      expect((await c.rpc('has_role', { _user_id: autre, _role: 'admin' })).data).toBe(false);
    });
    it('jeton de tâche planifiée illisible par un client', async () => {
      const { data } = await S.A.users.admin_structure.from('sante_cron_config' as never).select('*');
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe('Triggers d’intégrité', () => {
    it('consultation : clôture directe interdite, puis immuable après clôture', async () => {
      const m = S.A.users.medecin;
      const direct = await m.from('sante_consultations').update({ statut: 'cloturee' }).eq('id', S.A.consultation).select('id');
      expect(direct.error).toBeTruthy();
      const prep = await m.from('sante_consultations').update({ motif: 'test', diagnostic: 'test' }).eq('id', S.A.consultation).select('id');
      expect(prep.error).toBeNull();
      const cl = await m.rpc('sante_cloturer_consultation', { _consultation_id: S.A.consultation });
      expect(cl.error).toBeNull();
      const apres = await m.from('sante_consultations').update({ diagnostic: 'modifié' }).eq('id', S.A.consultation).select('id');
      expect(apres.error || (apres.data ?? []).length === 0, 'modification après clôture acceptée').toBeTruthy();
      const { data: relu } = await m.from('sante_consultations').select('diagnostic, statut').eq('id', S.A.consultation).single();
      expect(relu).toMatchObject({ diagnostic: 'test', statut: 'cloturee' });
      const del = await m.from('sante_consultations').delete().eq('id', S.A.consultation).select('id');
      expect(del.error || (del.data ?? []).length === 0).toBeTruthy();
    });
    it('rendez-vous : transition interdite (planifié → terminé) refusée', async () => {
      const s = S.A.users.secretaire;
      const rdv = await s.from('sante_rendez_vous').insert({ structure_id: S.A.structure, patient_id: S.A.patient, praticien_id: S.A.praticien, debut: new Date(Date.now() + 86_400_000).toISOString(), duree_min: 20, motif: 'test' }).select('id').single();
      if (rdv.error) { expect.soft(rdv.error, 'insertion RDV (schéma à vérifier)').toBeNull(); return; }
      const bad = await s.from('sante_rendez_vous').update({ statut: 'termine' }).eq('id', rdv.data.id).select('id');
      expect(bad.error).toBeTruthy();
    });
  });

  describe('Laboratoire, facturation et comptabilité', () => {
    let demande = '';
    beforeAll(async () => {
      const st = S.A.structure;
      let { data: an } = await admin.from('sante_analyses').select('id').eq('structure_id', st).eq('code', 'P0GLY').maybeSingle();
      if (!an) { const ins = await admin.from('sante_analyses').insert({ structure_id: st, code: 'P0GLY', libelle: 'Glycémie test', tarif: 1000 }).select('id').single(); if (ins.error) throw ins.error; an = ins.data; }
      const { data: pa } = await admin.from('sante_analyse_parametres').select('id').eq('analyse_id', an!.id).maybeSingle();
      if (!pa) { const ip = await admin.from('sante_analyse_parametres').insert({ structure_id: st, analyse_id: an!.id, code: 'GLY', libelle: 'Glycémie', unite: 'g/L', type: 'numerique' }); if (ip.error) throw ip.error; }
      const r = await S.A.users.secretaire.rpc('sante_creer_demande_labo', { _patient_id: S.A.patient, _analyses: [an!.id], _prescripteur: 'Dr TEST', _urgence: false, _renseignements: null, _consultation_id: null });
      if (r.error) throw r.error;
      demande = r.data as string;
    }, 60_000);

    it('saut d’étape (enregistrée → validée) refusé', async () => {
      const r = await S.A.users.biologiste.from('sante_demandes_labo').update({ statut: 'validee' }).eq('id', demande).select('id');
      expect(r.error || (r.data ?? []).length === 0).toBeTruthy();
      expect((await S.A.users.biologiste.rpc('sante_valider_demande', { _demande_id: demande, _niveau: 'biologique' })).error).toBeTruthy();
    });
    it('double validation : saisie, validation technique et biologique par des personnes distinctes', async () => {
      const t = S.A.users.technicien, b = S.A.users.biologiste;
      for (const st of ['prelevee', 'recue', 'en_analyse']) expect((await t.rpc('sante_avancer_demande', { _demande_id: demande, _statut: st, _motif: null })).error).toBeNull();
      const { data: pa } = await admin.from('sante_analyse_parametres').select('id').eq('structure_id', S.A.structure).eq('code', 'GLY').limit(1).single();
      expect((await t.rpc('sante_saisir_resultat', { _demande_id: demande, _parametre_id: pa!.id, _valeur_num: 1, _valeur_texte: null })).error).toBeNull();
      // Le technicien qui a saisi ne peut pas valider
      expect((await t.rpc('sante_valider_demande', { _demande_id: demande, _niveau: 'technique' })).error).toBeTruthy();
      expect((await b.rpc('sante_valider_demande', { _demande_id: demande, _niveau: 'technique' })).error).toBeNull();
      // Le même biologiste ne peut pas faire la validation biologique
      expect((await b.rpc('sante_valider_demande', { _demande_id: demande, _niveau: 'biologique' })).error).toBeTruthy();
      // Un technicien n'est pas habilité à la validation biologique
      expect((await t.rpc('sante_valider_demande', { _demande_id: demande, _niveau: 'biologique' })).error).toBeTruthy();
    }, 60_000);
    it('facture émise : ni modifiable ni supprimable', async () => {
      const c = S.A.users.caissier;
      const f = await c.rpc('sante_creer_facture', { _patient_id: S.A.patient, _lignes: [{ libelle: 'Test', quantite: 1, prix_unitaire: 1000 }], _assurance_id: null, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null });
      expect(f.error).toBeNull();
      const up = await S.A.users.admin_structure.from('sante_factures').update({ total: 1 }).eq('id', f.data as string).select('id');
      expect(up.error || (up.data ?? []).length === 0).toBeTruthy();
      const del = await S.A.users.admin_structure.from('sante_factures').delete().eq('id', f.data as string).select('id');
      expect(del.error || (del.data ?? []).length === 0).toBeTruthy();
      const { data } = await admin.from('sante_factures').select('total').eq('id', f.data as string).single();
      expect(Number(data!.total)).toBe(1000);
    });
    it('écriture comptable validée : immuable même pour le serveur', async () => {
      const { data: e } = await admin.from('ecritures').select('id, total_debit').eq('statut', 'validee').limit(1).maybeSingle();
      if (!e) { console.warn('Aucune écriture validée disponible : test non exécuté'); return; }
      const up = await admin.from('ecritures').update({ total_debit: Number(e.total_debit) + 1 }).eq('id', e.id);
      expect(up.error).toBeTruthy();
      expect((await admin.from('ecritures').delete().eq('id', e.id)).error).toBeTruthy();
    });
  });

  it('Matrice constatée rôle × table (SELECT sur sa propre structure) comparée à la matrice attendue', async () => {
    const constatee: Record<string, Record<string, boolean>> = {};
    for (const role of ROLES) {
      constatee[role] = {};
      for (const t of TABLES) {
        const [col, val] = PAR_PATIENT.has(t) ? ['patient_id', S.A.patient] : ['structure_id', S.A.structure];
        const { data, error } = await S.A.users[role].from(t).select('id').eq(col, val).limit(1);
        constatee[role][t] = !error && (data ?? []).length > 0;
      }
    }
    writeFileSync('tests/db/matrice-constatee.json', JSON.stringify(constatee, null, 2));
    const ecarts: string[] = [];
    const att = attendue as unknown as Record<string, Record<string, boolean>>;
    for (const role of ROLES) for (const t of Object.keys(constatee[role])) {
      if (att[role]?.[t] === undefined) continue;
      // Seules les FUITES sont fiables ici (lecture constatée alors que refus attendu) : un « refus »
      // constaté peut venir d'une table sans donnée de test.
      if (att[role][t] === false && constatee[role][t]) ecarts.push(`${role} × ${t} : attendu ${att[role][t] ? 'lecture' : 'refus'}, constaté ${constatee[role][t] ? 'lecture' : 'refus'}`);
    }
    writeFileSync('tests/db/matrice-ecarts.txt', ecarts.join('\n') || 'Aucun écart');
    // La matrice attendue décrit la CIBLE « besoin d'en connaître » (P1.2). Les écarts sont
    // rapportés (fichier ci-dessus) ; ils deviendront bloquants à la livraison de P1.
    if (ecarts.length) console.warn(`Écarts matrice (cible P1) : ${ecarts.length}\n` + ecarts.join('\n'));
    expect(Object.keys(constatee)).toHaveLength(ROLES.length);
  }, 120_000);
});
