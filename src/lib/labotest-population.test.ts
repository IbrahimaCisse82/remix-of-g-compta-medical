import { describe, expect, it } from 'vitest';
import { LABOTEST_ROWS } from '../../supabase/functions/_shared/labotest-data';
import { labotestCode, populateLabotest } from '../../supabase/functions/_shared/labotest-population';

function fake(email = 'demo-sante@gcompta.sn', name = 'PME 1') {
  const analyses: any[] = [], tariffs: any[] = [], calls: any[] = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'demo', email } }, error: null }) },
    from(table: string) {
      let inserted: any;
      const q: any = {
        select: () => q, eq: () => q, single: () => q,
        insert: (value: any) => { inserted = value; return q; },
        then(resolve: any) {
          if (inserted) { tariffs.push(inserted); return Promise.resolve({ data: inserted, error: null }).then(resolve); }
          const data = table === 'structure_memberships' ? [{ structure_id: 'sid' }]
            : table === 'structures' ? { nom: name, type: 'mixte', created_by: 'demo', entreprise_id: 'ent' }
            : table === 'entreprises' ? { nom: 'PME 1', user_id: 'demo', secteur_activite: 'sante_mixte' }
            : table === 'sante_analyses' ? analyses : tariffs;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
    async rpc(name: string, args: any) {
      calls.push({ name, args }); analyses.push({ code: args._code });
      return { data: args._code, error: null };
    },
  };
  return { db, calls, analyses, tariffs };
}

describe('Nomenclature Labotest de démonstration', () => {
  it('conserve les 192 lignes et les tarifs AFP du document', () => {
    expect(LABOTEST_ROWS).toHaveLength(192);
    expect(LABOTEST_ROWS[0]).toMatchObject({ codeSource: 'AFP', coefficientB: 80, particulier: 20800, assurance: 20800, ipm: 17600, hopital: 16000 });
  });
  it('conserve chaque ligne sans collision malgré les codes absents ou répétés', () => {
    expect(new Set(LABOTEST_ROWS.map(r => labotestCode(r.row))).size).toBe(192);
    expect(LABOTEST_ROWS.filter(r => !r.codeSource)).toHaveLength(14);
    expect(LABOTEST_ROWS.filter(r => r.codeSource === 'AUU')).toHaveLength(2);
  });
  it('préserve les quatre grilles B=260/260/220/200', () => {
    for (const r of LABOTEST_ROWS) {
      expect(r.particulier).toBe(r.coefficientB * 260);
      expect(r.assurance).toBe(r.coefficientB * 260);
      expect(r.ipm).toBe(r.coefficientB * 220);
      expect(r.hopital).toBe(r.coefficientB * 200);
    }
  });
  it('refuse un compte réel et une structure non dédiée avant les créations', async () => {
    const real = fake('real@example.com'), wrong = fake(undefined, 'Real lab');
    await expect(populateLabotest(real.db)).rejects.toThrow('Dedicated demo');
    await expect(populateLabotest(wrong.db)).rejects.toThrow('Not the PME 1');
    expect(real.calls).toHaveLength(0); expect(wrong.calls).toHaveLength(0);
    expect(real.tariffs).toHaveLength(0); expect(wrong.tariffs).toHaveLength(0);
  });
  it('crée 192 analyses atomiques et 576 tarifs sans écraser ni doubler au second passage', async () => {
    const f = fake();
    expect(await populateLabotest(f.db)).toMatchObject({ created: 192, tarifs_convention: 576 });
    expect(await populateLabotest(f.db)).toMatchObject({ created: 0 });
    expect(f.calls).toHaveLength(192); expect(f.tariffs).toHaveLength(576);
    expect(f.calls[0]).toMatchObject({ name: 'sante_catalogue_creer_analyse', args: { _structure_id: 'sid', _type: 'texte', _tarif: 20800, _unite: '' } });
    expect(f.tariffs.find(t => t.code === 'DEMO-LABOTEST-004' && t.organisme.includes('IPM'))?.tarif).toBe(17600);
  });
});