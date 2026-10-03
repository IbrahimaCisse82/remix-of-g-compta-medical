import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';

interface Facture {
  id: string;
  numero: string;
  date_facture: string;
  total_ttc: number;
  statut: string;
  uuid_dgid: string | null;
  qr_code: string | null;
  hash_certif: string | null;
  statut_dgid: string;
  date_transmission: string | null;
  dgid_error: string | null;
  dgid_mode: string;
}

interface DgidConfig {
  id?: string;
  entreprise_id?: string;
  mode: string;
  ninea_transmetteur: string | null;
  certificat: string | null;
  endpoint: string | null;
  actif: boolean;
}

const STATUT_LABEL: Record<string, { label: string; color: string }> = {
  non_transmise: { label: 'Non transmise', color: 'text-fg3' },
  transmise: { label: 'Transmise', color: 'text-primary' },
  acceptee: { label: '✓ Acceptée', color: 'text-accent' },
  simulee: { label: '⚠ Simulée (non transmise)', color: 'text-fg3' },
  rejetee: { label: '✕ Rejetée', color: 'text-destructive' },
};

interface DgidTx {
  id: string; facture_id: string; action: string; statut: string;
  payload: any; response: any; created_at: string;
}

export default function FacturesDgidPage() {
  const { entreprise } = useApp();
  const [factures, setFactures] = useState<Facture[]>([]);
  const [cfg, setCfg] = useState<DgidConfig>({ mode: 'test', ninea_transmetteur: '', certificat: '', endpoint: '', actif: false });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [historyFor, setHistoryFor] = useState<Facture | null>(null);
  const [historyRows, setHistoryRows] = useState<DgidTx[]>([]);

  const load = useCallback(async () => {
    if (!entreprise) return;
    setLoading(true);
    const [{ data: facs }, { data: c }] = await Promise.all([
      supabase.from('factures').select('id,numero,date_facture,total_ttc,statut,uuid_dgid,qr_code,hash_certif,statut_dgid,date_transmission,dgid_error,dgid_mode')
        .eq('entreprise_id', entreprise.id).order('date_facture', { ascending: false }),
      supabase.from('dgid_config').select('*').eq('entreprise_id', entreprise.id).maybeSingle(),
    ]);
    setFactures((facs as Facture[]) || []);
    if (c) setCfg(c as DgidConfig);
    setLoading(false);
  }, [entreprise]);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async () => {
    if (!entreprise) return;
    const payload = { ...cfg, entreprise_id: entreprise.id };
    const { error } = await supabase.from('dgid_config').upsert(payload, { onConflict: 'entreprise_id' });
    if (error) return toast.error(error.message);
    toast.success('Configuration DGID enregistrée');
    setShowConfig(false);
    load();
  };

  const emit = async (id: string) => {
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke('emit-facture-dgid', { body: { facture_id: id } });
      if (error) throw error;
      toast.success(`Facture transmise DGID (${data.statut})`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Erreur transmission');
    } finally {
      setBusy(null);
    }
  };

  const openHistory = async (f: Facture) => {
    setHistoryFor(f);
    const { data } = await supabase.from('dgid_transmissions').select('*')
      .eq('facture_id', f.id).order('created_at', { ascending: false });
    setHistoryRows((data as DgidTx[]) || []);
  };

  const stats = {
    total: factures.length,
    non_transmise: factures.filter(f => f.statut_dgid === 'non_transmise').length,
    acceptee: factures.filter(f => f.statut_dgid === 'acceptee').length,
    rejetee: factures.filter(f => f.statut_dgid === 'rejetee').length,
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">📄 Factures DGID (e-Facturation)</div>
        <button onClick={() => setShowConfig(true)} className="text-xs px-3 py-1 border border-border rounded hover:bg-bg3">
          ⚙️ Configuration
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase font-mono">Total</div>
            <div className="text-xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase font-mono">Non transmises</div>
            <div className="text-xl font-bold text-fg3">{stats.non_transmise}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase font-mono">Acceptées</div>
            <div className="text-xl font-bold text-accent">{stats.acceptee}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase font-mono">Rejetées</div>
            <div className="text-xl font-bold text-destructive">{stats.rejetee}</div>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-fg2">
          <b className="text-primary">ℹ️ Mode {cfg.mode.toUpperCase()}</b> — La conformité e-facturation DGID Sénégal est préparée.
          En mode <b>test</b>, les transmissions génèrent un UUID/QR/hash et sont acceptées d'office.
          En mode <b>prod</b>, l'endpoint DGID configuré est appelé. Archivage légal 10 ans conservé dans la GED.
        </div>

        {loading ? (
          <div className="text-center py-10 text-fg3">Chargement...</div>
        ) : (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-[10px] uppercase font-mono text-fg3">
                <tr>
                  <th className="text-left px-3 py-2">N° Facture</th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-right px-3 py-2">TTC</th>
                  <th className="text-left px-3 py-2">Statut DGID</th>
                  <th className="text-left px-3 py-2">UUID DGID</th>
                  <th className="text-left px-3 py-2">Transmission</th>
                  <th className="text-right px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {factures.map(f => {
                  const s = STATUT_LABEL[f.statut_dgid] || STATUT_LABEL.non_transmise;
                  return (
                    <tr key={f.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{f.numero}</td>
                      <td className="px-3 py-2">{f.date_facture}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(f.total_ttc)}</td>
                      <td className={`px-3 py-2 font-semibold ${s.color}`}>{s.label}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-fg3">{f.uuid_dgid ? f.uuid_dgid.slice(0, 8) + '…' : '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-fg3">{f.date_transmission ? new Date(f.date_transmission).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => openHistory(f)} className="text-[10px] mr-2 text-fg2 hover:text-primary underline">
                          Historique
                        </button>
                        {f.statut_dgid === 'acceptee' ? (
                          <span className="text-[10px] text-accent">✓ conforme</span>
                        ) : (
                          <button disabled={busy === f.id} onClick={() => emit(f.id)}
                            className="text-[10px] px-2 py-1 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-40">
                            {busy === f.id ? '...' : (f.statut_dgid === 'rejetee' ? 'Renvoyer' : 'Transmettre')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {factures.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-fg3">Aucune facture</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowConfig(false)}>
          <div className="bg-bg2 border border-border rounded-xl p-5 w-[480px] max-w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-base mb-4">⚙️ Configuration DGID</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-fg3 block mb-1">Mode</label>
                <select value={cfg.mode} onChange={e => setCfg({ ...cfg, mode: e.target.value })}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5">
                  <option value="test">Test (simulation)</option>
                  <option value="prod">Production</option>
                </select>
              </div>
              <div>
                <label className="text-fg3 block mb-1">NINEA transmetteur</label>
                <input value={cfg.ninea_transmetteur || ''} onChange={e => setCfg({ ...cfg, ninea_transmetteur: e.target.value })}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-fg3 block mb-1">Endpoint DGID (prod)</label>
                <input value={cfg.endpoint || ''} placeholder="https://api.dgid.sn/..." onChange={e => setCfg({ ...cfg, endpoint: e.target.value })}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="text-fg3 block mb-1">Certificat / clé (référence)</label>
                <textarea value={cfg.certificat || ''} onChange={e => setCfg({ ...cfg, certificat: e.target.value })}
                  rows={3} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono text-[10px]" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.actif} onChange={e => setCfg({ ...cfg, actif: e.target.checked })} />
                <span>Activer la transmission automatique à la validation des factures</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowConfig(false)} className="text-xs px-3 py-1.5 border border-border rounded">Annuler</button>
              <button onClick={saveConfig} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setHistoryFor(null)}>
          <div className="bg-bg2 border border-border rounded-xl p-5 w-[720px] max-w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-base">📜 Historique DGID — {historyFor.numero}</h3>
              <button onClick={() => setHistoryFor(null)} className="text-fg3 hover:text-foreground">✕</button>
            </div>
            {historyRows.length === 0 ? (
              <div className="text-center py-8 text-fg3 text-xs">Aucune transmission enregistrée</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-bg3 text-[10px] uppercase font-mono text-fg3">
                  <tr>
                    <th className="text-left px-2 py-1.5">Date</th>
                    <th className="text-left px-2 py-1.5">Action</th>
                    <th className="text-left px-2 py-1.5">Statut</th>
                    <th className="text-left px-2 py-1.5">Réponse</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map(h => (
                    <tr key={h.id} className="border-t border-border align-top">
                      <td className="px-2 py-1.5 font-mono text-[10px]">{new Date(h.created_at).toLocaleString()}</td>
                      <td className="px-2 py-1.5">{h.action}</td>
                      <td className={`px-2 py-1.5 font-semibold ${h.statut === 'acceptee' ? 'text-accent' : h.statut === 'rejetee' ? 'text-destructive' : 'text-primary'}`}>{h.statut}</td>
                      <td className="px-2 py-1.5 font-mono text-[9px] text-fg3 max-w-[300px] truncate" title={JSON.stringify(h.response)}>
                        {JSON.stringify(h.response)?.slice(0, 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
