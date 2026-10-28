import { LABOTEST_ROWS } from './labotest-data.ts';
import { DEMO_EMAIL, DEMO_NAME } from './demo-population.ts';

export const labotestCode = (row: number) => `DEMO-LABOTEST-${String(row).padStart(3, '0')}`;
export const LABOTEST_GRIDS = [
  ['Labotest démo — Société/Assurance', 'assurance'],
  ['Labotest démo — IPM', 'ipm'],
  ['Labotest démo — Hôpital Sénégal', 'hopital'],
] as const;

// No client-supplied tenant and no privileged writes: the signed-in demo's permissions apply.
export async function populateLabotest(db: any) {
  const checked = async (request: any) => {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  };
  const auth = await checked(db.auth.getUser());
  if (auth?.user?.email !== DEMO_EMAIL) throw new Error('Dedicated demo account required');
  const uid = auth.user.id;
  const members = await checked(db.from('structure_memberships').select('structure_id').eq('user_id', uid).eq('statut', 'actif'));
  if (members.length !== 1) throw new Error('Ambiguous demo membership');
  const sid = members[0].structure_id;
  const st = await checked(db.from('structures').select('nom,type,created_by,entreprise_id').eq('id', sid).single());
  if (st.nom !== DEMO_NAME || st.type !== 'mixte' || st.created_by !== uid) throw new Error('Not the PME 1 demo structure');
  const ent = await checked(db.from('entreprises').select('nom,user_id,secteur_activite').eq('id', st.entreprise_id).single());
  if (ent.nom !== DEMO_NAME || ent.user_id !== uid || ent.secteur_activite !== 'sante_mixte') throw new Error('Not the demo company');
  const existing = await checked(db.from('sante_analyses').select('id,code').eq('structure_id', sid));
  const codes = new Set(existing.map((a: any) => a.code));
  const tariffs = await checked(db.from('sante_tarifs_convention').select('organisme,code').eq('structure_id', sid));
  const keys = new Set(tariffs.map((t: any) => `${t.organisme}|${t.code}`));
  let created = 0;
  for (const row of LABOTEST_ROWS) {
    const code = labotestCode(row.row);
    if (!codes.has(code)) {
      // The workbook has no clinical parameters. These settings are explicitly fictitious,
      // not inferred biological references, units, specimen instructions or validations.
      const result = await db.rpc('sante_catalogue_creer_analyse', {
        _structure_id: sid, _code: code,
        _libelle: `${row.libelle} — Labotest démo${row.codeSource ? ` (${row.codeSource})` : ''}`,
        _section: 'biochimie', _tarif: row.particulier, _delai: 24,
        _tube: '', _echantillon: '', _parametre: 'Observation de démonstration — sans valeur clinique',
        _unite: '', _type: 'texte',
      });
      if (result.error) {
        // A concurrent launch may have created the same immutable demo marker.
        if (result.error.code !== '23505') throw result.error;
        const found = await checked(db.from('sante_analyses').select('id').eq('structure_id', sid).eq('code', code));
        if (found.length !== 1) throw result.error;
      } else created++;
      codes.add(code);
    }
    for (const [organisme, field] of LABOTEST_GRIDS) {
      const key = `${organisme}|${code}`;
      if (keys.has(key)) continue;
      const result = await db.from('sante_tarifs_convention').insert({ structure_id: sid, organisme, code, tarif: row[field] });
      if (result.error && result.error.code !== '23505') throw result.error;
      keys.add(key);
    }
  }
  return { analyses: LABOTEST_ROWS.length, created, tarifs_convention: LABOTEST_ROWS.length * LABOTEST_GRIDS.length };
}