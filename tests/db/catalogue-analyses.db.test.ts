import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

// Catalogue d'analyses : fiche analyse (0078) et import tableur des références (0080).
// Comptes et laboratoire fictifs dédiés ; aucune structure cliente touchée.
const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY, key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run = randomBytes(8).toString('hex');
let admin: SupabaseClient, bio: SupabaseClient, secretaire: SupabaseClient, etranger: SupabaseClient;
let sid = '', gly = '', nfs = '';

describe.skipIf(!url || !service || !key)('Catalogue d’analyses — API réelle', () => {
  beforeAll(async () => {
    if (!url || !service || !key) throw new Error('Configuration absente');
    admin = createClient(url, service);
    async function compte(n: string) {
      const email = `p0-catalogue-${n}-${run}@gsante.test`, password = randomBytes(24).toString('base64url');
      const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (u.error || !u.data.user) throw new Error('Compte absent');
      const c = createClient(url, key, { auth: { persistSession: false } });
      const login = await c.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
      return { c, id: u.data.user.id };
    }
    bio = (await compte('bio')).c;
    const sec = await compte('secretaire'); secretaire = sec.c;
    etranger = (await compte('etranger')).c;
    const s = await bio.rpc('sante_creer_structure', { _type: 'laboratoire', _nom: `TEST catalogue ${run}`, _role_metier: 'biologiste' }); if (s.error) throw s.error; sid = s.data;
    const m = await admin.from('structure_memberships').insert({ structure_id: sid, user_id: sec.id, statut: 'actif' }).select('id').single(); if (m.error) throw m.error;
    await admin.from('medical_user_roles').insert({ membership_id: m.data?.id, role: 'secretaire' });
    const a = await admin.from('sante_analyses').insert([
      { structure_id: sid, code: 'TGLY', libelle: 'Glycémie (recette)', section: 'biochimie', delai_heures: 24, tarif: 1000, actif: false },
      { structure_id: sid, code: 'TNFS', libelle: 'NFS (recette)', section: 'hematologie', delai_heures: 24, tarif: 1000, actif: false },
    ]).select('id, code'); if (a.error) throw a.error;
    gly = a.data.find(x => x.code === 'TGLY')!.id; nfs = a.data.find(x => x.code === 'TNFS')!.id;
  });

  it('une analyse sans paramètre ne peut pas être activée', async () => {
    const r = await bio.from('sante_analyses').update({ actif: true }).eq('id', gly);
    expect(r.error?.message).toMatch(/au moins un paramètre/);
  });

  it('la secrétaire ne peut ni importer ni modifier le catalogue ; un étranger non plus', async () => {
    const lignes = [{ code_analyse: 'TGLY', code_parametre: 'GLU', bas: '0,7', haut: '1,1' }];
    expect((await secretaire.rpc('sante_catalogue_importer_references', { _structure_id: sid, _lignes: lignes })).error?.message).toMatch(/Accès refusé/);
    expect((await etranger.rpc('sante_catalogue_importer_references', { _structure_id: sid, _lignes: lignes })).error?.message).toMatch(/Accès refusé/);
    await secretaire.from('sante_analyses').update({ section: 'urines' }).eq('id', gly);
    expect((await admin.from('sante_analyses').select('section').eq('id', gly).single()).data?.section).toBe('biochimie');
  });

  it('le biologiste importe paramètres et références ; le réimport ne crée pas de doublon', async () => {
    const lignes = [
      { code_analyse: 'tgly', tube: 'Fluoré', a_jeun: 'oui', code_parametre: 'glu', libelle_parametre: 'Glucose', unite: 'g/L', decimales: '2', bas: '0,7', haut: '1,1', critique_bas: '0,4', critique_haut: '4' },
      { code_analyse: 'TGLY', code_parametre: 'GLU', sexe: 'F', age_min_ans: '18', age_max_ans: '150', bas: '0,65', haut: '1,05' },
      { code_analyse: 'TNFS', code_parametre: 'HB', libelle_parametre: 'Hémoglobine', unite: 'g/dL', decimales: '1' },
    ];
    const r = await bio.rpc('sante_catalogue_importer_references', { _structure_id: sid, _lignes: lignes });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ analyses: 2, parametres: 2, references: 2 });
    expect((await bio.rpc('sante_catalogue_importer_references', { _structure_id: sid, _lignes: lignes })).error).toBeNull();
    const p = await admin.from('sante_analyse_parametres').select('id').in('analyse_id', [gly, nfs]);
    expect(p.data).toHaveLength(2);
    const v = await admin.from('sante_valeurs_reference').select('id').eq('structure_id', sid);
    expect(v.data).toHaveLength(2);
    expect((await admin.from('sante_analyses').select('tube, jeune, actif').eq('id', gly).single()).data).toEqual({ tube: 'Fluoré', jeune: true, actif: false });
  });

  it('une ligne refusée annule tout l’import', async () => {
    const r = await bio.rpc('sante_catalogue_importer_references', { _structure_id: sid, _lignes: [
      { code_analyse: 'TNFS', code_parametre: 'PLQ' },
      { code_analyse: 'TGLY', code_parametre: 'GLU', bas: '2', haut: '1' },
    ] });
    expect(r.error?.message).toMatch(/Ligne 2 : bas supérieur à haut/);
    expect((await admin.from('sante_analyse_parametres').select('id').eq('analyse_id', nfs).eq('code', 'PLQ')).data).toHaveLength(0);
  });

  it('refuse une analyse d’une autre structure ou inconnue', async () => {
    expect((await bio.rpc('sante_catalogue_importer_references', { _structure_id: sid, _lignes: [{ code_analyse: 'INCONNU', code_parametre: 'X' }] })).error?.message).toMatch(/absente du catalogue/);
  });

  it('après import, l’analyse complète s’active', async () => {
    expect((await bio.from('sante_analyses').update({ actif: true }).eq('id', gly)).error).toBeNull();
  });
});
