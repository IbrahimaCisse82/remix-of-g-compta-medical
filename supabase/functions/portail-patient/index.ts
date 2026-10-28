// Portail patient : consultation des comptes rendus validés et ordonnances.
// Accès par lien sécurisé 48 h (créé par le personnel) ou numéro de dossier + code SMS (session 24 h).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { SMS_ENABLED } from '../_shared/delivery-scope.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('');
const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
function e164(tel: string | null): string | null {
  if (!tel) return null;
  let t = tel.replace(/[\s.\-()]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (/^[0-9]{9}$/.test(t)) t = '+221' + t;
  return /^\+[1-9][0-9]{7,14}$/.test(t) ? t : null;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '');
  if (!SMS_ENABLED && ['demander_code', 'verifier_code'].includes(action)) {
    return json({ error: 'Accès par lien sécurisé uniquement. Demandez un lien à l’accueil.' }, 410);
  }
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnue';

  const limite = async (cle: string, max: number) => {
    const { count } = await admin.from('sante_portail_patient_essais').select('id', { count: 'exact', head: true }).eq('cle', cle).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= max) return true;
    await admin.from('sante_portail_patient_essais').insert({ cle });
    return false;
  };

  // 1) Personnel : créer un lien 48 h
  if (action === 'lien') {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Non autorisé' }, 401);
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await user.auth.getUser(auth.slice(7));
    if (!u?.user) return json({ error: 'Non autorisé' }, 401);
    const pid = typeof body.patient_id === 'string' && /^[0-9a-f-]{36}$/.test(body.patient_id) ? body.patient_id : null;
    if (!pid) return json({ error: 'patient_id requis' }, 400);
    const { data: p } = await admin.from('sante_patients').select('id, structure_id').eq('id', pid).maybeSingle();
    if (!p) return json({ error: 'Patient introuvable' }, 404);
    const { data: ok } = await user.rpc('has_any_medical_role', { _structure_id: p.structure_id, _roles: ['admin_structure', 'secretaire', 'medecin', 'biologiste'] });
    if (!ok) return json({ error: 'Accès refusé' }, 403);
    const heures = body.heures === 24 ? 24 : 48;
    const t = rand(32);
    await admin.from('sante_portail_patient').insert({ structure_id: p.structure_id, patient_id: p.id, type: 'lien', secret_hash: await sha(t), expire_le: new Date(Date.now() + heures * 3600_000).toISOString(), cree_par: u.user.id });
    await admin.from('medical_access_log').insert({ structure_id: p.structure_id, patient_id: p.id, user_id: u.user.id, ecran: 'portail', motif: 'Lien portail patient créé' }).then(() => {}, () => {});
    return json({ token: t, expire_heures: heures });
  }

  // 2) Patient : demander un code SMS
  if (action === 'demander_code') {
    const dossier = String(body.numero_dossier ?? '').trim().toUpperCase().slice(0, 40);
    const tel = e164(String(body.telephone ?? ''));
    const generique = { ok: true, message: 'Si les informations sont correctes, un code a été envoyé par SMS.' };
    if (!dossier || !tel) return json({ error: 'Numéro de dossier et téléphone requis' }, 400);
    if (await limite(`code:${ip}`, 5) || await limite(`code:${dossier}`, 3)) return json({ error: 'Trop de demandes. Réessayez dans une heure.' }, 429);
    const { data: p } = await admin.from('sante_patients').select('id, structure_id, telephone, statut, structure:structures(nom, sms_expediteur)').eq('numero_dossier', dossier).maybeSingle();
    const s: any = p?.structure;
    if (!p || p.statut === 'fusionne' || e164(p.telephone) !== tel) return json(generique);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY'), TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY ) return json({ error: 'Envoi de SMS indisponible pour cette structure. Demandez un lien à l’accueil.' }, 503);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    await admin.from('sante_portail_patient').update({ utilise: true }).eq('patient_id', p.id).eq('type', 'otp').eq('utilise', false);
    await admin.from('sante_portail_patient').insert({ structure_id: p.structure_id, patient_id: p.id, type: 'otp', secret_hash: await sha(`${p.id}:${code}`), expire_le: new Date(Date.now() + 10 * 60_000).toISOString() });
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': TWILIO_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: tel, From: s?.sms_expediteur || 'G-SANTE', Body: `${s.nom} : votre code d'accès est ${code}. Valable 10 minutes. Ne le communiquez à personne.` }),
    });
    if (!res.ok) { console.error(`OTP SMS échec [${res.status}]`); await res.text(); return json({ error: 'Envoi du SMS impossible. Réessayez plus tard.' }, 502); }
    await res.text();
    return json(generique);
  }

  // 3) Patient : vérifier le code → session 24 h
  if (action === 'verifier_code') {
    const dossier = String(body.numero_dossier ?? '').trim().toUpperCase().slice(0, 40);
    const code = String(body.code ?? '').trim();
    if (!dossier || !/^[0-9]{6}$/.test(code)) return json({ error: 'Code invalide' }, 400);
    if (await limite(`verif:${ip}`, 10)) return json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, 429);
    const { data: p } = await admin.from('sante_patients').select('id, structure_id').eq('numero_dossier', dossier).maybeSingle();
    if (!p) return json({ error: 'Code invalide ou expiré' }, 401);
    const { data: otp } = await admin.from('sante_portail_patient').select('*').eq('patient_id', p.id).eq('type', 'otp').eq('utilise', false).gt('expire_le', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!otp || otp.tentatives >= 5) return json({ error: 'Code invalide ou expiré' }, 401);
    if (otp.secret_hash !== await sha(`${p.id}:${code}`)) {
      await admin.from('sante_portail_patient').update({ tentatives: otp.tentatives + 1 }).eq('id', otp.id);
      return json({ error: 'Code invalide ou expiré' }, 401);
    }
    await admin.from('sante_portail_patient').update({ utilise: true }).eq('id', otp.id);
    const t = rand(32);
    await admin.from('sante_portail_patient').insert({ structure_id: p.structure_id, patient_id: p.id, type: 'session', secret_hash: await sha(t), expire_le: new Date(Date.now() + 24 * 3600_000).toISOString() });
    return json({ token: t });
  }

  // 3 bis) Lien à usage unique : date de naissance exigée, puis échange contre une session 24 h
  if (action === 'ouvrir_lien') {
    const t = String(body.token ?? ''); const dn = String(body.date_naissance ?? '').slice(0, 10);
    const generique = { error: 'Lien expiré, déjà utilisé ou informations incorrectes.' };
    if (!/^[0-9a-f]{64}$/.test(t) || !/^\d{4}-\d{2}-\d{2}$/.test(dn)) return json(generique, 401);
    if (await limite(`lien:${ip}`, 10)) return json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, 429);
    const { data: l } = await admin.from('sante_portail_patient').select('id, patient_id, structure_id, tentatives').eq('secret_hash', await sha(t)).eq('type', 'lien').eq('utilise', false).gt('expire_le', new Date().toISOString()).maybeSingle();
    if (!l || l.tentatives >= 3) return json(generique, 401);
    const { data: p } = await admin.from('sante_patients').select('date_naissance').eq('id', l.patient_id).single();
    if (!p?.date_naissance || String(p.date_naissance).slice(0, 10) !== dn) {
      await admin.from('sante_portail_patient').update({ tentatives: l.tentatives + 1 }).eq('id', l.id);
      return json(generique, 401);
    }
    const { data: pris } = await admin.from('sante_portail_patient').update({ utilise: true }).eq('id', l.id).eq('utilise', false).select('id');
    if (!pris?.length) return json(generique, 401);
    const s = rand(32);
    await admin.from('sante_portail_patient').insert({ structure_id: l.structure_id, patient_id: l.patient_id, type: 'session', secret_hash: await sha(s), expire_le: new Date(Date.now() + 24 * 3600_000).toISOString() });
    return json({ token: s });
  }

  // 4) Données (session uniquement)
  if (action === 'donnees') {
    const t = String(body.token ?? '');
    if (!/^[0-9a-f]{64}$/.test(t)) return json({ error: 'Lien invalide' }, 400);
    if (await limite(`data:${ip}`, 60)) return json({ error: 'Trop de requêtes' }, 429);
    const { data: acc } = await admin.from('sante_portail_patient').select('patient_id, structure_id, expire_le').eq('secret_hash', await sha(t)).eq('type', 'session').gt('expire_le', new Date().toISOString()).maybeSingle();
    if (!acc) return json({ error: 'Session expirée. Demandez un nouvel accès.' }, 401);
    const [{ data: patient }, { data: structure }, { data: ords }, { data: dems }] = await Promise.all([
      admin.from('sante_patients').select('numero_dossier, nom, prenoms, sexe, date_naissance').eq('id', acc.patient_id).single(),
      admin.from('structures').select('nom, adresse, telephone, ninea, rccm').eq('id', acc.structure_id).single(),
      admin.from('sante_ordonnances').select('id, numero, emise_le, recommandations, praticien:sante_praticiens(nom, specialite), lignes:sante_ordonnance_lignes(ordre, medicament, posologie, duree, quantite)').eq('patient_id', acc.patient_id).order('emise_le', { ascending: false }).limit(50),
      admin.from('sante_demandes_labo').select('id, numero, created_at, validee_le, prescripteur, resultats:sante_resultats(valeur_num, valeur_texte, drapeau, ref_bas, ref_haut, parametre:sante_analyse_parametres(libelle, unite, ordre, analyse:sante_analyses(sensible)))').eq('patient_id', acc.patient_id).eq('statut', 'validee').order('validee_le', { ascending: false }).limit(50),
    ]);
    // Résultats sensibles jamais en ligne : la demande entière est retenue pour remise en main propre
    const sensibles = (dems ?? []).filter((d: any) => (d.resultats ?? []).some((r: any) => r.parametre?.analyse?.sensible));
    const publiables = (dems ?? []).filter((d: any) => !sensibles.includes(d));
    const remettables = [];
    for (const d of publiables) { const { data: ok } = await admin.rpc('sante_cr_remettable', { _demande_id: d.id }); if (ok !== false) remettables.push(d); }
    await admin.from('medical_access_log').insert({ structure_id: acc.structure_id, patient_id: acc.patient_id, user_id: null, ecran: 'portail', motif: 'Consultation par le patient' }).then(() => {}, () => {});
    return json({ patient, structure, ordonnances: ords ?? [], comptes_rendus: remettables, en_attente_reglement: publiables.length - remettables.length, a_retirer_sur_place: sensibles.length, expire_le: acc.expire_le });
  }

  return json({ error: 'Action inconnue' }, 400);
});
