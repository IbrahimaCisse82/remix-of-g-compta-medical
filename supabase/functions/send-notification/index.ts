// Envoie une notification applicative (et prépare l'email — à activer via Lovable Emails plus tard).
import { corsFor } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';


Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: u } = await anon.auth.getUser(token);
    if (!u?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { entreprise_id, user_ids, type, titre, message, lien, meta } = body || {};
    if (!entreprise_id || !type || !titre) {
      return new Response(JSON.stringify({ error: 'entreprise_id, type et titre requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: allowed } = await anon.rpc('can_write_entreprise', { _entreprise_id: entreprise_id });
    if (allowed !== true) {
      return new Response(JSON.stringify({ error: 'Accès refusé à cette entreprise' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (Array.isArray(user_ids) && user_ids.length) {
      if (user_ids.length > 100 || !user_ids.every((u: unknown) => typeof u === 'string' && /^[0-9a-f-]{36}$/i.test(u))) {
        return new Response(JSON.stringify({ error: 'Destinataires invalides' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      for (const uid of user_ids) {
        const { data: ids } = await admin.rpc('get_user_entreprise_ids', { _user_id: uid });
        const membres = ((ids as unknown[]) || []).map((r: any) => typeof r === 'string' ? r : r?.get_user_entreprise_ids);
        if (!membres.includes(entreprise_id)) {
          return new Response(JSON.stringify({ error: 'Un destinataire n\'appartient pas à cette entreprise' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }
    if (typeof titre !== 'string' || titre.length > 200 || (message && String(message).length > 2000)) {
      return new Response(JSON.stringify({ error: 'Contenu invalide' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows: any[] = [];
    if (Array.isArray(user_ids) && user_ids.length) {
      for (const uid of user_ids) rows.push({ entreprise_id, user_id: uid, type, titre, message, lien, meta });
    } else {
      rows.push({ entreprise_id, type, titre, message, lien, meta });
    }
    const { error } = await admin.from('notifications').insert(rows);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Email hook: si la table email_send_log existe (Lovable Emails configuré),
    // on pourra brancher supabase.functions.invoke('send-transactional-email', …) ici.
    return new Response(JSON.stringify({ ok: true, count: rows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
