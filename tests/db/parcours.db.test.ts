/**
 * Sprint 2 — parcours complet d'un cabinet neuf, comme un vrai client :
 * création → accueil → consultation → ordonnance → facture → caisse → comptabilité.
 * Chaque étape est faite par la personne qui a le rôle correspondant (API réelle).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const url = process.env.SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const key = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)!;
const enabled = Boolean(url && service && key);
const run = randomBytes(6).toString('hex');
let admin: SupabaseClient;

async function compte(nom: string) {
  const email = `p0-parcours-${nom}-${run}@gsante.test`;
  const password = randomBytes(24).toString('base64url');
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error) throw u.error;
  const c = createClient(url, key, { auth: { persistSession: false } });
  const l = await c.auth.signInWithPassword({ email, password });
  if (l.error) throw l.error;
  return { c, id: u.data.user!.id };
}

describe.skipIf(!enabled)('Parcours cabinet de bout en bout', () => {
  let medecin: SupabaseClient, secretaire: SupabaseClient, caissier: SupabaseClient, comptable: SupabaseClient;
  let structure = '', entreprise = '', patient = '', consultation = '', facture = '';

  beforeAll(async () => {
    admin = createClient(url, service, { auth: { persistSession: false } });
    const m = await compte('medecin');
    medecin = m.c;
    const st = await medecin.rpc('sante_creer_structure', { _type: 'cabinet', _nom: `TEST parcours ${run}`, _role_metier: 'medecin' });
    if (st.error) throw st.error;
    structure = st.data as string;
    entreprise = (await admin.from('structures').select('entreprise_id').eq('id', structure).single()).data!.entreprise_id;
    for (const [nom, role] of [['secretaire', 'secretaire'], ['caissier', 'caissier'], ['comptable', 'comptable']] as const) {
      const u = await compte(nom);
      const ms = await admin.from('structure_memberships').insert({ structure_id: structure, user_id: u.id, statut: 'actif' }).select('id').single();
      if (ms.error) throw ms.error;
      await admin.from('medical_user_roles').insert({ membership_id: ms.data.id, role });
      if (nom === 'secretaire') secretaire = u.c; else if (nom === 'caissier') caissier = u.c; else comptable = u.c;
    }
  }, 90_000);

  it('accueil : la secrétaire crée le dossier patient', async () => {
    const p = await secretaire.rpc('sante_creer_patient', { _structure_id: structure, _nom: 'NDIAYE', _prenoms: `Awa${run}`, _sexe: 'F', _date_naissance: '1990-04-12', _consentement: true });
    expect(p.error).toBeNull();
    patient = p.data as string;
  });

  it('consultation : le médecin consulte, prescrit et clôture', async () => {
    const pr = await admin.from('sante_praticiens').insert({ structure_id: structure, nom: 'Dr Parcours' }).select('id').single();
    const c = await medecin.rpc('sante_demarrer_consultation', { _patient_id: patient, _praticien_id: pr.data!.id, _rdv_id: null, _motif: 'Fièvre' });
    expect(c.error).toBeNull();
    consultation = c.data as string;
    const o = await medecin.rpc('sante_emettre_ordonnance', { _consultation_id: consultation, _lignes: [{ medicament: 'Paracétamol 500mg', posologie: '1 cp x 3/j' }], _recommandations: null });
    expect(o.error).toBeNull();
    const d = await medecin.from('sante_consultations').update({ diagnostic: 'Paludisme simple', examen: 'T 38,5 °C' }).eq('id', consultation);
    expect(d.error).toBeNull();
    const cl = await medecin.rpc('sante_cloturer_consultation', { _consultation_id: consultation });
    expect(cl.error).toBeNull();
  });

  it('facture, caisse et comptabilité : 10 000 FCFA encaissés puis comptabilisés', async () => {
    const f = await caissier.rpc('sante_creer_facture', { _patient_id: patient, _lignes: [{ libelle: 'Consultation générale', prix_unitaire: 10000 }], _assurance_id: null, _remise: 0, _motif_remise: null, _consultation_id: consultation, _demande_id: null });
    expect(f.error).toBeNull();
    facture = f.data as string;
    const s = await caissier.rpc('sante_ouvrir_caisse', { _structure_id: structure, _fond: 5000 });
    expect(s.error).toBeNull();
    const e = await caissier.rpc('sante_encaisser', { _facture_id: facture, _mode: 'especes', _montant: 10000, _reference: null });
    expect(e.error).toBeNull();
    const ev = await admin.from('sante_compta_evenements').select('statut, derniere_erreur').eq('structure_id', structure);
    expect(ev.data!.length).toBeGreaterThanOrEqual(2);
    expect(ev.data!.filter(x => x.statut !== 'comptabilise'), JSON.stringify(ev.data)).toEqual([]);
    const fe = await caissier.rpc('sante_fermer_caisse', { _session_id: s.data, _compte: 15000 });
    expect(fe.error).toBeNull();
    const r = await comptable.rpc('sante_outbox_resume', { _structure_id: structure });
    expect(r.data).toMatchObject({ en_attente: 0, en_erreur: 0 });
    const { count } = await admin.from('ecritures').select('id', { count: 'exact', head: true }).eq('entreprise_id', entreprise);
    expect(count).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('cloisonnement : la caissière ne lit pas la consultation', async () => {
    const r = await caissier.from('sante_consultations').select('id, motif').eq('id', consultation);
    expect(r.data ?? []).toHaveLength(0);
  });
});
