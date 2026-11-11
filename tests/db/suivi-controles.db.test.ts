import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Date locale (Dakar = UTC) décalée de n jours, au format AAAA-MM-JJ. */
const jour = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe.skipIf(!url || !key || !service)('Suivi médical : contrôles programmés (0119)', () => {
  const admin = createClient(url, service);
  let medecin: SupabaseClient, secretaire: SupabaseClient, comptable: SupabaseClient;
  let structure = '', patient = '', praticien = '', consultation = '', controleRdv = '', controleSimple = '';
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-suivi-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  async function rattacher(label: string, role: string) {
    const x = await compte(label);
    const m = await admin.from('structure_memberships').insert({ structure_id: structure, user_id: x.id, statut: 'actif' }).select('id').single();
    if (m.error) throw m.error;
    const r = await admin.from('medical_user_roles').insert({ membership_id: m.data.id, role });
    if (r.error) throw r.error;
    return x.c;
  }
  beforeAll(async () => {
    const m = await compte('medecin'); medecin = m.c;
    const s = await medecin.rpc('sante_creer_structure', { _nom: 'TEST Suivi contrôles', _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error; structure = s.data as string;
    const p = await medecin.rpc('sante_creer_patient', { _structure_id: structure, _nom: 'TESTSUIVI', _prenoms: 'Patient', _sexe: 'F' });
    if (p.error) throw p.error; patient = p.data as string;
    const pr = await medecin.from('sante_praticiens').insert({ structure_id: structure, nom: 'Dr Suivi', user_id: m.id }).select('id').single();
    if (pr.error) throw pr.error; praticien = pr.data.id;
    const c = await medecin.rpc('sante_demarrer_consultation', { _patient_id: patient, _praticien_id: praticien, _rdv_id: null });
    if (c.error) throw c.error; consultation = c.data as string;
    secretaire = await rattacher('secretaire', 'secretaire');
    comptable = await rattacher('comptable', 'comptable');
  }, 180000);

  it('le médecin programme un contrôle avec heure : le rendez-vous est créé chez le même praticien', async () => {
    const r = await medecin.rpc('sante_programmer_controle', { _consultation_id: consultation, _prevu_le: jour(14), _motif: 'Contrôle tension sous traitement', _heure: '09:30' });
    expect(r.error).toBeNull(); controleRdv = r.data as string;
    const k = await admin.from('sante_controles').select('statut,rdv_id,praticien_id').eq('id', controleRdv).single();
    expect(k.data?.statut).toBe('prevu'); expect(k.data?.praticien_id).toBe(praticien);
    const rdv = await admin.from('sante_rendez_vous').select('praticien_id,patient_id,debut,motif,statut').eq('id', k.data!.rdv_id).single();
    expect(rdv.data?.praticien_id).toBe(praticien); expect(rdv.data?.patient_id).toBe(patient);
    expect(new Date(rdv.data!.debut).toISOString()).toBe(`${jour(14)}T09:30:00.000Z`);
    expect(rdv.data?.motif).toMatch(/^Contrôle : /);
  });
  it('sans heure, seul le rappel est créé ; date passée et motif vide sont refusés', async () => {
    const r = await medecin.rpc('sante_programmer_controle', { _consultation_id: consultation, _prevu_le: jour(3), _motif: 'Résultats NFS' });
    expect(r.error).toBeNull(); controleSimple = r.data as string;
    const k = await admin.from('sante_controles').select('rdv_id').eq('id', controleSimple).single();
    expect(k.data?.rdv_id).toBeNull();
    expect((await medecin.rpc('sante_programmer_controle', { _consultation_id: consultation, _prevu_le: jour(-1), _motif: 'Hier' })).error).not.toBeNull();
    expect((await medecin.rpc('sante_programmer_controle', { _consultation_id: consultation, _prevu_le: jour(5), _motif: ' ' })).error).not.toBeNull();
  });
  it('ni la secrétaire ni le comptable ne programment ; personne n\'écrit directement dans la table', async () => {
    expect((await secretaire.rpc('sante_programmer_controle', { _consultation_id: consultation, _prevu_le: jour(5), _motif: 'Essai secrétaire' })).error).not.toBeNull();
    expect((await comptable.rpc('sante_programmer_controle', { _consultation_id: consultation, _prevu_le: jour(5), _motif: 'Essai comptable' })).error).not.toBeNull();
    const ins = await medecin.from('sante_controles').insert({ structure_id: structure, patient_id: patient, prevu_le: jour(5), motif: 'Direct' });
    expect(ins.error).not.toBeNull();
  });
  it('« à revoir » : le médecin voit le motif, la secrétaire non, le comptable est refusé', async () => {
    const m = await medecin.rpc('sante_controles_a_revoir', { _structure_id: structure, _horizon_jours: 30 });
    expect(m.error).toBeNull();
    const ids = (m.data ?? []).map((x: { controle_id: string }) => x.controle_id);
    expect(ids).toEqual([controleSimple, controleRdv]);
    expect(m.data[0].motif).toBe('Résultats NFS');
    const s = await secretaire.rpc('sante_controles_a_revoir', { _structure_id: structure, _horizon_jours: 30 });
    expect(s.error).toBeNull(); expect(s.data).toHaveLength(2);
    expect(s.data.every((x: { motif: string | null }) => x.motif === null)).toBe(true);
    const court = await medecin.rpc('sante_controles_a_revoir', { _structure_id: structure, _horizon_jours: 7 });
    expect((court.data ?? []).map((x: { controle_id: string }) => x.controle_id)).toEqual([controleSimple]);
    expect((await comptable.rpc('sante_controles_a_revoir', { _structure_id: structure })).error).not.toBeNull();
  });
  it('la lecture directe suit l\'accès clinique : médecin oui, comptable non', async () => {
    expect((await medecin.from('sante_controles').select('id').eq('patient_id', patient)).data).toHaveLength(2);
    expect((await comptable.from('sante_controles').select('id').eq('patient_id', patient)).data ?? []).toHaveLength(0);
  });
  it('la consultation suivante réalise le contrôle proche, pas celui à deux semaines', async () => {
    const c = await medecin.rpc('sante_demarrer_consultation', { _patient_id: patient, _praticien_id: praticien, _rdv_id: null });
    expect(c.error).toBeNull();
    const k = await admin.from('sante_controles').select('id,statut,realise_par').in('id', [controleSimple, controleRdv]);
    const parId = Object.fromEntries((k.data ?? []).map(x => [x.id, x]));
    expect(parId[controleSimple].statut).toBe('realise'); expect(parId[controleSimple].realise_par).toBe(c.data);
    expect(parId[controleRdv].statut).toBe('prevu');
  });
  it('l\'annulation exige un motif et libère le rendez-vous planifié', async () => {
    expect((await medecin.rpc('sante_annuler_controle', { _controle_id: controleRdv, _motif: '' })).error).not.toBeNull();
    expect((await secretaire.rpc('sante_annuler_controle', { _controle_id: controleRdv, _motif: 'Patient parti' })).error).not.toBeNull();
    expect((await medecin.rpc('sante_annuler_controle', { _controle_id: controleRdv, _motif: 'Patient suivi ailleurs' })).error).toBeNull();
    const k = await admin.from('sante_controles').select('statut,rdv_id').eq('id', controleRdv).single();
    expect(k.data?.statut).toBe('annule');
    const r = await admin.from('sante_rendez_vous').select('statut').eq('id', k.data!.rdv_id).single();
    expect(r.data?.statut).toBe('annule');
    expect((await medecin.rpc('sante_annuler_controle', { _controle_id: controleRdv, _motif: 'Deuxième fois' })).error).not.toBeNull();
  });
});
