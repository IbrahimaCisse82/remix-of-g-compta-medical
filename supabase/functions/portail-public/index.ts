// Public read-only + limited-write portal (no JWT). Validates access via portail_acces + email.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { entreprise_id, email, section, action, jeton } = body || {};
    if (!entreprise_id || !email || !jeton || typeof jeton !== 'string' || jeton.length < 32) {
      return new Response(JSON.stringify({ error: 'Lien d\'accès incomplet' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Access check
    const { data: acces, error: accErr } = await supabase
      .from('portail_acces').select('*')
      .eq('entreprise_id', entreprise_id)
      .eq('email', String(email).toLowerCase().trim())
      .eq('jeton', jeton)
      .eq('actif', true).maybeSingle();

    if (accErr || !acces) {
      return new Response(JSON.stringify({ error: 'Accès refusé ou inactif' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    supabase.from('portail_acces').update({ derniere_connexion: new Date().toISOString() })
      .eq('id', acces.id).then(() => {});

    // ============ WRITE ACTIONS ============
    if (action === 'upload_document_url') {
      if (!acces.peut_deposer_documents) {
        return new Response(JSON.stringify({ error: 'Dépôt non autorisé' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { filename, mime_type, size, categorie } = body;
      if (!filename || typeof filename !== 'string' || filename.length > 200) {
        return new Response(JSON.stringify({ error: 'filename invalide' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (size && Number(size) > 20 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: 'Fichier > 20 Mo' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storage_path = `${entreprise_id}/portail/${Date.now()}_${safeName}`;
      const { data: signed, error: sErr } = await supabase.storage.from('ged')
        .createSignedUploadUrl(storage_path);
      if (sErr || !signed) {
        return new Response(JSON.stringify({ error: sErr?.message || 'signed url failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        upload_url: signed.signedUrl, token: signed.token, path: storage_path,
        // client will POST back to finalize with the same signed path
        finalize: { filename: safeName, mime_type, size, categorie },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'finalize_upload') {
      if (!acces.peut_deposer_documents) {
        return new Response(JSON.stringify({ error: 'Dépôt non autorisé' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { path, filename, mime_type, size, categorie } = body;
      if (!path || typeof path !== 'string' || !path.startsWith(`${entreprise_id}/portail/`)) {
        return new Response(JSON.stringify({ error: 'path invalide' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: doc, error: iErr } = await supabase.from('documents').insert({
        entreprise_id, ref_type: 'portail_depot',
        nom: filename || path.split('/').pop(),
        storage_path: path, mime_type: mime_type || null,
        taille_octets: size ? Number(size) : null,
        categorie: categorie || 'Portail',
        source: 'portail', depose_par_email: acces.email,
        statut_validation: 'en_attente',
      }).select('id').single();
      if (iErr) {
        return new Response(JSON.stringify({ error: iErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Notify cabinet users of this entreprise
      await supabase.from('notifications').insert({
        entreprise_id, type: 'portail_depot',
        titre: 'Nouveau document déposé',
        message: `${acces.email} a déposé "${filename || path}"`,
        lien: '/documents', meta: { document_id: doc.id, categorie },
      });
      return new Response(JSON.stringify({ ok: true, document_id: doc.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ READ SECTIONS ============
    const { data: entreprise } = await supabase
      .from('entreprises').select('id,nom,sigle,ninea,rccm,adresse,tel,forme_juridique,secteur,monnaie')
      .eq('id', entreprise_id).maybeSingle();

    const { data: exercices } = await supabase.from('exercices').select('*')
      .eq('entreprise_id', entreprise_id).order('annee', { ascending: false });
    const exercice = exercices?.[0] || null;

    const payload: Record<string, unknown> = {
      permissions: {
        bilan: acces.peut_voir_bilan, resultat: acces.peut_voir_resultat,
        documents: acces.peut_voir_documents, factures: acces.peut_voir_factures,
        depot: acces.peut_deposer_documents,
      },
      entreprise, exercice, exercices: exercices || [],
    };

    if ((section === 'bilan' || section === 'resultat') && exercice) {
      const ok = section === 'bilan' ? acces.peut_voir_bilan : acces.peut_voir_resultat;
      if (ok) {
        const { data: balance } = await supabase.from('balance').select('*').eq('exercice_id', exercice.id);
        payload.balance = balance || [];
      }
    }

    if (section === 'documents' && acces.peut_voir_documents) {
      const { data: documents } = await supabase.from('documents')
        .select('id,nom,categorie,taille_octets,mime_type,tags,created_at,storage_path,source,statut_validation')
        .eq('entreprise_id', entreprise_id).order('created_at', { ascending: false }).limit(200);
      const withUrls = await Promise.all((documents || []).map(async (d: any) => {
        const { data: signed } = await supabase.storage.from('ged').createSignedUrl(d.storage_path, 300);
        return { ...d, signed_url: signed?.signedUrl || null };
      }));
      payload.documents = withUrls;
    }

    if (section === 'factures' && acces.peut_voir_factures) {
      const { data: factures } = await supabase.from('factures')
        .select('id,numero,date_facture,date_echeance,statut,total_ttc,total_ht,client:clients(nom,ninea)')
        .eq('entreprise_id', entreprise_id).order('date_facture', { ascending: false }).limit(200);
      payload.factures = factures || [];
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
