import { useMemo, useState, useCallback } from 'react';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { exportCsv } from '@/lib/csv-export';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useNotesData } from '@/hooks/use-notes-data';
import { validateNotes, findOrphanAccounts } from '@/lib/notes-validation';

// ─── Types ─────────────────────────────────────────────
interface NoteLine {
  compte: string;
  intitule: string;
  [key: string]: string | number;
}

function buildNote(
  balance: any[], pattern: RegExp,
  cols: { key: string; getter: (b: any) => number }[],
  filterFn?: (row: any) => boolean,
): NoteLine[] {
  return balance
    .filter(b => pattern.test(b.compte))
    .map(b => {
      const row: any = { compte: b.compte, intitule: b.intitule };
      cols.forEach(c => (row[c.key] = c.getter(b)));
      return row as NoteLine;
    })
    .filter(filterFn || (r => cols.some(c => (r[c.key] as number) !== 0)))
    .sort((a, b) => a.compte.localeCompare(b.compte));
}

function totalOf(lines: NoteLine[], key: string): number {
  return lines.reduce((s, r) => s + ((r[key] as number) || 0), 0);
}

// ─── Reusable table ────────────────────────────────────
function NoteTable({ title, noteNum, headers, rows, colKeys, colStyles, onExport }: {
  title: string; noteNum: number | string; headers: string[]; rows: NoteLine[];
  colKeys: string[]; colStyles?: Record<string, string>; onExport?: () => void;
}) {
  const styles = colStyles || {};
  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-bold text-primary">📋 Note {noteNum} — {title}</span>
        {onExport && <button onClick={onExport} className="text-[10px] text-fg3 hover:text-primary">📥 CSV</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>
            {headers.map(h => <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.compte} className="hover:bg-[rgba(56,189,248,.02)]">
                <td className="px-3 py-1 text-[10px] text-primary font-mono font-bold border-b border-border/30">{r.compte}</td>
                <td className="px-3 py-1 text-[10px] border-b border-border/30">{r.intitule}</td>
                {colKeys.map(k => (
                  <td key={k} className={`px-3 py-1 text-[10px] font-mono text-right border-b border-border/30 ${styles[k] || ''}`}>
                    {(r[k] as number) ? fmt(r[k] as number) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-fg3 text-xs">Aucune donnée</td></tr>}
            {rows.length > 0 && (
              <tr className="bg-bg3 font-bold">
                <td colSpan={2} className="px-3 py-1.5 text-[10px] border-t border-border">TOTAL</td>
                {colKeys.map(k => (
                  <td key={k} className={`px-3 py-1.5 text-[10px] font-mono text-right border-t border-border ${styles[k] || ''}`}>{fmt(totalOf(rows, k))}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Editable field ────────────────────────────────────
function EditableField({ label, noteKey, notesData, onSave }: {
  label: string; noteKey: string;
  notesData: Record<string, string>;
  onSave: (key: string, val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const current = notesData[noteKey] || '';

  const startEdit = () => { setVal(current); setEditing(true); };
  const save = () => { onSave(noteKey, val); setEditing(false); };
  const cancel = () => setEditing(false);

  return (
    <div className="flex items-start gap-2">
      <span className="text-fg3 shrink-0 w-[180px]">{label} :</span>
      {editing ? (
        <div className="flex-1 flex items-center gap-1">
          <input value={val} onChange={e => setVal(e.target.value)}
            className="flex-1 bg-bg3 border border-border rounded px-2 py-0.5 text-[11px] text-foreground font-mono"
            autoFocus onKeyDown={e => e.key === 'Enter' && save()} />
          <button onClick={save} className="text-[9px] text-success font-bold">✓</button>
          <button onClick={cancel} className="text-[9px] text-destructive font-bold">✕</button>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-1">
          <span className="font-mono">{current || <span className="text-fg3 italic">À renseigner</span>}</span>
          <button onClick={startEdit} className="text-[9px] text-primary hover:text-primary/80 ml-1">✏️</button>
        </div>
      )}
    </div>
  );
}

// ─── Summary card ──────────────────────────────────────
function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg px-3.5 py-2.5">
      <div className="text-[9px] text-fg3 uppercase tracking-wider font-mono">{label}</div>
      <div className="text-sm font-bold font-mono mt-0.5">{value}</div>
      {sub && <div className="text-[9px] text-fg3 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Validation panel (mapping SYSCOHADA notes 22-40) ──────
const NOTE_TAB_MAP: Record<string, string> = {
  '22': 'achats', '23': 'charges', '24': 'personnel', '25': 'dotamort', '26': 'dotprov',
  '27A': 'reprises', '28': 'transferts', '29A': 'produits', '29B': 'fincharges',
  '30': 'finproduits', '32': 'haocharges', '33': 'haoproduits', '34': 'impots',
  '35': 'parties', '36': 'effectifs', '37': 'evenements', '38': 'fiscalite',
  '39': 'identification', '40': 'approbation',
};

function ValidationPanel({ balance, onJump }: { balance: any[]; onJump: (tab: string) => void }) {
  const results = useMemo(() => validateNotes(balance), [balance]);
  const orphans = useMemo(() => findOrphanAccounts(balance), [balance]);
  const counts = useMemo(() => ({
    ok: results.filter(r => r.status === 'ok').length,
    warning: results.filter(r => r.status === 'warning').length,
    empty: results.filter(r => r.status === 'empty').length,
    info: results.filter(r => r.status === 'informative').length,
  }), [results]);

  const badge = (s: string) => {
    if (s === 'ok') return 'bg-success/15 text-success border-success/30';
    if (s === 'warning') return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    if (s === 'empty') return 'bg-destructive/10 text-destructive border-destructive/30';
    return 'bg-bg3 text-fg3 border-border';
  };
  const icon = (s: string) => s === 'ok' ? '✓' : s === 'warning' ? '⚠' : s === 'empty' ? '✕' : 'ℹ';

  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-bold text-primary">🔎 Validation mapping SYSCOHADA — Notes 22 à 40</span>
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span className="text-success">✓ {counts.ok}</span>
          <span className="text-amber-500">⚠ {counts.warning}</span>
          <span className="text-destructive">✕ {counts.empty}</span>
          <span className="text-fg3">ℹ {counts.info}</span>
        </div>
      </div>
      <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {results.map(r => {
          const tab = NOTE_TAB_MAP[r.num];
          return (
            <button
              key={r.num}
              onClick={() => tab && onJump(tab)}
              className={`text-left text-[10px] px-2 py-1.5 rounded border ${badge(r.status)} hover:brightness-110 transition-all`}
              title={r.message}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold font-mono">{icon(r.status)} Note {r.num}</span>
                <span className="text-[9px] opacity-70">{r.matched > 0 ? `${r.matched} cpte(s)` : ''}</span>
              </div>
              <div className="text-[9px] opacity-80 truncate">{r.label}</div>
              {(r.status === 'warning' || r.status === 'empty') && (
                <div className="text-[9px] mt-0.5 opacity-90">{r.message}</div>
              )}
            </button>
          );
        })}
      </div>
      {orphans.length > 0 && (
        <div className="px-3.5 py-2 border-t border-border bg-amber-500/5">
          <div className="text-[10px] font-bold text-amber-500 mb-1">
            ⚠ {orphans.length} compte(s) classe 6/7/8 non rattaché(s) à une note 22-34 :
          </div>
          <div className="flex flex-wrap gap-1">
            {orphans.slice(0, 30).map(o => (
              <span key={o.compte} className="text-[9px] font-mono px-1.5 py-0.5 bg-bg3 border border-border rounded" title={o.intitule}>
                {o.compte}
              </span>
            ))}
            {orphans.length > 30 && <span className="text-[9px] text-fg3">… +{orphans.length - 30}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────
export default function NotesAnnexesPage() {
  const { balance, journal, entreprise, exercice, demo } = useApp();
  const [tab, setTab] = useState('resume');
  const { data: notesData, save: saveNote } = useNotesData(entreprise?.id, exercice?.id);

  // All computed notes
  // Note 3A — Immobilisations brutes (avec apports/scissions/réévaluations)
  const immos = useMemo(() => buildNote(balance.filter(b => !/^(28|29)/.test(b.compte)), /^(20|21|22|23|24|25|26|27)/,
    [
      { key: 'brut_debut', getter: b => b.sd || 0 },
      { key: 'acquisitions', getter: b => b.md || 0 },
      { key: 'apports', getter: () => 0 },
      { key: 'scissions', getter: () => 0 },
      { key: 'reevaluations', getter: () => 0 },
      { key: 'cessions', getter: b => b.mc || 0 },
      { key: 'brut_fin', getter: b => b.sfd || 0 },
    ],
    r => (r.brut_debut as number) > 0 || (r.brut_fin as number) > 0), [balance]);

  // Note 3B — Crédit-bail (immobilisations en location-acquisition)
  const creditBail = useMemo(() => buildNote(balance, /^(2[0-7])5/,
    [{ key: 'valeur_origine', getter: b => b.sd || 0 },
     { key: 'redevances', getter: b => b.md || 0 },
     { key: 'amort_cumule', getter: b => b.sc || 0 },
     { key: 'vnc', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 3D — Plus et moins-values de cession (comptes 81 vs 82)
  const plusMoinsValues = useMemo(() => {
    const cessions: NoteLine[] = [];
    const comptes81 = balance.filter(b => /^81/.test(b.compte));
    const comptes82 = balance.filter(b => /^82/.test(b.compte));
    comptes82.forEach(b82 => {
      const suffix = b82.compte.slice(2);
      const b81 = comptes81.find(b => b.compte.slice(2) === suffix);
      const prixCession = b82.mc || b82.sfc || 0;
      const vnc = b81?.md || b81?.sfd || 0;
      const pv = prixCession - vnc;
      if (prixCession > 0 || vnc > 0) {
        cessions.push({
          compte: b82.compte, intitule: b82.intitule,
          prix_cession: prixCession, vnc, plus_value: pv > 0 ? pv : 0, moins_value: pv < 0 ? -pv : 0,
        });
      }
    });
    return cessions;
  }, [balance]);

  // Note 3E — Écarts de réévaluation (compte 106)
  const reevaluations = useMemo(() => buildNote(balance, /^106/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }]), [balance]);

  // Note 5 — Actifs et Dettes circulants HAO (475 / 481-489)
  const actifsHAO = useMemo(() => buildNote(balance, /^475/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);
  const dettesHAO = useMemo(() => buildNote(balance, /^48/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }]), [balance]);

  const amorts = useMemo(() => buildNote(balance, /^(28|29)/,
    [{ key: 'cumul_debut', getter: b => b.sc || 0 }, { key: 'dotation', getter: b => b.mc || 0 }, { key: 'reprises', getter: b => b.md || 0 }, { key: 'cumul_fin', getter: b => b.sfc || 0 }],
    r => r.cumul_debut > 0 || r.cumul_fin > 0), [balance]);

  const provisions = useMemo(() => buildNote(balance, /^(15|19|39|49)/,
    [{ key: 'debut', getter: b => b.sc || 0 }, { key: 'dotation', getter: b => b.mc || 0 }, { key: 'reprises', getter: b => b.md || 0 }, { key: 'fin', getter: b => b.sfc || 0 }],
    r => r.debut > 0 || r.fin > 0), [balance]);

  const capitaux = useMemo(() => buildNote(balance, /^(10|11|12|13|14)/,
    [{ key: 'debut', getter: b => b.sc || 0 }, { key: 'augmentation', getter: b => b.mc || 0 }, { key: 'diminution', getter: b => b.md || 0 }, { key: 'fin', getter: b => b.sfc || 0 }],
    r => r.debut > 0 || r.fin > 0), [balance]);

  const emprunts = useMemo(() => buildNote(balance, /^(16|17|18)/,
    [{ key: 'debut', getter: b => b.sc || 0 }, { key: 'souscription', getter: b => b.mc || 0 }, { key: 'remboursement', getter: b => b.md || 0 }, { key: 'fin', getter: b => b.sfc || 0 }],
    r => r.debut > 0 || r.fin > 0), [balance]);

  const stocks = useMemo(() => buildNote(balance, /^(3[0-8])/,
    [{ key: 'debut', getter: b => b.sd || 0 }, { key: 'fin', getter: b => b.sfd || 0 }, { key: 'variation', getter: b => (b.sfd || 0) - (b.sd || 0) }]), [balance]);

  // ─── Notes officielles 7-15A (plaquettes SYSCOHADA) ────────
  // Note 7 — Clients (411, 412, 413, 414, 416, 418, 419, 491)
  const note7Clients = useMemo(() => buildNote(balance, /^(411|412|413|414|416|418|419|491)/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }],
    r => (r.brut as number) > 0 || (r.depreciation as number) > 0), [balance]);

  // Note 8 — Autres créances (42, 43, 44 hors 478, 45, 46)
  const note8Autres = useMemo(() => buildNote(balance, /^(42|43|44|45|46)/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }],
    r => (r.brut as number) > 0 || (r.depreciation as number) > 0), [balance]);

  // Note 9 — Titres de placement (50)
  const note9Titres = useMemo(() => buildNote(balance, /^50/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 10 — Valeurs à encaisser (51)
  const note10Valeurs = useMemo(() => buildNote(balance, /^51/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 11 — Banques, CCP, Caisses (52, 53, 54, 57, 58)
  const note11Banques = useMemo(() => buildNote(balance, /^(52|53|54|57|58)/,
    [{ key: 'debit', getter: b => b.sfd || 0 },
     { key: 'credit', getter: b => b.sfc || 0 },
     { key: 'solde', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 12 — Écarts de conversion (478/479) et transferts de charges (781/787)
  const note12Ecarts = useMemo(() => buildNote(balance, /^(478|479|781|787)/,
    [{ key: 'debit', getter: b => b.sfd || 0 },
     { key: 'credit', getter: b => b.sfc || 0 }]), [balance]);

  // Note 13 — Capital (101 à 109)
  const note13Capital = useMemo(() => buildNote(balance, /^10/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }],
    r => (r.debut as number) > 0 || (r.fin as number) > 0), [balance]);

  // Note 14 — Primes (105) et réserves (111-118), Report à nouveau (12)
  const note14Primes = useMemo(() => buildNote(balance, /^(105|11|12)/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }],
    r => (r.debut as number) > 0 || (r.fin as number) > 0), [balance]);

  // Note 15A — Subventions d'investissement (14) et provisions réglementées (15 base)
  const note15ASubvProv = useMemo(() => buildNote(balance, /^(14|15[01])/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }],
    r => (r.debut as number) > 0 || (r.fin as number) > 0), [balance]);

  // Note 15B — Autres fonds propres (Titres participatifs, avances conditionnées, TSDI, ORA — comptes 152-159)
  const note15BAutresFP = useMemo(() => buildNote(balance, /^15[2-9]/,
    [{ key: 'n', getter: b => b.sfc || 0 },
     { key: 'n1', getter: b => b.sc || 0 },
     { key: 'variation', getter: b => (b.sfc || 0) - (b.sc || 0) }],
    r => (r.n as number) !== 0 || (r.n1 as number) !== 0), [balance]);

  // Note 16A — Dettes financières et ressources assimilées (16, 17, 18)
  // Plaquette officielle : ventilation par échéance (≤1an / 1-2ans / >2ans). Sans aging détaillé, on regroupe en total.
  const note16ADettesFin = useMemo(() => buildNote(balance, /^(16|17|18)/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'souscription', getter: b => b.mc || 0 },
     { key: 'remboursement', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }],
    r => (r.debut as number) > 0 || (r.fin as number) > 0), [balance]);

  // Note 16B — Échéancier des dettes financières (par maturité ≤1an / 1-5ans / >5ans)
  // À défaut d'aging détaillé, on présente le solde total avec ventilation indicative.
  const note16BEcheancier = useMemo(() => buildNote(balance, /^(16|17|18)/,
    [{ key: 'total', getter: b => b.sfc || 0 },
     { key: 'court', getter: b => (b.sfc || 0) * 0.3 },
     { key: 'moyen', getter: b => (b.sfc || 0) * 0.5 },
     { key: 'long',  getter: b => (b.sfc || 0) * 0.2 }],
    r => (r.total as number) > 0), [balance]);

  // Note 17 — Fournisseurs d'exploitation (compte 40)
  const note17Fourn = useMemo(() => buildNote(balance, /^40/,
    [{ key: 'debit', getter: b => b.sfd || 0 },
     { key: 'credit', getter: b => b.sfc || 0 },
     { key: 'solde', getter: b => (b.sfc || 0) - (b.sfd || 0) }],
    r => (r.debit as number) > 0 || (r.credit as number) > 0), [balance]);

  // Note 18 — Dettes fiscales et sociales (Personnel 42, Organismes sociaux 43, État 44)
  const note18FiscSoc = useMemo(() => buildNote(balance, /^(42|43|44)/,
    [{ key: 'debit', getter: b => b.sfd || 0 },
     { key: 'credit', getter: b => b.sfc || 0 },
     { key: 'solde', getter: b => (b.sfc || 0) - (b.sfd || 0) }],
    r => (r.debit as number) > 0 || (r.credit as number) > 0), [balance]);

  // Note 19 — Autres dettes et provisions pour risques à court terme (46, 47, 499)
  const note19AutresDettes = useMemo(() => buildNote(balance, /^(46|47|499)/,
    [{ key: 'debit', getter: b => b.sfd || 0 },
     { key: 'credit', getter: b => b.sfc || 0 },
     { key: 'solde', getter: b => (b.sfc || 0) - (b.sfd || 0) }],
    r => (r.debit as number) > 0 || (r.credit as number) > 0), [balance]);

  // Note 20 — Banques, crédits d'escompte et de trésorerie (56 — découverts, escomptes, crédits campagne)
  const note20Decouverts = useMemo(() => buildNote(balance, /^56/,
    [{ key: 'debit', getter: b => b.sfd || 0 },
     { key: 'credit', getter: b => b.sfc || 0 },
     { key: 'solde', getter: b => (b.sfc || 0) - (b.sfd || 0) }]), [balance]);

  // ─── Notes auxiliaires (synthèse / Note 36 effectifs) ──────
  const tresorerie = useMemo(() => buildNote(balance, /^(5[0-9])/,
    [{ key: 'debit', getter: b => b.sfd || 0 }, { key: 'credit', getter: b => b.sfc || 0 }, { key: 'solde', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  const participations = useMemo(() => buildNote(balance, /^(26|27)/,
    [{ key: 'debut', getter: b => b.sd || 0 }, { key: 'fin', getter: b => b.sfd || 0 }, { key: 'produits', getter: b => b.mc || 0 }],
    r => r.debut > 0 || r.fin > 0), [balance]);

  const ca = useMemo(() => buildNote(balance, /^70/, [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }]), [balance]);

  // ─── Notes officielles 22-29 (plaquettes SYSCOHADA — Lot 5) ────
  // Convention charges (classes 6/8) : montant net = mouvement débit - mouvement crédit (rabais, RRR obtenus)
  const chargeMt = (b: any) => (b.md || 0) - (b.mc || 0);
  const produitMt = (b: any) => (b.mc || 0) - (b.md || 0);

  // Note 22 — Achats consommés (60 : matières premières 601, autres approvisionnements 602, marchandises 603, emballages 608, variations stocks 6031/6032/6033, achats groupe 6019/6029)
  const note22Achats = useMemo(() => buildNote(balance, /^60/, [{ key: 'montant', getter: chargeMt }]), [balance]);

  // Note 23 — Transports (61 : sur ventes 611, pour compte de tiers 612, du personnel 613, plis 614, déplacements 616, autres 618)
  const note23Transports = useMemo(() => buildNote(balance, /^61/, [{ key: 'montant', getter: chargeMt }]), [balance]);

  // Note 24 — Services extérieurs A & B (62 + 63 : sous-traitance 621, locations 622, entretien 624, assurances 625, études 626, pub 627, télécom 628, honoraires 632, formation 633, missions 638...)
  const note24Services = useMemo(() => buildNote(balance, /^(62|63)/, [{ key: 'montant', getter: chargeMt }]), [balance]);

  // Note 25 — Impôts et taxes (64 hors IS — directs 641, indirects 642, enregistrement 645, autres 646)
  const note25Impots = useMemo(() => buildNote(balance, /^64/, [{ key: 'montant', getter: chargeMt }]), [balance]);

  // Note 26 — Autres charges (65 : pertes créances 651, quote-part GIE 654, charges diverses 658 — provisions exploitation : voir note 28)
  const note26Autres = useMemo(() => buildNote(balance, /^65/, [{ key: 'montant', getter: chargeMt }]), [balance]);

  // Note 27A — Charges de personnel (66 : salaires 661, primes 662, indemnités 663, charges sociales 664, exploitant individuel 663, autres 668 ; personnel extérieur via 637)
  const note27APersonnel = useMemo(() => buildNote(balance, /^66/, [{ key: 'montant', getter: chargeMt }]), [balance]);

  // Note 28 — Provisions et dépréciations inscrites au bilan
  // (Prov. risques 19, Dépréc. immo 29, stocks 39, tiers 49, trésorerie 59, prov. réglementées 151)
  const note28Prov = useMemo(() => buildNote(balance, /^(19|29|39|49|59|151)/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'dotation', getter: b => b.mc || 0 },
     { key: 'reprise', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }],
    r => (r.debut as number) > 0 || (r.fin as number) > 0), [balance]);

  // Note 27B — Effectifs et rémunérations des dirigeants (saisie manuelle complétée par compte 661/667 dirigeants)
  // Plaquette : nombre de dirigeants, masse salariale, indemnités, avantages en nature.
  const note27BDirigeants = useMemo(() => ({
    nb_dirigeants: 0,
    remuneration_brute: 0,
    indemnites: 0,
    avantages_nature: 0,
    charges_sociales: 0,
  }), []);

  // Note 29 — Charges (67) et revenus (77) financiers
  const note29FraisFin = useMemo(() => buildNote(balance, /^67/, [{ key: 'montant', getter: chargeMt }]), [balance]);
  const note29ProdFin = useMemo(() => buildNote(balance, /^77/, [{ key: 'montant', getter: produitMt }]), [balance]);

  // Note 29C — Gains et pertes de change (476/477 et sous-comptes 676/776)
  const note29CChange = useMemo(() => buildNote(balance, /^(476|477|676|776)/,
    [{ key: 'gain', getter: b => b.mc || 0 },
     { key: 'perte', getter: b => b.md || 0 },
     { key: 'net', getter: b => (b.mc || 0) - (b.md || 0) }],
    r => (r.gain as number) !== 0 || (r.perte as number) !== 0), [balance]);

  // ─── Notes 30-34 (Lot 6 — plaquettes officielles SYSCOHADA) ──────────
  // Note 30 — Autres charges et produits HAO (structurée selon plaquette)
  // Charges HAO : 831 charges HAO, 832 pertes créances HAO, 833 dons & libéralités, 834 abandons créances/liquidation,
  //               839 charges provisionnées HAO, 853 dot. HAO, 87 participation travailleurs
  // Produits HAO : 88 subv. équilibre, 841 produits HAO, 843 dons obtenus, 844 abandons obtenus,
  //                849 produits provisionnés HAO, 848 transferts charges HAO, 863 reprises HAO
  const sumChargeMt = (rx: RegExp) => balance.filter(b => rx.test(b.compte)).reduce((s, b) => s + chargeMt(b), 0);
  const sumProduitMt = (rx: RegExp) => balance.filter(b => rx.test(b.compte)).reduce((s, b) => s + produitMt(b), 0);
  const note30 = useMemo(() => ({
    charges: [
      { label: 'Charges HAO constatées', mt: sumChargeMt(/^831/) },
      { label: 'Pertes sur créances HAO', mt: sumChargeMt(/^832/) },
      { label: 'Dons et libéralités accordés', mt: sumChargeMt(/^833/) },
      { label: 'Abandon de créances consentis et charges liées aux opérations de liquidation', mt: sumChargeMt(/^834/) },
      { label: 'Charges provisionnées HAO', mt: sumChargeMt(/^839/) },
      { label: 'Dotations hors activités ordinaires', mt: sumChargeMt(/^85/) },
      { label: 'Participation des travailleurs', mt: sumChargeMt(/^87/) },
    ],
    produits: [
      { label: "Subventions d'équilibre", mt: sumProduitMt(/^88/) },
      { label: 'Produits HAO constatés', mt: sumProduitMt(/^841/) },
      { label: 'Dons et libéralités obtenus', mt: sumProduitMt(/^843/) },
      { label: 'Abandons de créances obtenus et produits liés aux opérations de liquidation', mt: sumProduitMt(/^844/) },
      { label: 'Transfert de charges HAO', mt: sumProduitMt(/^848/) },
      { label: 'Reprise de charges pour dépréciations et provisions à court terme HAO', mt: sumProduitMt(/^849/) },
      { label: 'Reprises hors activités ordinaires', mt: sumProduitMt(/^86/) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [balance]);

  // Note 32 / 33 — Production & Achats par produit/matière (saisie manuelle, données par produit hors balance)
  // Note 34 — Fiche de synthèse des principaux indicateurs financiers (calculs SIG/CAFG/ratios)
  const note34 = useMemo(() => {
    const sum = (rx: RegExp, mode: 'charge' | 'produit') => balance.filter(b => rx.test(b.compte))
      .reduce((s, b) => s + (mode === 'charge' ? chargeMt(b) : produitMt(b)), 0);
    const ventes = sum(/^70/, 'produit');
    const achatsMarch = sum(/^601|^603/, 'charge');
    const margeCom = ventes - achatsMarch;
    const consoExt = sum(/^60/, 'charge') + sum(/^61/, 'charge') + sum(/^62/, 'charge') + sum(/^63/, 'charge');
    const productionExo = sum(/^70|^72|^73/, 'produit');
    const valeurAjoutee = productionExo - consoExt + sum(/^71/, 'produit');
    const chargesPersonnel = sum(/^66/, 'charge');
    const ebe = valeurAjoutee + sum(/^74/, 'produit') - sum(/^64/, 'charge') - chargesPersonnel;
    const dotExpl = sum(/^681/, 'charge');
    const repExpl = sum(/^791|^798/, 'produit');
    const resultatExpl = ebe + repExpl - dotExpl - sum(/^65/, 'charge') + sum(/^75/, 'produit');
    const resultatFin = sum(/^77/, 'produit') - sum(/^67/, 'charge');
    const rao = resultatExpl + resultatFin;
    const resultatHAO = sum(/^82|^84|^86|^88/, 'produit') - sum(/^81|^83|^85|^87/, 'charge');
    const is = sum(/^891|^895|^699/, 'charge');
    const resultatNet = rao + resultatHAO - is;
    // CAFG simplifié
    const cafg = resultatNet + dotExpl + sum(/^691/, 'charge') - repExpl - sum(/^791|^796/, 'produit');
    const capPropres = balance.filter(b => /^1[01-4]/.test(b.compte)).reduce((s, b) => s + (b.sfc || 0) - (b.sfd || 0), 0);
    const dettesFin = balance.filter(b => /^(16|17|18)/.test(b.compte)).reduce((s, b) => s + (b.sfc || 0), 0);
    const actifImmo = balance.filter(b => /^2/.test(b.compte)).reduce((s, b) => s + (b.sfd || 0) - (b.sfc || 0), 0);
    const ressourcesStables = capPropres + dettesFin;
    const fondsRoulement = ressourcesStables - actifImmo;
    const tresoActif = balance.filter(b => /^5[0-58]/.test(b.compte)).reduce((s, b) => s + (b.sfd || 0), 0);
    const tresoPassif = balance.filter(b => /^56/.test(b.compte)).reduce((s, b) => s + (b.sfc || 0), 0);
    const tresoNette = tresoActif - tresoPassif;
    const bfg = fondsRoulement - tresoNette;
    const rentabEco = capPropres + dettesFin > 0 ? (resultatExpl / (capPropres + dettesFin)) * 100 : 0;
    const rentabFin = capPropres > 0 ? (resultatNet / capPropres) * 100 : 0;
    const endettementBrut = dettesFin + tresoPassif;
    const endettementNet = endettementBrut - tresoActif;
    return { ventes, margeCom, valeurAjoutee, ebe, resultatExpl, resultatFin, rao, resultatHAO, resultatNet, cafg,
             capPropres, dettesFin, ressourcesStables, actifImmo, fondsRoulement, tresoActif, tresoPassif, tresoNette,
             bfg, rentabEco, rentabFin, endettementBrut, endettementNet };
  }, [balance]);

  // Compat synthèse / accès legacy
  const dotationsAmort = useMemo(() => buildNote(balance, /^(681|691)/, [{ key: 'montant', getter: chargeMt }]), [balance]);
  const haoCharges = useMemo(() => buildNote(balance, /^(81|83|85|87)/, [{ key: 'montant', getter: chargeMt }]), [balance]);
  const haoProduits = useMemo(() => buildNote(balance, /^(82|84|86|88)/, [{ key: 'montant', getter: produitMt }]), [balance]);
  const impots = useMemo(() => buildNote(balance, /^(891|895|699)/, [{ key: 'montant', getter: chargeMt }]), [balance]);
  const achats = note22Achats;
  const personnel = note27APersonnel;
  const autresCharges = useMemo(() => buildNote(balance, /^(63|64|65)/, [{ key: 'montant', getter: chargeMt }]), [balance]);

  const totalActif = balance.filter(b => /^[2-5]/.test(b.compte)).reduce((s, b) => s + (b.sfd || 0), 0);
  const totalPassif = balance.filter(b => /^[1-5]/.test(b.compte)).reduce((s, b) => s + (b.sfc || 0), 0);
  const totalCA = totalOf(ca, 'montant');
  const totalCharges = totalOf(achats, 'montant') + totalOf(autresCharges, 'montant') + totalOf(personnel, 'montant');
  const totalTreso = totalOf(tresorerie, 'solde');
  const nbEcritures = journal.length;

  const handleExportImmo = () => {
    exportCsv(['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Cessions', 'Brut Fin'],
      immos.map(r => [r.compte, r.intitule, r.brut_debut, r.acquisitions, r.cessions, r.brut_fin]),
      `note_immo_${exercice?.annee}`);
  };

  const tabGroups = [
    { label: '📊 Synthèse', tabs: [{ id: 'resume', label: 'Résumé' }] },
    { label: '🛡 Notes générales (1-2)', tabs: [
      { id: 'engagements', label: '1. Dettes garanties' },
      { id: 'methodes', label: '2. Méthodes comptables' },
    ]},
    { label: '🏢 Actif immobilisé (3A-3E)', tabs: [
      { id: 'immo', label: '3A. Immo. brutes' },
      { id: 'creditbail', label: '3B. Crédit-bail' },
      { id: 'amort', label: '3C. Amortissements' },
      { id: 'plusmoins', label: '3D. +/- values' },
      { id: 'reeval', label: '3E. Réévaluations' },
    ]},
    { label: '💼 Bilan (4-20) — Plaquettes officielles', tabs: [
      { id: 'participations', label: '4. Immo. financières' },
      { id: 'haoactif', label: '5A. Actifs HAO' },
      { id: 'haopassif', label: '5B. Dettes HAO' },
      { id: 'stocks', label: '6. Stocks' },
      { id: 'creances', label: '7. Clients' },
      { id: 'tresorerie', label: '8. Autres créances' },
      { id: 'capitaux', label: '9. Titres placement' },
      { id: 'subventions', label: '10. Valeurs encaisser' },
      { id: 'prov', label: '11. Banques/CCP/Caisse' },
      { id: 'emprunts', label: '12. Écarts conv./TC' },
      { id: 'regul', label: '13. Capital' },
      { id: 'constatees', label: '14. Primes/Réserves' },
      { id: 'subvprov', label: '15A. Subv./Prov. régl.' },
      { id: 'autresfp', label: '15B. Autres fonds propres' },
      { id: 'dettesfin', label: '16A. Dettes financières' },
      { id: 'echeancier', label: '16B. Échéancier dettes' },
      { id: 'fournisseurs', label: '17. Fournisseurs' },
      { id: 'fiscsoc', label: '18. Dettes fisc./soc.' },
      { id: 'autresdettes', label: '19. Autres dettes/prov.' },
      { id: 'decouverts', label: '20. Banques/découverts' },
    ]},
    { label: '📈 Compte de résultat (21-34) — Plaquettes officielles', tabs: [
      { id: 'ca', label: '21. Chiffre d\'affaires' },
      { id: 'achats', label: '22. Achats' },
      { id: 'charges', label: '23. Transports' },
      { id: 'personnel', label: '24. Services ext.' },
      { id: 'dotamort', label: '25. Impôts & taxes' },
      { id: 'dotprov', label: '26. Autres charges' },
      { id: 'reprises', label: '27A. Personnel' },
      { id: 'dirigeants', label: '27B. Dirigeants' },
      { id: 'transferts', label: '28. Provisions bilan' },
      { id: 'produits', label: '29A. Frais fin.' },
      { id: 'fincharges', label: '29B. Revenus fin.' },
      { id: 'change', label: '29C. Gains/pertes change' },
      { id: 'note30', label: '30. Autres ch./pr. HAO' },
      { id: 'note31', label: '31. 5 derniers exercices' },
      { id: 'note32', label: '32. Production' },
      { id: 'note33', label: '33. Achats production' },
      { id: 'note34', label: '34. Synthèse indicateurs' },
    ]},
    { label: '📝 Informations (35-40)', tabs: [
      { id: 'note35', label: '35. Info. soc./envir.' },
      { id: 'note36', label: '36. Tables des codes' },
      { id: 'parties', label: 'Parties liées' },
      { id: 'effectifs', label: 'Effectifs' },
      { id: 'evenements', label: '37. Événements' },
      { id: 'fiscalite', label: '38. Régime fiscal' },
      { id: 'identification', label: '39. Identification' },
      { id: 'approbation', label: '40. Approbation' },
    ]},
  ];

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Notes Annexes</div>
          <div className="text-[10px] text-fg3 font-mono">SYSCOHADA Révisé — {entreprise?.nom} — Exercice {exercice?.annee} — Notes 1 à 40 (plaquettes officielles)</div>
        </div>
      </div>

      <div className="p-5">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="space-y-2 mb-4">
            {tabGroups.map(g => (
              <div key={g.label}>
                <div className="text-[9px] text-fg3 font-mono uppercase tracking-wider mb-1 px-1">{g.label}</div>
                <TabsList className="flex flex-wrap h-auto gap-0.5 bg-bg2 p-1">
                  {g.tabs.map(t => (
                    <TabsTrigger key={t.id} value={t.id} className="text-[9px] px-1.5 py-0.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
            ))}
          </div>

          {/* Résumé */}
          <TabsContent value="resume">
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <SummaryCard label="Total Actif" value={fmt(totalActif)} />
                <SummaryCard label="Total Passif" value={fmt(totalPassif)} />
                <SummaryCard label="Chiffre d'Affaires" value={fmt(totalCA)} />
                <SummaryCard label="Charges Exploit." value={fmt(totalCharges)} />
                <SummaryCard label="Trésorerie Nette" value={fmt(totalTreso)} />
                <SummaryCard label="Écritures" value={String(nbEcritures)} sub={`Exercice ${exercice?.annee}`} />
              </div>

              <ValidationPanel balance={balance} onJump={setTab} />

              <div className="bg-bg2 border border-border rounded-lg p-4">
                <h3 className="text-xs font-bold text-primary mb-2">Sommaire des Notes Annexes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
                  {tabGroups.slice(1).map(g => (
                    <div key={g.label}>
                      <div className="text-[10px] font-bold text-fg2 mt-2 mb-1">{g.label}</div>
                      {g.tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} className="block text-[10px] text-fg3 hover:text-primary py-0.5 pl-2">{t.label}</button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Bilan notes — numérotation officielle SYSCOHADA */}
          <TabsContent value="immo"><NoteTable noteNum="3A" title="Immobilisations brutes (acquisitions, apports, scissions, réévaluations, cessions)" headers={['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Apports', 'Scissions', 'Réévaluations', 'Cessions', 'Brut Fin']} rows={immos} colKeys={['brut_debut', 'acquisitions', 'apports', 'scissions', 'reevaluations', 'cessions', 'brut_fin']} colStyles={{ acquisitions: 'text-success', cessions: 'text-destructive' }} onExport={handleExportImmo} /></TabsContent>
          <TabsContent value="creditbail"><NoteTable noteNum="3B" title="Immobilisations acquises en crédit-bail et contrats assimilés" headers={['Compte', 'Intitulé', 'Valeur d\'origine', 'Redevances', 'Amort. cumulé', 'VNC']} rows={creditBail} colKeys={['valeur_origine', 'redevances', 'amort_cumule', 'vnc']} /></TabsContent>
          <TabsContent value="amort"><NoteTable noteNum="3C" title="Amortissements" headers={['Compte', 'Intitulé', 'Cumul Début', 'Dotation', 'Reprises', 'Cumul Fin']} rows={amorts} colKeys={['cumul_debut', 'dotation', 'reprises', 'cumul_fin']} colStyles={{ dotation: 'text-destructive', reprises: 'text-success' }} /></TabsContent>
          <TabsContent value="plusmoins"><NoteTable noteNum="3D" title="Plus-values et moins-values de cession d'immobilisations" headers={['Compte', 'Intitulé', 'Prix de cession', 'VNC', 'Plus-value', 'Moins-value']} rows={plusMoinsValues} colKeys={['prix_cession', 'vnc', 'plus_value', 'moins_value']} colStyles={{ plus_value: 'text-success', moins_value: 'text-destructive' }} /></TabsContent>
          <TabsContent value="reeval"><NoteTable noteNum="3E" title="Écarts de réévaluation (compte 106)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={reevaluations} colKeys={['debut', 'augmentation', 'diminution', 'fin']} /></TabsContent>
          <TabsContent value="participations"><NoteTable noteNum={4} title="Immobilisations financières (titres de participation, prêts, dépôts)" headers={['Compte', 'Intitulé', 'Début', 'Fin', 'Produits / Dividendes']} rows={participations} colKeys={['debut', 'fin', 'produits']} /></TabsContent>
          <TabsContent value="haoactif"><NoteTable noteNum="5A" title="Actifs circulants HAO (compte 475)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={actifsHAO} colKeys={['brut', 'depreciation', 'net']} /></TabsContent>
          <TabsContent value="haopassif"><NoteTable noteNum="5B" title="Dettes circulantes HAO (comptes 481-489)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={dettesHAO} colKeys={['debut', 'augmentation', 'diminution', 'fin']} /></TabsContent>
          <TabsContent value="stocks"><NoteTable noteNum={6} title="Stocks et en-cours" headers={['Compte', 'Intitulé', 'Début', 'Fin', 'Variation']} rows={stocks} colKeys={['debut', 'fin', 'variation']} /></TabsContent>
          {/* Notes officielles 7 à 15A — alignées plaquettes SYSCOHADA */}
          <TabsContent value="creances"><NoteTable noteNum={7} title="Clients (411, 412, 413, 414, 416, 418, 419, 491)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={note7Clients} colKeys={['brut', 'depreciation', 'net']} colStyles={{ brut: 'text-primary', depreciation: 'text-destructive' }} /></TabsContent>
          <TabsContent value="tresorerie"><NoteTable noteNum={8} title="Autres créances (Personnel, Organismes sociaux, État, Débiteurs divers — 42, 43, 44, 45, 46)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={note8Autres} colKeys={['brut', 'depreciation', 'net']} /></TabsContent>
          <TabsContent value="capitaux"><NoteTable noteNum={9} title="Titres de placement (actions, obligations, bons — compte 50)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={note9Titres} colKeys={['brut', 'depreciation', 'net']} /></TabsContent>
          <TabsContent value="subventions"><NoteTable noteNum={10} title="Valeurs à encaisser (effets, chèques, cartes de crédit — compte 51)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={note10Valeurs} colKeys={['brut', 'depreciation', 'net']} /></TabsContent>
          <TabsContent value="prov"><NoteTable noteNum={11} title="Banques, chèques postaux et caisses (52, 53, 54, 57, 58)" headers={['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde']} rows={note11Banques} colKeys={['debit', 'credit', 'solde']} colStyles={{ solde: 'text-success' }} /></TabsContent>
          <TabsContent value="emprunts"><NoteTable noteNum={12} title="Écarts de conversion (478/479) et transferts de charges (781/787)" headers={['Compte', 'Intitulé', 'Débit', 'Crédit']} rows={note12Ecarts} colKeys={['debit', 'credit']} /></TabsContent>
          <TabsContent value="regul"><NoteTable noteNum={13} title="Capital social (compte 10 — 101 à 109)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={note13Capital} colKeys={['debut', 'augmentation', 'diminution', 'fin']} colStyles={{ augmentation: 'text-success' }} /></TabsContent>
          <TabsContent value="constatees"><NoteTable noteNum={14} title="Primes (105) et Réserves (11) — Report à nouveau (12)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={note14Primes} colKeys={['debut', 'augmentation', 'diminution', 'fin']} /></TabsContent>
          <TabsContent value="subvprov"><NoteTable noteNum="15A" title="Subventions d'investissement (14) et Provisions réglementées (151 base)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={note15ASubvProv} colKeys={['debut', 'augmentation', 'diminution', 'fin']} /></TabsContent>
          <TabsContent value="autresfp"><NoteTable noteNum="15B" title="Autres fonds propres — Titres participatifs, avances conditionnées, TSDI, ORA (152-159)" headers={['Compte', 'Intitulé', 'Exercice N', 'Exercice N-1', 'Variation']} rows={note15BAutresFP} colKeys={['n', 'n1', 'variation']} colStyles={{ variation: 'text-success' }} /></TabsContent>
          <TabsContent value="dettesfin"><NoteTable noteNum="16A" title="Dettes financières et ressources assimilées (Emprunts obligataires, dettes auprès des établissements de crédit, crédit-bail — 16, 17, 18)" headers={['Compte', 'Intitulé', 'Début', 'Souscription', 'Remboursement', 'Fin']} rows={note16ADettesFin} colKeys={['debut', 'souscription', 'remboursement', 'fin']} colStyles={{ souscription: 'text-success', remboursement: 'text-destructive' }} /></TabsContent>
          <TabsContent value="echeancier"><NoteTable noteNum="16B" title="Échéancier des dettes financières par maturité (≤1 an / 1-5 ans / >5 ans — ventilation indicative à défaut d'aging détaillé)" headers={['Compte', 'Intitulé', 'Total', '≤ 1 an', '1 à 5 ans', '> 5 ans']} rows={note16BEcheancier} colKeys={['total', 'court', 'moyen', 'long']} /></TabsContent>
          <TabsContent value="fournisseurs"><NoteTable noteNum={17} title="Fournisseurs d'exploitation (compte 40 — fournisseurs, effets à payer, FNP, avances/acomptes, groupe)" headers={['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde']} rows={note17Fourn} colKeys={['debit', 'credit', 'solde']} /></TabsContent>
          <TabsContent value="fiscsoc"><NoteTable noteNum={18} title="Dettes fiscales et sociales (Personnel 42, Organismes sociaux 43, État impôts/TVA 44)" headers={['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde']} rows={note18FiscSoc} colKeys={['debit', 'credit', 'solde']} /></TabsContent>
          <TabsContent value="autresdettes"><NoteTable noteNum={19} title="Autres dettes et provisions pour risques à court terme (Associés 46, Débiteurs/créditeurs divers 47, Dépréciations 499)" headers={['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde']} rows={note19AutresDettes} colKeys={['debit', 'credit', 'solde']} /></TabsContent>
          <TabsContent value="decouverts"><NoteTable noteNum={20} title="Banques, crédits d'escompte et de trésorerie (compte 56 — découverts, escomptes commerciaux/campagne)" headers={['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde']} rows={note20Decouverts} colKeys={['debit', 'credit', 'solde']} colStyles={{ solde: 'text-destructive' }} /></TabsContent>

          {/* Résultat notes — Notes 21 à 34 */}
          <TabsContent value="ca"><NoteTable noteNum={21} title="Chiffre d'affaires détaillé" headers={['Compte', 'Intitulé', 'Montant']} rows={ca} colKeys={['montant']} /></TabsContent>
          {/* Notes 22-29 — Plaquettes officielles SYSCOHADA Lot 5 */}
          <TabsContent value="achats"><NoteTable noteNum={22} title="Achats consommés (matières premières, marchandises, autres approvisionnements, achats groupe — compte 60)" headers={['Compte', 'Intitulé', 'Montant net']} rows={note22Achats} colKeys={['montant']} colStyles={{ montant: 'text-destructive' }} /></TabsContent>
          <TabsContent value="charges"><NoteTable noteNum={23} title="Transports (sur ventes, pour compte de tiers, du personnel, plis, déplacements — compte 61)" headers={['Compte', 'Intitulé', 'Montant net']} rows={note23Transports} colKeys={['montant']} /></TabsContent>
          <TabsContent value="personnel"><NoteTable noteNum={24} title="Services extérieurs A & B (sous-traitance, locations, entretien, assurances, études, publicité, télécom, honoraires, formation, missions — comptes 62-63)" headers={['Compte', 'Intitulé', 'Montant net']} rows={note24Services} colKeys={['montant']} /></TabsContent>
          <TabsContent value="dotamort"><NoteTable noteNum={25} title="Impôts et taxes (directs, indirects, droits d'enregistrement, autres — compte 64 hors IS)" headers={['Compte', 'Intitulé', 'Montant net']} rows={note25Impots} colKeys={['montant']} /></TabsContent>
          <TabsContent value="dotprov"><NoteTable noteNum={26} title="Autres charges (pertes sur créances, quote-parts GIE, charges diverses — compte 65)" headers={['Compte', 'Intitulé', 'Montant net']} rows={note26Autres} colKeys={['montant']} /></TabsContent>
          <TabsContent value="reprises"><NoteTable noteNum="27A" title="Charges de personnel (rémunérations, charges sociales, exploitant individuel, personnel extérieur — compte 66 + 637)" headers={['Compte', 'Intitulé', 'Montant net']} rows={note27APersonnel} colKeys={['montant']} colStyles={{ montant: 'text-destructive' }} /></TabsContent>
          <TabsContent value="dirigeants">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border"><span className="text-xs font-bold text-primary">📋 Note 27B — Rémunérations des dirigeants</span></div>
              <table className="w-full border-collapse">
                <tbody>
                  {[
                    ['Nombre de dirigeants', note27BDirigeants.nb_dirigeants],
                    ['Rémunération brute annuelle', note27BDirigeants.remuneration_brute],
                    ['Indemnités et gratifications', note27BDirigeants.indemnites],
                    ['Avantages en nature', note27BDirigeants.avantages_nature],
                    ['Charges sociales sur dirigeants', note27BDirigeants.charges_sociales],
                  ].map(([l, v]) => (
                    <tr key={l as string}><td className="px-3 py-1.5 text-[10px] border-b border-border/30">{l}</td><td className="px-3 py-1.5 text-[10px] font-mono text-right border-b border-border/30">{v ? fmt(v as number) : '— (saisie manuelle)'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="transferts"><NoteTable noteNum={28} title="Provisions et dépréciations inscrites au bilan (provisions risques 19, dépréciations 29/39/49/59, prov. réglementées 151)" headers={['Compte', 'Intitulé', 'Début', 'Dotation', 'Reprise', 'Fin']} rows={note28Prov} colKeys={['debut', 'dotation', 'reprise', 'fin']} colStyles={{ dotation: 'text-destructive', reprise: 'text-success' }} /></TabsContent>
          <TabsContent value="produits"><NoteTable noteNum="29A" title="Frais financiers (intérêts emprunts, escomptes accordés, pertes de change, malis sur actions — compte 67)" headers={['Compte', 'Intitulé', 'Montant net']} rows={note29FraisFin} colKeys={['montant']} colStyles={{ montant: 'text-destructive' }} /></TabsContent>
          <TabsContent value="fincharges"><NoteTable noteNum="29B" title="Revenus financiers (intérêts prêts, escomptes obtenus, gains de change, dividendes — compte 77)" headers={['Compte', 'Intitulé', 'Montant net']} rows={note29ProdFin} colKeys={['montant']} colStyles={{ montant: 'text-success' }} /></TabsContent>
          <TabsContent value="change"><NoteTable noteNum="29C" title="Gains et pertes de change (écarts de conversion 476/477, gains 776, pertes 676)" headers={['Compte', 'Intitulé', 'Gain', 'Perte', 'Net']} rows={note29CChange} colKeys={['gain', 'perte', 'net']} colStyles={{ gain: 'text-success', perte: 'text-destructive' }} /></TabsContent>
          {/* Note 30 — Autres charges et produits HAO (plaquette officielle) */}
          <TabsContent value="note30">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 30 — Autres charges et produits HAO</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr><th className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase border-b border-border">Libellé</th><th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase border-b border-border">Montant N</th></tr></thead>
                  <tbody>
                    {note30.charges.map(r => <tr key={r.label}><td className="px-3 py-1 text-[10px] border-b border-border/30">{r.label}</td><td className="px-3 py-1 text-[10px] font-mono text-right text-destructive border-b border-border/30">{r.mt ? fmt(r.mt) : '—'}</td></tr>)}
                    <tr className="bg-bg3 font-bold"><td className="px-3 py-1.5 text-[10px] border-y border-border">SOUS-TOTAL : AUTRES CHARGES HAO</td><td className="px-3 py-1.5 text-[10px] font-mono text-right text-destructive border-y border-border">{fmt(note30.charges.reduce((s,r)=>s+r.mt,0))}</td></tr>
                    {note30.produits.map(r => <tr key={r.label}><td className="px-3 py-1 text-[10px] border-b border-border/30">{r.label}</td><td className="px-3 py-1 text-[10px] font-mono text-right text-success border-b border-border/30">{r.mt ? fmt(r.mt) : '—'}</td></tr>)}
                    <tr className="bg-bg3 font-bold"><td className="px-3 py-1.5 text-[10px] border-y border-border">SOUS-TOTAL : AUTRES PRODUITS HAO</td><td className="px-3 py-1.5 text-[10px] font-mono text-right text-success border-y border-border">{fmt(note30.produits.reduce((s,r)=>s+r.mt,0))}</td></tr>
                    <tr className="bg-bg3 font-bold"><td className="px-3 py-2 text-[11px] border-t-2 border-primary">TOTAL NET HAO</td><td className="px-3 py-2 text-[11px] font-mono text-right border-t-2 border-primary">{fmt(note30.produits.reduce((s,r)=>s+r.mt,0) - note30.charges.reduce((s,r)=>s+r.mt,0))}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* Note 31 — Répartition du résultat & 5 derniers exercices */}
          <TabsContent value="note31">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 31 — Répartition du résultat et autres éléments caractéristiques des cinq derniers exercices</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[10px]">
                  <thead><tr><th className="bg-bg3 px-3 py-1.5 text-left font-bold text-fg3 uppercase border-b border-border">Indicateur</th>{[0,1,2,3,4].map(i => <th key={i} className="bg-bg3 px-3 py-1.5 text-right font-bold text-fg3 border-b border-border">N-{4-i}</th>)}</tr></thead>
                  <tbody>
                    {([
                      ['STRUCTURE DU CAPITAL', null],
                      ['Capital social','cap_social'],
                      ['Actions ordinaires','cap_ord'],
                      ['Actions à dividendes prioritaires (ADP) sans droit de vote','cap_adp'],
                      ["Actions nouvelles à émettre — par conversion d'obligations",'cap_conv'],
                      ['Actions nouvelles à émettre — par exercice de droits de souscription','cap_souscr'],
                      ['OPÉRATIONS ET RÉSULTAT', null],
                      ["Chiffre d'affaires hors taxes",'op_ca'],
                      ['Résultat des activités ordinaires (RAO) hors dot./reprises','op_rao'],
                      ['Participations des travailleurs aux bénéfices','op_partic'],
                      ['Impôt sur le résultat','op_is'],
                      ['Résultat net','op_rn'],
                      ['RÉSULTAT PAR ACTION', null],
                      ['Résultat distribué','rpa_dist'],
                      ['Dividende attribué à chaque action','rpa_div'],
                      ['PERSONNEL ET POLITIQUE SALARIALE', null],
                      ["Effectif moyen des travailleurs au cours de l'exercice",'pers_eff'],
                      ['Effectif moyen de personnel extérieur','pers_eff_ext'],
                      ['Masse salariale distribuée (comptes 661, 662, 663)','pers_masse'],
                      ['Avantages sociaux versés (comptes 664, 668)','pers_avantages'],
                      ['Personnel extérieur facturé (compte 667)','pers_facture'],
                    ] as Array<[string, string|null]>).map(([label, key]) => key === null ? (
                      <tr key={label} className="bg-bg3 font-bold"><td colSpan={6} className="px-3 py-1 text-primary">{label}</td></tr>
                    ) : (
                      <tr key={key}><td className="px-3 py-1 border-b border-border/30">{label}</td>{[0,1,2,3,4].map(i => (
                        <td key={i} className="px-2 py-0.5 text-right border-b border-border/30">
                          <input className="w-full bg-transparent border-b border-border/30 text-right font-mono text-[10px] focus:outline-none focus:border-primary"
                            defaultValue={notesData[`n31_${key}_${i}`] || ''}
                            onBlur={e => saveNote(`n31_${key}_${i}`, e.target.value)} placeholder="—" />
                        </td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 text-[9px] text-fg3 italic border-t border-border">
                Y compris l'exercice dont les états financiers sont soumis à l'approbation. Le résultat négatif est entre parenthèses. L'exercice N correspond au dividende proposé du dernier exercice.
              </div>
            </div>
          </TabsContent>

          {/* Note 32 — Production de l'exercice */}
          <TabsContent value="note32">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 32 — Production de l'exercice</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed">
                <p className="mb-2">Ventilation par <strong>désignation de produit</strong> (qté + valeur) sur axes : production vendue dans le pays, autres États OHADA, hors OHADA, immobilisée, stocks ouverture/clôture.</p>
                <p className="text-fg3 italic">Données extra-comptables — saisie manuelle (par produit) :</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                  {['p1','p2','p3','p4','p5'].map(k => (
                    <EditableField key={k} label={`Produit ${k.toUpperCase()} (désignation, qté, valeur)`} noteKey={`n32_${k}`} notesData={notesData} onSave={saveNote} />
                  ))}
                </div>
                <div className="bg-bg3 rounded p-3 mt-3 text-[10px]">
                  <p className="font-bold mb-1">Récap. comptable :</p>
                  <p>Ventes (70) : <span className="font-mono">{fmt(note34.ventes)}</span> · Production immobilisée (72) : <span className="font-mono">{fmt(balance.filter(b=>/^72/.test(b.compte)).reduce((s,b)=>s+produitMt(b),0))}</span> · Variation stocks (73) : <span className="font-mono">{fmt(balance.filter(b=>/^73/.test(b.compte)).reduce((s,b)=>s+produitMt(b),0))}</span></p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Note 33 — Achats destinés à la production */}
          <TabsContent value="note33">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 33 — Achats destinés à la production</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed">
                <p className="mb-2">Ventilation par <strong>désignation de matière/marchandise</strong> (qté + valeur) — origine pays / autres OHADA / hors OHADA / variations stocks.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                  {['m1','m2','m3','m4','m5'].map(k => (
                    <EditableField key={k} label={`Matière ${k.toUpperCase()} (désignation, qté, valeur)`} noteKey={`n33_${k}`} notesData={notesData} onSave={saveNote} />
                  ))}
                </div>
                <div className="bg-bg3 rounded p-3 mt-3 text-[10px]">
                  <p className="font-bold mb-1">Récap. comptable (compte 60) :</p>
                  <p>Total achats : <span className="font-mono">{fmt(totalOf(note22Achats,'montant'))}</span></p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Note 34 — Fiche synthèse des indicateurs financiers */}
          <TabsContent value="note34">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 34 — Fiche de synthèse des principaux indicateurs financiers (en milliers de {entreprise?.monnaie || 'FCFA'})</span>
              </div>
              <div className="px-4 py-3 text-[11px]">
                <table className="w-full text-[10px]">
                  <tbody>
                    <tr className="bg-bg3"><td colSpan={2} className="px-3 py-1 font-bold text-primary">SOLDES INTERMÉDIAIRES DE GESTION</td></tr>
                    {([
                      ["Chiffre d'affaires", note34.ventes],
                      ['Marge commerciale', note34.margeCom],
                      ['Valeur ajoutée', note34.valeurAjoutee],
                      ["Excédent brut d'exploitation (EBE)", note34.ebe],
                      ["Résultat d'exploitation", note34.resultatExpl],
                      ['Résultat financier', note34.resultatFin],
                      ['Résultat des activités ordinaires (RAO)', note34.rao],
                      ['Résultat hors activités ordinaires', note34.resultatHAO],
                      ['Résultat net', note34.resultatNet],
                    ] as Array<[string, number]>).map(([l,v]) => <tr key={l} className="border-b border-border/30"><td className="px-3 py-1">{l}</td><td className="px-3 py-1 text-right font-mono">{fmt(v)}</td></tr>)}

                    <tr className="bg-bg3"><td colSpan={2} className="px-3 py-1 font-bold text-primary">CAPACITÉ D'AUTOFINANCEMENT</td></tr>
                    <tr className="border-b border-border/30"><td className="px-3 py-1">Capacité d'autofinancement globale (CAFG)</td><td className="px-3 py-1 text-right font-mono">{fmt(note34.cafg)}</td></tr>

                    <tr className="bg-bg3"><td colSpan={2} className="px-3 py-1 font-bold text-primary">STRUCTURE FINANCIÈRE</td></tr>
                    {([
                      ['Capitaux propres et ressources assimilées', note34.capPropres],
                      ['+ Dettes financières et autres ressources assimilées', note34.dettesFin],
                      ['= Ressources stables', note34.ressourcesStables],
                      ['− Actif immobilisé', note34.actifImmo],
                      ['= Fonds de roulement (1)', note34.fondsRoulement],
                      ['Trésorerie nette (5)', note34.tresoNette],
                      ['Besoin de financement global (4)', note34.bfg],
                    ] as Array<[string, number]>).map(([l,v]) => <tr key={l} className="border-b border-border/30"><td className="px-3 py-1">{l}</td><td className="px-3 py-1 text-right font-mono">{fmt(v)}</td></tr>)}

                    <tr className="bg-bg3"><td colSpan={2} className="px-3 py-1 font-bold text-primary">RENTABILITÉ</td></tr>
                    <tr className="border-b border-border/30"><td className="px-3 py-1">Rentabilité économique (Rés. exploit. / Cap. propres + Dettes fin.)</td><td className="px-3 py-1 text-right font-mono">{note34.rentabEco.toFixed(2)} %</td></tr>
                    <tr className="border-b border-border/30"><td className="px-3 py-1">Rentabilité financière (Rés. net / Cap. propres)</td><td className="px-3 py-1 text-right font-mono">{note34.rentabFin.toFixed(2)} %</td></tr>

                    <tr className="bg-bg3"><td colSpan={2} className="px-3 py-1 font-bold text-primary">ENDETTEMENT</td></tr>
                    <tr className="border-b border-border/30"><td className="px-3 py-1">Endettement financier brut (Dettes fin. + Trésorerie passif)</td><td className="px-3 py-1 text-right font-mono">{fmt(note34.endettementBrut)}</td></tr>
                    <tr className="border-b border-border/30"><td className="px-3 py-1">Endettement financier net (− Trésorerie actif)</td><td className="px-3 py-1 text-right font-mono">{fmt(note34.endettementNet)}</td></tr>
                  </tbody>
                </table>
                <p className="text-[9px] text-fg3 italic mt-3">Les écarts de conversion sont éliminés afin de ramener créances/dettes à leur valeur initiale. Résultat d'exploitation après impôt théorique pour la rentabilité économique.</p>
              </div>
            </div>
          </TabsContent>

          {/* Note 35 — Informations sociales et environnementales (>250 salariés) */}
          <TabsContent value="note35">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 35 — Liste des informations sociales, environnementales et sociétales</span>
              </div>
              <div className="px-4 py-3 text-[11px] space-y-3">
                <p className="text-fg3 italic">Note obligatoire pour les entités ayant un effectif de plus de 250 salariés.</p>
                <div>
                  <p className="font-bold text-primary mb-1">Informations sociales</p>
                  <EditableField label="Emploi et politique salariale" noteKey="n35_soc_emploi" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Organisation du travail / Relations sociales" noteKey="n35_soc_orga" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Santé, sécurité, formation" noteKey="n35_soc_sante" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Égalité de traitement, lutte discriminations" noteKey="n35_soc_egalite" notesData={notesData} onSave={saveNote} />
                </div>
                <div>
                  <p className="font-bold text-primary mb-1">Informations environnementales</p>
                  <EditableField label="Politique générale environnement" noteKey="n35_env_politique" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Pollutions, déchets, gestion ressources" noteKey="n35_env_pollution" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Changement climatique, biodiversité" noteKey="n35_env_climat" notesData={notesData} onSave={saveNote} />
                </div>
                <div>
                  <p className="font-bold text-primary mb-1">Engagements sociétaux pour le développement durable</p>
                  <EditableField label="Impact territorial, économique et social" noteKey="n35_soct_impact" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Relations parties prenantes" noteKey="n35_soct_parties" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Sous-traitance, droits humains, lutte corruption" noteKey="n35_soct_ethique" notesData={notesData} onSave={saveNote} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Note 36 — Tables des codes (forme juridique, régime fiscal, pays) */}
          <TabsContent value="note36">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 36 — Tables des codes</span>
              </div>
              <div className="px-4 py-3 text-[11px] grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="font-bold text-primary mb-2">1 — Forme juridique</p>
                  <ul className="space-y-0.5 text-[10px] font-mono">
                    {[['1','SA à participation publique'],['2','Société Anonyme (SA)'],['3','SARL'],['4','Société en Commandite Simple (SCS)'],['5','Société en Nom Collectif (SNC)'],['6','Société en Participation (SP)'],['7','Groupement d\'Intérêt Économique (GIE)'],['8','Association'],['9','Autre forme juridique']].map(([c,l]) => (
                      <li key={c}><span className="text-primary font-bold w-6 inline-block">{c}</span> {l}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-bold text-primary mb-2">2 — Régime fiscal</p>
                  <ul className="space-y-0.5 text-[10px] font-mono">
                    {[['1','Réel normal'],['2','Réel simplifié'],['3','Synthétique'],['4','Forfait']].map(([c,l]) => (
                      <li key={c}><span className="text-primary font-bold w-6 inline-block">{c}</span> {l}</li>
                    ))}
                  </ul>
                  <p className="text-[9px] text-fg3 italic mt-2">Remplacer le premier 0 par 1 si l'entreprise bénéficie d'un agrément prioritaire.</p>
                </div>
                <div>
                  <p className="font-bold text-primary mb-2">3 — Pays du siège social</p>
                  <ul className="space-y-0.5 text-[10px] font-mono">
                    {[['UEMOA','Bénin 01, Burkina 02, Côte d\'Ivoire 03, Guinée Bissau 04, Mali 05, Niger 06, Sénégal 07, Togo 08'],['CEMAC','Cameroun 09, Centrafrique 10, Congo 11, Gabon 12, Guinée Eq. 13, Tchad 14'],['OHADA','Comores 15, Guinée Conakry 16'],['Autres','Autres pays africains, France, UE, USA, Canada, Suisse, Asie, etc.']].map(([z,l]) => (
                      <li key={z}><span className="text-primary font-bold">{z}</span> — <span className="text-fg2">{l}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Note 1 — Dettes garanties par des sûretés réelles (officielle SYSCOHADA) */}
          <TabsContent value="engagements">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 1 — Dettes garanties par des sûretés réelles & engagements hors bilan</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <p className="font-bold">Sûretés réelles consenties (sur biens de l'entreprise) :</p>
                <EditableField label="Hypothèques sur immeubles" noteKey="sur_hypotheques" notesData={notesData} onSave={saveNote} />
                <EditableField label="Nantissements sur fonds de commerce" noteKey="sur_nant_fonds" notesData={notesData} onSave={saveNote} />
                <EditableField label="Nantissements sur titres" noteKey="sur_nant_titres" notesData={notesData} onSave={saveNote} />
                <EditableField label="Gages sur matériel / véhicules" noteKey="sur_gages" notesData={notesData} onSave={saveNote} />
                <EditableField label="Privilèges (Trésor, sécurité sociale)" noteKey="sur_privileges" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Engagements donnés :</p>
                <EditableField label="Cautions & garanties données" noteKey="eng_cautions_donnees" notesData={notesData} onSave={saveNote} />
                <EditableField label="Effets escomptés non échus" noteKey="eng_effets" notesData={notesData} onSave={saveNote} />
                <EditableField label="Engagements de crédit-bail restants" noteKey="eng_credit_bail" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Engagements reçus :</p>
                <EditableField label="Cautions & garanties reçues" noteKey="eng_cautions_recues" notesData={notesData} onSave={saveNote} />
                <EditableField label="Lignes de crédit non utilisées" noteKey="eng_lignes_credit" notesData={notesData} onSave={saveNote} />
                <EditableField label="Avals & cautionnements reçus" noteKey="eng_avals" notesData={notesData} onSave={saveNote} />
              </div>
            </div>
          </TabsContent>

          {/* Note 2 — Méthodes comptables (enrichi : dérogations + infos complémentaires) */}
          <TabsContent value="methodes">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 2 — Règles et méthodes comptables</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <p><strong>Référentiel :</strong> SYSCOHADA révisé (Acte Uniforme du 26 janvier 2017).</p>
                <p><strong>Conventions de base :</strong> Continuité d'exploitation, coût historique, prudence, permanence des méthodes, spécialisation des exercices, intangibilité du bilan d'ouverture, importance significative.</p>

                <p className="font-bold mt-2">Méthodes appliquées :</p>
                <EditableField label="Méthode d'amortissement" noteKey="methode_amort" notesData={notesData} onSave={saveNote} />
                <EditableField label="Méthode d'évaluation des stocks" noteKey="methode_stocks" notesData={notesData} onSave={saveNote} />
                <EditableField label="Traitement des devises" noteKey="methode_devises" notesData={notesData} onSave={saveNote} />
                <EditableField label="Méthode de comptabilisation des produits" noteKey="methode_produits" notesData={notesData} onSave={saveNote} />
                <EditableField label="Provisions et dépréciations" noteKey="methode_prov" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Dérogations aux principes comptables :</p>
                <EditableField label="Dérogation appliquée" noteKey="derogation_1" notesData={notesData} onSave={saveNote} />
                <EditableField label="Justification & impact" noteKey="derogation_just" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Changements de méthode :</p>
                <EditableField label="Changement n°1" noteKey="changement_1" notesData={notesData} onSave={saveNote} />
                <EditableField label="Impact sur les capitaux propres" noteKey="changement_impact" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Informations complémentaires :</p>
                <EditableField label="Méthodes spécifiques au secteur" noteKey="info_secteur" notesData={notesData} onSave={saveNote} />
                <EditableField label="Autres informations utiles" noteKey="info_autres" notesData={notesData} onSave={saveNote} />

                <p className="mt-2"><strong>Monnaie :</strong> {entreprise?.monnaie || 'FCFA'}</p>
              </div>
            </div>
          </TabsContent>

          {/* Note 35 — Parties Liées */}
          <TabsContent value="parties">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 35 — Parties liées</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <EditableField label="Rémunérations des dirigeants" noteKey="pl_remunerations" notesData={notesData} onSave={saveNote} />
                <EditableField label="Avances aux dirigeants" noteKey="pl_avances" notesData={notesData} onSave={saveNote} />
                <EditableField label="Ventes/achats intragroupe" noteKey="pl_intragroupe" notesData={notesData} onSave={saveNote} />
                <EditableField label="Comptes courants associés" noteKey="pl_courants" notesData={notesData} onSave={saveNote} />
                <EditableField label="Autres transactions" noteKey="pl_autres" notesData={notesData} onSave={saveNote} />
              </div>
            </div>
          </TabsContent>

          {/* Note 36 — Effectifs */}
          <TabsContent value="effectifs">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 36 — Effectifs et masse salariale</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <p>Effectif moyen de l'exercice {exercice?.annee} :</p>
                <EditableField label="Cadres supérieurs" noteKey="eff_cadres_sup" notesData={notesData} onSave={saveNote} />
                <EditableField label="Cadres" noteKey="eff_cadres" notesData={notesData} onSave={saveNote} />
                <EditableField label="Agents de maîtrise" noteKey="eff_maitrise" notesData={notesData} onSave={saveNote} />
                <EditableField label="Employés" noteKey="eff_employes" notesData={notesData} onSave={saveNote} />
                <EditableField label="Ouvriers" noteKey="eff_ouvriers" notesData={notesData} onSave={saveNote} />
                <EditableField label="Stagiaires / Apprentis" noteKey="eff_stagiaires" notesData={notesData} onSave={saveNote} />
                <EditableField label="Effectif total" noteKey="eff_total" notesData={notesData} onSave={saveNote} />
                <p className="text-fg3 italic mt-2">Masse salariale : {fmt(totalOf(personnel, 'montant'))} {entreprise?.monnaie || 'FCFA'}</p>
              </div>
            </div>
          </TabsContent>

          {/* Note 37 — Événements postérieurs */}
          <TabsContent value="evenements">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 37 — Événements postérieurs à la clôture</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <p>Événements significatifs survenus après la clôture ({exercice?.annee ? `31/12/${exercice.annee}` : '—'}) :</p>
                <EditableField label="Événement 1" noteKey="evt_1" notesData={notesData} onSave={saveNote} />
                <EditableField label="Événement 2" noteKey="evt_2" notesData={notesData} onSave={saveNote} />
                <EditableField label="Événement 3" noteKey="evt_3" notesData={notesData} onSave={saveNote} />
                <EditableField label="Commentaire" noteKey="evt_commentaire" notesData={notesData} onSave={saveNote} />
              </div>
            </div>
          </TabsContent>

          {/* Note 38 — Régime fiscal */}
          <TabsContent value="fiscalite">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 38 — Régime fiscal et information sectorielle</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <EditableField label="Régime d'imposition" noteKey="fisc_regime" notesData={notesData} onSave={saveNote} />
                <EditableField label="Taux IS applicable" noteKey="fisc_taux_is" notesData={notesData} onSave={saveNote} />
                <EditableField label="Régime TVA" noteKey="fisc_tva" notesData={notesData} onSave={saveNote} />
                <EditableField label="Patente" noteKey="fisc_patente" notesData={notesData} onSave={saveNote} />
                <EditableField label="Déficits reportables" noteKey="fisc_deficits" notesData={notesData} onSave={saveNote} />
                <EditableField label="Avantages fiscaux" noteKey="fisc_avantages" notesData={notesData} onSave={saveNote} />
                <div className="bg-bg3 rounded p-3 mt-2">
                  <p className="text-[10px] font-bold mb-1">Charge d'impôt :</p>
                  <p className="font-mono text-sm">{fmt(totalOf(impots, 'montant'))} {entreprise?.monnaie || 'FCFA'}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Note 39 — Identification (fiche signalétique R1) */}
          <TabsContent value="identification">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 39 — Fiche signalétique de l'entreprise</span>
              </div>
              <div className="px-4 py-3">
                <div className="bg-bg3 rounded p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><span className="text-fg3">Dénomination :</span> <strong>{entreprise?.nom || '—'}</strong></div>
                    <div><span className="text-fg3">Sigle :</span> <strong>{entreprise?.sigle || '—'}</strong></div>
                    <div><span className="text-fg3">Forme juridique :</span> <strong>{entreprise?.forme_juridique || '—'}</strong></div>
                    <div><span className="text-fg3">Secteur :</span> <strong>{entreprise?.secteur || '—'}</strong></div>
                    <div><span className="text-fg3">NINEA :</span> <strong className="font-mono">{entreprise?.ninea || '—'}</strong></div>
                    <div><span className="text-fg3">RCCM :</span> <strong className="font-mono">{entreprise?.rccm || '—'}</strong></div>
                    <div><span className="text-fg3">Adresse :</span> <strong>{entreprise?.adresse || '—'}</strong></div>
                    <div><span className="text-fg3">Téléphone :</span> <strong>{entreprise?.tel || '—'}</strong></div>
                    <div><span className="text-fg3">Monnaie :</span> <strong>{entreprise?.monnaie || 'FCFA'}</strong></div>
                    <div><span className="text-fg3">Exercice :</span> <strong>{exercice?.annee || '—'} ({exercice?.statut || '—'})</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Note 40 — Approbation */}
          <TabsContent value="approbation">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 40 — Approbation des états financiers</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-3">
                <p>États financiers de l'exercice clos le {exercice?.annee ? `31/12/${exercice.annee}` : '—'} :</p>
                <div className="bg-bg3 rounded p-4 space-y-3">
                  <EditableField label="Directeur Général / Gérant" noteKey="appro_dg" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Commissaire aux Comptes" noteKey="appro_cac" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Expert-Comptable" noteKey="appro_ec" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Lieu" noteKey="appro_lieu" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Date" noteKey="appro_date" notesData={notesData} onSave={saveNote} />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
