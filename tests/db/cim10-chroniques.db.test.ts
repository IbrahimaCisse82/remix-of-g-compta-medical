import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { totp } from './totp';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Codes fictifs (sous-codes « U99.T* », inexistants dans la CIM-10) : le référentiel réel de la base de test n'est pas modifié.
const CODES = [
  { code: 'U99TA', libelle: 'Affection de recette hypertensive essentielle', chapitre: 'XXII' },
  { code: 'u99.tb', libelle: 'Diabète de recette sucré type œdémateux', chapitre: 'XXII' },
  { code: 'U99.TC', libelle: 'Fièvre de recette paludéenne', chapitre: 'XXII' },
];

describe.skipIf(!url || !key || !service)('CIM-10, diagnostics codés et maladies chroniques (0121)', () => {
  const admin = createClient(url, service);
  let operateur: SupabaseClient, medecin: SupabaseClient, secretaire: SupabaseClient;
  let structure = '', patient = '', praticien = '', consultation = '';
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-cim-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  beforeAll(async () => {
    const o = await compte('operateur'); operateur = o.c;
    const ins = await admin.from('plateforme_operateurs').insert({ user_id: o.id, role: 'operateur' });
    if (ins.error) throw ins.error;
    const e = await operateur.auth.mfa.enroll({ factorType: 'totp' });
    if (e.error || !e.data) throw e.error;
    const v = await operateur.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
    if (v.error) throw v.error;
    const m = await compte('medecin'); medecin = m.c;
    const s = await medecin.rpc('sante_creer_structure', { _nom: 'TEST CIM-10', _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error; structure = s.data as string;
    const p = await medecin.rpc('sante_creer_patient', { _structure_id: structure, _nom: 'TESTCIM', _prenoms: 'Patient', _sexe: 'F' });
    if (p.error) throw p.error; patient = p.data as string;
    const pr = await medecin.from('sante_praticiens').insert({ structure_id: structure, nom: 'Dr Code', user_id: m.id }).select('id').single();
    if (pr.error) throw pr.error; praticien = pr.data.id;
    const c = await medecin.rpc('sante_demarrer_consultation', { _patient_id: patient, _praticien_id: praticien, _rdv_id: null });
    if (c.error) throw c.error; consultation = c.data as string;
    const sec = await compte('secretaire'); secretaire = sec.c;
    const ms = await admin.from('structure_memberships').insert({ structure_id: structure, user_id: sec.id, statut: 'actif' }).select('id').single();
    if (ms.error) throw ms.error;
    await admin.from('medical_user_roles').insert({ membership_id: ms.data.id, role: 'secretaire' });
  }, 180000);

  it("seul un opérateur charge le référentiel ; les codes sont normalisés et l'import est tracé", async () => {
    expect((await medecin.rpc('plateforme_cim10_importer', { _version: 'Recette', _lignes: CODES })).error).not.toBeNull();
    const r = await operateur.rpc('plateforme_cim10_importer', { _version: 'Recette', _lignes: [...CODES, { code: '12', libelle: 'Invalide' }] });
    expect(r.error).toBeNull();
    expect(r.data.enregistrees).toBe(3); expect(r.data.rejets).toEqual(['12']);
    const k = await admin.from('sante_cim10').select('code').in('code', ['U99.TA', 'U99.TB', 'U99.TC']);
    expect(k.data).toHaveLength(3);
    const j = await admin.from('plateforme_audit').select('action').eq('action', 'cim10_import').limit(1);
    expect(j.data).toHaveLength(1);
  });
  it('recherche par code (avec ou sans point) et par mots sans accents', async () => {
    const parCode = await secretaire.rpc('sante_cim10_chercher', { _q: 'u99ta' });
    expect(parCode.data?.[0]?.code).toBe('U99.TA');
    const parMots = await medecin.rpc('sante_cim10_chercher', { _q: 'diabete RECETTE oedemateux' });
    expect(parMots.data?.map((x: { code: string }) => x.code)).toEqual(['U99.TB']);
    expect((await medecin.rpc('sante_cim10_chercher', { _q: 'x' })).data).toEqual([]);
  });
  it('le médecin code la consultation : un seul diagnostic principal ; la secrétaire ne peut ni coder ni lire', async () => {
    const a = await medecin.rpc('sante_diagnostic_coder', { _consultation_id: consultation, _code: 'U99.TC' });
    expect(a.error).toBeNull();
    const b = await medecin.rpc('sante_diagnostic_coder', { _consultation_id: consultation, _code: 'u99tb', _principal: true });
    expect(b.error).toBeNull();
    const d = await medecin.from('sante_consultation_diagnostics').select('code, principal, libelle').eq('consultation_id', consultation).order('code');
    expect(d.data).toEqual([
      { code: 'U99.TB', principal: true, libelle: 'Diabète de recette sucré type œdémateux' },
      { code: 'U99.TC', principal: false, libelle: 'Fièvre de recette paludéenne' },
    ]);
    expect((await medecin.rpc('sante_diagnostic_coder', { _consultation_id: consultation, _code: 'U99.ZZ' })).error?.message).toMatch(/inconnu/);
    expect((await secretaire.rpc('sante_diagnostic_coder', { _consultation_id: consultation, _code: 'U99.TA' })).error).not.toBeNull();
    expect((await secretaire.from('sante_consultation_diagnostics').select('id').eq('consultation_id', consultation)).data ?? []).toHaveLength(0);
    // Retirer le principal : le suivant devient principal.
    expect((await medecin.rpc('sante_diagnostic_retirer', { _id: b.data })).error).toBeNull();
    const apres = await medecin.from('sante_consultation_diagnostics').select('code, principal').eq('consultation_id', consultation);
    expect(apres.data).toEqual([{ code: 'U99.TC', principal: true }]);
  });
  it('après clôture, le codage est figé', async () => {
    await medecin.from('sante_consultations').update({ motif: 'Fièvre', diagnostic: 'Accès palustre' }).eq('id', consultation);
    expect((await medecin.rpc('sante_cloturer_consultation', { _consultation_id: consultation })).error).toBeNull();
    expect((await medecin.rpc('sante_diagnostic_coder', { _consultation_id: consultation, _code: 'U99.TA' })).error?.message).toMatch(/clôturée/);
  });
  it('maladies chroniques : déclaration codée ou libre, pas de doublon actif, résolution', async () => {
    const a = await medecin.rpc('sante_chronique_declarer', { _patient_id: patient, _code: 'U99TA', _depuis: '2020-03-01', _consultation_id: consultation });
    expect(a.error).toBeNull();
    expect((await medecin.rpc('sante_chronique_declarer', { _patient_id: patient, _code: 'U99.TA' })).error?.message).toMatch(/Déjà/);
    const libre = await medecin.rpc('sante_chronique_declarer', { _patient_id: patient, _libelle: 'Drépanocytose SS (texte libre)' });
    expect(libre.error).toBeNull();
    expect((await medecin.rpc('sante_chronique_declarer', { _patient_id: patient })).error).not.toBeNull();
    expect((await secretaire.rpc('sante_chronique_declarer', { _patient_id: patient, _libelle: 'Asthme' })).error).not.toBeNull();
    const l = await medecin.from('sante_maladies_chroniques').select('code, libelle, statut').eq('patient_id', patient).order('created_at');
    expect(l.data).toEqual([
      { code: 'U99.TA', libelle: 'Affection de recette hypertensive essentielle', statut: 'active' },
      { code: null, libelle: 'Drépanocytose SS (texte libre)', statut: 'active' },
    ]);
    expect((await secretaire.from('sante_maladies_chroniques').select('id').eq('patient_id', patient)).data ?? []).toHaveLength(0);
    expect((await medecin.rpc('sante_chronique_statut', { _id: a.data, _statut: 'resolue' })).error).toBeNull();
    expect((await medecin.rpc('sante_chronique_declarer', { _patient_id: patient, _code: 'U99.TA' })).error).toBeNull();
  });
});
