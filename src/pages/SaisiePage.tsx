import { useApp } from '@/stores/app-store';
import { fmt, pf } from '@/lib/accounting';
import { useState, useMemo, useRef, useEffect } from 'react';
import { toast } from 'sonner';

interface LigneEcriture {
  compte: string;
  intitule: string;
  debit: number;
  credit: number;
}

// ─── Import CSV Modal ────────────────────────────────
function ImportCsvJournalModal({ onImport, onClose }: {
  onImport: (entries: { date: string; piece: string; journal_code: string; libelle: string; compte: string; intitule: string; debit: number; credit: number }[]) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ date: string; piece: string; journal_code: string; libelle: string; compte: string; intitule: string; debit: number; credit: number }[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('Fichier vide'); return; }
      const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
      const rows = lines.slice(1).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()));

      const parsed = rows.filter(r => r.length >= 6 && r[0]).map(r => ({
        date: r[0],
        piece: r[1] || '',
        journal_code: r[2] || 'OD',
        compte: r[3] || '',
        intitule: r[4] || '',
        libelle: r[5] || '',
        debit: pf(r[6] || '0'),
        credit: pf(r[7] || '0'),
      }));

      if (parsed.length === 0) { toast.error('Aucune ligne valide. Format attendu: Date;Pièce;Journal;Compte;Intitulé;Libellé;Débit;Crédit'); return; }
      setPreview(parsed);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Validate balance per piece
  const validation = useMemo(() => {
    const pieceMap = new Map<string, { debit: number; credit: number }>();
    for (const p of preview) {
      if (!pieceMap.has(p.piece)) pieceMap.set(p.piece, { debit: 0, credit: 0 });
      const t = pieceMap.get(p.piece)!;
      t.debit += p.debit;
      t.credit += p.credit;
    }
    const unbalanced: string[] = [];
    for (const [piece, t] of pieceMap) {
      if (Math.abs(t.debit - t.credit) > 0.01) unbalanced.push(piece);
    }
    return { pieces: pieceMap.size, unbalanced };
  }, [preview]);

  return (
    <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-sm text-primary">📂 Import CSV Écritures</div>
        <button onClick={onClose} className="text-fg3 text-xs hover:text-foreground">✕ Fermer</button>
      </div>
      <p className="text-[10px] text-fg3 mb-3">
        Format : <code className="bg-bg3 px-1 rounded">Date;Pièce;Journal;Compte;Intitulé;Libellé;Débit;Crédit</code>
      </p>
      <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFile} className="text-xs text-fg2 mb-3" />

      {preview.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[11px] text-success font-bold">✓ {preview.length} ligne(s) · {validation.pieces} pièce(s)</span>
            {validation.unbalanced.length > 0 && (
              <span className="text-[10px] text-destructive font-bold">
                ⚠ {validation.unbalanced.length} pièce(s) déséquilibrée(s): {validation.unbalanced.join(', ')}
              </span>
            )}
          </div>
          <div className="max-h-48 overflow-auto border border-border rounded mb-3">
            <table className="w-full border-collapse text-[10px]">
              <thead><tr>
                {['Date', 'Pièce', 'Jrn', 'Compte', 'Intitulé', 'Libellé', 'Débit', 'Crédit'].map(h => (
                  <th key={h} className="bg-bg3 px-2 py-1 text-left font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {preview.slice(0, 15).map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-0.5 font-mono border-b border-border/30">{r.date}</td>
                    <td className="px-2 py-0.5 font-mono border-b border-border/30">{r.piece}</td>
                    <td className="px-2 py-0.5 font-mono border-b border-border/30">{r.journal_code}</td>
                    <td className="px-2 py-0.5 font-mono text-primary border-b border-border/30">{r.compte}</td>
                    <td className="px-2 py-0.5 border-b border-border/30">{r.intitule}</td>
                    <td className="px-2 py-0.5 border-b border-border/30">{r.libelle}</td>
                    <td className="px-2 py-0.5 font-mono text-right border-b border-border/30">{r.debit ? fmt(r.debit) : ''}</td>
                    <td className="px-2 py-0.5 font-mono text-right border-b border-border/30">{r.credit ? fmt(r.credit) : ''}</td>
                  </tr>
                ))}
                {preview.length > 15 && <tr><td colSpan={8} className="px-2 py-1 text-fg3">...et {preview.length - 15} de plus</td></tr>}
              </tbody>
            </table>
          </div>
          <button onClick={() => onImport(preview)} disabled={validation.unbalanced.length > 0}
            className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90">
            ✓ Importer {preview.length} lignes
          </button>
          {validation.unbalanced.length > 0 && (
            <span className="text-[10px] text-destructive ml-2">Corrigez les pièces déséquilibrées avant d'importer</span>
          )}
        </>
      )}
    </div>
  );
}

// ─── Nouvelle Écriture Form ──────────────────────────
function NouvelleEcritureForm({ onSubmit, plan, loading }: { onSubmit: (data: { date: string; piece: string; journal_code: string; libelle: string; lignes: LigneEcriture[] }) => void; plan: { numero: string; intitule: string; actif: boolean }[]; loading: boolean }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [piece, setPiece] = useState('');
  const [journalCode, setJournalCode] = useState('OD');
  const [libelle, setLibelle] = useState('');
  const [lignes, setLignes] = useState<LigneEcriture[]>([
    { compte: '', intitule: '', debit: 0, credit: 0 },
    { compte: '', intitule: '', debit: 0, credit: 0 },
  ]);
  const [compteSearch, setCompteSearch] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCompteSearch(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const totalDebit = lignes.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const isValid = isBalanced && date && piece && libelle && lignes.every(l => l.compte && (l.debit > 0 || l.credit > 0));

  const activePlan = useMemo(() => plan.filter(p => p.actif), [plan]);
  const filteredComptes = useMemo(() => {
    if (!searchTerm) return activePlan.slice(0, 20);
    const t = searchTerm.toLowerCase();
    return activePlan.filter(p => p.numero.includes(t) || p.intitule.toLowerCase().includes(t)).slice(0, 20);
  }, [activePlan, searchTerm]);

  const updateLigne = (i: number, field: keyof LigneEcriture, val: string | number) => {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  };

  const selectCompte = (i: number, numero: string, intitule: string) => {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, compte: numero, intitule } : l));
    setCompteSearch(null);
    setSearchTerm('');
  };

  const addLigne = () => setLignes(prev => [...prev, { compte: '', intitule: '', debit: 0, credit: 0 }]);
  const removeLigne = (i: number) => { if (lignes.length > 2) setLignes(prev => prev.filter((_, idx) => idx !== i)); };

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({ date, piece, journal_code: journalCode, libelle, lignes: lignes.filter(l => l.compte) });
    setPiece('');
    setLibelle('');
    setLignes([
      { compte: '', intitule: '', debit: 0, credit: 0 },
      { compte: '', intitule: '', debit: 0, credit: 0 },
    ]);
  };

  return (
    <div className="bg-bg2 border border-border rounded-lg p-4 mb-4" ref={dropdownRef}>
      <div className="font-bold text-sm mb-3 text-primary">✏️ Nouvelle Écriture</div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">N° Pièce</label>
          <input value={piece} onChange={e => setPiece(e.target.value)} placeholder="FA-001" className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">Journal</label>
          <select value={journalCode} onChange={e => setJournalCode(e.target.value)} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary">
            <option value="AC">AC - Achats</option>
            <option value="VE">VE - Ventes</option>
            <option value="BQ">BQ - Banque</option>
            <option value="CA">CA - Caisse</option>
            <option value="OD">OD - Opérations Diverses</option>
            <option value="SA">SA - Salaires</option>
            <option value="AN">AN - À-Nouveau</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">Libellé</label>
          <input value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="Description de l'opération" className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary" />
        </div>
      </div>

      <div className="border border-border rounded overflow-hidden mb-3">
        <div className="grid grid-cols-[1fr_2fr_120px_120px_40px] bg-bg3 px-3 py-1.5 text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">
          <span>Compte</span><span>Intitulé</span><span className="text-right">Débit</span><span className="text-right">Crédit</span><span></span>
        </div>
        {lignes.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_120px_120px_40px] items-center px-3 py-1 border-b border-border/30 relative">
            <div className="relative">
              <input
                value={l.compte}
                onChange={e => { updateLigne(i, 'compte', e.target.value); setCompteSearch(i); setSearchTerm(e.target.value); }}
                onFocus={() => { setCompteSearch(i); setSearchTerm(l.compte); }}
                placeholder="601100"
                className="w-full bg-bg3 border border-border rounded px-2 py-1 text-[11px] text-primary font-mono outline-none focus:border-primary"
              />
              {compteSearch === i && (
                <div className="absolute z-50 top-full left-0 w-72 max-h-48 overflow-auto bg-bg2 border border-border rounded shadow-lg mt-0.5">
                  {filteredComptes.map(c => (
                    <button key={c.numero} onClick={() => selectCompte(i, c.numero, c.intitule)} className="w-full text-left px-2 py-1 text-[10px] hover:bg-primary/10 flex gap-2">
                      <span className="text-primary font-mono font-bold">{c.numero}</span>
                      <span className="text-fg3 truncate">{c.intitule}</span>
                    </button>
                  ))}
                  {filteredComptes.length === 0 && <div className="px-2 py-1 text-[10px] text-fg3">Aucun compte trouvé</div>}
                </div>
              )}
            </div>
            <span className="text-[10px] text-fg3 px-2 truncate">{l.intitule || '—'}</span>
            <input type="number" value={l.debit || ''} onChange={e => updateLigne(i, 'debit', Number(e.target.value) || 0)} placeholder="0" className="w-full bg-bg3 border border-border rounded px-2 py-1 text-[11px] font-mono text-right text-primary outline-none focus:border-primary" />
            <input type="number" value={l.credit || ''} onChange={e => updateLigne(i, 'credit', Number(e.target.value) || 0)} placeholder="0" className="w-full bg-bg3 border border-border rounded px-2 py-1 text-[11px] font-mono text-right text-success outline-none focus:border-primary" />
            <button onClick={() => removeLigne(i)} className="text-destructive text-xs text-center" disabled={lignes.length <= 2}>✕</button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_2fr_120px_120px_40px] items-center px-3 py-1.5 bg-bg3 font-bold">
          <span className="text-[10px] text-fg3 font-mono">TOTAUX</span>
          <span></span>
          <span className={`text-[11px] font-mono text-right ${isBalanced ? 'text-success' : 'text-primary'}`}>{fmt(totalDebit)}</span>
          <span className={`text-[11px] font-mono text-right ${isBalanced ? 'text-success' : 'text-success'}`}>{fmt(totalCredit)}</span>
          <span></span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={addLigne} className="text-[11px] text-primary hover:underline">+ Ajouter une ligne</button>
        <div className="flex items-center gap-3">
          {!isBalanced && totalDebit > 0 && (
            <span className="text-[10px] text-destructive font-mono">
              Écart: {fmt(Math.abs(totalDebit - totalCredit))}
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {loading ? 'Enregistrement...' : '✓ Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function SaisiePage() {
  const { journal, deleteJournalEntry, addJournalEntry, plan, exercice, loading, isExerciceCloture, demo } = useApp();
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const rows = journal.filter(r => !filter || r.libelle?.toLowerCase().includes(filter.toLowerCase()) || r.compte?.includes(filter));
  const locked = isExerciceCloture();

  const handleSubmit = async (data: { date: string; piece: string; journal_code: string; libelle: string; lignes: LigneEcriture[] }) => {
    const lines = data.lignes.map(l => ({
      id: '',
      exercice_id: exercice?.id || '',
      entreprise_id: '',
      date_ecriture: data.date,
      piece: data.piece,
      journal_code: data.journal_code,
      libelle: data.libelle,
      compte: l.compte,
      intitule: l.intitule,
      debit: l.debit,
      credit: l.credit,
    }));
    await addJournalEntry(lines);
    setShowForm(false);
  };

  const handleCsvImport = async (entries: { date: string; piece: string; journal_code: string; libelle: string; compte: string; intitule: string; debit: number; credit: number }[]) => {
    // Group by piece and import each piece as a journal entry
    const pieceMap = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!pieceMap.has(e.piece)) pieceMap.set(e.piece, []);
      pieceMap.get(e.piece)!.push(e);
    }

    let count = 0;
    for (const [, pieceEntries] of pieceMap) {
      const lines = pieceEntries.map(e => ({
        id: '',
        exercice_id: exercice?.id || '',
        entreprise_id: '',
        date_ecriture: e.date,
        piece: e.piece,
        journal_code: e.journal_code,
        libelle: e.libelle,
        compte: e.compte,
        intitule: e.intitule,
        debit: e.debit,
        credit: e.credit,
      }));
      await addJournalEntry(lines);
      count += lines.length;
    }

    setShowImport(false);
    toast.success(`${count} écritures importées (${pieceMap.size} pièces)`);
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Saisie d'Écritures</div>
          <div className="text-[10px] text-fg3 font-mono">
            {locked && <span className="text-destructive font-bold">🔒 Exercice clôturé — Lecture seule</span>}
            {!locked && 'Toutes les écritures de l\'exercice courant'}
          </div>
        </div>
        {!locked && !demo && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowImport(!showImport); setShowForm(false); }} className="px-3 py-1.5 rounded text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">
              {showImport ? '✕' : '📂 Import CSV'}
            </button>
            <button onClick={() => { setShowForm(!showForm); setShowImport(false); }} className="px-3 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              {showForm ? '✕ Fermer' : '+ Nouvelle Écriture'}
            </button>
          </div>
        )}
      </div>
      <div className="p-5">
        {showImport && !locked && <ImportCsvJournalModal onImport={handleCsvImport} onClose={() => setShowImport(false)} />}
        {showForm && !locked && <NouvelleEcritureForm onSubmit={handleSubmit} plan={plan} loading={loading} />}

        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{rows.length} écriture(s)</span>
            <input className="bg-bg3 border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary w-40" placeholder="Rechercher..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>
                {['Date', 'Pièce', 'Journal', 'Compte', 'Libellé', 'Débit', 'Crédit', ...(locked ? [] : [''])].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{r.date_ecriture}</td>
                    <td className="px-3 py-1.5 text-[11px] border-b border-border/50"><span className="bg-[rgba(56,189,248,.12)] text-primary rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono">{r.piece}</span></td>
                    <td className="px-3 py-1.5 text-[9px] text-fg3 border-b border-border/50">{r.journal_code}</td>
                    <td className="px-3 py-1.5 text-[11px] text-primary font-mono border-b border-border/50">{r.compte}</td>
                    <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.libelle}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.debit ? fmt(r.debit) : ''}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.credit ? fmt(r.credit) : ''}</td>
                    {!locked && (
                      <td className="px-3 py-1.5 border-b border-border/50"><button onClick={() => deleteJournalEntry(r.id)} className="text-destructive text-xs">🗑</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
