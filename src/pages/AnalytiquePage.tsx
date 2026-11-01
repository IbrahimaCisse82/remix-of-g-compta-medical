import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Axe { id: string; code: string; libelle: string; actif: boolean; }
interface Ventilation { id: string; journal_entry_id: string; axe_id: string; centre: string; montant: number; pourcentage: number; }

export default function AnalytiquePage() {
  const { entreprise, exercice, journal } = useApp();
  const [axes, setAxes] = useState<Axe[]>([]);
  const [ventilations, setVentilations] = useState<Ventilation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAxeForm, setShowAxeForm] = useState(false);
  const [newAxeCode, setNewAxeCode] = useState('');
  const [newAxeLibelle, setNewAxeLibelle] = useState('');
  const [selectedAxe, setSelectedAxe] = useState<string>('');
  const [showVentForm, setShowVentForm] = useState(false);
  const [ventEntryId, setVentEntryId] = useState('');
  const [ventCentre, setVentCentre] = useState('');
  const [ventPct, setVentPct] = useState(100);

  const loadData = useCallback(async () => {
    if (!entreprise || !exercice) return;
    setLoading(true);
    const [axeRes, ventRes] = await Promise.all([
      supabase.from('axes_analytiques').select('*').eq('entreprise_id', entreprise.id),
      supabase.from('ventilations_analytiques').select('*').eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id),
    ]);
    if (axeRes.data) setAxes(axeRes.data as any[]);
    if (ventRes.data) setVentilations(ventRes.data as any[]);
    if (axeRes.data?.length && !selectedAxe) setSelectedAxe(axeRes.data[0].id);
    setLoading(false);
  }, [entreprise, exercice, selectedAxe]);

  useEffect(() => { loadData(); }, [loadData]);

  const addAxe = async () => {
    if (!entreprise || !newAxeCode || !newAxeLibelle) return;
    const { error } = await supabase.from('axes_analytiques').insert({
      entreprise_id: entreprise.id, code: newAxeCode, libelle: newAxeLibelle,
    });
    if (error) toast.error(error.message);
    else { toast.success('Axe créé'); setShowAxeForm(false); setNewAxeCode(''); setNewAxeLibelle(''); await loadData(); }
  };

  const deleteAxe = async (id: string) => {
    await supabase.from('axes_analytiques').delete().eq('id', id);
    toast.success('Axe supprimé');
    await loadData();
  };

  const addVentilation = async () => {
    if (!entreprise || !exercice || !selectedAxe || !ventEntryId || !ventCentre) return;
    const entry = journal.find(j => j.id === ventEntryId);
    if (!entry) return;
    const montant = ((entry.debit || 0) - (entry.credit || 0)) * ventPct / 100;
    const { error } = await supabase.from('ventilations_analytiques').insert({
      entreprise_id: entreprise.id, exercice_id: exercice.id,
      journal_entry_id: ventEntryId, axe_id: selectedAxe,
      centre: ventCentre, montant, pourcentage: ventPct,
    });
    if (error) toast.error(error.message);
    else { toast.success('Ventilation ajoutée'); setShowVentForm(false); await loadData(); }
  };

  // Summary by centre for selected axe
  const summary = useMemo(() => {
    const axeVents = ventilations.filter(v => v.axe_id === selectedAxe);
    const map = new Map<string, number>();
    for (const v of axeVents) {
      map.set(v.centre, (map.get(v.centre) || 0) + v.montant);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [ventilations, selectedAxe]);

  const total = summary.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">📊 Comptabilité Analytique</div>
        <div className="text-[10px] text-fg3 font-mono">Multi-axes — Ventilation des charges et produits</div></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAxeForm(!showAxeForm)} className="px-3 py-1.5 rounded text-[11px] font-bold border border-border text-fg2 hover:bg-bg3">
            {showAxeForm ? '✕' : '+ Nouvel Axe'}
          </button>
          <button onClick={() => setShowVentForm(!showVentForm)} className="px-3 py-1.5 rounded text-[11px] font-bold border border-primary/30 text-primary hover:bg-primary/10">
            + Ventiler
          </button>
        </div>
      </div>
      <div className="p-5">
        {/* Add axe form */}
        {showAxeForm && (
          <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
            <div className="font-bold text-sm mb-3 text-primary">📐 Nouvel Axe Analytique</div>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Code</label>
                <input value={newAxeCode} onChange={e => setNewAxeCode(e.target.value)} placeholder="AXE1" className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-24 font-mono" />
              </div>
              <div>
                <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Libellé</label>
                <input value={newAxeLibelle} onChange={e => setNewAxeLibelle(e.target.value)} placeholder="Centre de coûts" className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-48" />
              </div>
              <button onClick={addAxe} className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground">✓ Créer</button>
            </div>
          </div>
        )}

        {/* Ventilation form */}
        {showVentForm && (
          <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
            <div className="font-bold text-sm mb-3 text-primary">📌 Ventiler une écriture</div>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Axe</label>
                <select value={selectedAxe} onChange={e => setSelectedAxe(e.target.value)} className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-40">
                  {axes.map(a => <option key={a.id} value={a.id}>{a.code} — {a.libelle}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Écriture</label>
                <select value={ventEntryId} onChange={e => setVentEntryId(e.target.value)} className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-64">
                  <option value="">Sélectionner...</option>
                  {journal.filter(j => /^[6-7]/.test(j.compte)).slice(0, 100).map(j => (
                    <option key={j.id} value={j.id}>{j.date_ecriture} — {j.compte} — {j.libelle} ({fmt((j.debit || 0) - (j.credit || 0))})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Centre</label>
                <input value={ventCentre} onChange={e => setVentCentre(e.target.value)} placeholder="Direction, Production..." className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-40" />
              </div>
              <div>
                <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">%</label>
                <input type="number" value={ventPct} onChange={e => setVentPct(Number(e.target.value))} className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-20 font-mono" />
              </div>
              <button onClick={addVentilation} className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground">✓ Ventiler</button>
            </div>
          </div>
        )}

        {/* Axes tabs */}
        <div className="flex items-center gap-1 mb-4">
          {axes.map(a => (
            <button key={a.id} onClick={() => setSelectedAxe(a.id)}
              className={`px-3 py-1.5 rounded text-[11px] font-bold ${selectedAxe === a.id ? 'bg-primary text-primary-foreground' : 'bg-bg2 border border-border text-fg2 hover:bg-bg3'}`}>
              {a.code} — {a.libelle}
              <span onClick={e => { e.stopPropagation(); deleteAxe(a.id); }} className="ml-2 text-destructive hover:underline">✕</span>
            </button>
          ))}
          {axes.length === 0 && <span className="text-[11px] text-fg3">Aucun axe analytique. Créez-en un pour commencer.</span>}
        </div>

        {/* Summary by centre */}
        {selectedAxe && summary.length > 0 && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
            <div className="px-3.5 py-2.5 border-b border-border">
              <span className="text-xs font-semibold">Répartition par centre — {axes.find(a => a.id === selectedAxe)?.libelle}</span>
            </div>
            <table className="w-full border-collapse">
              <thead><tr>
                {['Centre', 'Montant', '%'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {summary.map(([centre, montant]) => (
                  <tr key={centre} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 text-[11px] font-bold border-b border-border/50">{centre}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(montant)}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-fg3 border-b border-border/50">{total ? ((montant / total) * 100).toFixed(1) : 0} %</td>
                  </tr>
                ))}
                <tr className="bg-bg3 font-bold">
                  <td className="px-3 py-1.5 text-[11px] border-t border-border">TOTAL</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-t border-border">{fmt(total)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-t border-border">100 %</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Detail ventilations */}
        {selectedAxe && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border">
              <span className="text-xs font-semibold">Détail des ventilations</span>
            </div>
            <table className="w-full border-collapse">
              <thead><tr>
                {['Écriture', 'Centre', 'Montant', '%', ''].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {ventilations.filter(v => v.axe_id === selectedAxe).map(v => {
                  const entry = journal.find(j => j.id === v.journal_entry_id);
                  return (
                    <tr key={v.id} className="hover:bg-[rgba(56,189,248,.02)]">
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">
                        <span className="text-primary font-mono">{entry?.compte}</span> — {entry?.libelle || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] font-bold border-b border-border/50">{v.centre}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(v.montant)}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono text-right text-fg3 border-b border-border/50">{v.pourcentage} %</td>
                      <td className="px-3 py-1.5 border-b border-border/50">
                        <button onClick={async () => { await supabase.from('ventilations_analytiques').delete().eq('id', v.id); await loadData(); }} className="text-destructive text-xs">🗑</button>
                      </td>
                    </tr>
                  );
                })}
                {ventilations.filter(v => v.axe_id === selectedAxe).length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-fg3 text-[11px]">Aucune ventilation sur cet axe</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
