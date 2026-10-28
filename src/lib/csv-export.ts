/**
 * CSV Export utility for G-Compta
 */
import { protegerFormuleCsv } from './impression';

function escapeCsv(val: string | number | null | undefined): string {
  if (val == null) return '';
  // Protection injection de formules (Excel/LibreOffice) avant quoting.
  const s = String(protegerFormuleCsv(val));
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCsv(headers: string[], rows: (string | number | null | undefined)[][], filename: string) {
  const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const csv = bom + [
    headers.map(escapeCsv).join(';'),
    ...rows.map(r => r.map(escapeCsv).join(';')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportBalanceCsv(balance: { compte: string; intitule: string; sd: number; sc: number; md: number; mc: number; sfd: number; sfc: number }[], filename: string) {
  exportCsv(
    ['N° Compte', 'Intitulé', 'Sol.Init.D', 'Sol.Init.C', 'Mvt.Débit', 'Mvt.Crédit', 'Sol.Fin.D', 'Sol.Fin.C'],
    balance.map(r => [r.compte, r.intitule, r.sd, r.sc, r.md, r.mc, r.sfd, r.sfc]),
    filename,
  );
}

export function exportJournalCsv(journal: { date_ecriture: string; piece: string; journal_code: string; compte: string; intitule: string; libelle: string; debit: number; credit: number }[], filename: string) {
  exportCsv(
    ['Date', 'Pièce', 'Journal', 'Compte', 'Intitulé', 'Libellé', 'Débit', 'Crédit'],
    journal.map(r => [r.date_ecriture, r.piece, r.journal_code, r.compte, r.intitule, r.libelle, r.debit, r.credit]),
    filename,
  );
}

export function exportEtatCsv(lines: { ref: string; label: string; valN: number; valN1?: number }[], filename: string) {
  exportCsv(
    ['Réf.', 'Libellé', 'Exercice N', 'N-1'],
    lines.map(r => [r.ref, r.label, r.valN, r.valN1 ?? '']),
    filename,
  );
}
