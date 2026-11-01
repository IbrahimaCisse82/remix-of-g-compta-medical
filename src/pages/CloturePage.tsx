import ControleComptable from '@/components/ControleComptable';
import { controlesSyscohada } from '@/lib/conformite-syscohada';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClotureLog { id: string; action: string; details: any; created_at: string; user_id: string | null; }

export default function CloturePage() {
  const { exercice, exercices, entreprise, balance, balanceN1, clotureExercice, loading, openExercice } = useApp();
  const [logs, setLogs] = useState<ClotureLog[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!entreprise) return;
    const { data } = await supabase.from('cloture_logs').select('*')
      .eq('entreprise_id', entreprise.id).order('created_at', { ascending: false });
    if (data) setLogs(data as any[]);
  }, [entreprise]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleCloture = async () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    await clotureExercice();
    await loadLogs();
  };

  const handleReopen = async (excId: string) => {
    if (confirmReopen !== excId) { setConfirmReopen(excId); return; }
    setConfirmReopen(null);
    const motif = window.prompt('Motif de réouverture (obligatoire, 5 caractères minimum) :') || '';
    if (motif.trim().length < 5) { toast.error('Motif obligatoire'); return; }
    const { error } = await supabase.rpc('fn_rouvrir_exercice', { _exercice_id: excId, _motif: motif.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success('Exercice réouvert');
    await openExercice(excId);
    await loadLogs();
  };

  const canCloture = exercice?.statut === 'en_cours';
  const blocked = controlesSyscohada(balance, balanceN1).some(c => c.bloquant && !c.ok);
  const resultatNet = balance.filter(b => /^[6-8]/.test(b.compte)).reduce((s, b) => s + ((b.sfc || 0) - (b.sfd || 0)), 0);
  const bilanCount = balance.filter(b => /^[1-5]/.test(b.compte)).length;

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">🔒 Clôture & Réouverture d'Exercice</div>
        <div className="text-[10px] text-fg3 font-mono">Gestion complète du cycle de vie des exercices</div></div>
      </div>
      <div className="p-5">
        {/* Current exercice info */}
        <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
          <div className="font-bold text-sm mb-3 text-primary">📅 Exercice courant : {exercice?.annee}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-[10px] text-fg3 uppercase font-mono">Statut</div>
              <div className={`text-sm font-bold ${exercice?.statut === 'en_cours' ? 'text-accent' : 'text-success'}`}>
                {exercice?.statut === 'en_cours' ? '🟡 En cours' : '🟢 Clôturé'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-fg3 uppercase font-mono">Comptes de bilan</div>
              <div className="text-sm font-bold font-mono">{bilanCount}</div>
            </div>
            <div>
              <div className="text-[10px] text-fg3 uppercase font-mono">Résultat net</div>
              <div className={`text-sm font-bold font-mono ${resultatNet >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(resultatNet)}</div>
            </div>
            <div>
              <div className="text-[10px] text-fg3 uppercase font-mono">Période</div>
              <div className="text-sm font-mono">{exercice?.date_debut} → {exercice?.date_fin}</div>
            </div>
          </div>

          <ControleComptable balance={balance} previous={balanceN1} />
          {canCloture && (
            <div className="flex items-center gap-2">
              {confirming && <span className="text-[10px] text-destructive font-bold animate-pulse">⚠ Cette action est irréversible. Confirmer ?</span>}
              <button onClick={handleCloture} disabled={loading || blocked}
                className={`px-4 py-2 rounded text-[11px] font-bold ${confirming ? 'bg-destructive text-destructive-foreground' : 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25'}`}>
                {loading ? '⏳ Clôture en cours...' : confirming ? '⚠ Oui, clôturer définitivement' : `🔒 Clôturer l'exercice ${exercice?.annee}`}
              </button>
              {confirming && <button onClick={() => setConfirming(false)} className="px-3 py-1 rounded text-[10px] border border-border text-fg2">Annuler</button>}
            </div>
          )}
        </div>

        {/* All exercices */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">Tous les exercices</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Année', 'Début', 'Fin', 'Statut', 'Actions'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {exercices.sort((a, b) => b.annee - a.annee).map(e => (
                <tr key={e.id} className={`hover:bg-[rgba(56,189,248,.02)] ${exercice?.id === e.id ? 'bg-primary/5' : ''}`}>
                  <td className="px-3 py-1.5 text-[11px] font-mono font-bold text-accent border-b border-border/50">{e.annee}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_debut}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_fin}</td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${e.statut === 'en_cours' ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success'}`}>
                      {e.statut === 'en_cours' ? '🟡 En cours' : '🟢 Clôturé'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/50 flex gap-1">
                    <button onClick={() => openExercice(e.id)} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                      {exercice?.id === e.id ? '✓ Actif' : 'Ouvrir'}
                    </button>
                    {e.statut === 'cloture' && (
                      <>
                        {confirmReopen === e.id && <span className="text-[9px] text-destructive animate-pulse">Confirmer ?</span>}
                        <button onClick={() => handleReopen(e.id)} className={`text-[10px] px-2 py-0.5 rounded ${confirmReopen === e.id ? 'bg-destructive/10 text-destructive font-bold' : 'bg-accent/10 text-accent'}`}>
                          {confirmReopen === e.id ? '⚠ Oui' : '🔓 Réouvrir'}
                        </button>
                        {confirmReopen === e.id && <button onClick={() => setConfirmReopen(null)} className="text-[9px] text-fg3">Non</button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Logs */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">📜 Historique des opérations</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Date', 'Action', 'Détails'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{new Date(l.created_at).toLocaleString('fr-FR')}</td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${l.action === 'cloture' ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
                      {l.action === 'cloture' ? '🔒 Clôture' : '🔓 Réouverture'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-fg3 font-mono border-b border-border/50">{JSON.stringify(l.details)}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-fg3 text-[11px]">Aucun historique</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
