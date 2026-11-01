import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';

type Echeance = {
  id: string;
  entreprise_id: string;
  exercice_id: string | null;
  type_declaration: string;
  libelle: string;
  periode: string;
  date_limite: string;
  montant_du: number;
  montant_paye: number;
  statut: 'a_declarer' | 'declaree' | 'payee' | 'en_retard';
  reference_paiement: string | null;
  date_declaration: string | null;
  date_paiement: string | null;
  notes: string | null;
};

const TYPES = [
  { code: 'TVA', label: 'TVA mensuelle', jour: 15, periodicite: 'mensuelle', compte: '4441' },
  { code: 'IRPP', label: 'IRPP / Retenue salaires', jour: 15, periodicite: 'mensuelle', compte: '4471' },
  { code: 'IPRES', label: 'IPRES (parts salariale + patronale)', jour: 10, periodicite: 'mensuelle', compte: '4311' },
  { code: 'CSS', label: 'CSS (Caisse Sécurité Sociale)', jour: 10, periodicite: 'mensuelle', compte: '4312' },
  { code: 'CFCE', label: 'CFCE (3 % masse salariale)', jour: 15, periodicite: 'mensuelle', compte: '4475' },
  { code: 'IS', label: 'IS — Acompte / Solde', jour: 15, periodicite: 'trimestrielle', compte: '441' },
  { code: 'TOB', label: 'TOB (Taxe sur opérations bancaires)', jour: 15, periodicite: 'mensuelle', compte: '4476' },
  { code: 'CGU', label: 'Contribution Globale Unique (CGU)', jour: 30, periodicite: 'annuelle', compte: '442' },
  { code: 'DSF', label: 'Dépôt DSF (États financiers annuels)', jour: 30, periodicite: 'annuelle', compte: '' },
];

const STATUT_COLORS: Record<string, string> = {
  a_declarer: 'text-amber-500',
  declaree: 'text-blue-500',
  payee: 'text-emerald-500',
  en_retard: 'text-red-500',
};

const STATUT_LABELS: Record<string, string> = {
  a_declarer: 'À déclarer',
  declaree: 'Déclarée',
  payee: 'Payée',
  en_retard: 'En retard',
};

function joursAvant(dateLimite: string): number {
  const d = new Date(dateLimite);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

export default function EcheancierPage() {
  const { entreprise, exercice } = useApp();
  const [list, setList] = useState<Echeance[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('tous');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type_declaration: 'TVA', libelle: '', periode: '', date_limite: '',
    montant_du: 0, notes: '',
  });

  const reload = useCallback(async () => {
    if (!entreprise) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('echeances_fiscales')
      .select('*')
      .eq('entreprise_id', entreprise.id)
      .order('date_limite', { ascending: true });
    if (error) toast.error(error.message);
    else {
      const mapped = (data || []).map((d: any) => {
        const e: Echeance = {
          ...d,
          montant_du: Number(d.montant_du),
          montant_paye: Number(d.montant_paye),
        };
        // auto en_retard
        if (e.statut === 'a_declarer' && joursAvant(e.date_limite) < 0) {
          e.statut = 'en_retard';
        }
        return e;
      });
      setList(mapped);
    }
    setLoading(false);
  }, [entreprise]);

  useEffect(() => { reload(); }, [reload]);

  const stats = useMemo(() => {
    const total = list.length;
    const aDeclarer = list.filter(e => e.statut === 'a_declarer').length;
    const enRetard = list.filter(e => e.statut === 'en_retard').length;
    const payees = list.filter(e => e.statut === 'payee').length;
    const montantTotal = list.reduce((s, e) => s + e.montant_du, 0);
    const restantDu = list.filter(e => e.statut !== 'payee').reduce((s, e) => s + (e.montant_du - e.montant_paye), 0);
    return { total, aDeclarer, enRetard, payees, montantTotal, restantDu };
  }, [list]);

  const filtered = useMemo(() => {
    if (filter === 'tous') return list;
    if (filter === 'urgent') return list.filter(e => {
      const j = joursAvant(e.date_limite);
      return e.statut !== 'payee' && j <= 7;
    });
    return list.filter(e => e.statut === filter);
  }, [list, filter]);

  const handleAdd = async () => {
    if (!entreprise || !form.libelle || !form.date_limite) {
      toast.error('Libellé et date limite requis');
      return;
    }
    const t = TYPES.find(x => x.code === form.type_declaration);
    const { error } = await supabase.from('echeances_fiscales').insert({
      entreprise_id: entreprise.id,
      exercice_id: exercice?.id,
      type_declaration: form.type_declaration,
      libelle: form.libelle || t?.label || '',
      periode: form.periode,
      date_limite: form.date_limite,
      montant_du: form.montant_du,
      notes: form.notes,
      statut: 'a_declarer',
    });
    if (error) toast.error(error.message);
    else {
      toast.success('Échéance créée');
      setShowForm(false);
      setForm({ type_declaration: 'TVA', libelle: '', periode: '', date_limite: '', montant_du: 0, notes: '' });
      reload();
    }
  };

  const updateStatut = async (id: string, statut: Echeance['statut'], extra: Partial<Echeance> = {}) => {
    const today = new Date().toISOString().slice(0, 10);
    const updates: any = { statut, ...extra };
    if (statut === 'declaree' && !extra.date_declaration) updates.date_declaration = today;
    if (statut === 'payee' && !extra.date_paiement) updates.date_paiement = today;
    const { error } = await supabase.from('echeances_fiscales').update(updates).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Statut mis à jour'); reload(); }
  };

  const supprimer = async (id: string) => {
    if (!confirm('Supprimer cette échéance ?')) return;
    const { error } = await supabase.from('echeances_fiscales').delete().eq('id', id);
    if (error) toast.error(error.message);
    else reload();
  };

  const genererAlertes = async () => {
    try {
      const { data, error } = await supabase.rpc('fn_generer_alertes_echeances' as any);
      if (error) throw error;
      const n = Number(data) || 0;
      toast.success(n > 0 ? `${n} alerte(s) d'échéance générée(s).` : 'Aucune nouvelle alerte à générer.');
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la génération des alertes');
    }
  };

  const genererCalendrierAnnee = async () => {
    if (!entreprise || !exercice) return;
    if (!confirm(`Générer toutes les échéances récurrentes pour l'année ${exercice.annee} ?`)) return;
    const inserts: any[] = [];
    const annee = exercice.annee;
    for (const t of TYPES) {
      if (t.periodicite === 'mensuelle') {
        for (let m = 1; m <= 12; m++) {
          // déclaration du mois M se fait au mois M+1
          const decMois = m + 1;
          const an = decMois > 12 ? annee + 1 : annee;
          const mois = decMois > 12 ? 1 : decMois;
          const dl = `${an}-${String(mois).padStart(2, '0')}-${String(t.jour).padStart(2, '0')}`;
          inserts.push({
            entreprise_id: entreprise.id,
            exercice_id: exercice.id,
            type_declaration: t.code,
            libelle: `${t.label} — ${String(m).padStart(2, '0')}/${annee}`,
            periode: `${String(m).padStart(2, '0')}/${annee}`,
            date_limite: dl,
            montant_du: 0,
            statut: 'a_declarer',
          });
        }
      } else if (t.periodicite === 'trimestrielle') {
        for (let q = 1; q <= 4; q++) {
          const mois = q * 3 + 1 > 12 ? 1 : q * 3 + 1;
          const an = q === 4 ? annee + 1 : annee;
          inserts.push({
            entreprise_id: entreprise.id,
            exercice_id: exercice.id,
            type_declaration: t.code,
            libelle: `${t.label} — T${q}/${annee}`,
            periode: `T${q}/${annee}`,
            date_limite: `${an}-${String(mois).padStart(2, '0')}-${String(t.jour).padStart(2, '0')}`,
            montant_du: 0,
            statut: 'a_declarer',
          });
        }
      } else {
        // annuelle: déposer 4 mois après clôture
        inserts.push({
          entreprise_id: entreprise.id,
          exercice_id: exercice.id,
          type_declaration: t.code,
          libelle: `${t.label} — ${annee}`,
          periode: `${annee}`,
          date_limite: `${annee + 1}-04-${String(t.jour).padStart(2, '0')}`,
          montant_du: 0,
          statut: 'a_declarer',
        });
      }
    }
    const { error } = await supabase.from('echeances_fiscales').insert(inserts);
    if (error) toast.error(error.message);
    else { toast.success(`${inserts.length} échéances générées`); reload(); }
  };

  const alertes = useMemo(() => list.filter(e => {
    if (e.statut === 'payee') return false;
    const j = joursAvant(e.date_limite);
    return j <= 7;
  }).slice(0, 5), [list]);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">📅 Échéancier Fiscal & Social</div>
        <div className="flex items-center gap-2">
          <button onClick={genererCalendrierAnnee}
            className="text-[11px] px-3 py-1 rounded border border-border bg-bg3 hover:bg-primary/10 hover:border-primary">
            ⚙️ Générer calendrier {exercice?.annee}
          </button>
          <button onClick={genererAlertes}
            className="text-[11px] px-3 py-1 rounded border border-border bg-bg3 hover:bg-primary/10 hover:border-primary">
            🔔 Générer les alertes J-7
          </button>
          <button onClick={() => setShowForm(true)}
            className="text-[11px] px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90">
            + Nouvelle échéance
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="Total" value={String(stats.total)} color="text-foreground" />
          <StatCard label="À déclarer" value={String(stats.aDeclarer)} color="text-amber-500" />
          <StatCard label="En retard" value={String(stats.enRetard)} color="text-red-500" />
          <StatCard label="Payées" value={String(stats.payees)} color="text-emerald-500" />
          <StatCard label="Total dû (FCFA)" value={fmt(stats.montantTotal)} color="text-primary" />
          <StatCard label="Reste à payer" value={fmt(stats.restantDu)} color="text-orange-500" />
        </div>

        {/* Alertes */}
        {alertes.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="font-semibold text-sm text-amber-600 dark:text-amber-400 mb-2">
              ⚠️ Alertes — Échéances ≤ 7 jours
            </div>
            <div className="space-y-1">
              {alertes.map(e => {
                const j = joursAvant(e.date_limite);
                return (
                  <div key={e.id} className="text-[11px] flex items-center justify-between">
                    <span>
                      <span className="font-mono font-bold text-primary">{e.type_declaration}</span> · {e.libelle}
                    </span>
                    <span className={j < 0 ? 'text-red-500 font-bold' : j <= 3 ? 'text-orange-500 font-bold' : 'text-amber-500'}>
                      {j < 0 ? `Retard ${-j}j` : j === 0 ? "Aujourd'hui" : `J-${j}`} · {e.date_limite}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="flex gap-2 flex-wrap">
          {['tous', 'urgent', 'a_declarer', 'declaree', 'payee', 'en_retard'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[11px] px-3 py-1 rounded border ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-bg2 border-border hover:bg-bg3'}`}>
              {f === 'tous' ? 'Toutes' : f === 'urgent' ? '⚠️ Urgentes (≤7j)' : STATUT_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Liste */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-bg3 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Type</th>
                <th className="text-left px-3 py-2 font-semibold">Libellé</th>
                <th className="text-left px-3 py-2 font-semibold">Période</th>
                <th className="text-left px-3 py-2 font-semibold">Date limite</th>
                <th className="text-right px-3 py-2 font-semibold">Montant dû</th>
                <th className="text-right px-3 py-2 font-semibold">Payé</th>
                <th className="text-center px-3 py-2 font-semibold">Statut</th>
                <th className="text-center px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-6 text-fg3">Chargement…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-6 text-fg3">Aucune échéance. Cliquez sur "Générer calendrier" pour démarrer.</td></tr>
              )}
              {filtered.map(e => {
                const j = joursAvant(e.date_limite);
                return (
                  <tr key={e.id} className="border-b border-border/30 hover:bg-bg3/50">
                    <td className="px-3 py-2 font-mono font-bold text-primary">{e.type_declaration}</td>
                    <td className="px-3 py-2">{e.libelle}</td>
                    <td className="px-3 py-2 font-mono text-fg2">{e.periode}</td>
                    <td className="px-3 py-2 font-mono">
                      {e.date_limite}
                      {e.statut !== 'payee' && (
                        <span className={`ml-2 text-[9px] ${j < 0 ? 'text-red-500' : j <= 7 ? 'text-amber-500' : 'text-fg3'}`}>
                          {j < 0 ? `(${-j}j retard)` : `(J-${j})`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(e.montant_du)}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-500">{fmt(e.montant_paye)}</td>
                    <td className={`px-3 py-2 text-center font-semibold ${STATUT_COLORS[e.statut]}`}>
                      {STATUT_LABELS[e.statut]}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        {e.statut === 'a_declarer' || e.statut === 'en_retard' ? (
                          <button onClick={() => updateStatut(e.id, 'declaree')}
                            className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-500 hover:bg-blue-500/30">
                            Déclarer
                          </button>
                        ) : null}
                        {e.statut !== 'payee' && (
                          <button onClick={() => updateStatut(e.id, 'payee', { montant_paye: e.montant_du })}
                            className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30">
                            Payer
                          </button>
                        )}
                        <button onClick={() => supprimer(e.id)}
                          className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20">
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowForm(false)}>
          <div className="bg-bg2 border border-border rounded-xl p-5 w-[480px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-base mb-4">Nouvelle échéance</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-fg3 uppercase font-mono">Type</label>
                <select value={form.type_declaration}
                  onChange={e => {
                    const t = TYPES.find(x => x.code === e.target.value);
                    setForm({ ...form, type_declaration: e.target.value, libelle: t?.label || '' });
                  }}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-sm">
                  {TYPES.map(t => <option key={t.code} value={t.code}>{t.code} — {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-fg3 uppercase font-mono">Libellé</label>
                <input value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-fg3 uppercase font-mono">Période</label>
                  <input value={form.periode} onChange={e => setForm({ ...form, periode: e.target.value })}
                    placeholder="ex: 03/2026 ou T1/2026"
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-fg3 uppercase font-mono">Date limite</label>
                  <input type="date" value={form.date_limite}
                    onChange={e => setForm({ ...form, date_limite: e.target.value })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-fg3 uppercase font-mono">Montant dû (FCFA)</label>
                <input type="number" value={form.montant_du}
                  onChange={e => setForm({ ...form, montant_du: Number(e.target.value) })}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-fg3 uppercase font-mono">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-bg3">Annuler</button>
                <button onClick={handleAdd} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">Créer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg p-3">
      <div className="text-[9px] text-fg3 uppercase tracking-wider font-mono mb-1">{label}</div>
      <div className={`text-lg font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}
