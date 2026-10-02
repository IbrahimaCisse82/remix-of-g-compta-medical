import { useApp } from '@/stores/app-store';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  fetchPlans,
  fetchSubscription,
  computeUsage,
  mapPlan,
  mapAbonnement,
  LIMIT_LABELS,
  LIMIT_UNITS,
  statusLabel,
  statusClasses,
  daysRemaining,
  formatDate,
  isLimitExceeded,
  type Plan,
  type Abonnement,
  type Usage,
} from '@/lib/subscription';
import { fmt } from '@/lib/accounting';

export default function MonAbonnementPage() {
  const { entreprise, env } = useApp();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [abonnement, setAbonnement] = useState<Abonnement | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [history, setHistory] = useState<Abonnement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    if (!entreprise) return;
    setLoading(true);
    try {
      const [plansData, subData] = await Promise.all([
        fetchPlans(),
        fetchSubscription(entreprise.id),
      ]);
      setPlans(plansData);
      setAbonnement(subData.abonnement);
      setPlan(subData.plan);
      setSelectedPlanId(subData.plan?.id || null);

      if (subData.plan) {
        const usageData = await computeUsage(entreprise.id, subData.plan.limites);
        setUsage(usageData);
      }

      const { data: hist } = await supabase
        .from('abonnements')
        .select('*, plan:plans_abonnement(*)')
        .eq('entreprise_id', entreprise.id)
        .order('created_at', { ascending: false });
      setHistory((hist || []).map((h: any) => mapAbonnement(h)));
    } catch (err: any) {
      toast.error('Erreur chargement abonnement : ' + err.message);
    }
    setLoading(false);
  }, [entreprise]);

  useEffect(() => { load(); }, [load]);

  const handleRequestChange = async () => {
    if (!entreprise || !selectedPlanId || !plan) return;
    setRequesting(true);
    try {
      const newPlan = plans.find(p => p.id === selectedPlanId);
      if (!newPlan) return;

      // Mise à jour manuelle sans paiement pour l'instant
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from('abonnements').insert({
        entreprise_id: entreprise.id,
        plan_id: newPlan.id,
        statut: 'essai',
        date_debut: today,
        essai_fin: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
      if (error) throw error;

      // Notification au cabinet
      await supabase.from('notifications').insert({
        entreprise_id: entreprise.id,
        type: 'info',
        titre: 'Changement de plan demandé',
        message: `L'entreprise ${entreprise.nom} a demandé le plan ${newPlan.nom}.`,
      });

      toast.success(`Plan ${newPlan.nom} activé en essai 14 jours.`);
      setShowChangeModal(false);
      await load();
    } catch (err: any) {
      toast.error('Erreur : ' + err.message);
    }
    setRequesting(false);
  };

  if (!entreprise) {
    return (
      <div className="p-5 text-fg3 text-sm">
        Veuillez sélectionner une entreprise.
      </div>
    );
  }

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">💳 Mon Abonnement</div>
          <div className="text-[10px] text-fg3 font-mono">Plan actuel et limites de l'entreprise</div>
        </div>
        <div className="flex items-center gap-2">
          {env === 'cabinet' && (
            <span className="text-[10px] text-fg3 font-mono px-2 py-1 bg-bg3 border border-border rounded">
              Géré par le cabinet
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-center text-fg3 py-10 text-sm">Chargement...</div>
        ) : (
          <>
            {/* Plan actuel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="md:col-span-2 bg-bg2 border border-border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] text-fg3 uppercase font-mono mb-1">Plan actuel</div>
                    <div className="font-serif text-2xl text-foreground">{plan?.nom || 'Aucun plan'}</div>
                    {plan?.description && <div className="text-xs text-fg2 mt-1">{plan.description}</div>}
                  </div>
                  {abonnement && (
                    <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusClasses(abonnement.statut)}`}>
                      {statusLabel(abonnement.statut)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="bg-bg3 rounded p-2.5 border border-border">
                    <div className="text-[9px] text-fg3 uppercase font-mono">Prix</div>
                    <div className="font-bold text-foreground">{plan ? `${fmt(plan.prix_fcfa)} F/${plan.periodicite}` : '—'}</div>
                  </div>
                  <div className="bg-bg3 rounded p-2.5 border border-border">
                    <div className="text-[9px] text-fg3 uppercase font-mono">Début</div>
                    <div className="font-bold text-foreground">{formatDate(abonnement?.date_debut)}</div>
                  </div>
                  <div className="bg-bg3 rounded p-2.5 border border-border">
                    <div className="text-[9px] text-fg3 uppercase font-mono">Fin</div>
                    <div className="font-bold text-foreground">{formatDate(abonnement?.date_fin || abonnement?.essai_fin)}</div>
                  </div>
                  <div className="bg-bg3 rounded p-2.5 border border-border">
                    <div className="text-[9px] text-fg3 uppercase font-mono">Jours restants</div>
                    <div className={`font-bold ${(daysRemaining(abonnement?.date_fin || abonnement?.essai_fin) ?? 0) <= 7 ? 'text-destructive' : 'text-foreground'}`}>
                      {daysRemaining(abonnement?.date_fin || abonnement?.essai_fin) ?? '—'}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => setShowChangeModal(true)}
                    className="px-3 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Changer de plan
                  </button>
                </div>
              </div>

              {/* Résumé limites */}
              <div className="bg-bg2 border border-border rounded-lg p-4">
                <div className="text-[10px] text-fg3 uppercase font-mono mb-3">Limites</div>
                {usage && isLimitExceeded(usage) && (
                  <div className="mb-3 text-[10px] font-bold text-destructive bg-destructive/10 rounded px-2 py-1.5">
                    ⚠️ Une limite est atteinte
                  </div>
                )}
                <div className="space-y-3">
                  {usage && Object.entries(usage).map(([key, u]) => {
                    const label = LIMIT_LABELS[key] || key;
                    const unit = LIMIT_UNITS[key] || '';
                    const pct = u.limit === -1 ? 0 : Math.min(100, (u.used / u.limit) * 100);
                    return (
                      <div key={key}>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-fg2">{label}</span>
                          <span className="font-mono">
                            {u.limit === -1 ? `${u.used.toFixed(2)} ${unit} / ∞` : `${u.used.toFixed(2)} / ${u.limit} ${unit}`}
                          </span>
                        </div>
                        <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${u.limit !== -1 && u.used >= u.limit ? 'bg-destructive' : 'bg-primary'}`}
                            style={{ width: `${u.limit === -1 ? 100 : pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Features */}
            {plan && (
              <div className="bg-bg2 border border-border rounded-lg p-4 mb-6">
                <div className="text-[10px] text-fg3 uppercase font-mono mb-3">Fonctionnalités incluses</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {plan.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-fg2">
                      <span className="text-accent">✓</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historique */}
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-semibold">Historique des abonnements</span>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Date', 'Plan', 'Statut', 'Début', 'Fin essai', 'Fin'].map(h => (
                      <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="hover:bg-[rgba(56,189,248,.02)]">
                      <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{formatDate(h.created_at)}</td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{plans.find(p => p.id === h.plan_id)?.nom || h.plan_id}</td>
                      <td className="px-3 py-1.5 border-b border-border/50">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${statusClasses(h.statut)}`}>
                          {statusLabel(h.statut)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{formatDate(h.date_debut)}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{formatDate(h.essai_fin)}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{formatDate(h.date_fin)}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-fg3 text-[11px]">
                        Aucun historique d'abonnement.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal changement de plan */}
      {showChangeModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={() => setShowChangeModal(false)}>
          <div className="bg-bg2 border border-border rounded-xl p-5 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-foreground">Changer de plan</h3>
              <button onClick={() => setShowChangeModal(false)} className="text-fg3 hover:text-foreground">✕</button>
            </div>
            <p className="text-xs text-fg2 mb-4">
              Le paiement en ligne n'est pas encore activé. La modification déclenche un essai de 14 jours et notifie le cabinet.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {plans.filter(p => !p.code?.startsWith('option_')).map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`text-left border rounded-lg p-4 transition-all ${
                    selectedPlanId === p.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-bg3 hover:border-primary/50'
                  }`}
                >
                  <div className="font-bold text-sm">{p.nom}</div>
                  <div className="text-xs text-fg3 mb-2">{p.description}</div>
                  <div className="font-serif text-xl text-primary">{fmt(p.prix_fcfa)}<span className="text-xs text-fg3"> F/{p.periodicite}</span></div>
                  <ul className="mt-2 space-y-1 text-[10px] text-fg2">
                    {p.limites.dossiers !== undefined && (
                      <li>• Dossiers : {p.limites.dossiers === -1 ? '∞' : p.limites.dossiers}</li>
                    )}
                    {p.limites.utilisateurs !== undefined && (
                      <li>• Utilisateurs : {p.limites.utilisateurs === -1 ? '∞' : p.limites.utilisateurs}</li>
                    )}
                    {p.limites.stockage_go !== undefined && (
                      <li>• Stockage : {p.limites.stockage_go === -1 ? '∞' : p.limites.stockage_go + ' Go'}</li>
                    )}
                  </ul>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowChangeModal(false)}
                className="px-3 py-1.5 rounded text-[11px] font-bold border border-border text-fg2 hover:bg-bg3"
              >
                Annuler
              </button>
              <button
                onClick={handleRequestChange}
                disabled={!selectedPlanId || selectedPlanId === plan?.id || requesting}
                className="px-3 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40"
              >
                {requesting ? 'Traitement...' : 'Activer l\'essai'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
