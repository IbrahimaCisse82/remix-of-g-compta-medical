import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run = randomBytes(8).toString('hex');
let c: SupabaseClient, sid = '', pid = '', aid = '', param = '', demande = '';
describe.skipIf(!url || !service || !key)('Livraison laboratoire — rectificatif et sous-traitance', () => {
  beforeAll(async () => {
    if (!url || !service || !key) throw new Error('Configuration absente');
    const admin = createClient(url, service);
    const email = `p0-livraison-labo-${run}@gsante.test`, password = randomBytes(24).toString('base64url');
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (user.error || !user.data.user) throw new Error('Compte absent');
    c = createClient(url, key, { auth: { persistSession: false } });
    const login = await c.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
    const st = await c.rpc('sante_creer_structure', { _type: 'laboratoire', _nom: `TEST livraison labo ${run}`, _role_metier: 'biologiste' }); if (st.error) throw st.error; sid = st.data;
    const config = await c.from('structures').update({ derogation_validation_unique: true }).eq('id', sid); if (config.error) throw config.error;
    const pr = await c.from('sante_praticiens').insert({ structure_id: sid, nom: 'Biologiste recette', user_id: user.data.user.id, numero_ordre: 'TEST-RECETTE' }); if (pr.error) throw pr.error;
    const p = await c.rpc('sante_creer_patient', { _structure_id: sid, _nom: 'RECETTE', _prenoms: run, _sexe: 'F' }); if (p.error) throw p.error; pid = p.data;
    const a = await c.from('sante_analyses').insert({ structure_id: sid, code: 'TXT', libelle: 'Résultat texte fictif', section: 'biochimie', tarif: 0 }).select('id').single(); if (a.error) throw a.error; aid = a.data.id;
    const ap = await c.from('sante_analyse_parametres').insert({ structure_id: sid, analyse_id: aid, code: 'TXT', libelle: 'Texte recette', type: 'texte' }).select('id').single(); if (ap.error) throw ap.error; param = ap.data.id;
    const d = await c.rpc('sante_creer_demande_labo', { _patient_id: pid, _analyses: [aid] }); if (d.error) throw d.error; demande = d.data;
    const pre = await c.rpc('sante_prelever', { _demande_id: demande, _identifiants: ['nom', 'numero_dossier'], _site: 'Recette', _conditions: {} }); if (pre.error) throw pre.error;
  });
  it('le retour sous-traitant est persistant et ne peut être enregistré deux fois', async () => {
    const e = await c.rpc('sante_envoyer_sous_traitance', { _demande_id: demande, _analyse_id: aid, _laboratoire: 'Laboratoire fictif', _reference: 'TEST' });
    expect(e.error).toBeNull();
    const r = await c.rpc('sante_recevoir_sous_traitance', { _id: e.data, _reference: '' }); expect(r.error).toBeNull();
    const saved = await c.from('sante_sous_traitance').select('statut,recu_par,recu_le,reference_externe').eq('id', e.data).single();
    expect(saved.error).toBeNull(); expect(saved.data).toMatchObject({ statut: 'recu', reference_externe: 'TEST' }); expect(saved.data?.recu_le).toBeTruthy(); expect(saved.data?.recu_par).toBeTruthy();
    expect((await c.rpc('sante_recevoir_sous_traitance', { _id: e.data, _reference: '' })).error).toBeTruthy();
  });
  it('le parcours complet conserve original, version, empreinte et alerte de traitement du rectificatif', async () => {
    for (const statut of ['recue', 'en_analyse']) expect((await c.rpc('sante_avancer_demande', { _demande_id: demande, _statut: statut })).error).toBeNull();
    expect((await c.rpc('sante_saisir_resultat', { _demande_id: demande, _parametre_id: param, _valeur_num: null, _valeur_texte: 'original' })).error).toBeNull();
    for (const niveau of ['technique', 'biologique']) expect((await c.rpc('sante_valider_demande', { _demande_id: demande, _niveau: niveau })).error).toBeNull();
    const original = await c.from('sante_demandes_labo').select('version,cr_hash').eq('id', demande).single(); expect(original.error).toBeNull(); expect(original.data?.version).toBe(1);
    const correction = await c.rpc('sante_rectifier_resultat_v2', { _demande_id: demande, _parametre_id: param, _valeur_num: null, _valeur_texte: '0012', _motif: 'Correction fictive de recette', _traitement_deja_prescrit: true });
    expect(correction.error).toBeNull(); expect(correction.data).toBe(2);
    const historique = await c.from('sante_rectificatifs').select('ancienne_valeur_texte,nouvelle_valeur_texte,traitement_deja_prescrit').eq('demande_id', demande).single();
    expect(historique.error).toBeNull(); expect(historique.data).toEqual({ ancienne_valeur_texte: 'original', nouvelle_valeur_texte: '0012', traitement_deja_prescrit: true });
    const r = await c.from('sante_resultats').select('valeur_num,valeur_texte').eq('demande_id', demande).single(); expect(r.data).toEqual({ valeur_num: null, valeur_texte: '0012' });
    const after = await c.from('sante_demandes_labo').select('version,cr_hash').eq('id', demande).single(); expect(after.data?.version).toBe(2); expect(after.data?.cr_hash).not.toBe(original.data?.cr_hash);
  });
  it('l’ancien appel rectificatif n’est pas exposé aux utilisateurs', async () => {
    expect((await c.rpc('sante_rectifier_resultat', { _demande_id: demande, _parametre_id: param, _valeur_num: null, _valeur_texte: 'interdit', _motif: 'Test accès ancien appel' })).error).toBeTruthy();
  });
});