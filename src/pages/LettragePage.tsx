import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LettrageEntry {
  id: string;
  journal_entry_id: string;
  compte: string;
  code_lettrage: string;
  montant: number;
  date_lettrage: string;
}

export default function LettragePage() {
  const { journal, entreprise, exercice } = useApp();
  const [compteFilter, setCompteFilter] = useState('411');
  const [lettrages, setLettrages] = useState<LettrageEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [lettreCode, setLettreCode] = useState('');

  // Filter journal for tiers accounts (411, 401)
  const tiersEntries = useMemo(() => {
    return journal.filter(j => j.compte.startsWith(compteFilter));
  }, [journal, compteFilter]);

  // Group by compte
  const comptes = useMemo(() => {
    const map = new Map<string, { intitule: string; entries: typeof tiersEntries }>();
    for (const e of tiersEntries) {
      if (!map.has(e.compte)) map.set(e.compte, { intitule: e.intitule, entries: [] });
      map.get(e.compte)!.entries.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tiersEntries]);

  // Load existing lettrages
  const loadLettrages = useCallback(async () => {
    if (!entreprise || !exercice) return;
    const { data } = await supabase.from('lettrage').select('*')
      .eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id);
    if (data) setLettrages(data as any[]);
  }, [entreprise, exercice]);

  useState(() => { loadLettrages(); });

  const lettredIds = useMemo(() => new Set(lettrages.map(l => l.journal_entry_id)), [lettrages]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Compute selected balance
  const selectedBalance = useMemo(() => {
    let d = 0, c = 0;
    for (const id of selected) {
      const e = journal.find(j => j.id === id);
      if (e) { d += e.debit || 0; c += e.credit || 0; }
    }
    return { debit: d, credit: c, solde: d - c };
  }, [selected, journal]);

  const canLettre = selected.size >= 2 && Math.abs(selectedBalance.solde) < 0.01;

  // Manual lettrage
  const handleLettrage = async () => {
    if (!canLettre || !entreprise || !exercice) return;
    setLoading(true);
    const code = lettreCode || `L${String(lettrages.length + 1).padStart(4, '0')}`;
    const inserts = Array.from(selected).map(id => {
      const e = journal.find(j => j.id === id)!;
      return {
        entreprise_id: entreprise.id,
        exercice_id: exercice.id,
        compte: e.compte,
        code_lettrage: code,
        journal_entry_id: id,
        montant: (e.debit || 0) - (e.credit || 0),
        date_lettrage: new Date().toISOString().slice(0, 10),
      };
    });
    const { error } = await supabase.from('lettrage').insert(inserts);
    if (error) { toast.error('Erreur lettrage: ' + error.message); }
    else {
      toast.success(`Lettrage ${code} appliqué (${selected.size} écritures)`);
      setSelected(new Set());
      setLettreCode('');
      await loadLettrages();
    }
    setLoading(false);
  };

  // Auto lettrage by exact amount matching
  const handleAutoLettrage = async () => {
    if (!entreprise || !exercice) return;
    setLoading(true);
    let count = 0;
    for (const [compte, { entries }] of comptes) {
      const unlettered = entries.filter(e => !lettredIds.has(e.id));
      const debits = unlettered.filter(e => (e.debit || 0) > 0);
      const credits = unlettered.filter(e => (e.credit || 0) > 0);
      const usedD = new Set<string>();
      const usedC = new Set<string>();

      for (const d of debits) {
        if (usedD.has(d.id)) continue;
        for (const c of credits) {
          if (usedC.has(c.id)) continue;
          if (Math.abs((d.debit || 0) - (c.credit || 0)) < 0.01) {
            const code = `A${String(lettrages.length + count + 1).padStart(4, '0')}`;
            await supabase.from('lettrage').insert([
              { entreprise_id: entreprise.id, exercice_id: exercice.id, compte, code_lettrage: code, journal_entry_id: d.id, montant: d.debit || 0, date_lettrage: new Date().toISOString().slice(0, 10) },
              { entreprise_id: entreprise.id, exercice_id: exercice.id, compte, code_lettrage: code, journal_entry_id: c.id, montant: -(c.credit || 0), date_lettrage: new Date().toISOString().slice(0, 10) },
            ]);
            usedD.add(d.id);
            usedC.add(c.id);
            count++;
            break;
          }
        }
      }
    }
    toast.success(`${count} lettrage(s) automatique(s) appliqué(s)`);
    await loadLettrages();
    setLoading(false);
  };

  // Delettrage
  const handleDelettrage = async (code: string) => {
    const { error } = await supabase.from('lettrage').delete()
      .eq('code_lettrage', code).eq('entreprise_id', entreprise?.id);
    if (error) toast.error(error.message);
    else { toast.success(`Lettrage ${code} annulé`); await loadLettrages(); }
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">🔗 Lettrage des Comptes Tiers</div>
        <div className="text-[10px] text-fg3 font-mono">Rapprochement manuel et automatique</div></div>
        <div className="flex items-center gap-2">
          <button onClick={handleAutoLettrage} disabled={loading} className="px-3 py-1.5 rounded text-[11px] font-bold border border-accent/30 text-accent hover:bg-accent/10">
            ⚡ Lettrage Auto
          </button>
        </div>
      </div>
      <div className="p-5">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1">
            {['411', '401', '42'].map(p => (
              <button key={p} onClick={() => { setCompteFilter(p); setSelected(new Set()); }}
                className={`px-3 py-1 rounded text-[11px] font-mono font-bold ${compteFilter === p ? 'bg-primary text-primary-foreground' : 'bg-bg2 border border-border text-fg2 hover:bg-bg3'}`}>
                {p === '411' ? '411 Clients' : p === '401' ? '401 Fournisseurs' : '42 Personnel'}
              </button>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] text-fg3">{selected.size} sélectionnée(s)</span>
              <span className={`text-[11px] font-mono font-bold ${Math.abs(selectedBalance.solde) < 0.01 ? 'text-success' : 'text-destructive'}`}>
                Solde: {fmt(selectedBalance.solde)}
              </span>
              <input value={lettreCode} onChange={e => setLettreCode(e.target.value)} placeholder="Code..." className="bg-bg3 border border-border rounded px-2 py-1 text-[11px] w-24 font-mono" />
              <button onClick={handleLettrage} disabled={!canLettre || loading}
                className="px-3 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40">
                ✓ Lettrer
              </button>
            </div>
          )}
        </div>

        {/* Entries table */}
        {comptes.map(([compte, { intitule, entries }]) => (
          <div key={compte} className="bg-bg2 border border-border rounded-lg overflow-hidden mb-3">
            <div className="px-3.5 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold text-primary font-mono">{compte} — {intitule}</span>
              <span className="text-[10px] text-fg3">{entries.length} écriture(s)</span>
            </div>
            <table className="w-full border-collapse">
              <thead><tr>
                {['', 'Date', 'Pièce', 'Libellé', 'Débit', 'Crédit', 'Lettrage'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {entries.map(e => {
                  const lettre = lettrages.find(l => l.journal_entry_id === e.id);
                  const isLettred = !!lettre;
                  return (
                    <tr key={e.id} className={`hover:bg-[rgba(56,189,248,.02)] ${isLettred ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-1.5 border-b border-border/50">
                        {!isLettred && <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="accent-primary" />}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_ecriture}</td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50"><span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[9px] font-bold font-mono">{e.piece}</span></td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{e.libelle}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{e.debit ? fmt(e.debit) : ''}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{e.credit ? fmt(e.credit) : ''}</td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">
                        {lettre && (
                          <span className="bg-success/10 text-success rounded px-1.5 py-0.5 text-[9px] font-bold font-mono cursor-pointer" onClick={() => handleDelettrage(lettre.code_lettrage)} title="Cliquer pour délettrer">
                            {lettre.code_lettrage}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {comptes.length === 0 && <div className="text-center text-fg3 text-sm py-8">Aucune écriture sur les comptes {compteFilter}*</div>}
      </div>
    </div>
  );
}
