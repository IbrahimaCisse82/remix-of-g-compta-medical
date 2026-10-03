// Edge Function: emit-facture-dgid
// Simule la transmission d'une facture vers la DGID (préparation norme e-facture Sénégal).
// En mode test: génère uuid_dgid, hash, qr_code et marque statut=acceptee.
// En mode prod: à brancher sur l'API DGID officielle (endpoint fourni par entreprise).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { facture_id } = body;
    if (!facture_id || typeof facture_id !== "string") {
      return new Response(JSON.stringify({ error: "facture_id requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: facture, error: fErr } = await supabase
      .from("factures").select("*").eq("id", facture_id).maybeSingle();
    if (fErr || !facture) {
      return new Response(JSON.stringify({ error: "facture introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cfg } = await supabase
      .from("dgid_config").select("*").eq("entreprise_id", facture.entreprise_id).maybeSingle();

    const mode = cfg?.mode ?? "test";

    // Génération UUID + hash + QR
    const uuid_dgid = crypto.randomUUID();
    const payload = {
      uuid_dgid,
      numero: facture.numero,
      date: facture.date_facture,
      ttc: facture.total_ttc,
      ht: facture.total_ht,
      tva: facture.total_tva,
      ninea_emetteur: cfg?.ninea_transmetteur ?? null,
    };
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(payload)));
    const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    const qr_code = `DGID|${uuid_dgid}|${facture.numero}|${facture.total_ttc}|${hash.slice(0, 16)}`;

    let statut = "transmise";
    let response_data: unknown = { simulated: true, mode };
    const DGID_HOSTS = (Deno.env.get("DGID_ALLOWED_HOSTS") || "").split(",").map(h => h.trim()).filter(Boolean);
    let endpointOk = false;
    try { const u = new URL(cfg?.endpoint ?? ""); endpointOk = u.protocol === "https:" && DGID_HOSTS.includes(u.hostname); } catch { endpointOk = false; }
    if (mode === "prod" && !endpointOk) {
      statut = "rejetee";
      response_data = { error: "Adresse DGID non autorisée : l'intégration officielle n'est pas encore branchée." };
    } else if (mode === "prod" && cfg?.endpoint) {
      try {
        const r = await fetch(cfg.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        response_data = await r.json().catch(() => ({ status: r.status }));
        statut = r.ok ? "acceptee" : "rejetee";
      } catch (e) {
        statut = "rejetee";
        response_data = { error: String(e) };
      }
    } else {
      statut = "simulee"; // mode test : simulation, jamais « acceptée »
    }

    await supabase.from("factures").update({
      uuid_dgid, qr_code, hash_certif: hash,
      statut_dgid: statut, date_transmission: new Date().toISOString(),
      dgid_mode: mode, dgid_error: statut === "rejetee" ? JSON.stringify(response_data) : null,
    }).eq("id", facture_id);

    await supabase.from("dgid_transmissions").insert({
      entreprise_id: facture.entreprise_id,
      facture_id, action: "emit", statut,
      payload, response: response_data as any,
    });

    return new Response(JSON.stringify({ ok: true, uuid_dgid, qr_code, statut, hash }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
