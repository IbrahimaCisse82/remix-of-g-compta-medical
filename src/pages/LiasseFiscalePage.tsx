import ControleComptable from '@/components/ControleComptable';
import { assertExportable } from '@/lib/conformite-syscohada';
import { toast } from 'sonner';
import { useApp } from '@/stores/app-store';
import { calc, calculateActif, CR, ACTIF, PASSIF, TFT, fmt, fmtSigned, type MapLine } from '@/lib/accounting';
import { escapeHtml } from '@/lib/impression';
import { imprimerEtatsFinanciers } from '@/lib/pdf-export';
import ExportEtatsFinanciers from '@/components/ExportEtatsFinanciers';

function buildHeader(entreprise: any, exercice: any): string {
  // Toutes les données issues de la base sont échappées avant insertion dans le HTML.
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:2px solid #0B1F3A;padding-bottom:10px;">
      <div>
        <div style="font-size:18px;font-weight:bold;color:#0B1F3A;">${escapeHtml(entreprise.nom)}</div>
        <div style="font-size:9px;color:#555;margin-top:3px;">
          ${escapeHtml(entreprise.forme_juridique || '')} ${entreprise.sigle ? `(${escapeHtml(entreprise.sigle)})` : ''}
          ${entreprise.ninea ? ` · NINEA: ${escapeHtml(entreprise.ninea)}` : ''}
          ${entreprise.rccm ? ` · RCCM: ${escapeHtml(entreprise.rccm)}` : ''}
        </div>
        <div style="font-size:9px;color:#555;">${escapeHtml(entreprise.adresse || '')} ${entreprise.tel ? `· Tél: ${escapeHtml(entreprise.tel)}` : ''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;color:#888;">Monnaie: ${escapeHtml(entreprise.monnaie || 'FCFA')}</div>
        <div style="font-size:9px;color:#888;">Exercice: ${escapeHtml(exercice.date_debut)} au ${escapeHtml(exercice.date_fin)}</div>
      </div>
    </div>`;
}

function buildTable(title: string, def: MapLine[], vals: Record<string, number>, valsN1: Record<string, number>, hasN1: boolean, extra?: { brut?: Record<string, number>; amort?: Record<string, number> }): string {
  const isActif = !!extra?.brut;
  const cols = isActif 
    ? `<th>Réf</th><th>Libellé</th><th class="r">Brut</th><th class="r">Amort/Dép.</th><th class="r">Net N</th>${hasN1 ? '<th class="r">N-1</th>' : ''}`
    : `<th>Réf</th><th>Libellé</th><th class="r">N</th>${hasN1 ? '<th class="r">N-1</th>' : ''}`;
  
  let rows = '';
  for (const l of def) {
    if (l.type === 'sect') {
      rows += `<tr class="sect"><td colspan="${isActif ? (hasN1 ? 6 : 5) : (hasN1 ? 4 : 3)}">${escapeHtml(l.label)}</td></tr>`;
      continue;
    }
    const cls = l.type === 'gtotal' ? 'gtot' : l.type === 'total' ? 'tot' : '';
    const v = vals[l.id] || 0;
    if (isActif) {
      rows += `<tr class="${cls}"><td>${escapeHtml(l.id)}</td><td>${escapeHtml(l.label)}</td><td class="r">${fmtSigned(extra?.brut?.[l.id] || 0)}</td><td class="r">${extra?.amort?.[l.id] ? fmtSigned(-(extra?.amort?.[l.id] || 0)) : '—'}</td><td class="r">${fmtSigned(v)}</td>${hasN1 ? `<td class="r">${fmtSigned(valsN1[l.id] || 0)}</td>` : ''}</tr>`;
    } else {
      rows += `<tr class="${cls}"><td>${escapeHtml(l.id)}</td><td>${escapeHtml(l.label)}</td><td class="r ${v < 0 ? 'neg' : ''}">${fmt(v)}</td>${hasN1 ? `<td class="r">${fmt(valsN1[l.id] || 0)}</td>` : ''}</tr>`;
    }
  }

  return `<h2 style="font-size:13px;font-weight:bold;color:#0B1F3A;text-transform:uppercase;letter-spacing:2px;margin:20px 0 8px;text-align:center;">${title}</h2>
    <table><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>`;
}

export default function LiasseFiscalePage() {
  const { balance, balanceN1, entreprise, exercice } = useApp();

  const vA = calc(balance, ACTIF);
  const vP = calc(balance, PASSIF);
  const vCR = calc(balance, CR);
  const vAN1 = calc(balanceN1, ACTIF);
  const vPN1 = calc(balanceN1, PASSIF);
  const vCRN1 = calc(balanceN1, CR);
  const hasN1 = balanceN1.length > 0;
  const vT = calc(balance, TFT, { XI: vCR['XI'] || 0 });
  const vTN1 = hasN1 ? calc(balanceN1, TFT, { XI: vCRN1['XI'] || 0 }) : {};

  const { brut: vABrut, amort: vAAmort } = calculateActif(balance);

  const rn = vCR['XI'] || 0;

  const handleExportDSF = () => {
    if (!entreprise || !exercice) return;
    try { assertExportable(balance, balanceN1); } catch (error) { toast.error(error instanceof Error ? error.message : 'États non validés'); return; }
    void imprimerEtatsFinanciers({ entreprise, exercice, balance, balanceN1 }, ['garde', 'bilan', 'cr', 'tft']);
  };

  const handleExportDSFComplete = () => {
    if (!entreprise || !exercice) return;
    try { assertExportable(balance, balanceN1); } catch (error) { toast.error(error instanceof Error ? error.message : 'États non validés'); return; }
    void imprimerEtatsFinanciers({ entreprise, exercice, balance, balanceN1 }, ['garde', 'bilan', 'cr', 'tft', 'notes']);
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Liasse Fiscale (DSF)</div>
          <div className="text-[10px] text-fg3 font-mono">Déclaration Statistique et Fiscale — {entreprise?.nom} — {exercice?.annee}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportDSF} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-primary/30 text-primary hover:bg-primary/10">📄 DSF seul</button>
          <button onClick={handleExportDSFComplete} className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90">📚 Liasse complète</button>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div className="bg-bg2 border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-bold text-primary">📋 Contenu de la Liasse Fiscale</h3>
          <p className="text-[11px] text-fg2">La DSF (Déclaration Statistique et Fiscale) est le document officiel à déposer auprès des administrations fiscales. Elle comprend :</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {[
              { num: '1', label: 'Fiche Signalétique', desc: 'Identification complète de l\'entreprise' },
              { num: '2', label: 'Bilan (Actif & Passif)', desc: 'Brut / Amortissements / Net avec comparatif N-1' },
              { num: '3', label: 'Compte de Résultat', desc: 'SIG complets SYSCOHADA avec références officielles' },
              { num: '4', label: 'Tableau des Flux de Trésorerie', desc: 'Méthode indirecte — Références ZA à ZH' },
            ].map(item => (
              <div key={item.num} className="bg-bg3 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-bold">{item.num}</span>
                  <span className="text-[11px] font-bold">{item.label}</span>
                </div>
                <p className="text-[10px] text-fg3 pl-7">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Summary preview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[9px] text-fg3 uppercase font-mono">Total Actif (BZ)</div>
            <div className="text-sm font-bold font-mono mt-1">{fmt(vA['BZ'] || 0)}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[9px] text-fg3 uppercase font-mono">Total Passif (DZ)</div>
            <div className="text-sm font-bold font-mono mt-1">{fmt(vP['DZ'] || 0)}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[9px] text-fg3 uppercase font-mono">CA (XB)</div>
            <div className="text-sm font-bold font-mono text-primary mt-1">{fmt(vCR['XB'] || 0)}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[9px] text-fg3 uppercase font-mono">Résultat Net (XI)</div>
            <div className={`text-sm font-bold font-mono mt-1 ${rn >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtSigned(rn)}</div>
          </div>
        </div>

        <div className="text-center space-y-2">
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={handleExportDSF} className="px-6 py-2.5 rounded-lg text-sm font-bold border border-primary/40 text-primary hover:bg-primary/10 transition-all">
              📄 États financiers (page de garde, bilan, CR, TFT)
            </button>
            <button onClick={handleExportDSFComplete} className="px-6 py-2.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all">
              📚 Liasse complète (pages de garde, états, notes 1 à 36)
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <span className="text-[10px] text-fg3 self-center">Version de travail (mention « provisoire » tant que les contrôles ne sont pas satisfaits) :</span>
            <ExportEtatsFinanciers etats={['garde', 'bilan', 'cr', 'tft', 'notes']} />
          </div>
          <p className="text-[10px] text-fg3 mt-2">Le document s'ouvrira dans une nouvelle fenêtre pour impression / enregistrement PDF (A4).</p>
        </div>
      </div>
    </div>
  );
}
