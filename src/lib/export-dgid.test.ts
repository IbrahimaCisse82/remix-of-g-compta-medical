import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import type { BalanceLine, Entreprise, Exercice } from './accounting';
import { dureeMois, remplirClasseurDgid, MODELE_DGID } from './export-dgid';

const b = (compte: string, d: Partial<BalanceLine>): BalanceLine => ({ compte, intitule: compte, sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, ...d });
const entreprise = { id: 'e', nom: 'Clinique Test', sigle: 'CT', ninea: '0012345 2G3', rccm: 'SN-DKR-2024-B-1', tel: '33 800 00 00', adresse: 'Dakar', forme_juridique: 'SARL', secteur: 'Santé', monnaie: 'FCFA' } as Entreprise;
const exercice = { id: 'x', entreprise_id: 'e', annee: 2026, date_debut: '2026-01-01', date_fin: '2026-12-31', statut: 'en_cours' } as Exercice;
const balance = [
  b('101', { sc: 1_000_000, mc: 1_000_000, sfc: 1_000_000 }),
  b('521', { sd: 1_000_000, md: 1_500_000, mc: 300_000, sfd: 1_200_000 }),
  b('2441', { md: 300_000, sfd: 300_000 }),
  b('2844', { mc: 50_000, sfc: 50_000 }),
  b('6813', { md: 50_000, sfd: 50_000 }),
  b('706', { mc: 500_000, sfc: 500_000 }),
];

let rempli: ExcelJS.Workbook;
async function charger() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(`public/${MODELE_DGID}`));
  remplirClasseurDgid(wb, { entreprise, exercice, balance, balanceN1: [] });
  return wb;
}
const classeur = async () => rempli;
const ligne = (ws: ExcelJS.Worksheet, col: number, ref: string) => { for (let r = 1; r <= ws.rowCount; r++) if (ws.getRow(r).getCell(col).value === ref) return ws.getRow(r); throw new Error(ref); };

describe('export Excel modèle DGID', () => {
  beforeAll(async () => { rempli = await charger(); }, 60_000);
  it('durée de l’exercice en mois', () => { expect(dureeMois('2026-01-01', '2026-12-31')).toBe(12); expect(dureeMois('2026-07-01', '2026-12-31')).toBe(6); });
  it('remplit le bilan par référence (brut, amortissements, net)', async () => {
    const ws = (await classeur()).getWorksheet('BILAN PAYSAGE')!;
    const am = ligne(ws, 1, 'AM');
    expect([am.getCell(4).value, am.getCell(5).value, am.getCell(6).value]).toEqual([300_000, 50_000, 250_000]);
    expect(ligne(ws, 1, 'BZ').getCell(6).value).toBe(1_450_000);
    expect(ligne(ws, 8, 'DZ').getCell(11).value).toBe(1_450_000);
    expect(ligne(ws, 8, 'CJ').getCell(11).value).toBe(450_000);
  });
  it('remplit le compte de résultat et le TFT', async () => {
    const wb = await classeur();
    expect(ligne(wb.getWorksheet('COMPTE DE RESULTAT')!, 1, 'XI').getCell(5).value).toBe(450_000);
    const t = wb.getWorksheet('FLUX DE TRESORERIE')!;
    expect(ligne(t, 1, 'ZA').getCell(5).value).toBe(1_000_000);
    expect(ligne(t, 1, 'FA').getCell(5).value).toBe(500_000);
    expect(ligne(t, 1, 'FG').getCell(5).value).toBe(-300_000);
    expect(ligne(t, 1, 'ZH').getCell(5).value).toBe(1_200_000);
  });
  it('identifie l’entité et efface les données d’exemple', async () => {
    const wb = await classeur();
    const pg = wb.getWorksheet('Page de garde')!, r1 = wb.getWorksheet('Fiche de renseignement R1')!;
    expect(pg.getCell('L35').value).toBe('Clinique Test');
    expect(pg.getCell('N51').value).toBe('0012345 2G3');
    expect(pg.getCell('B17').value).toBe('CENTRE DE DEPOT : ');
    expect(r1.getCell('T71').value).toBeNull();
    expect(r1.getCell('I24').value).toBe('SN-DKR-2024-B-1');
    expect(wb.calcProperties.fullCalcOnLoad).toBe(true);
    expect((r1.getCell('J4').value as { result?: unknown }).result).toBe('Clinique Test');
    expect((wb.getWorksheet('BILAN PAYSAGE')!.getCell('D5').value as { result?: unknown }).result).toBe('0012345 2G3');
  });
});
