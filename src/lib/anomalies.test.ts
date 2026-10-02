import { describe, it, expect } from 'vitest';
import {
  ctrlEquilibreGlobal, ctrlEquilibreParPiece, ctrlBalanceVsJournal, ctrlComptesHorsPlan,
  ctrlStructureLignes, ctrlDatesPeriode, ctrlCompteResultat, ctrlLignesOrphelines,
  ctrlSensBalance, ctrlEquilibreBalance, executerControles, resumeAnomalies,
  type LigneControle,
} from './anomalies';

const L = (o: Partial<LigneControle>): LigneControle => ({
  id: o.id || 'l1', date_ecriture: o.date_ecriture || '2026-03-15', piece: o.piece ?? 'AC-001',
  journal_code: o.journal_code || 'AC', compte: o.compte || '601000', libelle: 'Achat',
  debit: o.debit ?? 0, credit: o.credit ?? 0, ecriture_id: o.ecriture_id !== undefined ? o.ecriture_id : 'e1',
});

const ok: LigneControle[] = [
  L({ id: 'a', compte: '601000', debit: 1000 }),
  L({ id: 'b', compte: '401000', credit: 1000 }),
];

describe('contrôles de cohérence', () => {
  it('journal équilibré : aucune anomalie globale', () => {
    expect(ctrlEquilibreGlobal(ok)).toHaveLength(0);
  });

  it('détecte un journal déséquilibré', () => {
    const a = ctrlEquilibreGlobal([L({ debit: 1000 }), L({ credit: 900 })]);
    expect(a[0].niveau).toBe('bloquant');
  });

  it('détecte une pièce déséquilibrée', () => {
    const a = ctrlEquilibreParPiece([L({ piece: 'P1', debit: 500 }), L({ piece: 'P1', credit: 400 })]);
    expect(a).toHaveLength(1);
    expect(a[0].code).toBe('EQ-PIECE');
  });

  it('accepte des pièces équilibrées séparément', () => {
    expect(ctrlEquilibreParPiece([
      L({ piece: 'P1', debit: 500 }), L({ piece: 'P1', credit: 500 }),
      L({ piece: 'P2', debit: 10 }), L({ piece: 'P2', credit: 10 }),
    ])).toHaveLength(0);
  });

  it('détecte un écart balance ↔ journal', () => {
    const a = ctrlBalanceVsJournal(ok, [
      { compte: '601000', md: 900, mc: 0, sfd: 900, sfc: 0 },
      { compte: '401000', md: 0, mc: 1000, sfd: 0, sfc: 1000 },
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].reference).toBe('601000');
  });

  it('ne signale rien si balance = journal', () => {
    expect(ctrlBalanceVsJournal(ok, [
      { compte: '601000', md: 1000, mc: 0, sfd: 1000, sfc: 0 },
      { compte: '401000', md: 0, mc: 1000, sfd: 0, sfc: 1000 },
    ])).toHaveLength(0);
  });

  it('détecte un compte hors plan et accepte un compte rattaché à un collectif', () => {
    expect(ctrlComptesHorsPlan([L({ compte: '999999' })], ['601', '401'])).toHaveLength(1);
    expect(ctrlComptesHorsPlan([L({ compte: '411CLI1' })], ['411'])).toHaveLength(0);
  });

  it('détecte ligne sans pièce, double sens, montant nul et négatif', () => {
    const a = ctrlStructureLignes([
      L({ piece: '', debit: 100 }),
      L({ debit: 100, credit: 100 }),
      L({ debit: 0, credit: 0 }),
      L({ debit: -5 }),
    ]).map(x => x.code);
    expect(a).toContain('PIECE-ABSENTE');
    expect(a).toContain('SENS-DOUBLE');
    expect(a).toContain('MONTANT-NUL');
    expect(a).toContain('MONTANT-NEGATIF');
  });

  it('refuse un code journal non normalisé et un compte invalide', () => {
    const a = ctrlStructureLignes([L({ journal_code: 'ZZ', compte: 'XX', debit: 10 })]).map(x => x.code);
    expect(a).toContain('JOURNAL-NON-NORMALISE');
    expect(a).toContain('COMPTE-INVALIDE');
  });

  it('détecte une écriture hors période', () => {
    const ex = { date_debut: '2026-01-01', date_fin: '2026-12-31' };
    expect(ctrlDatesPeriode([L({ date_ecriture: '2025-12-31', debit: 1 })], ex)).toHaveLength(1);
    expect(ctrlDatesPeriode([L({ date_ecriture: '2026-06-01', debit: 1 })], ex)).toHaveLength(0);
  });

  it('interdit un compte 13X hors journaux de clôture', () => {
    expect(ctrlCompteResultat([L({ compte: '131000', journal_code: 'VT', debit: 1 })])).toHaveLength(1);
    expect(ctrlCompteResultat([L({ compte: '131000', journal_code: 'OD', debit: 1 })])).toHaveLength(0);
  });

  it('signale les lignes sans écriture rattachée', () => {
    expect(ctrlLignesOrphelines([L({ ecriture_id: null })])).toHaveLength(1);
    expect(ctrlLignesOrphelines(ok)).toHaveLength(0);
  });

  it('signale un compte à double solde et une balance déséquilibrée', () => {
    expect(ctrlSensBalance([{ compte: '512', md: 0, mc: 0, sfd: 10, sfc: 5 }])).toHaveLength(1);
    expect(ctrlEquilibreBalance([{ compte: '512', md: 0, mc: 0, sfd: 100, sfc: 0 }])[0].code)
      .toBe('BAL-DESEQUILIBRE');
  });

  it('agrège et trie les contrôles, et autorise la clôture sans bloquant', () => {
    const anomalies = executerControles({
      journal: ok,
      balance: [
        { compte: '601000', md: 1000, mc: 0, sfd: 1000, sfc: 0 },
        { compte: '401000', md: 0, mc: 1000, sfd: 0, sfc: 1000 },
      ],
      comptesPlan: ['601', '401'],
      exercice: { date_debut: '2026-01-01', date_fin: '2026-12-31' },
    });
    expect(resumeAnomalies(anomalies).bloquant).toBe(0);
    expect(resumeAnomalies(anomalies).clotureAutorisee).toBe(true);
  });

  it('bloque la clôture en présence d’un déséquilibre', () => {
    const anomalies = executerControles({
      journal: [L({ debit: 1000 }), L({ credit: 900 })],
      balance: [], comptesPlan: ['601', '401'], exercice: null,
    });
    expect(resumeAnomalies(anomalies).clotureAutorisee).toBe(false);
  });
});
