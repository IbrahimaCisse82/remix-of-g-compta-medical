import { comptesManquants } from '@/lib/plan-reference';
import { accountReference, REFERENCE_VERSION } from '@/lib/syscohada-reference';
import { toast } from 'sonner';
import { useApp } from '@/stores/app-store';
import { useState, useMemo, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { exportCsv } from '@/lib/csv-export';

const CLS_COL: Record<string, string> = { '1': '#a78bfa', '2': '#38bdf8', '3': '#34d399', '4': '#fb923c', '5': '#f59e0b', '6': '#fb7185', '7': '#6ee7b7', '8': '#c084fc' };
const CLS_LBL: Record<string, string> = { '1': 'Ressources Stables', '2': 'Actif Immobilisé', '3': 'Stocks', '4': 'Tiers', '5': 'Trésorerie', '6': 'Charges', '7': 'Produits', '8': 'HAO / Impôts', '9': 'Hors bilan / Analytique' };

const SENS_AUTO: Record<string, string> = { '1': 'C', '2': 'D', '3': 'D', '4': 'D/C', '5': 'D', '6': 'D', '7': 'C', '8': 'D/C' };
const TYPE_AUTO: Record<string, string> = { '1': 'Bilan', '2': 'Bilan', '3': 'Bilan', '4': 'Bilan', '5': 'Bilan', '6': 'Résultat', '7': 'Résultat', '8': 'HAO' };

export default function PlanComptablePage() {
  const { plan, toggleCompte, addCompte, deleteCompte, demo, installerPlanReference } = useApp();
  const manquants = useMemo(() => comptesManquants(plan.map(p => p.numero)).length, [plan]);
  const [installation, setInstallation] = useState(false);
  const installer = async () => {
    setInstallation(true);
    try { const n = await installerPlanReference(); toast.success(`${n.toLocaleString('fr-FR')} compte(s) du référentiel ajouté(s).`); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Installation impossible.'); }
    finally { setInstallation(false); }
  };
  const [filter, setFilter] = useState('');
  const [showInactif, setShowInactif] = useState(false);
  const [classeFilter, setClasseFilter] = useState<string>('');
  const [limite, setLimite] = useState(200);
  useEffect(() => { setLimite(200); }, [filter, classeFilter]);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [newNumero, setNewNumero] = useState('');
  const [newIntitule, setNewIntitule] = useState('');

  const rows = useMemo(() => {
    let r = plan;
    if (classeFilter) r = r.filter(x => x.classe === classeFilter);
    if (filter) r = r.filter(x => x.numero.includes(filter) || x.intitule.toLowerCase().includes(filter.toLowerCase()));
    if (!showInactif) r = r.filter(x => x.actif !== false);
    return [...r].sort((a, b) => a.numero.localeCompare(b.numero));
  }, [plan, filter, classeFilter, showInactif]);

  const classCounts = useMemo(() => {
    const counts: Record<string, { total: number; actif: number }> = {};
    for (const p of plan) {
      if (!counts[p.classe]) counts[p.classe] = { total: 0, actif: 0 };
      counts[p.classe].total++;
      if (p.actif) counts[p.classe].actif++;
    }
    return counts;
  }, [plan]);

  const handleToggle = async (id: string) => {
    setToggling(prev => new Set(prev).add(id));
    await toggleCompte(id);
    setToggling(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const handleAdd = async () => {
    if (!newNumero || !newIntitule) return;
    if (!accountReference(newNumero.trim())) { toast.error('Compte inconnu ou supprimé du référentiel SYSCOHADA révisé'); return; }
    const classe = newNumero[0];
    await addCompte({
      id: '', entreprise_id: '',
      numero: newNumero,
      intitule: newIntitule,
      classe,
      sens: SENS_AUTO[classe] || 'D',
      type_compte: TYPE_AUTO[classe] || 'Bilan',
      actif: true,
    });
    setNewNumero('');
    setNewIntitule('');
  };

  const handleExport = () => {
    exportCsv(
      ['N° Compte', 'Intitulé', 'Classe', 'Sens', 'Type', 'Actif'],
      rows.map(r => [r.numero, r.intitule, r.classe, r.sens, r.type_compte, r.actif ? 'Oui' : 'Non']),
      'plan_comptable',
    );
  };

  const totalActif = plan.filter(p => p.actif).length;

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">Plan Comptable SYSCOHADA Révisé</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-accent bg-accent/10 border border-accent/20 rounded-full px-2.5 py-0.5">{totalActif} / {plan.length} comptes actifs</span>
          <button onClick={handleExport} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">📥 CSV</button>
          {!demo && (
            <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-md text-[11px] font-bold bg-primary text-primary-foreground hover:opacity-90">
              {showForm ? '✕' : '+ Compte'}
            </button>
          )}
        </div>
      </div>
      <div className="p-5">
        <p className="text-xs text-muted-foreground mb-3">Référentiel {REFERENCE_VERSION} — 1 422 comptes, classes 1 à 9 ; mappings en attente de visa.</p>
        {!demo && manquants > 0 && (
          <div className="border border-border bg-bg2 rounded-lg p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-fg2 max-w-2xl">{plan.length === 0
              ? 'Ce dossier n’a pas encore de plan comptable : la saisie manuelle et le rapprochement bancaire en ont besoin. Installez le plan SYSCOHADA révisé (classes 1 à 8).'
              : `${manquants.toLocaleString('fr-FR')} compte(s) du référentiel SYSCOHADA ne figurent pas dans ce plan. Les ajouter ne modifie ni ne supprime aucun compte existant.`}</p>
            <button disabled={installation} onClick={() => void installer()} className="px-3 py-1.5 rounded-md text-[11px] font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {installation ? 'Installation…' : plan.length === 0 ? 'Installer le plan SYSCOHADA' : `Ajouter les ${manquants.toLocaleString('fr-FR')} comptes`}
            </button>
          </div>
        )}
        {/* Add form */}
        {showForm && (
          <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
            <div className="font-bold text-sm mb-3 text-primary">➕ Nouveau Compte</div>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">N° Compte</label>
                <input value={newNumero} onChange={e => setNewNumero(e.target.value)} placeholder="601100"
                  className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-primary font-mono outline-none focus:border-primary w-28" />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">Intitulé</label>
                <input value={newIntitule} onChange={e => setNewIntitule(e.target.value)} placeholder="Achats de marchandises"
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary" />
              </div>
              {newNumero && (
                <div className="text-[10px] text-fg3 font-mono">
                  Cl.{newNumero[0]} · {SENS_AUTO[newNumero[0]] || '?'} · {TYPE_AUTO[newNumero[0]] || '?'}
                </div>
              )}
              <button onClick={handleAdd} disabled={!newNumero || !newIntitule}
                className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90">
                ✓ Ajouter
              </button>
            </div>
          </div>
        )}

        {/* Class filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setClasseFilter('')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${!classeFilter ? 'bg-primary/15 border-primary text-primary' : 'bg-bg2 border-border text-fg2 hover:border-primary/50'}`}>
            Toutes ({plan.length})
          </button>
          {Object.entries(CLS_LBL).map(([c, label]) => {
            const cc = classCounts[c];
            if (!cc) return null;
            return (
              <button key={c} onClick={() => setClasseFilter(classeFilter === c ? '' : c)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${classeFilter === c ? 'border-primary' : 'bg-bg2 border-border hover:border-primary/50'}`}
                style={{ color: CLS_COL[c] }}>
                <span className="font-mono mr-1">Cl.{c}</span> {label}
                <span className="ml-1.5 text-fg3 text-[9px]">({cc.actif}/{cc.total})</span>
              </button>
            );
          })}
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{rows.length} compte(s) affiché(s)</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-fg2 cursor-pointer">
                <input type="checkbox" checked={showInactif} onChange={e => setShowInactif(e.target.checked)} className="rounded" /> Afficher inactifs
              </label>
              <input className="bg-bg3 border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary w-48" placeholder="Rechercher n° ou intitulé..." value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10"><tr>
                {['N° Compte', 'Intitulé', 'Classe', 'Sens', 'Type', 'Actif', ...(demo ? [] : [''])].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.slice(0, limite).map(r => {
                  const isParent = r.numero.length <= 3;
                  return (
                    <tr key={r.id} className={`hover:bg-[rgba(56,189,248,.02)] transition-opacity ${r.actif === false ? 'opacity-35' : ''} ${isParent ? 'bg-bg3/30' : ''}`}>
                      <td className="px-3 py-1.5 text-[11px] font-bold font-mono border-b border-border/50" style={{ color: CLS_COL[r.classe] || 'inherit', paddingLeft: isParent ? '0.75rem' : `${0.75 + (r.numero.length - 3) * 0.5}rem` }}>
                        {r.numero}
                      </td>
                      <td className={`px-3 py-1.5 text-[11px] border-b border-border/50 ${isParent ? 'font-semibold' : ''}`}>{r.intitule}</td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold font-mono" style={{ background: (CLS_COL[r.classe] || '#888') + '22', color: CLS_COL[r.classe] }}>Cl.{r.classe}</span>
                      </td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">
                        <span className={`rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono ${r.sens === 'D' ? 'bg-[rgba(56,189,248,.12)] text-primary' : r.sens === 'C' ? 'bg-[rgba(52,211,153,.12)] text-success' : 'bg-[rgba(251,191,36,.12)] text-accent'}`}>{r.sens}</span>
                      </td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50 text-fg3">{r.type_compte}</td>
                      <td className="px-3 py-1.5 border-b border-border/50">
                        <Switch
                          checked={r.actif}
                          onCheckedChange={() => handleToggle(r.id)}
                          disabled={toggling.has(r.id)}
                          className="scale-75"
                        />
                      </td>
                      {!demo && (
                        <td className="px-3 py-1.5 border-b border-border/50">
                          <button onClick={() => deleteCompte(r.id)} className="text-destructive text-xs hover:underline">🗑</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > limite && (
              <div className="p-3 text-center border-t border-border">
                <button onClick={() => setLimite(l => l + 200)} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">
                  Afficher plus ({(rows.length - limite).toLocaleString('fr-FR')} compte(s) restant(s) ; filtrez par classe ou recherchez un numéro)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}