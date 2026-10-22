/**
 * P0.1 — Tests de sécurité de la base, exécutés contre l'API réelle avec de VRAIS comptes de test
 * (jamais les comptes de démonstration). Chaque utilisateur agit avec son propre jeton : les
 * politiques RLS, triggers et fonctions SECURITY DEFINER sont donc réellement mis à l'épreuve.
 *
 * Lancement : bunx vitest run -c vitest.db.config.ts
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (création des comptes de test), SUPABASE_PUBLISHABLE_KEY.
 * Sortie : la matrice constatée rôle × table est écrite dans tests/db/matrice-constatee.json.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
      if (!an) { const ins = await admin.from('sante_analyses').insert({ structure_id: st, code: 'P0GLY', libelle: 'Glycémie test', section: 'biochimie', tarif: 1000 }).select('id').single(); if (ins.error) throw ins.error; an = ins.data; }
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

  describe('P1 — cloisonnement, besoin d’en connaître, bris de glace', () => {
    let medecin2: SupabaseClient, admin2: SupabaseClient;
    async function membre(email: string, role: string) {
      const c = await compte(email);
      const m = await admin.from('structure_memberships').upsert({ structure_id: S.A.structure, user_id: await uid(c), statut: 'actif' }, { onConflict: 'structure_id,user_id' }).select('id').single();
      if (m.error) throw m.error;
      await admin.from('medical_user_roles').upsert({ membership_id: m.data.id, role }, { onConflict: 'membership_id,role' });
      return c;
    }
    beforeAll(async () => {
      medecin2 = await membre('p1-medecin2-a@gsante.test', 'medecin');
      admin2 = await membre('p1-admin2-a@gsante.test', 'admin_structure');
      await admin.from('sante_bris_glace').delete().eq('patient_id', S.A.patient);
      await admin.from('structures').update({ acces_tous_dossiers: false }).eq('id', S.A.structure);
    }, 60_000);

    const CLINIQUES = ['sante_consultations', 'sante_ordonnances', 'sante_constantes', 'sante_antecedents', 'sante_documents_patient', 'sante_resultats'] as const;
    for (const role of ['admin_structure', 'secretaire', 'caissier', 'comptable', 'lecteur'] as const) {
      it(`${role} : aucune donnée clinique lisible`, async () => {
        for (const t of CLINIQUES) {
          const col = t === 'sante_resultats' ? 'structure_id' : 'patient_id';
          const val = t === 'sante_resultats' ? S.A.structure : S.A.patient;
          const { data } = await S.A.users[role].from(t).select('id').eq(col, val).limit(1);
          expect(data ?? [], `${role} lit ${t}`).toHaveLength(0);
        }
      });
    }
    it('comptable et lecteur : ni identité patient ni libellés d’actes, mais ventes agrégées', async () => {
      for (const role of ['comptable', 'lecteur'] as const) {
        expect((await S.A.users[role].from('sante_patients').select('id').eq('structure_id', S.A.structure)).data ?? []).toHaveLength(0);
        expect((await S.A.users[role].from('sante_facture_lignes').select('libelle').eq('structure_id', S.A.structure)).data ?? []).toHaveLength(0);
      }
      const agg = await S.A.users.comptable.rpc('sante_ventes_par_categorie', { _structure_id: S.A.structure, _debut: '2020-01-01', _fin: '2100-01-01' });
      expect(agg.error).toBeNull();
      expect(JSON.stringify(agg.data)).not.toMatch(/TEST|Patient/);
    });
    it('écritures santé : aucune identité patient transmise à la comptabilité', async () => {
      const { data: lignes } = await admin.from('ecriture_lignes').select('libelle, intitule, ecritures!inner(origine)').eq('ecritures.origine', 'sante').limit(500);
      for (const l of lignes ?? []) expect(`${l.libelle} ${l.intitule}`).not.toMatch(/TESTA|TESTB/);
    });
    it('médecin sans relation de soin : pas de contenu clinique, sauf option structure', async () => {
      expect((await medecin2.from('sante_consultations').select('id').eq('patient_id', S.A.patient)).data ?? []).toHaveLength(0);
      expect((await S.A.users.medecin.from('sante_consultations').select('id').eq('patient_id', S.A.patient)).data ?? []).not.toHaveLength(0);
      await admin.from('structures').update({ acces_tous_dossiers: true }).eq('id', S.A.structure);
      expect((await medecin2.from('sante_consultations').select('id').eq('patient_id', S.A.patient)).data ?? []).not.toHaveLength(0);
      await admin.from('structures').update({ acces_tous_dossiers: false }).eq('id', S.A.structure);
    });
    it('bris de glace : motif codé + 20 caractères, accès 1 h, revue par un autre administrateur', async () => {
      expect((await medecin2.rpc('sante_bris_de_glace', { _patient_id: S.A.patient, _motif: 'trop court', _motif_code: 'urgence_vitale' })).error).toBeTruthy();
      expect((await medecin2.rpc('sante_bris_de_glace', { _patient_id: S.A.patient, _motif: 'Patient admis inconscient aux urgences', _motif_code: 'inconnu' })).error).toBeTruthy();
      expect((await medecin2.rpc('sante_bris_de_glace' as never, { _patient_id: S.A.patient, _motif: 'Patient admis inconscient aux urgences' } as never)).error).toBeTruthy();
      const ok = await medecin2.rpc('sante_bris_de_glace', { _patient_id: S.A.patient, _motif: 'Patient admis inconscient aux urgences', _motif_code: 'patient_inconscient' });
      expect(ok.error).toBeNull();
      expect((await medecin2.from('sante_consultations').select('id').eq('patient_id', S.A.patient)).data ?? []).not.toHaveLength(0);
      // Auto-revue interdite (admin qui a lui-même ouvert un accès)
      const own = await S.A.users.admin_structure.rpc('sante_bris_de_glace', { _patient_id: S.A.patient, _motif: 'Contrôle qualité dossier urgent', _motif_code: 'autre' });
      expect(own.error).toBeNull();
      expect((await S.A.users.admin_structure.rpc('sante_revoir_bris_glace', { _id: own.data as string, _commentaire: 'ok vu' })).error).toBeTruthy();
      expect((await admin2.rpc('sante_revoir_bris_glace', { _id: own.data as string, _commentaire: 'Justifié, vérifié' })).error).toBeNull();
      expect((await admin2.rpc('sante_revoir_bris_glace', { _id: ok.data as string, _commentaire: 'Justifié, vérifié' })).error).toBeNull();
      expect((await medecin2.from('sante_consultations').select('id').eq('patient_id', S.A.patient)).data ?? [], 'accès fermé après revue').toHaveLength(0);
    }, 60_000);
    it('renouvellement plafonné', async () => {
      const args = { _patient_id: S.A.patient, _motif: 'Continuité des soins, médecin traitant absent', _motif_code: 'continuite_soins' };
      let refus = false;
      for (let i = 0; i < 4; i++) if ((await medecin2.rpc('sante_bris_de_glace', args)).error) { refus = true; break; }
      expect(refus).toBe(true);
    });
    it('export droit d’accès : réservé (refusé au secrétariat), tracé', async () => {
      expect((await S.A.users.secretaire.rpc('sante_export_dossier', { _patient_id: S.A.patient })).error).toBeTruthy();
      const r = await S.A.users.medecin.rpc('sante_export_dossier', { _patient_id: S.A.patient });
      expect(r.error).toBeNull();
      const { data } = await admin.from('medical_access_log').select('id').eq('patient_id', S.A.patient).eq('ecran', 'export_droit_acces').limit(1);
      expect(data ?? []).toHaveLength(1);
    });
  });

  describe('P2 — facturation, caisse, outbox comptable, tiers-payant', () => {
    let entreprise = '';
    const st = () => S.A.structure;
    async function evt(source: string) {
      return (await admin.from('sante_compta_evenements').select('id, statut, ecriture_id, tentatives').eq('source_id', source)).data ?? [];
    }
    async function fermerCaisseOuverte() {
      const { data } = await admin.from('sante_sessions_caisse').select('id').eq('structure_id', st()).is('fermee_le', null);
      for (const x of data ?? []) await S.A.users.caissier.rpc('sante_fermer_caisse', { _session_id: x.id, _compte: 0 });
    }
    beforeAll(async () => {
      let { data: e } = await admin.from('entreprises').select('id').eq('nom', 'TEST P2 A').maybeSingle();
      if (!e) e = (await admin.from('entreprises').insert({ nom: 'TEST P2 A', secteur_activite: 'sante_mixte' }).select('id').single()).data;
      entreprise = e!.id;
      for (const module of ['sante_patients', 'sante_clinique', 'sante_laboratoire', 'sante_tiers_payant', 'sante_portail_resultats']) {
        const ex = await admin.from('entreprise_modules').select('id').eq('entreprise_id', entreprise).eq('module', module).maybeSingle();
        if (!ex.data) await admin.from('entreprise_modules').insert({ entreprise_id: entreprise, module, actif: true });
      }
      const an = new Date().getFullYear();
      const ex = await admin.from('exercices').select('id').eq('entreprise_id', entreprise).eq('annee', an).maybeSingle();
      if (!ex.data) await admin.from('exercices').insert({ entreprise_id: entreprise, annee: an, date_debut: `${an}-01-01`, date_fin: `${an}-12-31` });
      await admin.from('structures').update({ entreprise_id: entreprise, compta_panne_simulee: false, facturation_labo_moment: 'enregistrement' }).eq('id', st());
      await admin.from('sante_comptes_parametres').delete().eq('structure_id', st());
      await fermerCaisseOuverte();
    }, 60_000);
    afterAll(async () => {
      await admin.from('structures').update({ entreprise_id: null, compta_panne_simulee: false }).eq('id', st());
    });

    let factureLabo = '';
    it('demande de laboratoire facturée à l’enregistrement et comptabilisée', async () => {
      const { data: an } = await admin.from('sante_analyses').select('id').eq('structure_id', st()).eq('code', 'P0GLY').single();
      const d = await S.A.users.secretaire.rpc('sante_creer_demande_labo', { _patient_id: S.A.patient, _analyses: [an!.id], _prescripteur: 'Dr TEST', _urgence: false, _renseignements: null, _consultation_id: null });
      expect(d.error).toBeNull();
      const { data: f } = await admin.from('sante_factures').select('id, total').eq('demande_id', d.data as string).eq('type', 'facture').single();
      factureLabo = f!.id;
      expect(Number(f!.total)).toBe(1000);
      const e = await evt(f!.id);
      expect(e).toHaveLength(1);
      expect(e[0].statut).toBe('comptabilise');
      // Aucune analyse facturable deux fois
      const bis = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _lignes: [{ libelle: 'x', prix_unitaire: 1 }], _assurance_id: null, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: d.data as string });
      expect(bis.error?.message).toMatch(/Déjà facturé/);
    }, 60_000);

    it('panne simulée du module comptable puis rejeu sans doublon', async () => {
      await admin.from('structures').update({ compta_panne_simulee: true }).eq('id', st());
      expect((await S.A.users.caissier.rpc('sante_ouvrir_caisse', { _structure_id: st(), _fond: 10000 })).error).toBeNull();
      const enc = await S.A.users.caissier.rpc('sante_encaisser', { _facture_id: factureLabo, _mode: 'especes', _montant: 1000, _reference: null });
      expect(enc.error, 'le soin et la facture ne sont jamais bloqués').toBeNull();
      expect((await evt(enc.data as string))[0].statut).toBe('en_erreur');
      expect((await S.A.users.admin_structure.rpc('sante_outbox_resume', { _structure_id: st() })).data).toMatchObject({ en_erreur: expect.any(Number) });
      await admin.from('structures').update({ compta_panne_simulee: false }).eq('id', st());
      expect((await S.A.users.lecteur.rpc('sante_rejouer_outbox', { _structure_id: st() })).error).toBeTruthy();
      await S.A.users.comptable.rpc('sante_rejouer_outbox', { _structure_id: st() });
      await S.A.users.comptable.rpc('sante_rejouer_outbox', { _structure_id: st() });
      const e = await evt(enc.data as string);
      expect(e).toHaveLength(1);
      expect(e[0].statut).toBe('comptabilise');
      const { count } = await admin.from('journal').select('id', { count: 'exact', head: true }).eq('ecriture_id', e[0].ecriture_id!);
      expect(count).toBe(2);
    }, 60_000);

    it('clôture de caisse avec écart comptabilisé, session verrouillée', async () => {
      const { data: sess } = await admin.from('sante_sessions_caisse').select('id').eq('structure_id', st()).is('fermee_le', null).single();
      const r = await S.A.users.caissier.rpc('sante_fermer_caisse', { _session_id: sess!.id, _compte: 10500 }); // attendu 11 000
      expect(r.error).toBeNull();
      expect(Number(r.data)).toBe(-500);
      expect((await evt(sess!.id))[0]?.statut).toBe('comptabilise');
      const rap = await S.A.users.caissier.rpc('sante_rapport_caisse', { _session_id: sess!.id });
      expect(rap.error).toBeNull();
      expect((await admin.from('sante_sessions_caisse').update({ ecart: 0 }).eq('id', sess!.id)).error).toBeTruthy();
    }, 60_000);

    it('règlement partiel d’un organisme imputé sur trois factures', async () => {
      const org = 'IPM TEST P2';
      await admin.from('sante_patient_assurances').delete().eq('patient_id', S.A.patient);
      const { data: ass } = await admin.from('sante_patient_assurances').insert({ patient_id: S.A.patient, organisme: org, taux_couverture: 80 }).select('id').single();
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const f = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _lignes: [{ libelle: 'Acte', prix_unitaire: 10000 }], _assurance_id: ass!.id, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null });
        expect(f.error).toBeNull(); ids.push(f.data as string);
      }
      const mauvais = await S.A.users.comptable.rpc('sante_imputer_reglement', { _structure_id: st(), _organisme: org, _montant: 20000, _mode: 'virement', _reference: 'VIR-1',
        _imputations: [{ facture_id: ids[0], montant: 8000 }] });
      expect(mauvais.error?.message).toMatch(/ventilation/i);
      const ok = await S.A.users.comptable.rpc('sante_imputer_reglement', { _structure_id: st(), _organisme: org, _montant: 20000, _mode: 'virement', _reference: 'VIR-1',
        _imputations: [{ facture_id: ids[0], montant: 8000 }, { facture_id: ids[1], montant: 8000 }, { facture_id: ids[2], montant: 4000 }] });
      expect(ok.error).toBeNull();
      const { data: fs } = await admin.from('sante_factures').select('id, statut_tiers').in('id', ids);
      const statut = Object.fromEntries((fs ?? []).map(f => [f.id, f.statut_tiers]));
      expect([statut[ids[0]], statut[ids[1]]]).toEqual(['paye', 'paye']);
      expect(statut[ids[2]]).not.toBe('paye');
      expect(Number((await admin.rpc('sante_reste_organisme', { _facture_id: ids[2] })).data)).toBe(4000);
      expect((await evt(ok.data as string))[0].statut).toBe('comptabilise');
      // Rejet « non-prise en charge » refusé si la convention ne l'autorise pas
      expect((await S.A.users.admin_structure.rpc('sante_rejet_tiers', { _facture_id: ids[2], _type: 'non_prise_en_charge', _motif: 'Acte exclu', _montant: null as never })).error).toBeTruthy();
      expect((await S.A.users.admin_structure.rpc('sante_rejet_tiers', { _facture_id: ids[2], _type: 'perte', _motif: 'Créance irrécouvrable', _montant: 4000 })).error).toBeNull();
      await admin.from('sante_patient_assurances').delete().eq('patient_id', S.A.patient);
    }, 90_000);

    it('avoir sur facture encaissée → remboursement approuvé puis payé', async () => {
      const f = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _lignes: [{ libelle: 'Acte', prix_unitaire: 3000 }], _assurance_id: null, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null });
      await S.A.users.caissier.rpc('sante_ouvrir_caisse', { _structure_id: st(), _fond: 0 });
      expect((await S.A.users.caissier.rpc('sante_encaisser', { _facture_id: f.data as string, _mode: 'especes', _montant: 3000, _reference: null })).error).toBeNull();
      expect((await S.A.users.admin_structure.rpc('sante_annuler_facture', { _facture_id: f.data as string, _motif: 'Erreur de saisie' })).error).toBeNull();
      const { data: r } = await admin.from('sante_remboursements').select('id, montant, statut').eq('facture_id', f.data as string).single();
      expect(Number(r!.montant)).toBe(3000);
      expect((await S.A.users.caissier.rpc('sante_payer_remboursement', { _id: r!.id, _mode: 'especes' })).error, 'paiement avant approbation').toBeTruthy();
      expect((await S.A.users.admin_structure.rpc('sante_decider_remboursement', { _id: r!.id, _approuver: true, _motif: 'Erreur confirmée' })).error).toBeNull();
      expect((await S.A.users.caissier.rpc('sante_payer_remboursement', { _id: r!.id, _mode: 'especes' })).error).toBeNull();
      expect((await evt(r!.id))[0].statut).toBe('comptabilise');
      await fermerCaisseOuverte();
    }, 60_000);

    it('conventions : tarif conventionné, taux par catégorie, exclusion, accord préalable, bon consommé', async () => {
      const org = 'MUTUELLE P2';
      for (const t of ['sante_conventions', 'sante_convention_exclusions', 'sante_tarifs_convention', 'sante_bons_pec'] as const) await admin.from(t).delete().eq('structure_id', st());
      await admin.from('sante_patient_assurances').delete().eq('patient_id', S.A.patient);
      let { data: acte } = await admin.from('sante_actes').select('code').eq('structure_id', st()).eq('code', 'P2CS').maybeSingle();
      if (!acte) await admin.from('sante_actes').insert({ structure_id: st(), code: 'P2CS', libelle: 'Consultation test', tarif: 10000 });
      let { data: ech } = await admin.from('sante_actes').select('code').eq('structure_id', st()).eq('code', 'P2ECHO').maybeSingle();
      if (!ech) await admin.from('sante_actes').insert({ structure_id: st(), code: 'P2ECHO', libelle: 'Échographie test', tarif: 20000, categorie: 'acte', accord_prealable: true });
      void acte; void ech;
      const { data: ass } = await admin.from('sante_patient_assurances').insert({ patient_id: S.A.patient, organisme: org, taux_couverture: 50 }).select('id').single();
      expect((await S.A.users.admin_structure.from('sante_conventions').insert({ structure_id: st(), organisme: org, categorie: 'consultation', taux: 80 })).error).toBeNull();
      await S.A.users.admin_structure.from('sante_tarifs_convention').insert({ structure_id: st(), organisme: org, code: 'P2CS', tarif: 8000 });
      await S.A.users.admin_structure.from('sante_convention_exclusions').insert({ structure_id: st(), organisme: org, code: 'P2EXCL' });
      const f = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _assurance_id: ass!.id, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null,
        _lignes: [{ code: 'P2CS', libelle: 'Consultation', prix_unitaire: 10000 }, { code: 'P2EXCL', libelle: 'Exclu', prix_unitaire: 1000 }] });
      expect(f.error).toBeNull();
      const { data: fa } = await admin.from('sante_factures').select('total, part_organisme, part_patient').eq('id', f.data as string).single();
      expect([Number(fa!.total), Number(fa!.part_organisme), Number(fa!.part_patient)]).toEqual([9000, 6400, 2600]);
      const sans = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _assurance_id: ass!.id, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null,
        _lignes: [{ code: 'P2ECHO', libelle: 'Écho', prix_unitaire: 20000 }] });
      expect(sans.error?.message).toMatch(/Accord préalable/);
      await S.A.users.caissier.from('sante_bons_pec').insert({ structure_id: st(), patient_id: S.A.patient, organisme: org, numero: 'BON-1', date_fin: '2100-01-01', plafond: 5000, accord_prealable: true });
      const avec = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _assurance_id: ass!.id, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null,
        _lignes: [{ code: 'P2ECHO', libelle: 'Écho', prix_unitaire: 20000 }] });
      expect(avec.error).toBeNull();
      const { data: fb } = await admin.from('sante_factures').select('part_organisme').eq('id', avec.data as string).single();
      expect(Number(fb!.part_organisme), 'plafonné par le bon').toBe(5000);
      const { data: bon } = await admin.from('sante_bons_pec').select('consomme').eq('numero', 'BON-1').eq('structure_id', st()).single();
      expect(Number(bon!.consomme)).toBe(5000);
      await admin.from('sante_patient_assurances').delete().eq('patient_id', S.A.patient);
    }, 90_000);

    it('TVA collectée séparée si l’acte est taxable et la structure assujettie', async () => {
      await admin.from('structures').update({ regime_tva: 'assujetti' }).eq('id', st());
      await admin.from('sante_actes').update({ regime_tva: 'taxable', taux_tva: 18 }).eq('structure_id', st()).eq('code', 'P2CS');
      const f = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _assurance_id: null, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null,
        _lignes: [{ code: 'P2CS', libelle: 'Consultation', prix_unitaire: 11800 }] });
      expect(f.error).toBeNull();
      const e = (await evt(f.data as string))[0];
      const { data: l } = await admin.from('ecriture_lignes').select('compte, credit').eq('ecriture_id', e.ecriture_id!);
      const tva = (l ?? []).find(x => x.compte === '4431');
      expect(Number(tva?.credit)).toBe(1800);
      await admin.from('structures').update({ regime_tva: 'exonere' }).eq('id', st());
      await admin.from('sante_actes').update({ regime_tva: 'a_valider' }).eq('structure_id', st()).eq('code', 'P2CS');
    }, 60_000);

    it('lettrage automatique quand la part organisme est soldée', async () => {
      const org = 'IPM LETTRAGE';
      await admin.from('sante_patient_assurances').delete().eq('patient_id', S.A.patient);
      const { data: ass } = await admin.from('sante_patient_assurances').insert({ patient_id: S.A.patient, organisme: org, taux_couverture: 100 }).select('id').single();
      const f = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _assurance_id: ass!.id, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null, _lignes: [{ libelle: 'Acte', prix_unitaire: 7000 }] });
      const { data: num } = await admin.from('sante_factures').select('numero').eq('id', f.data as string).single();
      const r = await S.A.users.comptable.rpc('sante_imputer_reglement', { _structure_id: st(), _organisme: org, _montant: 7000, _mode: 'virement', _reference: 'VIR-L', _imputations: [{ facture_id: f.data, montant: 7000 }] });
      expect(r.error).toBeNull();
      const { data: let_ } = await admin.from('lettrage').select('montant').eq('code_lettrage', 'S' + num!.numero.replace(/-/g, '').slice(-9));
      expect((let_ ?? []).length).toBe(2);
      expect((let_ ?? []).reduce((t, x) => t + Number(x.montant), 0)).toBe(0);
      expect((await S.A.users.comptable.rpc('sante_relancer', { _structure_id: st(), _organisme: org })).error, 'rien à relancer').toBeTruthy();
      expect((await S.A.users.comptable.rpc('sante_creances_organismes', { _structure_id: st() })).error).toBeNull();
      expect((await S.A.users.comptable.rpc('sante_provisionner_creance', { _structure_id: st(), _organisme: 'IPM TEST P2', _montant: 1000, _motif: 'Retard > 1 an' })).error).toBeNull();
      await admin.from('sante_patient_assurances').delete().eq('patient_id', S.A.patient);
    }, 60_000);

    it('mode secours : bloc réservé, numéro hors bloc refusé, saisie a posteriori', async () => {
      const b = await S.A.users.admin_structure.rpc('sante_reserver_bloc', { _structure_id: st(), _poste: 'Accueil', _taille: 10 });
      expect(b.error).toBeNull();
      const { data: bloc } = await admin.from('sante_blocs_secours').select('debut, fin').eq('id', b.data as string).single();
      expect((await S.A.users.caissier.rpc('sante_saisir_facture_secours', { _bloc_id: b.data, _rang: Number(bloc!.fin) + 1, _patient_id: S.A.patient, _lignes: [{ libelle: 'x', prix_unitaire: 100 }], _assurance_id: null })).error).toBeTruthy();
      const ok = await S.A.users.caissier.rpc('sante_saisir_facture_secours', { _bloc_id: b.data, _rang: Number(bloc!.debut), _patient_id: S.A.patient, _lignes: [{ libelle: 'Consultation papier', prix_unitaire: 5000 }], _assurance_id: null });
      expect(ok.error).toBeNull();
      const { data: f } = await admin.from('sante_factures').select('facture_secours').eq('id', ok.data as string).single();
      expect(f!.facture_secours).toBe(true);
    }, 60_000);

    it('compte rendu conditionné au règlement de la part patient', async () => {
      const { data: an } = await admin.from('sante_analyses').select('id').eq('structure_id', st()).eq('code', 'P0GLY').single();
      await admin.from('structures').update({ cr_conditionne_reglement: true }).eq('id', st());
      const d = await S.A.users.secretaire.rpc('sante_creer_demande_labo', { _patient_id: S.A.patient, _analyses: [an!.id], _prescripteur: null, _urgence: false, _renseignements: null, _consultation_id: null });
      expect((await S.A.users.biologiste.rpc('sante_cr_remettable', { _demande_id: d.data })).data).toBe(false);
      const { data: f } = await admin.from('sante_factures').select('id').eq('demande_id', d.data as string).single();
      await S.A.users.caissier.rpc('sante_ouvrir_caisse', { _structure_id: st(), _fond: 0 });
      await S.A.users.caissier.rpc('sante_encaisser', { _facture_id: f!.id, _mode: 'wave', _montant: 1000, _reference: null });
      expect((await S.A.users.biologiste.rpc('sante_cr_remettable', { _demande_id: d.data })).data).toBe(true);
      await admin.from('structures').update({ cr_conditionne_reglement: false }).eq('id', st());
      await fermerCaisseOuverte();
    }, 60_000);

    it('comptes paramétrables : la correspondance est appliquée, réservée au comptable/admin', async () => {
      expect((await S.A.users.lecteur.rpc('sante_definir_compte', { _structure_id: st(), _cle: 'produits', _compte: '7061' })).error).toBeTruthy();
      expect((await S.A.users.comptable.rpc('sante_definir_compte', { _structure_id: st(), _cle: 'produits', _compte: '7061' })).error).toBeNull();
      const f = await S.A.users.caissier.rpc('sante_creer_facture', { _patient_id: S.A.patient, _lignes: [{ libelle: 'Acte', prix_unitaire: 2000 }], _assurance_id: null, _remise: 0, _motif_remise: null, _consultation_id: null, _demande_id: null });
      const e = (await evt(f.data as string))[0];
      const { data: l } = await admin.from('ecriture_lignes').select('compte').eq('ecriture_id', e.ecriture_id!);
      expect((l ?? []).map(x => x.compte)).toContain('7061');
      await admin.from('sante_comptes_parametres').delete().eq('structure_id', st());
    }, 60_000);
  });

  describe('P3 — laboratoire : pré-analytique, microbiologie, validation figée', () => {
    let bio2: SupabaseClient;
    const st = () => S.A.structure;
    const nouvelle = async () => {
      const { data: an } = await admin.from('sante_analyses').select('id').eq('structure_id', st()).eq('code', 'P0GLY').single();
      const r = await S.A.users.secretaire.rpc('sante_creer_demande_labo', { _patient_id: S.A.patient, _analyses: [an!.id], _prescripteur: 'Dr TEST', _urgence: false, _renseignements: null, _consultation_id: null });
      if (r.error) throw r.error; return r.data as string;
    };
    beforeAll(async () => {
      bio2 = await compte('p0-biologiste2-a@gsante.test');
      const user_id = await uid(bio2);
      const m = await admin.from('structure_memberships').upsert({ structure_id: st(), user_id, statut: 'actif' }, { onConflict: 'structure_id,user_id' }).select('id').single();
      await admin.from('medical_user_roles').upsert({ membership_id: m.data!.id, role: 'biologiste' }, { onConflict: 'membership_id,role' });
      const { data: pr } = await admin.from('sante_praticiens').select('id').eq('structure_id', st()).eq('user_id', user_id).maybeSingle();
      if (!pr) await admin.from('sante_praticiens').insert({ structure_id: st(), nom: 'Dr BIO TEST', user_id, numero_ordre: 'ONMS-TEST-1' });
    }, 60_000);

    it('prélèvement : identification positive (2 identifiants) obligatoire', async () => {
      const d = await nouvelle();
      expect((await S.A.users.technicien.rpc('sante_prelever', { _demande_id: d, _identifiants: ['nom'], _site: 'pli du coude', _conditions: null })).error).toBeTruthy();
      expect((await S.A.users.secretaire.rpc('sante_prelever', { _demande_id: d, _identifiants: ['nom', 'ddn'], _site: null, _conditions: null })).error).toBeTruthy();
      expect((await S.A.users.technicien.rpc('sante_prelever', { _demande_id: d, _identifiants: ['nom', 'ddn'], _site: 'pli du coude', _conditions: { a_jeun: true } })).error).toBeNull();
    }, 60_000);

    it('rejet codifié avec nouveau prélèvement lié à la demande d’origine', async () => {
      const d = await nouvelle();
      await S.A.users.technicien.rpc('sante_prelever', { _demande_id: d, _identifiants: ['nom', 'ddn'], _site: null, _conditions: null });
      expect((await S.A.users.technicien.rpc('sante_rejeter_echantillon', { _demande_id: d, _code: 'nimporte', _commentaire: null, _nouveau_prelevement: false })).error).toBeTruthy();
      const r = await S.A.users.technicien.rpc('sante_rejeter_echantillon', { _demande_id: d, _code: 'hemolyse', _commentaire: 'tube rose', _nouveau_prelevement: true });
      expect(r.error).toBeNull();
      const { data: n } = await admin.from('sante_demandes_labo').select('demande_origine_id, statut').eq('id', r.data as string).single();
      expect(n!.demande_origine_id).toBe(d);
      expect(n!.statut).toBe('enregistree');
    }, 60_000);

    it('microbiologie : germe préliminaire bloque la validation ; validation biologique → libellés figés + jeton vérifiable', async () => {
      const d = await nouvelle(); const t = S.A.users.technicien;
      await t.rpc('sante_prelever', { _demande_id: d, _identifiants: ['nom', 'ddn'], _site: null, _conditions: null });
      for (const s of ['recue', 'en_analyse']) expect((await t.rpc('sante_avancer_demande', { _demande_id: d, _statut: s, _motif: null })).error).toBeNull();
      const { data: pa } = await admin.from('sante_analyse_parametres').select('id').eq('structure_id', st()).eq('code', 'GLY').limit(1).single();
      expect((await t.rpc('sante_saisir_resultat', { _demande_id: d, _parametre_id: pa!.id, _valeur_num: 1, _valeur_texte: null })).error).toBeNull();
      const g = await t.rpc('sante_saisir_germe', { _demande_id: d, _type: 'ecbu', _germe: 'E. coli', _quantification: '10^5', _commentaire: null, _definitif: false, _antibiogramme: [{ antibiotique: 'Amoxicilline', interpretation: 'r' }] });
      expect(g.error).toBeNull();
      expect((await S.A.users.biologiste.rpc('sante_valider_demande', { _demande_id: d, _niveau: 'technique' })).error).toBeTruthy();
      expect((await t.rpc('sante_germe_definitif', { _germe_id: g.data })).error).toBeNull();
      expect((await S.A.users.biologiste.rpc('sante_valider_demande', { _demande_id: d, _niveau: 'technique' })).error).toBeNull();
      expect((await bio2.rpc('sante_valider_demande', { _demande_id: d, _niveau: 'biologique' })).error).toBeNull();
      const { data: dl } = await admin.from('sante_demandes_labo').select('cr_token, cr_hash, statut').eq('id', d).single();
      expect(dl!.statut).toBe('validee');
      const { data: r } = await admin.from('sante_resultats').select('libelle_fige').eq('demande_id', d).single();
      expect(r!.libelle_fige).toBe('Glycémie');
      const anon = createClient(URL, ANON, { auth: { persistSession: false } });
      const v = await anon.rpc('sante_verifier_cr', { _token: dl!.cr_token });
      expect((v.data as { authentique: boolean; empreinte: string }).authentique).toBe(true);
      expect((v.data as { empreinte: string }).empreinte).toBe(dl!.cr_hash);
      expect(((await anon.rpc('sante_verifier_cr', { _token: '0'.repeat(32) })).data as { authentique: boolean }).authentique).toBe(false);
    }, 90_000);

    it('sous-traitance : envoi réservé au labo, analyse de la demande, puis réception unique', async () => {
      const d = await nouvelle();
      const { data: an } = await admin.from('sante_analyses').select('id').eq('structure_id', st()).eq('code', 'P0GLY').single();
      await S.A.users.technicien.rpc('sante_prelever', { _demande_id: d, _identifiants: ['nom', 'ddn'], _site: null, _conditions: null });
      expect((await S.A.users.secretaire.rpc('sante_envoyer_sous_traitance', { _demande_id: d, _analyse_id: an!.id, _laboratoire: 'Labo X', _reference: null })).error).toBeTruthy();
      const e = await S.A.users.technicien.rpc('sante_envoyer_sous_traitance', { _demande_id: d, _analyse_id: an!.id, _laboratoire: 'Labo X', _reference: 'R1' });
      expect(e.error).toBeNull();
      expect((await S.A.users.technicien.rpc('sante_recevoir_sous_traitance', { _id: e.data, _reference: null })).error).toBeNull();
      expect((await S.A.users.technicien.rpc('sante_recevoir_sous_traitance', { _id: e.data, _reference: null })).error).toBeTruthy();
      expect((await S.B.users.technicien.from('sante_sous_traitance').select('id').eq('id', e.data as string)).data ?? []).toHaveLength(0);
    }, 60_000);

    it('non-conformité : clôture réservée au biologiste/admin avec action corrective', async () => {
      const nc = await S.A.users.technicien.rpc('sante_declarer_non_conformite', { _structure_id: st(), _demande_id: null, _type: 'analytique', _gravite: 'mineure', _description: 'Automate en panne ce matin' });
      expect(nc.error).toBeNull();
      expect((await S.A.users.technicien.rpc('sante_traiter_non_conformite', { _id: nc.data, _action: 'Maintenance faite', _cloturer: true })).error).toBeTruthy();
      expect((await S.A.users.biologiste.rpc('sante_traiter_non_conformite', { _id: nc.data, _action: '', _cloturer: true })).error).toBeTruthy();
      expect((await S.A.users.biologiste.rpc('sante_traiter_non_conformite', { _id: nc.data, _action: 'Maintenance préventive réalisée', _cloturer: true })).error).toBeNull();
      expect((await S.A.users.comptable.from('sante_non_conformites').select('id').eq('id', nc.data as string)).data ?? []).toHaveLength(0);
    }, 60_000);

    it('EEQ : |z| > 2 ouvre automatiquement une non-conformité, |z| ≤ 2 non', async () => {
      const bon = await S.A.users.technicien.rpc('sante_saisir_eeq', { _structure_id: st(), _organisme: 'OMS', _campagne: 'C1', _analyse: 'Glycémie', _date: null, _obtenue: 1.05, _cible: 1, _ecart: 0.1 });
      const mauvais = await S.A.users.technicien.rpc('sante_saisir_eeq', { _structure_id: st(), _organisme: 'OMS', _campagne: 'C1', _analyse: 'Urée', _date: null, _obtenue: 1.4, _cible: 1, _ecart: 0.1 });
      const { data } = await admin.from('sante_eeq').select('id, zscore, non_conformite_id').in('id', [bon.data as string, mauvais.data as string]);
      const b = data!.find(x => x.id === bon.data)!, m = data!.find(x => x.id === mauvais.data)!;
      expect(Number(b.zscore)).toBe(0.5); expect(b.non_conformite_id).toBeNull();
      expect(Number(m.zscore)).toBe(4); expect(m.non_conformite_id).not.toBeNull();
    }, 60_000);

    it('élimination des échantillons : seulement après la durée de conservation, interdite au caissier', async () => {
      expect((await S.A.users.caissier.rpc('sante_eliminer_echantillons', { _structure_id: st() })).error).toBeTruthy();
      await admin.from('structures').update({ conservation_echantillons_jours: 0 }).eq('id', st());
      const r = await S.A.users.biologiste.rpc('sante_eliminer_echantillons', { _structure_id: st() });
      await admin.from('structures').update({ conservation_echantillons_jours: 7 }).eq('id', st());
      expect(r.error).toBeNull();
      expect(Number(r.data)).toBeGreaterThan(0);
      const { count } = await admin.from('sante_demandes_labo').select('id', { count: 'exact', head: true }).eq('structure_id', st()).eq('statut', 'validee').is('echantillon_elimine_le', null);
      expect(count).toBe(0);
    }, 60_000);
  });

  describe('P4 — sécurité des soins : allergies et remise en main propre', () => {
    const st = () => S.A.structure;

    it('ordonnance bloquée si le médicament correspond à une allergie du patient, sauf justification écrite', async () => {
      const { data: ant } = await admin.from('sante_antecedents').insert({ patient_id: S.A.patient, type: 'allergie', libelle: 'Pénicilline' }).select('id').single();
      expect(ant).toBeTruthy();
      const lignes = (just?: string) => [{ medicament: 'Pénicilline G 1M UI', posologie: '1 injection/jour', justification_allergie: just }];
      const sans = await S.A.users.medecin.rpc('sante_emettre_ordonnance', { _consultation_id: S.A.consultation, _lignes: lignes(), _recommandations: null });
      expect(sans.error).toBeTruthy(); expect(String(sans.error!.message)).toMatch(/ALLERGIE/);
      const courte = await S.A.users.medecin.rpc('sante_emettre_ordonnance', { _consultation_id: S.A.consultation, _lignes: lignes('nécessaire'), _recommandations: null });
      expect(courte.error).toBeTruthy();
      const justifiee = await S.A.users.medecin.rpc('sante_emettre_ordonnance', { _consultation_id: S.A.consultation, _lignes: lignes('Indication vitale, surveillance rapprochée'), _recommandations: null });
      expect(justifiee.error).toBeNull();
      const { data: l } = await admin.from('sante_ordonnance_lignes').select('justification_allergie').eq('ordonnance_id', justifiee.data as string).single();
      expect(l!.justification_allergie).toMatch(/Indication vitale/);
      const autres = await S.A.users.medecin.rpc('sante_emettre_ordonnance', { _consultation_id: S.A.consultation, _lignes: [{ medicament: 'Paracétamol 500mg', posologie: '1 cp x 3/j' }], _recommandations: null });
      expect(autres.error).toBeNull();
      await admin.from('sante_antecedents').delete().eq('id', ant!.id);
    }, 60_000);

    it('remise en main propre : pièce d’identité et procuration obligatoires, demande validée exigée, rôles limités', async () => {
      const { data: dv } = await admin.from('sante_demandes_labo').select('id').eq('structure_id', st()).eq('patient_id', S.A.patient).eq('statut', 'validee').order('created_at', { ascending: false }).limit(1).single();
      expect(dv).toBeTruthy();
      const base = { structure_id: st(), demande_id: dv!.id, patient_id: S.A.patient, piece_type: 'CNI', piece_numero: '123456789' };
      const uidSec = await uid(S.A.users.secretaire);
      // Mandataire sans procuration : refusé par la contrainte
      expect((await admin.from('sante_remises_resultats').insert({ ...base, beneficiaire: 'mandataire', nom_mandataire: 'Frère TEST', procuration: false, remis_par: uidSec })).error).toBeTruthy();
      // Pièce trop courte : refusée
      expect((await admin.from('sante_remises_resultats').insert({ ...base, beneficiaire: 'patient', piece_numero: '12', procuration: false, remis_par: uidSec })).error).toBeTruthy();
      // Technicien : ne peut pas enregistrer de remise
      expect((await S.A.users.technicien.from('sante_remises_resultats').insert({ ...base, beneficiaire: 'patient', procuration: false })).error).toBeTruthy();
      // Demande non validée : refusée
      const { data: an } = await admin.from('sante_analyses').select('id').eq('structure_id', st()).eq('code', 'P0GLY').single();
      const { data: de } = await S.A.users.secretaire.rpc('sante_creer_demande_labo', { _patient_id: S.A.patient, _analyses: [an!.id], _prescripteur: 'Dr TEST', _urgence: false, _renseignements: null, _consultation_id: null });
      expect((await S.A.users.secretaire.from('sante_remises_resultats').insert({ ...base, demande_id: de as string, beneficiaire: 'patient', procuration: false })).error).toBeTruthy();
      // Cas valide par la secrétaire
      const ok = await S.A.users.secretaire.from('sante_remises_resultats').insert({ ...base, beneficiaire: 'mandataire', nom_mandataire: 'Frère TEST', procuration: true }).select('id').single();
      expect(ok.error).toBeNull();
      // Le comptable ne voit pas la remise
      expect((await S.A.users.comptable.from('sante_remises_resultats').select('id').eq('id', ok.data!.id)).data ?? []).toHaveLength(0);
    }, 60_000);

    it('date de naissance estimée : enregistrée, et impossible sans date', async () => {
      const ok = await S.A.users.secretaire.rpc('sante_creer_patient', { _structure_id: st(), _nom: 'TESTESTIMEE', _prenoms: 'Age', _sexe: 'M', _date_naissance: '1991-01-01', _date_naissance_estimee: true, _consentement: true, _ignorer_doublons: true });
      expect(ok.error).toBeNull();
      const { data: p } = await admin.from('sante_patients').select('date_naissance_estimee').eq('id', ok.data as string).single();
      expect(p!.date_naissance_estimee).toBe(true);
      const ko = await S.A.users.secretaire.rpc('sante_creer_patient', { _structure_id: st(), _nom: 'TESTESTIMEE2', _prenoms: 'Age', _sexe: 'M', _date_naissance: null, _date_naissance_estimee: true, _consentement: true, _ignorer_doublons: true });
      expect(ko.error).toBeTruthy();
    }, 60_000);

    it('dose pédiatrique : enfant sans poids bloqué, dépassement mg/kg/j bloqué, justification acceptée', async () => {
      const pat = await S.A.users.secretaire.rpc('sante_creer_patient', { _structure_id: st(), _nom: 'TESTENFANT', _prenoms: 'Pedi', _sexe: 'F', _date_naissance: new Date(Date.now() - 5 * 365.25 * 86400_000).toISOString().slice(0, 10), _consentement: true, _ignorer_doublons: true });
      expect(pat.error).toBeNull();
      await admin.from('sante_catalogue_medicaments').insert({ structure_id: st(), dci: 'Amoxicilline', nom_commercial: 'Clamoxyl', dose_max_pediatrique_mg_kg: 50 });
      const cons = await S.A.users.medecin.rpc('sante_demarrer_consultation', { _patient_id: pat.data, _praticien_id: S.A.praticien, _rdv_id: null, _motif: 'test pédiatrie' });
      expect(cons.error).toBeNull();
      const lignes = (dose: number, just?: string) => [{ medicament: 'Amoxicilline 500mg', posologie: '1 cp x 3/j', dose_mg_jour: dose, justification_pediatrie: just }];
      const sansPoids = await S.A.users.medecin.rpc('sante_emettre_ordonnance', { _consultation_id: cons.data, _lignes: lignes(300), _recommandations: null });
      expect(String(sansPoids.error!.message)).toMatch(/PEDIATRIE_POIDS/);
      await admin.from('sante_constantes').insert({ consultation_id: cons.data, patient_id: pat.data, poids: 20 });
      const trop = await S.A.users.medecin.rpc('sante_emettre_ordonnance', { _consultation_id: cons.data, _lignes: lignes(1500), _recommandations: null });
      expect(String(trop.error!.message)).toMatch(/PEDIATRIE_DOSE/);
      const justifiee = await S.A.users.medecin.rpc('sante_emettre_ordonnance', { _consultation_id: cons.data, _lignes: lignes(1500, 'Infection sévère, avis infectiologique'), _recommandations: null });
      expect(justifiee.error).toBeNull();
      const conforme = await S.A.users.medecin.rpc('sante_emettre_ordonnance', { _consultation_id: cons.data, _lignes: lignes(900), _recommandations: null });
      expect(conforme.error).toBeNull();
    }, 60_000);
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
    expect(ecarts, 'écarts à la matrice d’accès (bloquant depuis P1)').toHaveLength(0);
  }, 120_000);
});
