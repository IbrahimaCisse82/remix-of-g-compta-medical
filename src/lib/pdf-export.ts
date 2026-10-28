/**
 * Professional PDF Export via Print — G-Compta SYSCOHADA
 * Generates clean HTML in a new window and triggers print/save-as-PDF
 */
import type { Entreprise, Exercice, MapLine } from './accounting';
import { fmt, fmtSigned } from './accounting';
import { escapeHtml } from './impression';

function buildHeader(entreprise: Entreprise, exercice: Exercice, title: string): string {
  // Toutes les données issues de la base sont échappées avant insertion dans le HTML.
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:2px solid #0B1F3A;padding-bottom:12px;">
      <div>
        <div style="font-size:20px;font-weight:bold;color:#0B1F3A;">${escapeHtml(entreprise.nom)}</div>
        <div style="font-size:10px;color:#555;margin-top:4px;">
          ${escapeHtml(entreprise.forme_juridique || '')} ${entreprise.sigle ? `(${escapeHtml(entreprise.sigle)})` : ''}
          ${entreprise.ninea ? ` · NINEA: ${escapeHtml(entreprise.ninea)}` : ''}
          ${entreprise.rccm ? ` · RCCM: ${escapeHtml(entreprise.rccm)}` : ''}
        </div>
        <div style="font-size:10px;color:#555;">${escapeHtml(entreprise.adresse || '')} ${entreprise.tel ? `· Tél: ${escapeHtml(entreprise.tel)}` : ''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;color:#888;">Monnaie: ${escapeHtml(entreprise.monnaie || 'FCFA')}</div>
        <div style="font-size:9px;color:#888;">Exercice: ${escapeHtml(exercice.date_debut)} au ${escapeHtml(exercice.date_fin)}</div>
      </div>
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:bold;color:#0B1F3A;text-transform:uppercase;letter-spacing:3px;">${escapeHtml(title)}</div>
      <div style="font-size:11px;color:#555;">Exercice clos le ${escapeHtml(exercice.date_fin)} · ${escapeHtml(entreprise.monnaie || 'FCFA')}</div>
    </div>`;
}

function buildFooter(): string {
  return `<div style="margin-top:20px;padding-top:8px;border-top:1px solid #ccc;text-align:center;font-size:8px;color:#999;">
    G-Compta · Système Comptable SYSCOHADA Révisé · Généré le ${new Date().toLocaleDateString('fr-FR')}
  </div>`;
}

function openPrintWindow(html: string, title: string) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Veuillez autoriser les popups pour exporter en PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #222; padding: 15mm; }
      table { width:100%; border-collapse:collapse; margin-bottom:12px; }
      th { background:#0B1F3A; color:#fff; font-size:8px; text-transform:uppercase; letter-spacing:0.5px; padding:5px 6px; text-align:left; }
      td { padding:3px 6px; border-bottom:1px solid #e0e0e0; font-size:9px; }
      tr:nth-child(even) { background:#f9f9f9; }
      .tot { background:#e8f4e8 !important; font-weight:bold; border-top:2px solid #0B1F3A; }
      .gtot { background:#0B1F3A !important; color:#fff !important; font-weight:bold; }
      .sect { background:#f0f0f0; font-weight:bold; font-size:8px; text-transform:uppercase; letter-spacing:1px; color:#555; }
      .right { text-align:right; font-family: 'Courier New', monospace; }
      .neg { color:#c00; }
      @media print { body { padding: 10mm 8mm; } @page { size: A4; margin: 10mm; } }
      @media screen { body { max-width:900px; margin:0 auto; } .no-print { display:block; text-align:center; margin-bottom:15px; } }
    </style>
  </head><body>
    <div class="no-print"><button onclick="window.print()" style="padding:8px 24px;background:#0B1F3A;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">📥 Imprimer / Enregistrer en PDF</button></div>
    ${html}
  </body></html>`);
  w.document.close();
}

export function exportBilanPdf(
  entreprise: Entreprise, exercice: Exercice,
  actifDef: MapLine[], passifDef: MapLine[],
  vA: Record<string, number>, vP: Record<string, number>,
  vAN1: Record<string, number>, vPN1: Record<string, number>,
  vABrut: Record<string, number>, vAAmort: Record<string, number>,
) {
  const hasN1 = Object.values(vAN1).some(v => v !== 0);
  
  let actifHtml = `<table><thead><tr><th style="width:40px">Réf</th><th>ACTIF</th><th class="right" style="width:90px">Brut</th><th class="right" style="width:90px">Amort/Dép.</th><th class="right" style="width:90px">Net N</th>${hasN1 ? '<th class="right" style="width:90px">Net N-1</th>' : ''}</tr></thead><tbody>`;
  for (const l of actifDef) {
    if (l.type === 'sect') { actifHtml += `<tr class="sect"><td colspan="${hasN1 ? 6 : 5}">${escapeHtml(l.label)}</td></tr>`; continue; }
    const cls = l.type === 'gtotal' ? 'gtot' : l.type === 'total' ? 'tot' : '';
    actifHtml += `<tr class="${cls}"><td>${escapeHtml(l.id)}</td><td>${escapeHtml(l.label)}</td><td class="right">${fmtSigned(vABrut[l.id] || 0)}</td><td class="right ${(vAAmort[l.id] || 0) > 0 ? 'neg' : ''}">${vAAmort[l.id] ? fmtSigned(-(vAAmort[l.id] || 0)) : '—'}</td><td class="right">${fmtSigned(vA[l.id] || 0)}</td>${hasN1 ? `<td class="right">${fmtSigned(vAN1[l.id] || 0)}</td>` : ''}</tr>`;
  }
  actifHtml += '</tbody></table>';

  let passifHtml = `<table><thead><tr><th style="width:40px">Réf</th><th>PASSIF</th><th class="right" style="width:100px">Net N</th>${hasN1 ? '<th class="right" style="width:100px">Net N-1</th>' : ''}</tr></thead><tbody>`;
  for (const l of passifDef) {
    if (l.type === 'sect') { passifHtml += `<tr class="sect"><td colspan="${hasN1 ? 4 : 3}">${escapeHtml(l.label)}</td></tr>`; continue; }
    const cls = l.type === 'gtotal' ? 'gtot' : l.type === 'total' ? 'tot' : '';
    passifHtml += `<tr class="${cls}"><td>${escapeHtml(l.id)}</td><td>${escapeHtml(l.label)}</td><td class="right">${fmtSigned(vP[l.id] || 0)}</td>${hasN1 ? `<td class="right">${fmtSigned(vPN1[l.id] || 0)}</td>` : ''}</tr>`;
  }
  passifHtml += '</tbody></table>';

  const eq = Math.abs((vA['BZ'] || 0) - (vP['DZ'] || 0)) < 1;
  const eqHtml = `<div style="text-align:center;padding:8px;font-weight:bold;font-size:11px;border-radius:4px;${eq ? 'background:#e8f4e8;color:#0a6' : 'background:#fde8e8;color:#c00'}">
    ${eq ? '✓ BILAN ÉQUILIBRÉ' : '⚠ BILAN NON ÉQUILIBRÉ'} — Actif: ${fmt(vA['BZ'] || 0)} / Passif: ${fmt(vP['DZ'] || 0)}
  </div>`;

  openPrintWindow(
    buildHeader(entreprise, exercice, 'BILAN — Système Normal') + actifHtml + passifHtml + eqHtml + buildFooter(),
    `Bilan ${entreprise.nom} ${exercice.annee}`
  );
}

export function exportCRPdf(
  entreprise: Entreprise, exercice: Exercice,
  crDef: MapLine[], vCR: Record<string, number>, vCRN1: Record<string, number>, hasN1: boolean,
) {
  let html = `<table><thead><tr><th style="width:50px">Réf</th><th>Libellé</th><th class="right" style="width:110px">Exercice N</th>${hasN1 ? '<th class="right" style="width:110px">N-1</th>' : ''}</tr></thead><tbody>`;
  for (const l of crDef) {
    if (l.type === 'sect') { html += `<tr class="sect"><td colspan="${hasN1 ? 4 : 3}">${escapeHtml(l.label)}</td></tr>`; continue; }
    const cls = l.type === 'gtotal' ? 'gtot' : l.type === 'total' ? 'tot' : '';
    const v = vCR[l.id] || 0;
    html += `<tr class="${cls}"><td>${escapeHtml(l.id)}</td><td>${escapeHtml(l.label)}</td><td class="right ${v < 0 ? 'neg' : ''}">${fmt(v)}</td>${hasN1 ? `<td class="right">${fmt(vCRN1[l.id] || 0)}</td>` : ''}</tr>`;
  }
  html += '</tbody></table>';

  const rn = vCR['XI'] || 0;
  html += `<div style="text-align:center;padding:8px;font-weight:bold;font-size:12px;border-radius:4px;margin-top:8px;${rn >= 0 ? 'background:#e8f4e8;color:#0a6' : 'background:#fde8e8;color:#c00'}">
    RÉSULTAT NET : ${fmtSigned(rn)} ${entreprise.monnaie || 'FCFA'}
  </div>`;

  openPrintWindow(
    buildHeader(entreprise, exercice, 'COMPTE DE RÉSULTAT — Système Normal') + html + buildFooter(),
    `CR ${entreprise.nom} ${exercice.annee}`
  );
}

export function exportTFTPdf(
  entreprise: Entreprise, exercice: Exercice,
  tftDef: MapLine[], vT: Record<string, number>, vTN1: Record<string, number>, hasN1: boolean,
) {
  let html = `<table><thead><tr><th style="width:50px">Réf</th><th>Libellé</th><th class="right" style="width:110px">N</th>${hasN1 ? '<th class="right" style="width:110px">N-1</th>' : ''}</tr></thead><tbody>`;
  for (const l of tftDef.filter(x => !x.id.startsWith('_'))) {
    if (l.type === 'sect') { html += `<tr class="sect"><td colspan="${hasN1 ? 4 : 3}">${escapeHtml(l.label)}</td></tr>`; continue; }
    const cls = l.type === 'gtotal' ? 'gtot' : l.type === 'total' ? 'tot' : '';
    const v = vT[l.id] || 0;
    html += `<tr class="${cls}"><td>${escapeHtml(l.id)}</td><td>${escapeHtml(l.label)}</td><td class="right ${v < 0 ? 'neg' : ''}">${fmt(v)}</td>${hasN1 ? `<td class="right">${fmt(vTN1[l.id] || 0)}</td>` : ''}</tr>`;
  }
  html += '</tbody></table>';

  openPrintWindow(
    buildHeader(entreprise, exercice, 'TABLEAU DES FLUX DE TRÉSORERIE') + html + buildFooter(),
    `TFT ${entreprise.nom} ${exercice.annee}`
  );
}
