import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Corrections 0130 issues de la recette de novembre 2026 (anomalies A-007, A-009, A-012).
// Les parcours complets (règlements importés, statut tiers, tableau de bord) sont rejoués par scripts/recette.
describe.skipIf(!url || !key || !service)('Corrections de la recette (0130)', () => {
  const anonyme = createClient(url, key, { auth: { persistSession: false } });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  it('A-012 : la balance matérialisée n’est pas lisible sans connexion', async () => {
    const r = await anonyme.from('mv_balance').select('compte').limit(1);
    expect(r.error).not.toBeNull();
    expect(r.data ?? []).toEqual([]);
  });
  it('A-012 : la clé de service (portail public) la lit toujours', async () => {
    const r = await admin.from('mv_balance').select('compte').limit(1);
    expect(r.error).toBeNull();
  });
  it('A-009 : un exercice chevauchant un exercice existant du même dossier est refusé', async () => {
    const x = await admin.from('exercices').select('entreprise_id, annee, date_debut, date_fin').limit(1);
    if (!x.data?.length) return;
    const e = x.data[0];
    const r = await admin.from('exercices').insert({ entreprise_id: e.entreprise_id, annee: e.annee, date_debut: e.date_debut, date_fin: e.date_fin, statut: 'en_cours' }).select('id');
    expect(r.error?.message).toMatch(/chevauche/);
    const inverse = await admin.from('exercices').insert({ entreprise_id: e.entreprise_id, annee: 2099, date_debut: '2099-12-31', date_fin: '2099-01-01', statut: 'en_cours' }).select('id');
    expect(inverse.error?.message).toMatch(/date de fin/);
  });
});
