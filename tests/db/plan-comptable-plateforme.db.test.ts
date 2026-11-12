import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomInt } from 'node:crypto';
import { totp } from './totp';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe.skipIf(!url || !key || !service)('Plan comptable géré par la plateforme (0128)', () => {
  const admin = createClient(url, service);
  let operateur: SupabaseClient, gerant: SupabaseClient, autre: SupabaseClient;
  let entreprise = '', entrepriseAutre = '';
  // Subdivision de 7061 propre à ce lancement (les lancements parallèles ne se gênent pas).
  const commun = `7061${randomInt(90000, 99999)}`;
  async function compte(label: string) {
    const password = randomBytes(24).toString('base64url');
    const email = `p0-plan-${label}-${randomBytes(6).toString('hex')}@gsante.test`;
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user) throw u.error ?? new Error('Compte absent');
    const c = createClient(url, key, { auth: { persistSession: false } });
    const l = await c.auth.signInWithPassword({ email, password });
    if (l.error) throw l.error;
    return { c, id: u.data.user.id };
  }
  async function dossier(label: string) {
    const m = await compte(label);
    const s = await m.c.rpc('sante_creer_structure', { _nom: `TEST Plan ${label}`, _type: 'cabinet', _role_metier: 'medecin' });
    if (s.error) throw s.error;
    const e = await admin.from('entreprises').select('id').eq('user_id', m.id).order('created_at', { ascending: false }).limit(1).single();
    if (e.error) throw e.error;
    return { c: m.c, entreprise: e.data.id as string };
  }
  beforeAll(async () => {
    const o = await compte('operateur'); operateur = o.c;
    const ins = await admin.from('plateforme_operateurs').insert({ user_id: o.id, role: 'operateur' });
    if (ins.error) throw ins.error;
    const f = await operateur.auth.mfa.enroll({ factorType: 'totp' });
    if (f.error || !f.data) throw f.error;
    const v = await operateur.auth.mfa.challengeAndVerify({ factorId: f.data.id, code: totp(f.data.totp.secret) });
    if (v.error) throw v.error;
    const a = await dossier('A'); gerant = a.c; entreprise = a.entreprise;
    const b = await dossier('B'); autre = b.c; entrepriseAutre = b.entreprise;
  }, 180000);

  it('le référentiel installable vient de la base : SYSCOHADA visé + comptes communs (70611)', async () => {
    const r = await gerant.rpc('plan_reference_comptes');
    expect(r.error).toBeNull();
    const parNumero = new Map((r.data as { numero: string; origine: string }[]).map(x => [x.numero, x.origine]));
    expect(parNumero.get('701')).toBe('referentiel');
    expect(parNumero.get('70611')).toBe('plateforme');
    expect(parNumero.has('10')).toBe(false); // niveau 2 : titre, non installé
  });
  it('l’installation n’ajoute que les comptes absents et ne touche pas aux comptes propres', async () => {
    const propre = await gerant.from('plan_comptable').insert({ entreprise_id: entreprise, numero: '6011999', intitule: 'Compte propre de recette', classe: '6', sens: 'D', type_compte: 'Résultat', actif: true });
    expect(propre.error).toBeNull();
    const premier = await gerant.rpc('plan_installer_reference', { _entreprise_id: entreprise });
    expect(premier.error).toBeNull();
    expect((await gerant.rpc('plan_installer_reference', { _entreprise_id: entreprise })).data).toBe(0);
    expect((await autre.rpc('plan_installer_reference', { _entreprise_id: entreprise })).error).not.toBeNull();
    const p = await gerant.from('plan_comptable').select('numero').eq('entreprise_id', entreprise).in('numero', ['701', '70611', '6011999']);
    expect(p.data?.map(x => x.numero).sort()).toEqual(['6011999', '701', '70611']);
    // Le compte propre reste invisible des autres dossiers.
    expect((await autre.from('plan_comptable').select('id').eq('entreprise_id', entreprise)).data ?? []).toHaveLength(0);
  });
  it('seul un opérateur définit un compte commun ; il doit subdiviser le référentiel sans le remplacer', async () => {
    expect((await gerant.rpc('plateforme_compte_commun_definir', { _numero: commun, _intitule: 'Commun de recette', _sens: 'C' })).error).not.toBeNull();
    expect((await operateur.rpc('plateforme_compte_commun_definir', { _numero: '701', _intitule: 'Remplacement', _sens: 'C' })).error).not.toBeNull();
    expect((await operateur.rpc('plateforme_compte_commun_definir', { _numero: '7011', _intitule: 'Remplacement', _sens: 'C' })).error?.message).toMatch(/référentiel/);
    expect((await operateur.rpc('plateforme_compte_commun_definir', { _numero: '1999999', _intitule: 'Sans parent', _sens: 'C' })).error?.message).toMatch(/subdivision/);
  });
  it('un compte commun actif est ajouté à tous les dossiers, sans modifier un intitulé existant', async () => {
    await autre.from('plan_comptable').insert({ entreprise_id: entrepriseAutre, numero: commun, intitule: 'Intitulé choisi par le dossier B', classe: '7', sens: 'C', type_compte: 'Résultat', actif: true });
    const r = await operateur.rpc('plateforme_compte_commun_definir', { _numero: commun, _intitule: 'Commun de recette', _sens: 'C' });
    expect(r.error).toBeNull();
    expect(r.data.dossiers_completes).toBeGreaterThanOrEqual(1);
    const a = await gerant.from('plan_comptable').select('intitule').eq('entreprise_id', entreprise).eq('numero', commun).single();
    expect(a.data?.intitule).toBe('Commun de recette');
    const b = await autre.from('plan_comptable').select('intitule').eq('entreprise_id', entrepriseAutre).eq('numero', commun).single();
    expect(b.data?.intitule).toBe('Intitulé choisi par le dossier B');
    const j = await admin.from('plateforme_audit').select('action').eq('action', 'compte_commun_defini').eq('cible_id', commun);
    expect(j.data).toHaveLength(1);
    // Désactivé : il n'est plus installé dans les nouveaux dossiers, sans être retiré des dossiers existants.
    expect((await operateur.rpc('plateforme_compte_commun_definir', { _numero: commun, _intitule: 'Commun de recette', _sens: 'C', _actif: false })).error).toBeNull();
    const ref = await gerant.rpc('plan_reference_comptes');
    expect((ref.data as { numero: string }[]).some(x => x.numero === commun)).toBe(false);
    const tous = await gerant.rpc('plan_reference_comptes', { _tous: true });
    expect((tous.data as { numero: string; origine: string }[]).find(x => x.numero === commun)?.origine).toBe('plateforme');
    expect((await gerant.from('plan_comptable').select('id').eq('entreprise_id', entreprise).eq('numero', commun)).data).toHaveLength(1);
  });
  it('l’état des référentiels est réservé aux opérateurs et compte les comptes propres', async () => {
    expect((await gerant.rpc('plateforme_referentiels_etat')).error).not.toBeNull();
    const e = await operateur.rpc('plateforme_referentiels_etat');
    expect(e.error).toBeNull();
    expect(e.data.plan.comptes_referentiel).toBeGreaterThan(1000);
    const d = (e.data.dossiers as { entreprise_id: string; propres: number; manquants: number; exemples_propres: string[] }[]).find(x => x.entreprise_id === entreprise);
    expect(d?.exemples_propres).toContain('6011999 Compte propre de recette');
    expect(d?.exemples_propres.some(x => x.startsWith(commun))).toBe(false);
    expect(d?.manquants).toBe(0); // 6011999 ; le compte commun, même désactivé, reste reconnu comme compte de la plateforme
  });
});
