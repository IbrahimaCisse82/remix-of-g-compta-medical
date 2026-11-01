import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BudgetLine { id: string; compte: string; intitule: string; mois: number; montant_budget: number; }

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export default function BudgetPage() {
  const { entreprise, exercice, journal, balance } = useApp();
  const [budgets, setBudgets] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newCompte, setNewCompte] = useState('');
  const [newIntitule, setNewIntitule] = useState('');
  const [newMontants, setNewMontants] = useState<number[]>(Array(12).fill(0));

  const loadBudgets = useCallback(async () => {
    if (!entreprise || !exercice) return;
    const { data } = await supabase.from('budgets').select('*')
      .eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id).order('compte');
    if (data) setBudgets(data as any[]);
  }, [entreprise, exercice]);

  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  // Realized amounts from journal by month
  const realized = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const j of journal) {
      if (!/^[6-7]/.test(j.compte)) continue;
      const m = new Date(j.date_ecriture).getMonth();
      if (!map.has(j.compte)) map.set(j.compte, Array(12).fill(0));
      const arr = map.get(j.compte)!;
      arr[m] += (j.debit || 0) - (j.credit || 0);
    }
    return map;
  }, [journal]);

  // Group budgets by compte
  const compteGroups = useMemo(() => {
    const map = new Map<string, { intitule: string; budgets: number[]; realized: number[] }>();
    for (const b of budgets) {
      if (!map.has(b.compte)) map.set(b.compte, { intitule: b.intitule, budgets: Array(12).fill(0), realized: realized.get(b.compte) || Array(12).fill(0) });
      map.get(b.compte)!.budgets[b.mois - 1] = b.montant_budget;
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [budgets, realized]);

  const addBudget = async () => {
    if (!entreprise || !exercice || !newCompte) return;
    setLoading(true);
    const inserts = newMontants.map((m, i) => ({
      entreprise_id: entreprise.id, exercice_id: exercice.id,
      compte: newCompte, intitule: newIntitule, mois: i + 1, montant_budget: m,
    })).filter(x => x.montant_budget !== 0);
    const { error } = await supabase.from('budgets').insert(inserts);
    if (error) toast.error(error.message);
    else { toast.success('Budget ajouté'); setShowForm(false); setNewCompte(''); setNewIntitule(''); setNewMontants(Array(12).fill(0)); await loadBudgets(); }
    setLoading(false);
  };

  const deleteBudget = async (compte: string) => {
    await supabase.from('budgets').delete().eq('compte', compte).eq('entreprise_id', entreprise?.id).eq('exercice_id', exercice?.id);
    toast.success('Budget supprimé');
    await loadBudgets();
  };

  const totalBudget = compteGroups.reduce((s, [, g]) => s + g.budgets.reduce((a, b) => a + b, 0), 0);
  const totalRealized = compteGroups.reduce((s, [, g]) => s + g.realized.reduce((a, b) => a + b, 0), 0);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">💰 Gestion Budgétaire</div>
        <div className="text-[10px] text-fg3 font-mono">Budget vs Réalisé — Exercice {exercice?.annee}</div></div>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded text-[11px] font-bold border border-border text-fg2 hover:bg-bg3">
          {showForm ? '✕' : '+ Nouveau Budget'}
        </button>
      </div>
      <div className="p-5">
        {showForm && (
          <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
            <div className="font-bold text-sm mb-3 text-primary">📋 Définir un budget</div>
            <div className="flex items-end gap-3 mb-3">
              <div>
                <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Compte</label>
                <input value={newCompte} onChange={e => setNewCompte(e.target.value)} placeholder="601000" className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-28 font-mono" />
              </div>
              <div>
                <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Intitulé</label>
                <input value={newIntitule} onChange={e => setNewIntitule(e.target.value)} placeholder="Achats de marchandises" className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-48" />
              </div>
            </div>
            <div className="grid grid-cols-12 gap-1 mb-3">
              {MOIS.map((m, i) => (
                <div key={m}>
                  <label className="text-[8px] text-fg3 font-mono block mb-0.5 text-center">{m}</label>
                  <input type="number" value={newMontants[i] || ''} onChange={e => {
                    const arr = [...newMontants]; arr[i] = Number(e.target.value) || 0; setNewMontants(arr);
                  }} className="w-full bg-bg3 border border-border rounded px-1 py-1 text-[10px] font-mono text-center" />
                </div>
              ))}
            </div>
            <button onClick={addBudget} disabled={!newCompte || loading} className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40">✓ Enregistrer</button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-bg2 border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-fg3 uppercase font-mono">Budget Total</div>
            <div className="text-lg font-bold text-primary font-mono">{fmt(totalBudget)}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-fg3 uppercase font-mono">Réalisé Total</div>
            <div className="text-lg font-bold text-accent font-mono">{fmt(totalRealized)}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3 text-center">
            <div className="text-[10px] text-fg3 uppercase font-mono">Écart</div>
            <div className={`text-lg font-bold font-mono ${totalBudget - totalRealized >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(totalBudget - totalRealized)}</div>
          </div>
        </div>

        {/* Detail table */}
        <div className="bg-bg2 border border-border rounded-lg overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead><tr>
              <th className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border sticky left-0 bg-bg3 z-10">Compte</th>
              {MOIS.map(m => <th key={m} className="bg-bg3 px-2 py-1.5 text-center text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{m}</th>)}
              <th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">Total</th>
              <th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">Écart</th>
              <th className="bg-bg3 px-2 py-1.5 border-b border-border"></th>
            </tr></thead>
            <tbody>
              {compteGroups.map(([compte, g]) => {
                const tb = g.budgets.reduce((a, b) => a + b, 0);
                const tr = g.realized.reduce((a, b) => a + b, 0);
                return (
                  <>
                    <tr key={`${compte}-b`} className="hover:bg-[rgba(56,189,248,.02)]">
                      <td className="px-3 py-1 text-[10px] font-mono text-primary font-bold border-b border-border/30 sticky left-0 bg-bg2" rowSpan={2}>
                        {compte}<br /><span className="text-fg3 font-normal text-[9px]">{g.intitule}</span>
                      </td>
                      {g.budgets.map((b, i) => (
                        <td key={i} className="px-2 py-1 text-[10px] font-mono text-center border-b border-border/30">{b ? fmt(b) : '—'}</td>
                      ))}
                      <td className="px-3 py-1 text-[10px] font-mono text-right font-bold border-b border-border/30">{fmt(tb)}</td>
                      <td className="px-3 py-1 text-[10px] font-mono text-right font-bold border-b border-border/30" rowSpan={2}>
                        <span className={tb - tr >= 0 ? 'text-success' : 'text-destructive'}>{fmt(tb - tr)}</span>
                      </td>
                      <td className="px-2 py-1 border-b border-border/30" rowSpan={2}>
                        <button onClick={() => deleteBudget(compte)} className="text-destructive text-xs">🗑</button>
                      </td>
                    </tr>
                    <tr key={`${compte}-r`} className="bg-accent/5">
                      {g.realized.map((r, i) => (
                        <td key={i} className="px-2 py-1 text-[10px] font-mono text-center text-accent border-b border-border/30">{r ? fmt(r) : '—'}</td>
                      ))}
                      <td className="px-3 py-1 text-[10px] font-mono text-right font-bold text-accent border-b border-border/30">{fmt(tr)}</td>
                    </tr>
                  </>
                );
              })}
              {compteGroups.length === 0 && <tr><td colSpan={15} className="px-3 py-6 text-center text-fg3 text-[11px]">Aucun budget défini. Cliquez sur "+ Nouveau Budget" pour commencer.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
