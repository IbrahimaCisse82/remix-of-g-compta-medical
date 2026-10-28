/**
 * Génération de l'annexe consolidée des 54 notes SYSCOHADA
 * — alimentée par la balance + les saisies manuelles (notes_annexes_data)
 */
import type { BalanceLine } from './accounting';
import { fmt } from './accounting';
import { escapeHtml } from './impression';

interface NoteCat {
  num: string;
  label: string;
  regex?: RegExp;        // comptable → tiré de la balance
  manualPrefix?: string; // informatif → préfixe des clés notes_annexes_data
}

// Catalogue officiel SYSCOHADA — 54 notes (Bilan 1-21 + CR 22-29C + HAO/Synthèse 30-34 + Informatives 35-40)
export const NOTES_CATALOG: NoteCat[] = [
  { num: '1',   label: 'Dettes garanties par des sûretés réelles & engagements hors bilan', manualPrefix: 'n1_' },
  { num: '2',   label: 'Règles et méthodes comptables', manualPrefix: 'n2_' },
  { num: '3A',  label: 'Immobilisations brutes (mouvements)', regex: /^(21|22|23|24|25|26|27)/ },
  { num: '3B',  label: 'Crédit-bail et contrats assimilés', manualPrefix: 'n3b_' },
  { num: '3C',  label: 'Amortissements', regex: /^28/ },
  { num: '3D',  label: 'Plus et moins-values de cession', regex: /^(81|82)/ },
  { num: '3E',  label: 'Écarts de réévaluation', regex: /^106/ },
  { num: '4',   label: 'Titres immobilisés et autres immobilisations financières', regex: /^(26|27)/ },
  { num: '5',   label: 'Actifs et dettes circulants HAO', regex: /^(475|481|482|483|484|485|486|487|488|489)/ },
  { num: '5A',  label: 'Charges et produits HAO (détail)', regex: /^(83|84|85|86|87|88)/ },
  { num: '5B',  label: 'Subventions d\'exploitation', regex: /^71/ },
  { num: '6',   label: 'Stocks et en-cours', regex: /^(31|32|33|34|35|36|37|38|39)/ },
  { num: '7',   label: 'Clients et comptes rattachés', regex: /^(411|412|413|414|416|418|419|491)/ },
  { num: '8',   label: 'Autres créances', regex: /^(425|427|4287|4387|4487|451|452|458|46[0-7]|471|472|474|476|477)/ },
  { num: '8A',  label: 'Charges immobilisées (étalement)', regex: /^20/ },
  { num: '9',   label: 'Titres de placement', regex: /^50/ },
  { num: '10',  label: 'Valeurs à encaisser', regex: /^51/ },
  { num: '11',  label: 'Banques, CCP, caisses et assimilés', regex: /^(52|53|54|57|58)/ },
  { num: '12',  label: 'Écarts de conversion et transferts de charges', regex: /^(478|479|781|787)/ },
  { num: '13',  label: 'Capital', regex: /^10[1-9]/ },
  { num: '14',  label: 'Primes, réserves et report à nouveau', regex: /^(105|11[1-8]|12)/ },
  { num: '15A', label: 'Subventions d\'investissement & provisions réglementées', regex: /^(14|151)/ },
  { num: '15B', label: 'Autres fonds propres', regex: /^15[2-9]/ },
  { num: '16A', label: 'Dettes financières et ressources assimilées', regex: /^(16|17|18)/ },
  { num: '16B', label: 'Échéancier des dettes financières', manualPrefix: 'n16b_' },
  { num: '17',  label: 'Fournisseurs d\'exploitation', regex: /^40/ },
  { num: '18',  label: 'Dettes fiscales et sociales', regex: /^(42|43|44)/ },
  { num: '19',  label: 'Autres dettes et provisions pour risques à court terme', regex: /^(46|47|499)/ },
  { num: '20',  label: 'Banques, crédits d\'escompte et de trésorerie', regex: /^56/ },
  { num: '21',  label: 'Engagements hors bilan', manualPrefix: 'n21_' },
  // Compte de résultat
  { num: '22',  label: 'Achats consommés', regex: /^60/ },
  { num: '23',  label: 'Transports', regex: /^61/ },
  { num: '24',  label: 'Services extérieurs', regex: /^(62|63)/ },
  { num: '25',  label: 'Impôts et taxes', regex: /^64/ },
  { num: '26',  label: 'Autres charges', regex: /^65/ },
  { num: '27A', label: 'Charges de personnel', regex: /^(66|637)/ },
  { num: '27B', label: 'Rémunérations des dirigeants', manualPrefix: 'n27b_' },
  { num: '28',  label: 'Provisions et dépréciations inscrites au bilan', regex: /^(19|29|39|49|59|151)/ },
  { num: '29A', label: 'Frais financiers', regex: /^67/ },
  { num: '29B', label: 'Revenus financiers', regex: /^77/ },
  { num: '29C', label: 'Gains et pertes de change', regex: /^(476|477|676|776)/ },
  // HAO & synthèse
  { num: '30',  label: 'Autres charges et produits HAO', regex: /^(83|84|85|86|87|88)/ },
  { num: '31',  label: 'Répartition du résultat & 5 derniers exercices', manualPrefix: 'n31_' },
  { num: '32',  label: 'Production de l\'exercice', manualPrefix: 'n32_' },
  { num: '33',  label: 'Achats destinés à la production', manualPrefix: 'n33_' },
  { num: '34',  label: 'Fiche de synthèse des indicateurs financiers', manualPrefix: 'n34_' },
  // Informatives
  { num: '35',  label: 'Informations sociales, environnementales et sociétales', manualPrefix: 'n35_' },
  { num: '36',  label: 'Tables des codes & effectifs', manualPrefix: 'n36_' },
  { num: '37',  label: 'Événements postérieurs à la clôture', manualPrefix: 'n37_' },
  { num: '38',  label: 'Régime fiscal et information sectorielle', manualPrefix: 'n38_' },
  { num: '39',  label: 'Fiche signalétique de l\'entreprise', manualPrefix: 'n39_' },
  { num: '40',  label: 'Approbation des états financiers', manualPrefix: 'n40_' },
];

export function buildAnnexesHtml(balance: BalanceLine[], notesData: Record<string, string>): string {
  const documented = NOTES_CATALOG.filter(note => note.num !== '8A' && (
    note.regex ? balance.some(b => note.regex?.test(b.compte) && (b.sfd !== b.sfc || b.md !== b.mc))
    : Object.entries(notesData).some(([key, value]) => note.manualPrefix && key.startsWith(note.manualPrefix) && value.trim())
  ));
  const total = documented.length;

  // ─── Sommaire cliquable ────────────────────────────
  let toc = `<div style="page-break-before: always;"></div>
    <h2 style="font-size:14px;font-weight:bold;color:#0B1F3A;text-transform:uppercase;letter-spacing:2px;margin:14px 0 10px;text-align:center;border-bottom:2px solid #0B1F3A;padding-bottom:6px;">
      SOMMAIRE — NOTES ANNEXES (${total} NOTES SYSCOHADA)
    </h2>
    <table style="font-size:9px;"><tbody>`;
  documented.forEach((n, i) => {
    const isManual = !!n.manualPrefix;
    toc += `<tr>
      <td style="width:50px;font-weight:bold;color:#0B1F3A;">N° ${n.num}</td>
      <td><a href="#note-${n.num}" style="color:#0B1F3A;text-decoration:none;">${n.label}</a></td>
      <td style="width:90px;text-align:right;color:#888;font-size:8px;">${isManual ? 'Saisie manuelle' : 'Balance auto'}</td>
      <td style="width:50px;text-align:right;color:#888;font-size:8px;">${i + 1}/${total}</td>
    </tr>`;
  });
  toc += `</tbody></table>`;

  // ─── Contenu des 54 notes ───────────────────────────
  let html = toc + `<div style="page-break-before: always;"></div>
    <h2 style="font-size:14px;font-weight:bold;color:#0B1F3A;text-transform:uppercase;letter-spacing:2px;margin:14px 0 10px;text-align:center;border-bottom:2px solid #0B1F3A;padding-bottom:6px;">
      NOTES ANNEXES PROVISOIRES — ${total} NOTES DOCUMENTÉES
    </h2>`;

  documented.forEach((note, i) => {
    const pageInfo = `Note ${i + 1} / ${total}`;
    html += `<div id="note-${note.num}" style="margin:14px 0 6px;page-break-inside:avoid;">
      <div style="background:#0B1F3A;color:#fff;padding:5px 8px;font-size:10px;font-weight:bold;letter-spacing:0.5px;display:flex;justify-content:space-between;align-items:center;">
        <span>NOTE ${note.num} — ${note.label}</span>
        <span style="font-size:8px;opacity:0.8;font-weight:normal;">${pageInfo}</span>
      </div>`;

    if (note.regex) {
      const rows = balance
        .filter(b => note.regex?.test(b.compte))
        .map(b => ({ ...b, solde: (b.sfd || 0) - (b.sfc || 0) }))
        .filter(r => r.solde !== 0)
        .sort((a, b) => a.compte.localeCompare(b.compte));

      if (rows.length === 0) {
        html += `<div style="padding:6px 8px;font-size:9px;color:#888;font-style:italic;background:#f9f9f9;">Aucun compte mouvementé sur cette note.</div>`;
      } else {
        const totalSolde = rows.reduce((s, r) => s + r.solde, 0);
        html += `<table style="margin:0;"><thead><tr>
          <th style="width:80px">Compte</th><th>Intitulé</th>
          <th class="r" style="width:90px">Débit</th>
          <th class="r" style="width:90px">Crédit</th>
          <th class="r" style="width:100px">Solde</th>
        </tr></thead><tbody>`;
        for (const r of rows) {
          html += `<tr><td>${escapeHtml(r.compte)}</td><td>${escapeHtml(r.intitule)}</td>
            <td class="r">${r.sfd ? fmt(r.sfd) : '—'}</td>
            <td class="r">${r.sfc ? fmt(r.sfc) : '—'}</td>
            <td class="r ${r.solde < 0 ? 'neg' : ''}">${fmt(r.solde)}</td></tr>`;
        }
        html += `<tr class="tot"><td colspan="4">TOTAL NOTE ${note.num}</td>
          <td class="r ${totalSolde < 0 ? 'neg' : ''}">${fmt(totalSolde)}</td></tr></tbody></table>`;
      }
    } else if (note.manualPrefix) {
      const entries = Object.entries(notesData)
        .filter(([k, v]) => note.manualPrefix && k.startsWith(note.manualPrefix) && v && v.trim() !== '')
        .sort((a, b) => a[0].localeCompare(b[0]));

      if (entries.length === 0) {
        html += `<div style="padding:6px 8px;font-size:9px;color:#888;font-style:italic;background:#f9f9f9;">Note informative — saisie manuelle non renseignée.</div>`;
      } else {
        html += `<table style="margin:0;"><thead><tr>
          <th style="width:35%">Rubrique</th><th>Valeur saisie</th>
        </tr></thead><tbody>`;
        for (const [k, v] of entries) {
          const label = k.replace(note.manualPrefix ?? '', '').replace(/_/g, ' ');
          html += `<tr><td style="font-family:monospace;font-size:9px;">${escapeHtml(label)}</td><td>${escapeHtml(v)}</td></tr>`;
        }
        html += `</tbody></table>`;
      }
    }
    html += `</div>`;
  });

  return html;
}

