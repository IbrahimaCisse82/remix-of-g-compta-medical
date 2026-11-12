import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe.skipIf(!url || !key || !service)('Consultations à facturer (0120)', () => {
  const admin = createClient(url, service);
  let medecin: SupabaseClient, caissier: SupabaseClient, comptable: SupabaseClient;
  let structure = '', patient = '', autrePatient = '', praticien = '', cloturee = '', brouillon = '';
  const code = `CS-${randomBytes(3).toString('hex')}`;
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-afact-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
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
  async function consultation(cloturer: boolean) {
    const c = await medecin.rpc('sante_demarrer_consultation', { _patient_id: patient, _praticien_id: praticien, _rdv_id: null });
    if (c.error) throw c.error;
    if (cloturer) {
      const u = await medecin.from('sante_consultations').update({ motif: 'Fièvre', diagnostic: 'Paludisme simple' }).eq('id', c.data);
      if (u.error) throw u.error;
      const k = await medecin.rpc('sante_cloturer_consultation', { _consultation_id: c.data });
      if (k.error) throw k.error;
    }
    return c.data as string;
  }
  beforeAll(async () => {
    const m = await compte('medecin'); medecin = m.c;
    const s = await medecin.rpc('sante_creer_structure', { _nom: 'TEST Consultations à facturer', _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error; structure = s.data as string;
    const a = await admin.from('sante_actes').insert({ structure_id: structure, code, libelle: 'Consultation de médecine générale', tarif: 10000, regime_tva: 'exonere' });
    if (a.error) throw a.error;
    const st = await admin.from('structures').update({ acte_consultation_code: code, facturation_auto: false }).eq('id', structure);
    if (st.error) throw st.error;
    const p = await medecin.rpc('sante_creer_patient', { _structure_id: structure, _nom: 'TESTAFACT', _prenoms: 'Patient', _sexe: 'M' });
    if (p.error) throw p.error; patient = p.data as string;
    const p2 = await medecin.rpc('sante_creer_patient', { _structure_id: structure, _nom: 'TESTAFACT', _prenoms: 'Autre', _sexe: 'F' });
    if (p2.error) throw p2.error; autrePatient = p2.data as string;
    const pr = await medecin.from('sante_praticiens').insert({ structure_id: structure, nom: 'Dr Facture', user_id: m.id }).select('id').single();
    if (pr.error) throw pr.error; praticien = pr.data.id;
    cloturee = await consultation(true);
    brouillon = await consultation(false);
    caissier = await rattacher('caissier', 'caissier');
    comptable = await rattacher('comptable', 'comptable');
  }, 180000);

  it('la caisse voit la consultation clôturée non facturée, sans motif ni diagnostic, avec l’acte proposé', async () => {
    const r = await caissier.rpc('sante_consultations_a_facturer', { _structure_id: structure });
    expect(r.error).toBeNull();
    expect(r.data.map((x: { consultation_id: string }) => x.consultation_id)).toEqual([cloturee]);
    const ligne = r.data[0];
    expect(Object.keys(ligne).sort()).toEqual(['acte_code', 'acte_libelle', 'acte_tarif', 'cloturee_le', 'consultation_id', 'numero_dossier', 'patient', 'patient_id', 'praticien']);
    expect(ligne.acte_code).toBe(code); expect(Number(ligne.acte_tarif)).toBe(10000); expect(ligne.praticien).toBe('Dr Facture');
  });
  it('le comptable n’y a pas accès', async () => {
    expect((await comptable.rpc('sante_consultations_a_facturer', { _structure_id: structure })).error).not.toBeNull();
  });
  it('refus : brouillon, autre patient', async () => {
    const lignes = [{ code, libelle: 'Consultation', prix_unitaire: 10000, quantite: 1 }];
    expect((await caissier.rpc('sante_facturer_consultation', { _consultation_id: brouillon, _patient_id: patient, _lignes: lignes })).error?.message).toMatch(/clôturée/);
    expect((await caissier.rpc('sante_facturer_consultation', { _consultation_id: cloturee, _patient_id: autrePatient, _lignes: lignes })).error?.message).toMatch(/autre patient/);
  });
  it('la facture est rattachée à la consultation, qui sort de la liste ; pas de seconde facture', async () => {
    const lignes = [{ code, libelle: 'Consultation de médecine générale', prix_unitaire: 10000, quantite: 1 }];
    const f = await caissier.rpc('sante_facturer_consultation', { _consultation_id: cloturee, _patient_id: patient, _lignes: lignes });
    expect(f.error).toBeNull();
    const fac = await admin.from('sante_factures').select('consultation_id, total, praticien_id').eq('id', f.data).single();
    expect(fac.data?.consultation_id).toBe(cloturee); expect(Number(fac.data?.total)).toBe(10000); expect(fac.data?.praticien_id).toBe(praticien);
    const r = await caissier.rpc('sante_consultations_a_facturer', { _structure_id: structure });
    expect(r.data).toHaveLength(0);
    expect((await caissier.rpc('sante_facturer_consultation', { _consultation_id: cloturee, _patient_id: patient, _lignes: lignes })).error?.message).toMatch(/Déjà facturé/);
  });
  it('après annulation (avoir), la consultation redevient à facturer', async () => {
    const fac = await admin.from('sante_factures').select('id').eq('consultation_id', cloturee).eq('type', 'facture').single();
    // Seul l'administrateur annule : le créateur de la structure l'est.
    expect((await medecin.rpc('sante_annuler_facture', { _facture_id: fac.data!.id, _motif: 'Erreur de tarif' })).error).toBeNull();
    const r = await caissier.rpc('sante_consultations_a_facturer', { _structure_id: structure });
    expect(r.data.map((x: { consultation_id: string }) => x.consultation_id)).toEqual([cloturee]);
  });
});
