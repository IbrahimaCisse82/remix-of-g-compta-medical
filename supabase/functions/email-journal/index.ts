import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { listEmailLogs, EmailAPIError } from 'npm:@lovable.dev/email-js@0.4.0';
import { z } from 'npm:zod@3.25.76';
import { journalAccessAllowed, scopedEmailEvents } from '../_shared/email-journal.ts';

const schema = z.object({
  structure_id: z.string().uuid(),
  since: z.string().datetime().optional(),
  cursor: z.string().max(2048).optional(),
}).strict();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode refusée' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) return json({ error: 'Service indisponible' }, 503);
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Connexion requise' }, 401);
    const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: authError } = await client.auth.getClaims(auth.slice(7));
    if (authError || !claims?.claims) return json({ error: 'Connexion requise' }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Filtres invalides' }, 400);
    const { structure_id, since, cursor } = parsed.data;
    const [role, mfa] = await Promise.all([
      client.rpc('is_structure_admin', { _structure_id: structure_id }), client.rpc('mfa_conforme'),
    ]);
    if (role.error || mfa.error || !journalAccessAllowed(role.data, mfa.data)) return json({ error: 'Accès réservé aux administrateurs de cette structure. Vérifiez aussi votre double authentification.' }, 403);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    let query = admin.from('sante_rappels').select('id,structure_id,fournisseur_id,statut,erreur,created_at,envoye_le').eq('structure_id', structure_id).eq('canal', 'email').order('created_at', { ascending: false }).limit(1000);
    if (since) query = query.gte('created_at', since);
    const { data: sources, error } = await query;
    if (error) return json({ error: 'Lecture du journal impossible', code: error.code }, 500);
    // Empty state is intentional: auth emails have no structure ownership.
    if (!sources?.length) return json({ events: [], history_starts_at: null, pagination: { next_cursor: null, has_more: false }, warning: 'Aucun envoi métier rattaché à cette structure. Les e-mails de connexion restent dans Plus → E-mails.' });
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json({ events: scopedEmailEvents(structure_id, sources, []), warning: 'Suivi fournisseur indisponible', history_starts_at: null, pagination: { next_cursor: null, has_more: false } });
    const logs = await listEmailLogs({ since, cursor, limit: 100 }, { apiKey });
    // Recheck access after the external request, before returning any PII.
    const [roleAgain, mfaAgain] = await Promise.all([client.rpc('is_structure_admin', { _structure_id: structure_id }), client.rpc('mfa_conforme')]);
    if (roleAgain.error || mfaAgain.error || !journalAccessAllowed(roleAgain.data, mfaAgain.data)) return json({ error: 'Autorisation révoquée' }, 403);
    return json({ events: scopedEmailEvents(structure_id, sources, logs.data), history_starts_at: logs.history_starts_at, pagination: logs.pagination, warning: sources.length === 1000 ? 'Affichage limité aux 1 000 derniers envois ; réduisez la période.' : null });
  } catch (error) {
    if (error instanceof EmailAPIError) {
      console.error('email-journal', error.code, error.status);
      return json({ error: 'Le suivi des e-mails est indisponible.', code: error.code, status: error.status }, error.status >= 400 && error.status <= 599 ? error.status : 502);
    }
    console.error('email-journal: unexpected failure');
    return json({ error: 'Lecture du journal impossible' }, 500);
  }
});