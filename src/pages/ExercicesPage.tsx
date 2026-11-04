import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { useState } from 'react';

export default function ExercicesPage() {
  const { exercices, openExercice, deleteExercice, addExercice, exercice, entreprise, clotureExercice, loading, demo } = useApp();
  const { canWrite, canCloturer, canDelete } = useUserRole();
  const [confirming, setConfirming] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newAnnee, setNewAnnee] = useState(new Date().getFullYear() + 1);

  const handleCloture = async () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    await clotureExercice();
  };

  const handleAdd = async () => {
    if (!entreprise) return;
    await addExercice({
      entreprise_id: entreprise.id,
      annee: newAnnee,
      date_debut: `${newAnnee}-01-01`,
      date_fin: `${newAnnee}-12-31`,
      statut: 'en_cours',
    });
    setShowForm(false);
  };

  const canCloture = exercice?.statut === 'en_cours';
  const existingYears = new Set(exercices.map(e => e.annee));

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">Exercices Comptables</div>
        <div className="flex items-center gap-2">
          {!demo && canWrite && (
            <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-border text-fg2 hover:bg-bg3">
              {showForm ? '✕ Fermer' : '+ Nouvel Exercice'}
            </button>
          )}
          {canCloture && canCloturer && (
            <>
              {confirming && <span className="text-[10px] text-destructive font-semibold animate-pulse">Confirmer la clôture ?</span>}
              <button
                onClick={handleCloture}
                disabled={loading}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                  confirming
                    ? 'bg-destructive text-destructive-foreground border-destructive'
                    : 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25'
                }`}
              >
                {loading ? '⏳ Clôture...' : confirming ? '⚠ Oui, clôturer' : `🔒 Clôturer ${exercice.annee}`}
              </button>
              {confirming && (
                <button onClick={() => setConfirming(false)} className="px-2 py-1 rounded text-[10px] border border-border text-fg2">Annuler</button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="p-5">
        {/* New exercice form */}
        {showForm && (
          <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
            <div className="font-bold text-sm mb-3 text-primary">📅 Nouvel Exercice</div>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">Année</label>
                <input type="number" value={newAnnee} onChange={e => setNewAnnee(Number(e.target.value))}
                  className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary w-24 font-mono" />
              </div>
              <div>
                <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">Début</label>
                <input disabled value={`${newAnnee}-01-01`} className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-fg3 w-32 font-mono" />
              </div>
              <div>
                <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono block mb-1">Fin</label>
                <input disabled value={`${newAnnee}-12-31`} className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] text-fg3 w-32 font-mono" />
              </div>
              <button onClick={handleAdd} disabled={existingYears.has(newAnnee) || loading}
                className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90">
                ✓ Créer
              </button>
              {existingYears.has(newAnnee) && <span className="text-[10px] text-destructive">Exercice {newAnnee} existe déjà</span>}
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 text-[11px] text-fg2">
          <strong className="text-primary">Clôture d'exercice :</strong> À la clôture, les soldes des comptes de bilan (classes 1-5) sont reportés en à-nouveaux sur l'exercice suivant. Les comptes de résultat (classes 6-8) sont soldés et le résultat net est affecté au Report à Nouveau (121 créditeur / 129 débiteur).
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">{exercices.length} exercice(s)</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Année', 'Début', 'Fin', 'Statut', 'Actions'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {exercices.sort((a, b) => b.annee - a.annee).map(e => (
                <tr key={e.id} className={`hover:bg-[rgba(56,189,248,.02)] ${exercice?.id === e.id ? 'bg-primary/5' : ''}`}>
                  <td className="px-3 py-1.5 text-[11px] text-accent font-bold font-mono border-b border-border/50">
                    {e.annee}
                    {exercice?.id === e.id && <span className="ml-1.5 text-[8px] text-primary bg-primary/10 rounded px-1 py-0.5">actif</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_debut}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_fin}</td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <span className={`rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono ${e.statut === 'en_cours' ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success'}`}>
                      {e.statut === 'en_cours' ? '🟡 En cours' : '🟢 Clôturé'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/50 flex gap-1">
                    <button onClick={() => openExercice(e.id)} className="text-[10px] px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold">
                      {exercice?.id === e.id ? '✓ Ouvert' : 'Ouvrir'}
                    </button>
                    {e.statut === 'en_cours' && exercice?.id !== e.id && !demo && canDelete && (
                      <button onClick={() => deleteExercice(e.id)} className="text-[10px] px-2 py-1 rounded bg-destructive/10 text-destructive">🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}