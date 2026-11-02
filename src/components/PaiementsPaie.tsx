import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { estCompteTresorerie, journalTresorerie } from '@/lib/reglements-tiers';

const NATURES: Record<string, string> = {
  salaires: 'Salaires nets (422)', ir: 'IR et TRIMF (4471)', cfce: 'CFCE (4472)', ipres: 'IPRES (4313)', css: 'CSS (4311/4312)', ipm: 'IPM (4333)',
};
interface Reste { nature: string; compte: string; du: number; paye: number; reste: number }
interface Paiement {
  id: string; numero: string; nature: string; date_paiement: string; compte_tresorerie: string; journal_code: string; mode: string | null;
  reference: string | null; montant: number; annule_le: string | null; motif_annulation: string | null;
}

/**
 * Paiement des salaires et des cotisations d'une période comptabilisée (écriture PAIE-<période>) :
 * reste dû par nature, paiement total ou partiel par fn_payer_paie (une écriture BQ/CA, lettrage des comptes soldés),
 * annulation par contre-passation (fn_annuler_paiement_paie).
 */
export default function PaiementsPaie({ periode, libellePeriode, canWrite }: { periode: string; libellePeriode: string; canWrite: boolean }) {
  const { entreprise, exercice, plan, rafraichirComptabilite } = useApp();
  const [restes, setRestes] = useState<Reste[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [form, setForm] = useState<{ nature: string; montant: number; date: string; compte: string; mode: string; reference: string } | null>(null);
  const [annul, setAnnul] = useState<{ p: Paiement; motif: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    if (!entreprise) return;
    const [r, p] = await Promise.all([
      supabase.rpc('fn_paie_restes' as any, { _entreprise_id: entreprise.id, _periode: periode }),
      (supabase.from('paie_paiements' as any) as any).select('*').eq('entreprise_id', entreprise.id).eq('periode', periode).order('date_paiement').order('numero'),
    ]);
    setRestes(((r.data ?? []) as any[]).map(x => ({ ...x, du: Number(x.du), paye: Number(x.paye), reste: Number(x.reste) })));
    setPaiements(((p.data ?? []) as any[]).map(x => ({ ...x, montant: Number(x.montant) })));
  }, [entreprise, periode]);
  useEffect(() => { void charger(); }, [charger]);

  const parNature = useMemo(() => {
    const m = new Map<string, { du: number; paye: number; reste: number }>();
    for (const r of restes) { const v = m.get(r.nature) ?? { du: 0, paye: 0, reste: 0 }; m.set(r.nature, { du: v.du + r.du, paye: v.paye + r.paye, reste: v.reste + r.reste }); }
    return [...m.entries()];
  }, [restes]);
  const comptesTreso = useMemo(() => plan.filter(c => /^5[2-7]\d{2,}/.test(c.numero)).sort((a, b) => a.numero.localeCompare(b.numero)), [plan]);

  if (!parNature.length && !paiements.length) return null;

  const ouvrir = (nature: string, reste: number) => {
    const auj = new Date().toISOString().slice(0, 10);
    setForm({ nature, montant: reste, date: exercice && auj > exercice.date_fin ? exercice.date_fin : auj,
      compte: comptesTreso.find(c => c.numero.startsWith('52'))?.numero ?? '521', mode: nature === 'salaires' ? 'Virement' : 'Virement', reference: '' });
  };
  const payer = async () => {
    if (!form || !exercice) return;
    if (!estCompteTresorerie(form.compte)) { toast.error('Compte de trésorerie attendu (52 banque, 55 monnaie électronique, 57 caisse)'); return; }
    if (!Number.isInteger(form.montant) || form.montant <= 0) { toast.error('Montant en FCFA entiers'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_payer_paie' as any, { _exercice_id: exercice.id, _periode: periode, _nature: form.nature, _date: form.date,
      _compte_tresorerie: form.compte, _montant: form.montant, _mode: form.mode, _reference: form.reference });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { numero: string; journal: string; montant: number; lettres: number };
    toast.success(`${r.numero} : ${fmt(r.montant)} au journal ${r.journal}${r.lettres ? ' — dette soldée et lettrée' : ''}`);
    setForm(null); await Promise.all([charger(), rafraichirComptabilite()]);
  };
  const annuler = async () => {
    if (!annul) return;
    if (annul.motif.trim().length < 5) { toast.error('Motif obligatoire (5 caractères au moins)'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('fn_annuler_paiement_paie' as any, { _paiement_id: annul.p.id, _motif: annul.motif.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Paiement ${annul.p.numero} annulé (contre-passation passée)`);
    setAnnul(null); await Promise.all([charger(), rafraichirComptabilite()]);
  };
  const champ = 'bg-bg3 border border-border rounded px-2 py-1 text-fg';

  return (
    <div className="bg-bg2 border border-border rounded-lg p-4 space-y-3 text-[11px]">
      <div className="font-bold text-sm">💸 Paiement des salaires et cotisations — {libellePeriode}</div>
      <table className="w-full">
        <thead className="text-fg3 text-[10px] uppercase"><tr><th className="text-left p-1">Dette</th><th className="text-right p-1">Dû</th><th className="text-right p-1">Payé</th><th className="text-right p-1">Reste</th><th /></tr></thead>
        <tbody>{parNature.map(([n, v]) => (
          <tr key={n} className="border-t border-border">
            <td className="p-1">{NATURES[n] ?? n}</td><td className="p-1 text-right font-mono">{fmt(v.du)}</td><td className="p-1 text-right font-mono">{fmt(v.paye)}</td>
            <td className={`p-1 text-right font-mono font-bold ${v.reste > 0 ? 'text-warning' : 'text-success'}`}>{v.reste > 0 ? fmt(v.reste) : 'soldé'}</td>
            <td className="p-1 text-right">{canWrite && v.reste > 0 && <button onClick={() => ouvrir(n, v.reste)} className="text-primary hover:underline">Payer</button>}</td>
          </tr>))}</tbody>
      </table>
      {paiements.length > 0 && (
        <div>
          <div className="text-fg3 text-[10px] uppercase mb-1">Paiements enregistrés</div>
          {paiements.map(p => (
            <div key={p.id} className={`flex flex-wrap gap-3 py-1 border-t border-border ${p.annule_le ? 'opacity-50 line-through' : ''}`}>
              <span className="font-mono">{p.numero}</span><span>{p.date_paiement}</span><span>{NATURES[p.nature] ?? p.nature}</span>
              <span className="font-mono">{p.journal_code} {p.compte_tresorerie}</span><span>{p.mode ?? ''}{p.reference ? ` · ${p.reference}` : ''}</span>
              <span className="font-mono ml-auto">{fmt(p.montant)}</span>
              {p.annule_le ? <span className="text-destructive no-underline">Annulé : {p.motif_annulation}</span>
                : canWrite && <button onClick={() => setAnnul({ p, motif: '' })} className="text-destructive hover:underline">Annuler</button>}
            </div>))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !busy && setForm(null)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-3">Payer : {NATURES[form.nature]} — {libellePeriode}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-fg3 text-[10px] uppercase">Montant (FCFA)<input type="number" min="1" step="1" value={form.montant} onChange={e => setForm({ ...form, montant: Number(e.target.value) || 0 })} className={`block w-full text-right font-mono ${champ}`} /></label>
              <label className="text-fg3 text-[10px] uppercase">Date<input type="date" value={form.date} min={exercice?.date_debut} max={exercice?.date_fin} onChange={e => setForm({ ...form, date: e.target.value })} className={`block w-full ${champ}`} /></label>
              <label className="text-fg3 text-[10px] uppercase">Compte de trésorerie (journal {journalTresorerie(form.compte)})
                <input list="comptes-treso-paie" value={form.compte} onChange={e => setForm({ ...form, compte: e.target.value.trim() })} className={`block w-full font-mono ${champ}`} />
                <datalist id="comptes-treso-paie">{comptesTreso.map(c => <option key={c.numero} value={c.numero}>{c.intitule}</option>)}</datalist></label>
              <label className="text-fg3 text-[10px] uppercase">Mode
                <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} className={`block w-full normal-case ${champ}`}>
                  {['Virement', 'Chèque', 'Espèces', 'Mobile money'].map(m => <option key={m}>{m}</option>)}</select></label>
              <label className="col-span-2 text-fg3 text-[10px] uppercase">Référence (ordre de virement, quittance…)<input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className={`block w-full normal-case ${champ}`} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setForm(null)} className="px-3 py-1.5 bg-bg3 rounded">Fermer</button>
              <button onClick={() => void payer()} disabled={busy} className="px-3 py-1.5 bg-primary text-primary-foreground rounded font-bold disabled:opacity-50">{busy ? 'Comptabilisation…' : 'Comptabiliser le paiement'}</button>
            </div>
          </div>
        </div>
      )}
      {annul && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !busy && setAnnul(null)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-2">Annuler le paiement {annul.p.numero}</div>
            <input autoFocus value={annul.motif} onChange={e => setAnnul({ ...annul, motif: e.target.value })} placeholder="Motif (virement rejeté, erreur de montant…)" className={`w-full ${champ}`} />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setAnnul(null)} className="px-3 py-1.5 bg-bg3 rounded">Fermer</button>
              <button onClick={() => void annuler()} disabled={busy} className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded font-bold disabled:opacity-50">Confirmer l’annulation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
