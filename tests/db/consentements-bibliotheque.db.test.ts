import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

// Bibliothèque des textes de consentement (migration 0079).
// Comptes et structures fictifs dédiés ; aucun texte réel ni aucune structure cliente n'est touchée.
const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY, key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run = randomBytes(8).toString('hex');
const TEXTE = 'Texte fictif de recette technique uniquement, sans valeur juridique ni usage clinique. '.repeat(2);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=';
let admin: SupabaseClient, owner: SupabaseClient, secretaire: SupabaseClient, etranger: SupabaseClient;
let sid = '', autreSid = '', patient = '', autrePatient = '', modele = '';

describe.skipIf(!url || !service || !key)('Bibliothèque des textes de consentement — API réelle', () => {
  beforeAll(async () => {
    if (!url || !service || !key) throw new Error('Configuration absente');
    admin = createClient(url, service);
    async function compte(n: string) {
      const email = `p0-consent-lib-${n}-${run}@gsante.test`, password = randomBytes(24).toString('base64url');
      const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (u.error || !u.data.user) throw new Error('Compte absent');
      const c = createClient(url, key, { auth: { persistSession: false } });
      const login = await c.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
      return { c, id: u.data.user.id };
    }
    owner = (await compte('owner')).c;
    const sec = await compte('secretaire'); secretaire = sec.c;
    etranger = (await compte('etranger')).c;
    const s = await owner.rpc('sante_creer_structure', { _type: 'cabinet', _nom: `TEST bibliotheque consentements ${run}`, _role_metier: 'medecin' }); if (s.error) throw s.error; sid = s.data;
    const s2 = await etranger.rpc('sante_creer_structure', { _type: 'cabinet', _nom: `TEST bibliotheque autre ${run}`, _role_metier: 'medecin' }); if (s2.error) throw s2.error; autreSid = s2.data;
    const m = await admin.from('structure_memberships').insert({ structure_id: sid, user_id: sec.id, statut: 'actif' }).select('id').single(); if (m.error) throw m.error;
    await admin.from('medical_user_roles').insert({ membership_id: m.data?.id, role: 'secretaire' });
    const p = await owner.rpc('sante_creer_patient', { _structure_id: sid, _nom: 'RECETTE', _prenoms: `Consent${run}`, _sexe: 'F', _date_naissance: '1990-04-12', _consentement: true, _ignorer_doublons: true }); if (p.error) throw p.error; patient = p.data;
    const p2 = await etranger.rpc('sante_creer_patient', { _structure_id: autreSid, _nom: 'RECETTE', _prenoms: `Autre${run}`, _sexe: 'M', _date_naissance: '1985-01-01', _consentement: true, _ignorer_doublons: true }); if (p2.error) throw p2.error; autrePatient = p2.data;
  });

  it('l’administrateur enregistre un texte ; une version en double est refusée', async () => {
    const r = await owner.rpc('sante_modele_consentement_creer', { _structure_id: sid, _type: 'traitement_donnees', _version: 'TEST-v1', _titre: 'Données de santé (recette)', _texte: TEXTE, _valide_par: 'Recette' });
    expect(r.error).toBeNull(); modele = r.data;
    const d = await owner.rpc('sante_modele_consentement_creer', { _structure_id: sid, _type: 'traitement_donnees', _version: 'TEST-v1', _titre: 'Doublon', _texte: TEXTE });
    expect(d.error?.message).toMatch(/existe déjà/);
  });

  it('seul l’administrateur enregistre ou archive ; un étranger ne lit rien', async () => {
    expect((await secretaire.rpc('sante_modele_consentement_creer', { _structure_id: sid, _type: 'soins', _version: 'TEST-v1', _titre: 'Soins', _texte: TEXTE })).error?.message).toMatch(/Accès refusé/);
    expect((await secretaire.rpc('sante_modele_consentement_archiver', { _modele_id: modele })).error?.message).toMatch(/Accès refusé/);
    expect((await etranger.rpc('sante_modele_consentement_creer', { _structure_id: sid, _type: 'soins', _version: 'TEST-v9', _titre: 'Soins', _texte: TEXTE })).error?.message).toMatch(/Accès refusé/);
    expect((await secretaire.from('sante_consentement_modeles').select('id').eq('structure_id', sid)).data).toHaveLength(1);
    expect((await etranger.from('sante_consentement_modeles').select('id').eq('structure_id', sid)).data).toHaveLength(0);
  });

  it('aucune écriture directe : le texte enregistré est immuable', async () => {
    expect((await owner.from('sante_consentement_modeles').update({ texte: `${TEXTE} modifié` }).eq('id', modele)).error).toBeTruthy();
    expect((await owner.from('sante_consentement_modeles').insert({ structure_id: sid, type: 'soins', version: 'TEST-x', titre: 'Direct', texte: TEXTE, texte_sha256: 'x' })).error).toBeTruthy();
    expect((await admin.from('sante_consentement_modeles').update({ texte: `${TEXTE} modifié` }).eq('id', modele)).error?.message).toMatch(/ne peut pas être modifié/);
    expect((await admin.from('sante_consentement_modeles').delete().eq('id', modele)).error?.message).toMatch(/ne peut pas être supprimé/);
  });

  it('la secrétaire fait signer le texte choisi : type, version et empreinte viennent du modèle', async () => {
    const r = await secretaire.rpc('sante_signer_consentement_modele', { _patient_id: patient, _modele_id: modele, _accorde: true, _signataire_nom: 'Patient fictif', _signataire_qualite: 'patient', _signature_png: PNG });
    expect(r.error).toBeNull();
    const c = await admin.from('sante_consentements').select('modele_id, type, version_texte, texte, texte_sha256').eq('id', r.data).single();
    const m = await admin.from('sante_consentement_modeles').select('texte_sha256').eq('id', modele).single();
    expect(c.data).toMatchObject({ modele_id: modele, type: 'traitement_donnees', version_texte: 'TEST-v1', texte: TEXTE, texte_sha256: m.data?.texte_sha256 });
  });

  it('un texte d’une autre structure ne peut pas être utilisé', async () => {
    const r = await etranger.rpc('sante_signer_consentement_modele', { _patient_id: autrePatient, _modele_id: modele, _accorde: true, _signataire_nom: 'X Y', _signataire_qualite: 'patient', _signature_png: PNG });
    expect(r.error?.message).toMatch(/introuvable/);
  });

  it('un texte archivé n’est plus signable ni réactivable ; une nouvelle version reprend le relais', async () => {
    expect((await owner.rpc('sante_modele_consentement_archiver', { _modele_id: modele })).error).toBeNull();
    expect((await secretaire.rpc('sante_signer_consentement_modele', { _patient_id: patient, _modele_id: modele, _accorde: true, _signataire_nom: 'X Y', _signataire_qualite: 'patient', _signature_png: PNG })).error?.message).toMatch(/archivé/);
    expect((await admin.from('sante_consentement_modeles').update({ actif: true }).eq('id', modele)).error?.message).toMatch(/ne peut pas être réactivé/);
    expect((await owner.rpc('sante_modele_consentement_creer', { _structure_id: sid, _type: 'traitement_donnees', _version: 'TEST-v2', _titre: 'Données de santé (recette)', _texte: TEXTE })).error).toBeNull();
  });
});
