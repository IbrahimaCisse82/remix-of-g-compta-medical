/**
 * Export Excel des états financiers au format du modèle DGID (Sénégal, SYSCOHADA révisé, système normal).
 *
 * Le classeur officiel (public/modeles/etats-financiers-dgid.xlsx) est ouvert tel quel : on ne fait
 * qu'y écrire les montants en face des références (AD, AE… / CA… / TA… / ZA…) et l'identification
 * de l'entité. Les données d'exemple du modèle (RCCM, banque, « X »…) sont effacées. Les notes
 * annexes restent à compléter dans le classeur.
 */
import type ExcelJS from 'exceljs';
import type { Workbook, Worksheet } from 'exceljs';
import { calc, calculateActif, CR, PASSIF, type BalanceLine, type Entreprise, type Exercice } from './accounting';
import { controlesSyscohada } from './conformite-syscohada';
import { calculerTft } from './tft-syscohada';

export const MODELE_DGID = 'modeles/etats-financiers-dgid.xlsx';

export interface DonneesDgid {
  entreprise: Entreprise;
  exercice: Exercice;
  balance: BalanceLine[];
  balanceN1: BalanceLine[];
}

const date = (iso: string) => { const [a, m, j] = iso.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)); };
export function dureeMois(debut: string, fin: string): number {
  const d = date(debut), f = date(fin);
  f.setUTCDate(f.getUTCDate() + 1);
  return (f.getUTCFullYear() - d.getUTCFullYear()) * 12 + f.getUTCMonth() - d.getUTCMonth();
}
const arrondi = (x: number | undefined) => Math.round(x ?? 0);

/** Écrit les montants d'un état : colonne des références → colonnes de valeurs. */
function remplirParReference(ws: Worksheet, colRef: number, valeurs: Record<string, number | undefined>[], colonnes: number[], lignes: [number, number]) {
  for (let r = lignes[0]; r <= lignes[1]; r++) {
    const ref = String(ws.getRow(r).getCell(colRef).value ?? '').trim();
    if (!/^[A-Z]{2}$/.test(ref)) continue;
    colonnes.forEach((c, i) => { ws.getRow(r).getCell(c).value = arrondi(valeurs[i][ref]); });
  }
}

/**
 * Les renvois simples du modèle (ex. ='Page de garde'!L35) reçoivent leur valeur en cache : un
 * lecteur qui ne recalcule pas à l'ouverture (LibreOffice, aperçus) affiche ainsi l'identification.
 */
function resoudreRenvois(wb: Workbook) {
  const renvoi = /^\+?(?:'?([^'!]+)'?!)?\$?([A-Z]{1,3})\$?(\d+)$/;
  for (let passe = 0; passe < 3; passe++) {
    wb.eachSheet(ws => ws.eachRow(row => row.eachCell(cell => {
      const v = cell.value as { formula?: string } | null;
      const m = v && typeof v === 'object' && typeof v.formula === 'string' ? renvoi.exec(v.formula) : null;
      if (!m) return;
      const cible = (m[1] ? wb.getWorksheet(m[1]) : ws)?.getCell(`${m[2]}${m[3]}`);
      if (!cible) return;
      const brut = cible.value as unknown;
      const res = brut && typeof brut === 'object' && 'formula' in (brut as object) ? (brut as { result?: unknown }).result : brut;
      cell.value = { formula: v!.formula!, result: (res ?? '') as string } as ExcelJS.CellFormulaValue;
    })));
  }
}

const vider = (ws: Worksheet | undefined, cellules: string[]) => { if (ws) for (const a of cellules) ws.getCell(a).value = null; };

/** Remplit le classeur ; renvoie les contrôles bloquants non satisfaits (états alors marqués provisoires). */
export function remplirClasseurDgid(wb: Workbook, d: DonneesDgid): string[] {
  const { entreprise: e, exercice: x, balance, balanceN1 } = d;
  const aN = calculateActif(balance), aN1 = calculateActif(balanceN1);
  const pN = calc(balance, PASSIF), pN1 = calc(balanceN1, PASSIF);
  const crN = calc(balance, CR), crN1 = calc(balanceN1, CR);
  const provisoire = controlesSyscohada(balance, balanceN1).filter(c => c.bloquant && !c.ok).map(c => c.code);
  const tN = calculerTft(balance).valeurs, tN1 = balanceN1.length ? calculerTft(balanceN1).valeurs : {};

  // Page de garde
  const pg = wb.getWorksheet('Page de garde');
  if (pg) {
    pg.getCell('B17').value = 'CENTRE DE DEPOT : ';
    pg.getCell('M27').value = date(x.date_fin);
    pg.getCell('M27').numFmt = 'dd/mm/yyyy';
    pg.getCell('L35').value = e.nom || '';
    pg.getCell('H41').value = e.sigle || '';
    pg.getCell('J46').value = e.adresse || '';
    pg.getCell('N51').value = e.ninea || '';
    if (provisoire.length) {
      pg.getCell('B19').value = `ÉTATS PROVISOIRES — contrôles non satisfaits : ${provisoire.join(', ')}`;
      pg.getCell('B19').font = { bold: true, size: 12 };
    }
  }

  // Fiche R1 : identification ; les données d'exemple du modèle sont effacées.
  const r1 = wb.getWorksheet('Fiche de renseignement R1');
  if (r1) {
    const debutPrecedent = new Date(date(x.date_debut)); debutPrecedent.setUTCDate(debutPrecedent.getUTCDate() - 1);
    r1.getCell('AH10').value = dureeMois(x.date_debut, x.date_fin);
    r1.getCell('Y13').value = date(x.date_debut);
    r1.getCell('AH13').value = date(x.date_fin);
    r1.getCell('Q20').value = balanceN1.length ? debutPrecedent : null;
    r1.getCell('AL20').value = balanceN1.length ? 12 : null;
    r1.getCell('I24').value = e.rccm || null;
    r1.getCell('G36').value = e.tel || null;
    r1.getCell('D40').value = e.adresse || null;
    r1.getCell('D44').value = e.secteur || null;
    vider(r1, ['F24', 'W24', 'G28', 'Q36', 'Y36', 'AA36', 'AE36', 'D48', 'D52', 'D56', 'S64', 'AK64', 'D69', 'T71', 'AD71', 'D72', 'D75']);
    r1.getCell('F24').value = 'SN';
  }
  vider(wb.getWorksheet("Activités de l'entreprise R2"), ['F14', 'G14', 'F16', 'G16', 'F18', 'G18', 'F20', 'G20', 'F22', 'G22', 'E25', 'F25', 'G25', 'H25', 'Q16', 'B33', 'D33', 'E33', 'F33', 'G33', 'H33', 'I33', 'M33']);

  for (const nom of ['BILAN PAYSAGE', 'COMPTE DE RESULTAT', 'FLUX DE TRESORERIE']) {
    const ws = wb.getWorksheet(nom);
    if (ws) ws.getCell('A4').value = e.nom || '';
  }

  const bilan = wb.getWorksheet('BILAN PAYSAGE');
  if (bilan) {
    remplirParReference(bilan, 1, [aN.brut, aN.amort, aN.net, balanceN1.length ? aN1.net : {}], [4, 5, 6, 7], [9, 37]);
    remplirParReference(bilan, 8, [pN, balanceN1.length ? pN1 : {}], [11, 12], [9, 37]);
  }
  const cr = wb.getWorksheet('COMPTE DE RESULTAT');
  if (cr) remplirParReference(cr, 1, [crN, balanceN1.length ? crN1 : {}], [5, 6], [8, 49]);
  const tft = wb.getWorksheet('FLUX DE TRESORERIE');
  if (tft) {
    remplirParReference(tft, 1, [tN, tN1], [5, 6], [8, 37]);
    for (let r = 8; r <= 37; r++) {
      if (String(tft.getRow(r).getCell(2).value ?? '').startsWith('Variation du BF')) {
        tft.getRow(r).getCell(5).value = arrondi(tN.VO);
        tft.getRow(r).getCell(6).value = balanceN1.length ? arrondi(tN1.VO) : 0;
      }
    }
  }
  resoudreRenvois(wb);
  wb.calcProperties = { ...(wb.calcProperties ?? {}), fullCalcOnLoad: true };
  return provisoire;
}

/** Télécharge le modèle, le remplit et propose le fichier à l'utilisateur. */
export async function exporterEtatsDgid(d: DonneesDgid): Promise<string[]> {
  const [{ default: ExcelJS }, reponse] = await Promise.all([
    import('exceljs'),
    fetch(`${import.meta.env.BASE_URL}${MODELE_DGID}`),
  ]);
  if (!reponse.ok) throw new Error('Modèle DGID introuvable');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await reponse.arrayBuffer());
  const provisoire = remplirClasseurDgid(wb, d);
  const tampon = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `etats_financiers_DGID_${(d.entreprise.sigle || d.entreprise.nom || 'entite').replace(/[^\w-]+/g, '_')}_${d.exercice.annee}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return provisoire;
}
