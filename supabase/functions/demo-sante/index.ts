// Prépare (idempotent) deux comptes de démonstration G-Santé isolés et renvoie les identifiants du compte A.
// Données fictives uniquement. Aucune donnée de santé réelle.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEMOS = [
  { key: 'A', email: 'demo-sante@gcompta.sn', password: 'DemoSante#2026', nom: 'Clinique Démo Dakar', type: 'mixte', secteur: 'sante_mixte', theme: 'clinique',
    roles: ['admin_structure', 'medecin', 'biologiste', 'secretaire'] },
  { key: 'B', email: 'demo-sante-b@gcompta.sn', password: 'DemoSanteB#2026', nom: 'Laboratoire Test Thiès', type: 'laboratoire', secteur: 'sante_laboratoire', theme: 'laboratoire',
    roles: ['admin_structure', 'technicien'] },
];
const MODULES: Record<string, string[]> = {
  sante_mixte: ['sante_patients', 'sante_clinique', 'sante_laboratoire', 'sante_tiers_payant', 'sante_portail_resultats'],
  sante_laboratoire: ['sante_patients', 'sante_laboratoire', 'sante_tiers_payant', 'sante_portail_resultats'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    let out: { email: string; password: string } | null = null;
    for (const d of DEMOS) {
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
      let user = list?.users.find(u => u.email === d.email);
      if (!user) {
        const { data, error } = await db.auth.admin.createUser({ email: d.email, password: d.password, email_confirm: true, user_metadata: { full_name: `Démo ${d.nom}` } });
        if (error) throw error;
        user = data.user!;
      }
      const { data: mem } = await db.from('structure_memberships').select('id').eq('user_id', user.id).limit(1).maybeSingle();
      if (!mem) {
        const { data: ent, error: e1 } = await db.from('entreprises').insert({ nom: d.nom, user_id: user.id, monnaie: 'FCFA', secteur_activite: d.secteur, ninea: '000000000', rccm: 'SN-DEMO' }).select('id').single();
        if (e1) throw e1;
        await db.from('entreprise_modules').insert(MODULES[d.secteur].map(m => ({ entreprise_id: ent.id, module: m, actif: true, date_activation: new Date().toISOString() })));
        const { data: st, error: e2 } = await db.from('structures').insert({ type: d.type, nom: d.nom, created_by: user.id, entreprise_id: ent.id, theme_medical: d.theme, ninea: '000000000', adresse: 'Adresse fictive' }).select('id').single();
        if (e2) throw e2;
        await db.from('sites').insert({ structure_id: st.id, nom: 'Site principal', principal: true });
        const { data: m, error: e3 } = await db.from('structure_memberships').insert({ structure_id: st.id, user_id: user.id, statut: 'actif' }).select('id').single();
        if (e3) throw e3;
        await db.from('medical_user_roles').insert(d.roles.map(role => ({ membership_id: m.id, role })));
      }
      if (d.key === 'A') out = { email: d.email, password: d.password };
    }
    return new Response(JSON.stringify(out), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('demo-sante', (e as Error).message);
    return new Response(JSON.stringify({ error: 'Préparation de la démo impossible' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
