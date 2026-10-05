// Rappels de rendez-vous par SMS (J-1). Aucun contenu clinique dans le message.
// Déclenchement : appel planifié (secret cron) ou bouton d'un administrateur/secrétaire (JWT + rôle vérifié).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { authenticateCronRequest } from '../_shared/cron-auth.ts';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

function e164(tel: string | null): string | null {
  if (!tel) return null;
  let t = tel.replace(/[\s.\-()]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (/^[0-9]{9}$/.test(t)) t = '+221' + t; // numéro sénégalais local
  return /^\+[1-9][0-9]{7,14}$/.test(t) ? t : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let structureFiltre: string | null = null;

  let isCron = false;
  const tache = req.headers.get('x-tache-planifiee') ?? '';
  if (/^[0-9a-f]{64}$/.test(tache)) {
    const { data: cfg } = await admin.from('sante_cron_config').select('jeton').eq('id', 1).maybeSingle();
    isCron = Boolean(cfg?.jeton) && cfg!.jeton === tache;
  }
  if (!isCron && Deno.env.get('LOVABLE_CRON_SECRET')) isCron = authenticateCronRequest(req.clone()) === null;
  if (!isCron) {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Non autorisé' }, 401);
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await user.auth.getClaims(auth.slice(7));
    if (!claims?.claims) return json({ error: 'Non autorisé' }, 401);
    const body = await req.json().catch(() => ({}));
    const sid = typeof body?.structure_id === 'string' && /^[0-9a-f-]{36}$/.test(body.structure_id) ? body.structure_id : null;
    if (!sid) return json({ error: 'structure_id requis' }, 400);
    const { data: ok } = await user.rpc('has_any_medical_role', { _structure_id: sid, _roles: ['admin_structure', 'secretaire'] });
    if (!ok) return json({ error: 'Accès refusé' }, 403);
    structureFiltre = sid;
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
  const fournisseur = Boolean(LOVABLE_API_KEY && TWILIO_API_KEY);

  const demain = new Date(); demain.setUTCDate(demain.getUTCDate() + 1);
  const debut = new Date(Date.UTC(demain.getUTCFullYear(), demain.getUTCMonth(), demain.getUTCDate()));
  const fin = new Date(debut.getTime() + 86_400_000);

  let q = admin.from('sante_rendez_vous')
    .select('id, debut, structure_id, patient:sante_patients(telephone), structure:structures(nom, telephone, sms_expediteur, rappels_sms_actifs)')
    .eq('statut', 'planifie').gte('debut', debut.toISOString()).lt('debut', fin.toISOString()).limit(500);
  if (structureFiltre) q = q.eq('structure_id', structureFiltre);
  const { data: rdvs, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const bilan = { envoyes: 0, echecs: 0, sans_fournisseur: 0, ignores: 0 };
  for (const r of rdvs ?? []) {
    const s: any = r.structure, p: any = r.patient;
    const to = e164(p?.telephone);
    if (!s?.rappels_sms_actifs || !to) { bilan.ignores++; continue; }
    const { data: deja } = await admin.from('sante_rappels').select('id, statut').eq('rdv_id', r.id).eq('canal', 'sms').maybeSingle();
    if (deja && deja.statut === 'envoye') { bilan.ignores++; continue; }
    const base = { structure_id: r.structure_id, rdv_id: r.id, canal: 'sms' };
    if (!fournisseur || !s.sms_expediteur) {
      await admin.from('sante_rappels').upsert({ ...base, statut: 'sans_fournisseur', erreur: !fournisseur ? 'Fournisseur SMS non connecté' : 'Numéro expéditeur manquant' }, { onConflict: 'rdv_id,canal' });
      bilan.sans_fournisseur++; continue;
    }
    const h = new Date(r.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' });
    const d = new Date(r.debut).toLocaleDateString('fr-FR', { timeZone: 'Africa/Dakar' });
    const Body = `Rappel : rendez-vous le ${d} à ${h} – ${s.nom}.${s.telephone ? ` Pour annuler : ${s.telephone}.` : ''}`;
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': TWILIO_API_KEY!, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: s.sms_expediteur, Body }),
    });
    const txt = await res.text();
    if (!res.ok) {
      console.error(`SMS échec [${res.status}]`); // pas de numéro ni de contenu dans les journaux
      await admin.from('sante_rappels').upsert({ ...base, statut: 'echec', erreur: `HTTP ${res.status}: ${txt.slice(0, 200)}` }, { onConflict: 'rdv_id,canal' });
      bilan.echecs++; continue;
    }
    const sid = (() => { try { return JSON.parse(txt).sid; } catch { return null; } })();
    await admin.from('sante_rappels').upsert({ ...base, statut: 'envoye', fournisseur_id: sid, envoye_le: new Date().toISOString(), erreur: null }, { onConflict: 'rdv_id,canal' });
    bilan.envoyes++;
  }
  return json({ ok: true, fournisseur, ...bilan });
});
