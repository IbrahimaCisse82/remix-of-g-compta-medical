import { describe, it, expect } from 'vitest';
import { attribuerNumerosEcritures, decouperAuxiliaire, controlerFec, buildFec, type FecLine } from './fec-export';

const L = (o: Partial<FecLine>): FecLine => ({
  date_ecriture: '2026-03-15', piece: 'P1', journal_code: 'AC',
  compte: o.compte || '601000', intitule: 'Achat', libelle: 'Facture',
  debit: o.debit ?? 0, credit: o.credit ?? 0, id: o.id || 'l1',
  ...o,
});

describe('FEC — numérotation et contrôle', () => {
  it('reprend le numéro serveur persistant quand il existe', () => {
    const lignes = [L({ ecriture_numero: 'AC000042' })];
    expect(attribuerNumerosEcritures(lignes).get(lignes[0])).toBe('AC000042');
  });

  it('recompte par pièce uniquement en repli', () => {
    const lignes = [L({ id: 'a', piece: 'P1' }), L({ id: 'b', piece: 'P1' }), L({ id: 'c', piece: 'P2' })];
    const nums = attribuerNumerosEcritures(lignes);
    expect(nums.get(lignes[0])).toBe('AC000001');
    expect(nums.get(lignes[1])).toBe('AC000001');
    expect(nums.get(lignes[2])).toBe('AC000002');
  });

  it('découpe le compte collectif / auxiliaire', () => {
    expect(decouperAuxiliaire('411001')).toEqual({ collectif: '411', auxiliaire: '001' });
    expect(decouperAuxiliaire('601000')).toBeNull();
  });

  it('contrôle un FEC équilibré', () => {
    const r = controlerFec([L({ debit: 1000 }), L({ credit: 1000 })]);
    expect(r.equilibre).toBe(true);
    expect(r.totalLignes).toBe(2);
  });

  it('signale un FEC déséquilibré et les lignes recomptées', () => {
    const r = controlerFec([L({ debit: 1000, ecriture_numero: undefined })]);
    expect(r.equilibre).toBe(false);
    expect(r.lignesRecomptees).toBe(1);
  });

  it('génère le FEC avec numéro serveur, auxiliaires et rapport intégré', () => {
    const fec = buildFec([
      L({ id: 'a', piece: 'AC-1', compte: '411001', compte_auxiliaire: '411CLIENT01', auxiliaire_libelle: 'Client X', debit: 1180 }),
      L({ id: 'b', piece: 'AC-1', compte: '701000', credit: 1180 }),
    ]);
    const lines = fec.split('\r\n');
    expect(lines[0]).toContain('CompAuxNum');
    expect(lines[1]).toContain('411CLIENT01|Client X');
    expect(lines[2]).toContain('701000');
    // ligne avec compte_auxiliaire explicite prioritaire sur le découpage
    expect(lines[1]).toContain('411CLIENT01');
    const r = controlerFec([L({ compte: '411001', debit: 1180 }), L({ credit: 1180 })]);
    expect(r.lignesAuxiliaires).toBeGreaterThanOrEqual(1);
  });
});
