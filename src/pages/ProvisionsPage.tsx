import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import { enregistrerLignesJournal } from '@/lib/ecritures';
import {
  NATURES_PROVISIONS as NATURES, lignesDotationProvision, lignesRepriseProvision,
  validerMontantReprise, encoursProvisions,
} from '@/lib/provisions';

type Provision = {
  id: string;
  entreprise_id: string;
  exercice_id: string | null;
  code: string;
  libelle: string;
  nature: 'exploitation' | 'financiere' | 'hao' | 'depreciation_immo' | 'depreciation_stock' | 'depreciation_creance';
  compte_provision: string;
  compte_dotation: string;
  compte_reprise: string;
  montant_initial: number;
  montant_actuel: number;
  date_constitution: string;
  date_reprise: string | null;
  statut: 'active' | 'reprise_partielle' | 'reprise_totale';
  notes: string | null;
};

const empty = (): Partial<Provision> => ({
  code: '', libelle: '', nature: 'exploitation',
  compte_provision: '191', compte_dotation: '6911', compte_reprise: '7911',
  montant_initial: 0, montant_actuel: 0,
  date_constitution: new Date().toISOString().slice(0, 10),
  statut: 'active',
});

export default function ProvisionsPage() {
  const { entreprise, exercice } = useApp();
  const [list, setList] = useState<Provision[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Provision>>(empty());

  const load = useCallback(async () => {
    if (!entreprise) return;
    setLoading(true);
    const { data, error } = await supabase.from('provisions').select('*')
      .eq('entreprise_id', entreprise.id).order('date_constitution', { ascending: false });
    if (error) toast.error(error.message);
    else setList((data || []).map((p: any) => ({
      ...p, montant_initial: Number(p.montant_initial), montant_actuel: Number(p.montant_actuel),
    })));
    setLoading(false);
  }, [entreprise]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!entreprise) return;
    if (!form.code || !form.libelle || !form.montant_initial) {
      toast.error('Code, libellé et montant requis'); return;
    }
    const payload: any = {
      ...form,
      entreprise_id: entreprise.id,
      exercice_id: exercice?.id,
      montant_actuel: form.montant_actuel ?? form.montant_initial,
    };
    const res = form.id
      ? await supabase.from('provisions').update(payload).eq('id', form.id)
      : await supabase.from('provisions').insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success('Provision enregistrée'); setShowForm(false); setForm(empty()); load(); }
  };

  const comptabiliserDotation = async (p: Provision) => {
    if (!exercice || !entreprise) return;
    const ctx = { entreprise_id: entreprise.id, exercice_id: exercice.id, date: exercice.date_fin };
    const lines = lignesDotationProvision(p, ctx)
      .map(l => ({ ...l, piece: `${l.piece}-${exercice.annee}` }));
    try {
      await enregistrerLignesJournal(lines as any, { origine: 'provision' });
      toast.success(`Dotation ${fmt(p.montant_actuel)} comptabilisée (${lines[0].piece})`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const reprendre = async (p: Provision, montant: number, totale: boolean) => {
    if (!exercice || !entreprise) return;
    const err = validerMontantReprise(montant, p.montant_actuel);
    if (err) { toast.error(err); return; }
    const ctx = { entreprise_id: entreprise.id, exercice_id: exercice.id, date: exercice.date_fin };
    const lines = lignesRepriseProvision(p, montant, ctx)
      .map(l => ({ ...l, piece: `${l.piece}-${exercice.annee}` }));
    try {
      await enregistrerLignesJournal(lines as any, { origine: 'reprise_provision' });
    } catch (e) { toast.error((e as Error).message); return; }
    await supabase.from('provisions').update({
      montant_actuel: p.montant_actuel - montant,
      statut: totale ? 'reprise_totale' : 'reprise_partielle',
      date_reprise: exercice.date_fin,
    }).eq('id', p.id);
    toast.success(`Reprise ${fmt(montant)} comptabilisée (${lines[0].piece})`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cette provision ?')) return;
    const { error } = await supabase.from('provisions').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Supprimée'); load(); }
  };

  const totals = useMemo(() => {
    const actives = list.filter(p => p.statut !== 'reprise_totale');
    return {
      count: list.length,
      actives: actives.length,
      total: actives.reduce((s, p) => s + p.montant_actuel, 0),
    };
  }, [list]);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">🛡️ Provisions & Dépréciations</div>
        <button onClick={() => { setForm(empty()); setShowForm(true); }}
          className="px-3 py-1 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90">
          + Nouvelle provision
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Nb provisions" value={String(totals.count)} />
          <Stat label="Actives" value={String(totals.actives)} />
          <Stat label="Encours total (FCFA)" value={fmt(totals.total)} color="text-primary" />
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-bg3 text-fg3">
              <tr>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Libellé</th>
                <th className="text-left p-2">Nature</th>
                <th className="text-left p-2">Compte</th>
                <th className="text-right p-2">Initial</th>
                <th className="text-right p-2">Actuel</th>
                <th className="text-center p-2">Statut</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center p-6 text-fg3">Chargement…</td></tr>}
              {!loading && list.length === 0 && (
                <tr><td colSpan={8} className="text-center p-6 text-fg3">Aucune provision</td></tr>
              )}
              {list.map(p => {
                const nat = NATURES.find(n => n.code === p.nature);
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-bg3/50">
                    <td className="p-2 font-mono">{p.code}</td>
                    <td className="p-2">{p.libelle}</td>
                    <td className="p-2 text-[10px] text-fg2">{nat?.label || p.nature}</td>
                    <td className="p-2 font-mono text-[10px]">{p.compte_provision}</td>
                    <td className="p-2 text-right font-mono">{fmt(p.montant_initial)}</td>
                    <td className="p-2 text-right font-mono text-primary">{fmt(p.montant_actuel)}</td>
                    <td className="p-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        p.statut === 'active' ? 'bg-emerald-500/20 text-emerald-500' :
                        p.statut === 'reprise_partielle' ? 'bg-amber-500/20 text-amber-500' :
                        'bg-fg3/20 text-fg3'
                      }`}>{p.statut}</span>
                    </td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => comptabiliserDotation(p)} title="Comptabiliser dotation"
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">💾 Doter</button>
                      {p.statut !== 'reprise_totale' && (
                        <>
                          <button onClick={() => {
                            const m = prompt(`Montant à reprendre (max ${fmt(p.montant_actuel)}) :`, String(p.montant_actuel));
                            if (m) reprendre(p, Number(m), Number(m) >= p.montant_actuel);
                          }} title="Reprendre la provision"
                            className="text-[10px] px-2 py-1 rounded border border-amber-500/40 text-amber-500 hover:bg-amber-500/10">↩ Reprise</button>
                        </>
                      )}
                      <button onClick={() => { setForm(p); setShowForm(true); }}
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">✏️</button>
                      <button onClick={() => remove(p.id)}
                        className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal title={form.id ? 'Modifier' : 'Nouvelle provision'} onClose={() => setShowForm(false)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Code"><input className="inp" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Libellé"><input className="inp" value={form.libelle || ''} onChange={e => setForm({ ...form, libelle: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Nature">
              <select className="inp" value={form.nature || 'exploitation'} onChange={e => {
                const n = NATURES.find(x => x.code === e.target.value);
                setForm({ ...form, nature: e.target.value as any, compte_provision: n?.cp || '', compte_dotation: n?.cd || '', compte_reprise: n?.cr || '' });
              }}>
                {NATURES.map(n => <option key={n.code} value={n.code}>{n.label} (P:{n.cp} / D:{n.cd} / R:{n.cr})</option>)}
              </select>
            </Field></div>
            <Field label="Compte provision"><input className="inp" value={form.compte_provision || ''} onChange={e => setForm({ ...form, compte_provision: e.target.value })} /></Field>
            <Field label="Compte dotation"><input className="inp" value={form.compte_dotation || ''} onChange={e => setForm({ ...form, compte_dotation: e.target.value })} /></Field>
            <Field label="Compte reprise"><input className="inp" value={form.compte_reprise || ''} onChange={e => setForm({ ...form, compte_reprise: e.target.value })} /></Field>
            <Field label="Date constitution"><input type="date" className="inp" value={form.date_constitution || ''} onChange={e => setForm({ ...form, date_constitution: e.target.value })} /></Field>
            <Field label="Montant initial (FCFA)"><input type="number" className="inp" value={form.montant_initial || 0} onChange={e => setForm({ ...form, montant_initial: Number(e.target.value), montant_actuel: Number(e.target.value) })} /></Field>
            <Field label="Montant actuel"><input type="number" className="inp" value={form.montant_actuel || 0} onChange={e => setForm({ ...form, montant_actuel: Number(e.target.value) })} /></Field>
            <div className="col-span-2"><Field label="Notes (justification, base légale, événement déclencheur)">
              <textarea className="inp" rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={save} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}

      <style>{`.inp{width:100%;padding:6px 8px;background:hsl(var(--bg3));border:1px solid hsl(var(--border));border-radius:4px;color:hsl(var(--foreground));font-size:11px;}`}</style>
    </div>
  );
}

function Stat({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-fg3 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold font-mono mt-1 ${color || 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] text-fg3 mb-1">{label}</span>{children}</label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-xl p-5 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-base text-foreground">{title}</h3>
          <button onClick={onClose} className="text-fg3 hover:text-foreground">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
