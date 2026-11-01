/**
 * Impression / PDF des états financiers SYSCOHADA révisé (système normal), sur la contexture des
 * plaquettes « États comptables et fiscaux » et du modèle DGID : page de garde, bilan paysage
 * (actif et passif côte à côte), compte de résultat et tableau des flux de trésorerie, avec
 * références, renvois de notes, exercices N et N-1. Noir et blanc, dates françaises.
 *
 * Les montants viennent du moteur commun (accounting.ts, tft-syscohada.ts) ; tant qu'un contrôle
 * bloquant échoue, chaque page porte la mention « ÉTATS PROVISOIRES ».
 */
import { calc, calculateActif, CR, PASSIF } from './accounting';
import { controlesSyscohada } from './conformite-syscohada';
import { BILAN_ACTIF, BILAN_PASSIF, COMPTE_RESULTAT, type LigneEtat } from './etats-presentation';
import { dureeMois, type DonneesDgid } from './export-dgid';
import { escapeHtml as h } from './impression';
import { calculerTft, LIGNES_TFT } from './tft-syscohada';

export type EtatPlaquette = 'garde' | 'bilan' | 'cr' | 'tft';

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
/** Montant au format de la plaquette : séparateur de milliers espace, négatif avec « − », zéro vide. */
export const montant = (x: number | undefined) => {
  const v = Math.round(x ?? 0);
  return v === 0 ? '' : (v < 0 ? '-' : '') + nombre.format(Math.abs(v)).replace(/\s/g, ' ');
};
export const dateFr = (iso: string) => { const [a, m, j] = iso.slice(0, 10).split('-'); return `${j}/${m}/${a}`; };
const veille = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

interface Contexte { d: DonneesDgid; n1: boolean; closN: string; closN1: string; provisoire: string[] }

function entete(x: Contexte, titre: string) {
  const { entreprise: e, exercice } = x.d;
  return `<table class="ident"><tr>
      <td>Désignation de l'entité : <b>${h(e.nom)}</b></td><td>Exercice clos le : <b>${dateFr(exercice.date_fin)}</b></td></tr><tr>
      <td>Numéro d'identification fiscale : <b>${h(e.ninea || '')}</b></td><td>Durée (en mois) : <b>${dureeMois(exercice.date_debut, exercice.date_fin)}</b></td></tr></table>
    <h1>${h(titre)}</h1>${x.provisoire.length ? '<div class="provisoire">ÉTATS PROVISOIRES</div>' : ''}`;
}
const pied = (x: Contexte) => `<div class="pied">${x.provisoire.length ? `États provisoires — contrôles non satisfaits : ${h(x.provisoire.join(', '))}. ` : ''}Montants en ${h(x.d.entreprise.monnaie || 'FCFA')}.</div>`;
const classe = (l: LigneEtat) => l.niveau === 'total' ? 'total' : l.niveau === 'rubrique' ? 'rubrique' : '';

function pageGarde(x: Contexte, etats: EtatPlaquette[]) {
  const { entreprise: e, exercice } = x.d;
  const coche = (k: EtatPlaquette | 'fiche' | 'notes') => (k === 'fiche' || k === 'notes' ? '' : etats.includes(k) ? 'X' : '');
  return `<section class="page garde">
    <div class="etat">RÉPUBLIQUE DU SÉNÉGAL<br>MINISTÈRE DES FINANCES ET DU BUDGET<br>DIRECTION GÉNÉRALE DES IMPÔTS ET DES DOMAINES</div>
    <div class="cadre-titre">ÉTATS FINANCIERS NORMALISÉS<br>SYSTÈME COMPTABLE OHADA (SYSCOHADA RÉVISÉ)</div>
    <p class="exercice">EXERCICE CLOS LE : <b>${dateFr(exercice.date_fin)}</b></p>
    <table class="garde-ident">
      <tr><th colspan="2">DÉSIGNATION DE L'ENTREPRISE</th></tr>
      <tr><td>DÉNOMINATION SOCIALE :<br><small>(ou nom et prénoms de l'exploitant)</small></td><td>${h(e.nom)}</td></tr>
      <tr><td>SIGLE USUEL :</td><td>${h(e.sigle || '')}</td></tr>
      <tr><td>ADRESSE COMPLÈTE :</td><td>${h(e.adresse || '')}</td></tr>
      <tr><td>N° D'IDENTIFICATION FISCALE :</td><td>${h(e.ninea || '')}</td></tr>
    </table>
    <p class="systeme">SYSTÈME NORMAL</p>
    <table class="depot"><tr><th>Documents déposés</th><th></th><th>Réservé à la Direction Générale des Impôts</th></tr>
      <tr><td>Fiche d'identification et renseignements divers</td><td class="case">${coche('fiche')}</td><td rowspan="5" class="reserve">Date de dépôt :<br><br>Nom de l'agent ayant réceptionné le dépôt :<br><br>Signature de l'agent et cachet du service :</td></tr>
      <tr><td>Bilan</td><td class="case">${coche('bilan')}</td></tr>
      <tr><td>Compte de résultat</td><td class="case">${coche('cr')}</td></tr>
      <tr><td>Tableau des flux de trésorerie</td><td class="case">${coche('tft')}</td></tr>
      <tr><td>Notes annexes</td><td class="case">${coche('notes')}</td></tr>
    </table>
    ${x.provisoire.length ? '<div class="provisoire">ÉTATS PROVISOIRES</div>' : ''}
  </section>`;
}

function pageBilan(x: Contexte) {
  const a = calculateActif(x.d.balance), a1 = calculateActif(x.d.balanceN1);
  const p = calc(x.d.balance, PASSIF), p1 = calc(x.d.balanceN1, PASSIF);
  const n = Math.max(BILAN_ACTIF.length, BILAN_PASSIF.length);
  let lignes = '';
  for (let i = 0; i < n; i++) {
    const la = BILAN_ACTIF[i], lp = BILAN_PASSIF[i];
    const gauche = la ? `<td class="ref ${classe(la)}">${la.ref}</td><td class="lib ${classe(la)}">${h(la.libelle)}</td><td class="note ${classe(la)}">${la.note}</td>
      <td class="mt ${classe(la)}">${montant(a.brut[la.ref])}</td><td class="mt ${classe(la)}">${montant(a.amort[la.ref])}</td><td class="mt ${classe(la)}">${montant(a.net[la.ref])}</td><td class="mt ${classe(la)}">${x.n1 ? montant(a1.net[la.ref]) : ''}</td>`
      : '<td colspan="7"></td>';
    const droite = lp ? `<td class="ref ${classe(lp)}">${lp.ref}</td><td class="lib ${classe(lp)}">${h(lp.libelle)}</td><td class="note ${classe(lp)}">${lp.note}</td>
      <td class="mt ${classe(lp)}">${montant(p[lp.ref])}</td><td class="mt ${classe(lp)}">${x.n1 ? montant(p1[lp.ref]) : ''}</td>`
      : '<td colspan="5"></td>';
    lignes += `<tr>${gauche}<td class="sep"></td>${droite}</tr>`;
  }
  return `<section class="page paysage">${entete(x, 'BILAN')}
    <table class="etat bilan"><thead>
      <tr><th rowspan="2">REF</th><th rowspan="2">ACTIF</th><th rowspan="2">Note</th><th colspan="3">EXERCICE AU ${x.closN}</th><th>EXERCICE AU ${x.closN1}</th>
          <th class="sep" rowspan="2"></th><th rowspan="2">REF</th><th rowspan="2">PASSIF</th><th rowspan="2">Note</th><th>EXERCICE AU ${x.closN}</th><th>EXERCICE AU ${x.closN1}</th></tr>
      <tr><th>BRUT</th><th>AMORT. et DÉPRÉC.</th><th>NET</th><th>NET</th><th>NET</th><th>NET</th></tr>
    </thead><tbody>${lignes}</tbody></table>${pied(x)}</section>`;
}

function pageCr(x: Contexte) {
  const v = calc(x.d.balance, CR), v1 = calc(x.d.balanceN1, CR);
  const lignes = COMPTE_RESULTAT.map(l => `<tr class="${classe(l)}"><td class="ref">${l.ref}</td><td class="lib">${h(l.libelle)}</td><td class="lettre">${l.lettre ?? ''}</td><td class="signe">${l.signe ?? ''}</td><td class="note">${l.note}</td>
      <td class="mt">${montant(v[l.ref])}</td><td class="mt">${x.n1 ? montant(v1[l.ref]) : ''}</td></tr>`).join('');
  return `<section class="page">${entete(x, 'COMPTE DE RÉSULTAT')}
    <table class="etat"><thead><tr><th>REF</th><th>LIBELLÉS</th><th></th><th></th><th>NOTE</th><th>EXERCICE AU ${x.closN}<br>NET</th><th>EXERCICE AU ${x.closN1}<br>NET</th></tr></thead>
    <tbody>${lignes}</tbody></table>${pied(x)}</section>`;
}

function pageTft(x: Contexte) {
  const v = calculerTft(x.d.balance).valeurs, v1 = x.n1 ? calculerTft(x.d.balanceN1).valeurs : {};
  const lignes = LIGNES_TFT.map(l => {
    if (l.titre) return `<tr class="titre"><td class="ref"></td><td class="lib" colspan="6">${h(l.libelle)}</td></tr>`;
    const cls = l.total ? 'total' : '';
    return `<tr class="${cls}"><td class="ref">${l.code === 'VO' ? '' : l.code}</td><td class="lib">${h(l.libelle)}</td><td class="lettre">${l.lettre ?? ''}</td><td class="note"></td>
      <td class="mt">${montant(v[l.code])}</td><td class="mt">${x.n1 ? montant(v1[l.code]) : ''}</td></tr>`;
  }).join('');
  return `<section class="page">${entete(x, 'TABLEAU DES FLUX DE TRÉSORERIE')}
    <table class="etat"><thead><tr><th>REF</th><th>LIBELLÉS</th><th></th><th>NOTE</th><th>EXERCICE AU ${x.closN}<br>NET</th><th>EXERCICE AU ${x.closN1}<br>NET</th></tr></thead>
    <tbody>${lignes}</tbody></table>
    <p class="renvoi">(1) À l'exception des variations des dettes et créances liées aux opérations d'investissement et de financement. Encaissements (+), décaissements (−).</p>${pied(x)}</section>`;
}

const STYLE = `
  @page { size: A4 portrait; margin: 10mm; }
  @page paysage { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #000; background: #fff; }
  .page { position: relative; break-after: page; padding: 2mm 0; }
  .page:last-child { break-after: auto; }
  .paysage { page: paysage; }
  h1 { text-align: center; font-size: 12pt; letter-spacing: 1px; margin: 3mm 0; }
  table { border-collapse: collapse; width: 100%; }
  .ident td { border: 1px solid #000; padding: 1.2mm 2mm; width: 50%; }
  .etat th { border: 1px solid #000; padding: 1mm; font-size: 7.5pt; text-align: center; font-weight: bold; }
  .etat td { border: 1px solid #000; padding: .8mm 1.2mm; vertical-align: middle; }
  .bilan td, .bilan th { font-size: 6.8pt; }
  .bilan td { padding: .5mm 1mm; }
  .paysage h1 { margin: 1.5mm 0; }
  .paysage .ident td { padding: .8mm 2mm; }
  td.ref, td.note, td.lettre, td.signe { text-align: center; white-space: nowrap; }
  td.ref { width: 9mm; } td.note { width: 12mm; } td.lettre, td.signe { width: 7mm; }
  td.mt { text-align: right; white-space: nowrap; width: 25mm; font-variant-numeric: tabular-nums; }
  .bilan td.mt { width: 19mm; }
  .bilan td.note { width: 8mm; }
  .sep { border: none !important; width: 2mm; }
  tr.total td, td.total { font-weight: bold; background: #e6e6e6; }
  td.rubrique { font-weight: bold; }
  tr.titre td { font-weight: bold; font-style: italic; }
  .pied { margin-top: 2mm; font-size: 7pt; }
  .renvoi { margin-top: 1.5mm; font-size: 7pt; }
  .provisoire { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 46pt; font-weight: bold; color: rgba(0,0,0,.08); transform: rotate(-25deg); pointer-events: none; }
  .garde { text-align: center; }
  .garde .etat { font-weight: bold; line-height: 1.6; margin: 6mm 0 12mm; text-align: left; }
  .cadre-titre { border: 2px solid #000; padding: 5mm; font-size: 13pt; font-weight: bold; line-height: 1.6; margin: 0 15mm; }
  .exercice { margin: 8mm 0; font-size: 11pt; }
  .garde-ident td, .garde-ident th { border: 1px solid #000; padding: 3mm; text-align: left; }
  .garde-ident th { text-align: center; }
  .garde-ident td:first-child { width: 42%; font-weight: bold; }
  .systeme { margin: 8mm 0; font-size: 12pt; font-weight: bold; }
  .depot td, .depot th { border: 1px solid #000; padding: 2mm; text-align: left; }
  .depot .case { width: 10mm; text-align: center; font-weight: bold; }
  .depot .reserve { width: 45%; vertical-align: top; }
  @media screen { body { background: #f2f2f2; } .page { background: #fff; width: 210mm; margin: 6mm auto; padding: 10mm; box-shadow: 0 0 3px #999; } .paysage { width: 297mm; } .barre { text-align: center; padding: 3mm; } }
  @media print { .barre { display: none; } }
`;

/** Document HTML complet (testable sans navigateur). */
export function htmlEtatsFinanciers(d: DonneesDgid, etats: EtatPlaquette[]): string {
  const provisoire = controlesSyscohada(d.balance, d.balanceN1).filter(c => c.bloquant && !c.ok).map(c => c.code);
  const x: Contexte = { d, n1: d.balanceN1.length > 0, closN: dateFr(d.exercice.date_fin), closN1: dateFr(veille(d.exercice.date_debut)), provisoire };
  const pages = etats.map(e => e === 'garde' ? pageGarde(x, etats) : e === 'bilan' ? pageBilan(x) : e === 'cr' ? pageCr(x) : pageTft(x)).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>États financiers ${h(d.entreprise.nom)} ${d.exercice.annee}</title><style>${STYLE}</style></head>
    <body><div class="barre"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>${pages}</body></html>`;
}

export function imprimerEtatsFinanciers(d: DonneesDgid, etats: EtatPlaquette[]) {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) { alert('Veuillez autoriser les fenêtres surgissantes pour imprimer les états.'); return; }
  w.document.write(htmlEtatsFinanciers(d, etats));
  w.document.close();
}
