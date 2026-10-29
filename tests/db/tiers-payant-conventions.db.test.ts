import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const run = randomBytes(7).toString('hex');
let c: SupabaseClient;
let sid = '';
let pid = '';
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!url || !key || !service)('Conventions tiers payant — recette isolée', () => {
  beforeAll(async () => {
    if (!url || !key || !service) throw new Error('Configuration absente');
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const email = `p0-conventions-${run}@gsante.test`;
    const password = randomBytes(24).toString('base64url');
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (user.error) throw user.error;
    c = createClient(url, key, { auth: { persistSession: false } });
    const login = await c.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    const structure = await c.rpc('sante_creer_structure', { _nom: `TEST conventions ${run}`, _type: 'cabinet', _role_metier: 'medecin' });
    if (structure.error) throw structure.error;
    sid = structure.data;
    const patient = await c.rpc('sante_creer_patient', { _structure_id: sid, _nom: 'RECETTE', _prenoms: run, _sexe: 'F', _date_naissance: '1990-04-12' });
    if (patient.error) throw patient.error;
    pid = patient.data;
    const config = await c.rpc('sante_configuration_sauver', { _structure_id: sid, _donnees: { nom: `TEST conventions ${run}` }, _etape: 2, _revision: 0, _terminer: true });
    if (config.error) throw config.error;
    if (process.env.CONVENTIONS_BROWSER_FIXTURE) writeFileSync(process.env.CONVENTIONS_BROWSER_FIXTURE, JSON.stringify({ storage_key: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`, session: login.data.session, structure: sid, patient: pid }));
  });

  async function fixture(label: string, convention: Record<string, unknown> = {}, assurance: Record<string, unknown> = {}) {
    const org = `IPM ${label} ${run}`;
    const code = `ACT-${label}-${run}`;
    const organism = await c.from('sante_organismes').insert({ structure_id: sid, nom: org, type: 'ipm' });
    if (organism.error) throw organism.error;
    const act = await c.from('sante_actes').insert({ structure_id: sid, code, libelle: `Acte ${label}`, categorie: 'consultation', tarif: 10000, regime_tva: 'exonere' });
    if (act.error) throw act.error;
    const cov = await c.from('sante_patient_assurances').insert({ patient_id: pid, organisme: org, taux_couverture: 80, ...assurance }).select('id').single();
    if (cov.error) throw cov.error;
    const conv = await c.from('sante_conventions').insert({ structure_id: sid, organisme: org, categorie: 'consultation', taux: 80, ...convention });
    if (conv.error) throw conv.error;
    return { org, code, assurance: cov.data.id };
  }

  async function invoice(f: { code: string; assurance: string }, remise = 0) {
    return c.rpc('sante_creer_facture', { _patient_id: pid, _assurance_id: f.assurance, _lignes: [{ code: f.code, libelle: 'Acte recette', prix_unitaire: 10000 }], _remise: remise, _motif_remise: remise ? 'Remise fictive de recette' : null });
  }
  async function parts(id: string) {
    const row = await c.from('sante_factures').select('part_organisme,part_patient,total,remise').eq('id', id).single();
    if (row.error) throw row.error;
    return row.data;
  }

  it('une convention expirée ne réduit plus la couverture par sa franchise ou son plafond', async () => {
    const f = await fixture('expiree', { date_fin: '2020-01-01', franchise: 1000, plafond: 2000 });
    const r = await invoice(f); expect(r.error).toBeNull();
    expect(await parts(r.data)).toMatchObject({ part_organisme: 8000, part_patient: 2000 });
  });
  it('une convention future ne réduit pas la couverture actuelle', async () => {
    const f = await fixture('future', { date_debut: '2099-01-01', franchise: 1000, plafond: 2000 });
    const r = await invoice(f); expect(r.error).toBeNull();
    expect(await parts(r.data)).toMatchObject({ part_organisme: 8000, part_patient: 2000 });
  });
  it('applique franchise, plafond catégorie, remise puis plafond assurance', async () => {
    const f = await fixture('combinee', { franchise: 1000, plafond: 6000 }, { plafond: 4000 });
    const r = await invoice(f, 1000); expect(r.error).toBeNull();
    expect(await parts(r.data)).toEqual({ part_organisme: 4000, part_patient: 5000, total: 10000, remise: 1000 });
  });
  it('une exclusion laisse la totalité de la ligne au patient', async () => {
    const f = await fixture('exclusion');
    expect((await c.from('sante_convention_exclusions').insert({ structure_id: sid, organisme: f.org, code: f.code })).error).toBeNull();
    const r = await invoice(f); expect(r.error).toBeNull();
    expect(await parts(r.data)).toMatchObject({ part_organisme: 0, part_patient: 10000 });
  });
  it('refuse une assurance expirée sans créer de facture', async () => {
    const f = await fixture('assurance-expiree', {}, { date_fin: '2020-01-01' });
    const r = await invoice(f); expect(r.error).toBeTruthy(); expect(r.data).toBeNull();
  });
  it('deux factures simultanées ne dépassent pas le plafond du bon', async () => {
    const f = await fixture('concurrence');
    const bon = await c.from('sante_bons_pec').insert({ structure_id: sid, patient_id: pid, organisme: f.org, numero: `BON-${run}`, date_debut: today, date_fin: '2099-12-31', plafond: 10000 }).select('id').single();
    expect(bon.error).toBeNull();
    const results = await Promise.all([invoice(f), invoice(f)]);
    for (const r of results) expect(r.error).toBeNull();
    const rows = await Promise.all(results.map(r => parts(r.data)));
    expect(rows.reduce((sum, r) => sum + Number(r.part_organisme), 0)).toBe(10000);
    const read = await c.from('sante_bons_pec').select('consomme').eq('id', bon.data?.id ?? '').single();
    expect(Number(read.data?.consomme)).toBe(10000);
    const third = await invoice(f); expect(third.error).toBeNull();
    expect(await parts(third.data)).toMatchObject({ part_organisme: 0, part_patient: 10000 });
  });
});