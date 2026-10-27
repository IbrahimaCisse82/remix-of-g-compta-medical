import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url = process.env.SUPABASE_URL ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const run = randomBytes(6).toString('hex');
describe.skipIf(!url || !service || !key)('Banque : API réelle et droits', () => {
  let admin: SupabaseClient, owner: SupabaseClient, accountant: SupabaseClient, reader: SupabaseClient, outsider: SupabaseClient;
  let entreprise = '', exercice = '', journal = '', otherJournal = '', statement = '';
  const operations = [{ date: '2026-10-27', libelle: 'Virement recette bancaire', reference: 'BQ-RECETTE', montant: 10000 }, { date: '2026-10-28', libelle: 'Second virement', reference: '', montant: 10000 }];
  const fingerprint = randomBytes(32).toString('hex');
  async function user(label: string) {
    const email = `p0-banque-${label}-${run}@gsante.test`, password = randomBytes(24).toString('base64url');
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const client = createClient(url, key, { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
    return { client, id: u.data.user.id };
  }
  const importArgs = () => ({ _entreprise_id: entreprise, _exercice_id: exercice, _compte: '521100', _nom_fichier: 'recette-banque.csv', _empreinte: fingerprint, _solde_initial: 2000, _operations: operations });
  beforeAll(async () => {
    admin = createClient(url, service, { auth: { persistSession: false } });
    const u = await user('admin'); owner = u.client;
    const s = await owner.rpc('sante_creer_structure', { _type: 'cabinet', _nom: `TEST Banque ${run}`, _role_metier: 'medecin' }); if (s.error) throw s.error;
    const ent = await admin.from('structures').select('entreprise_id').eq('id', s.data).single(); entreprise = ent.data?.entreprise_id ?? ''; if (!entreprise) throw new Error('Entreprise absente');
    const ex = await admin.from('exercices').select('id').eq('entreprise_id', entreprise).single(); exercice = ex.data?.id ?? ''; if (!exercice) throw new Error('Exercice absent');
    for (const role of ['comptable', 'lecteur'] as const) {
      const m = await user(role);
      const ms = await admin.from('structure_memberships').insert({ structure_id: s.data, user_id: m.id, statut: 'actif' }).select('id').single(); if (ms.error) throw ms.error;
      const r = await admin.from('medical_user_roles').insert({ membership_id: ms.data.id, role }); if (r.error) throw r.error;
      if (role === 'comptable') accountant = m.client; else reader = m.client;
    }
    outsider = (await user('autre')).client;
    const pc = await admin.from('plan_comptable').insert({ entreprise_id: entreprise, numero: '521100', intitule: 'Banque recette', classe: '5', sens: 'D', type_compte: 'bilan', actif: true }); if (pc.error) throw pc.error;
    const ec = await owner.rpc('fn_creer_ecriture', { _entreprise_id: entreprise, _exercice_id: exercice, _journal_code: 'BQ', _date: '2026-10-27', _libelle: 'Recette bancaire', _piece: 'BQ-RECETTE', _statut: 'validee', _origine: 'saisie', _lignes: [{ compte: '521100', intitule: 'Banque', debit: 10000, credit: 0 }, { compte: '411100', intitule: 'Clients', debit: 0, credit: 10000 }] }); if (ec.error) throw ec.error;
    const j = await admin.from('journal').select('id, compte').eq('ecriture_id', ec.data); journal = j.data?.find(x => x.compte === '521100')?.id ?? ''; otherJournal = j.data?.find(x => x.compte === '411100')?.id ?? ''; if (!journal) throw new Error('Ligne bancaire absente');
  }, 120000);
  it('le comptable importe et le lecteur consulte sans écrire', async () => {
    expect((await reader.rpc('banque_importer', importArgs())).error).toBeTruthy();
    const r = await accountant.rpc('banque_importer', importArgs()); expect(r.error).toBeNull(); statement = r.data;
    const read = await reader.from('operations_bancaires').select('id,montant').eq('releve_id', statement); expect(read.data).toHaveLength(2); expect(Number(read.data?.[0].montant)).toBe(10000);
  });
  it('un relevé identique ne peut pas être importé deux fois', async () => { expect((await accountant.rpc('banque_importer', importArgs())).error?.code).toBe('23505'); });
  it('les autres entreprises ne lisent ni ne rapprochent les opérations', async () => {
    expect((await outsider.from('operations_bancaires').select('id').eq('releve_id', statement)).data).toEqual([]);
    const op = await admin.from('operations_bancaires').select('id').eq('releve_id', statement).order('numero_ligne');
    expect((await outsider.rpc('banque_rapprocher', { _operation_id: op.data?.[0].id, _journal_id: journal })).error).toBeTruthy();
  });
  it('rapproche, empêche la réutilisation, annule et conserve la piste d’audit', async () => {
    const ops = await admin.from('operations_bancaires').select('id').eq('releve_id', statement).order('numero_ligne'); const [a, b] = ops.data ?? []; if (!a || !b) throw new Error('Opérations absentes');
    expect((await accountant.rpc('banque_rapprocher', { _operation_id: a.id, _journal_id: otherJournal })).error).toBeTruthy();
    expect((await reader.rpc('banque_rapprocher', { _operation_id: a.id, _journal_id: journal })).error).toBeTruthy();
    expect((await accountant.rpc('banque_rapprocher', { _operation_id: a.id, _journal_id: journal })).error).toBeNull();
    expect((await accountant.rpc('banque_rapprocher', { _operation_id: b.id, _journal_id: journal })).error?.code).toBe('23505');
    expect((await accountant.from('operations_bancaires').select('journal_id').eq('id', a.id).single()).data?.journal_id).toBe(journal);
    expect((await accountant.rpc('banque_rapprocher', { _operation_id: a.id, _journal_id: null })).error).toBeNull();
    const audit = await accountant.from('rapprochements_bancaires_audit').select('action').eq('operation_id', a.id).order('created_at'); expect(audit.data?.map(x => x.action)).toEqual(['rapprocher', 'annuler']);
    expect((await admin.from('journal').select('debit,credit').eq('id', journal).single()).data).toMatchObject({ debit: 10000, credit: 0 });
  });
  it('bloque un import hors exercice atomiquement', async () => {
    const r = await accountant.rpc('banque_importer', { ...importArgs(), _empreinte: 'a'.repeat(64), _operations: [{ ...operations[0], date: '2025-10-27' }] }); expect(r.error).toBeTruthy();
    expect((await admin.from('releves_bancaires').select('id').eq('entreprise_id', entreprise)).data).toHaveLength(1);
  });
});