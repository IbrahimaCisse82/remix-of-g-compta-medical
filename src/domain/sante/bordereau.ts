import { escapeHtml } from '@/lib/impression';
import { fcfa, type LigneBordereau } from './tiers-payant';

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function moinsDeCent(n: number): string {
  if (n <= 16) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  if (n < 70) {
    const d = Math.floor(n / 10), u = n % 10;
    return u === 0 ? DIZAINES[d] : u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${moinsDeCent(n - 60)}`;
  return n === 80 ? 'quatre-vingts' : `quatre-vingt-${moinsDeCent(n - 80)}`;
}

function moinsDeMille(n: number): string {
  const c = Math.floor(n / 100), r = n % 100;
  if (c === 0) return moinsDeCent(r);
  const cent = c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 ? 's' : ''}`;
  return r === 0 ? cent : `${cent} ${moinsDeCent(r)}`;
}

/** Nombre entier en toutes lettres (orthographe traditionnelle), pour « arrêté à la somme de ». */
export function enLettres(montant: number): string {
  let n = Math.round(Math.abs(montant));
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  const milliards = Math.floor(n / 1e9); n %= 1e9;
  const millions = Math.floor(n / 1e6); n %= 1e6;
  const milliers = Math.floor(n / 1e3); n %= 1e3;
  if (milliards) parts.push(`${moinsDeMille(milliards)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions) parts.push(`${moinsDeMille(millions)} million${millions > 1 ? 's' : ''}`);
  // « cents » et « quatre-vingts » perdent leur s devant « mille » (deux cent mille, quatre-vingt mille)
  if (milliers) parts.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers).replace(/(cent|vingt)s$/, '$1')} mille`);
  if (n) parts.push(moinsDeMille(n));
  return (montant < 0 ? 'moins ' : '') + parts.join(' ');
}

export const dateFr = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR');
export const periodeFr = (mois: string) => new Date(`${mois}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export interface StructureEntete { nom: string; adresse?: string | null; telephone?: string | null; ninea?: string | null; rccm?: string | null }

/** Bordereau A4 à adresser à l'organisme. Toutes les données issues de la base sont échappées. */
export function htmlBordereau(s: StructureEntete, organisme: string, mois: string, lignes: LigneBordereau[], total: number, aujourdhui = new Date()): string {
  const e = escapeHtml;
  const identite = [s.adresse, s.telephone && `Tél. ${s.telephone}`, s.ninea && `NINEA ${s.ninea}`, s.rccm && `RCCM ${s.rccm}`].filter(Boolean).map(x => e(x as string)).join(' · ');
  const rows = lignes.map((l, i) => `<tr${l.type === 'avoir' ? ' class="avoir"' : ''}><td>${i + 1}</td><td>${e(dateFr(l.date))}</td><td>${e(l.numero)}${l.type === 'avoir' ? '<br><small>avoir</small>' : ''}</td><td>${e(l.patient)}<br><small>${e(l.dossier)}</small></td><td>${e(l.adherent ?? '')}</td><td>${e(l.bon ?? '')}</td><td>${e(l.prestations ?? '')}</td><td class="n">${l.total != null ? fcfa(l.total) : ''}</td><td class="n">${l.taux != null ? `${Number(l.taux).toLocaleString('fr-FR')} %` : ''}</td><td class="n"><b>${fcfa(l.part_organisme)}</b></td></tr>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bordereau ${e(organisme)} ${e(mois)}</title><style>
@page{size:A4 landscape;margin:12mm}body{font-family:sans-serif;font-size:11px;color:#111}header{display:flex;justify-content:space-between;border-bottom:2px solid #0e7490;padding-bottom:6px;margin-bottom:10px}
h1{font-size:15px;margin:0;color:#0e7490}h2{font-size:14px;margin:0 0 4px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:4px;vertical-align:top}th{background:#f1f5f9;font-size:10px;text-align:left}
.n{text-align:right;white-space:nowrap}.avoir td{color:#b91c1c}small{color:#555}.arrete{margin-top:12px}.sig{display:flex;justify-content:space-between;margin-top:28px}.sig div{width:45%;border-top:1px solid #999;padding-top:4px}
</style></head><body>
<header><div><h1>${e(s.nom)}</h1><small>${identite}</small></div><div style="text-align:right"><h2>BORDEREAU DE FACTURATION</h2>Organisme : <b>${e(organisme)}</b><br>Période : ${e(periodeFr(mois))}<br>${lignes.length} pièce(s)</div></header>
<table><thead><tr><th>N°</th><th>Date</th><th>Facture</th><th>Patient</th><th>N° adhérent</th><th>Bon de prise en charge</th><th>Prestations</th><th>Montant total</th><th>Taux</th><th>Part organisme</th></tr></thead>
<tbody>${rows}<tr><td colspan="9"><b>Total à régler par l'organisme</b></td><td class="n"><b>${fcfa(total)}</b></td></tr></tbody></table>
<p class="arrete">Arrêté le présent bordereau à la somme de <b>${e(enLettres(total))} francs CFA</b> (${fcfa(total)}).</p>
<p>Fait le ${e(aujourdhui.toLocaleDateString('fr-FR'))}.</p>
<div class="sig"><div>Pour ${e(s.nom)} — signature et cachet</div><div>Reçu par ${e(organisme)} — date, signature et cachet</div></div>
<script>print()</script></body></html>`;
}
