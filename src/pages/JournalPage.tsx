import { confirmer } from '@/components/Confirmation';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { fmt } from '@/lib/accounting';
import { exportJournalCsv } from '@/lib/csv-export';
import { buildFec, downloadFec, controlerFec } from '@/lib/fec-export';
import { useState } from 'react';
import { toast } from 'sonner';

export default function JournalPage() {
  const { journal, deleteJournalEntry, extournerEcriture, isExerciceCloture, entreprise, exercice } = useApp();
  const { canWrite, canDelete } = useUserRole();
  const [filter, setFilter] = useState('');
  const locked = isExerciceCloture();
  const showActions = !locked && canWrite;
  const rows = journal.filter(r => !filter || r.libelle?.toLowerCase().includes(filter.toLowerCase()) || r.compte?.includes(filter));

  const td = rows.reduce((s, r) => s + (r.debit || 0), 0);
  const tc = rows.reduce((s, r) => s + (r.credit || 0), 0);

  const handleExportFec = async () => {
    if (!entreprise || !exercice) return;
    const rapport = controlerFec(journal as any);
    const lignes = [
      `Rapport de contrôle FEC — ${entreprise.nom} · Exercice ${exercice.annee}`,
      `Lignes : ${rapport.totalLignes} · Débit : ${fmt(rapport.totalDebit)} · Crédit : ${fmt(rapport.totalCredit)}`,
      `Équilibre : ${rapport.equilibre ? '✓ OK' : '✗ DÉSÉQUILIBRE'}`,
      `Lignes sans numéro serveur (recomptées) : ${rapport.lignesRecomptees}`,
      `Lignes auxiliaires : ${rapport.lignesAuxiliaires}`,
      rapport.comptesSansLibelle.length ? `Comptes sans intitulé : ${rapport.comptesSansLibelle.join(', ')}` : 'Intitulés : OK',
      '',
      'Télécharger le FEC ?',
    ];
    if (!rapport.equilibre || rapport.comptesSansLibelle.length > 0) {
      if (!(await confirmer(lignes.join('\n') + '\n\n⚠️ Des anomalies ont été détectées.'))) return;
    } else if (!(await confirmer(lignes.join('\n')))) return;
    const content = buildFec(journal as any, {
      entrepriseNom: entreprise.nom,
      ninea: entreprise.ninea || '',
      exerciceAnnee: exercice.annee,
    });
    downloadFec(content, entreprise.ninea || 'FEC', exercice.annee, exercice.date_fin);
    toast.success('FEC exporté — rapport de contrôle validé');
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Journal des Opérations</div><div className="text-[10px] text-fg3 font-mono">Partie double — Débit = Crédit</div></div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportJournalCsv(rows, `journal_${new Date().getFullYear()}`)} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">
            📥 Export CSV
          </button>
          <button onClick={handleExportFec} title="Fichier des Écritures Comptables — format officiel OHADA/fiscal" className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-primary/40 text-primary hover:bg-primary/10">
            📋 Export FEC officiel
          </button>
        </div>
      </div>
      <div className="p-5">
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Journal — {rows.length} ligne(s)</span>
            <input className="bg-bg3 border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary w-40" placeholder="Rechercher..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Date', 'Pièce', 'Journal', 'Compte', 'Libellé', 'Débit', 'Crédit', ...(showActions ? ['Action'] : [])].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{r.date_ecriture}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50"><span className="bg-[rgba(56,189,248,.12)] text-primary rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono">{r.piece || '—'}</span></td>
                  <td className="px-3 py-1.5 text-[9px] text-fg3 border-b border-border/50">{r.journal_code}</td>
                  <td className="px-3 py-1.5 text-[11px] text-primary font-mono border-b border-border/50">{r.compte}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.libelle}<br /><small className="text-fg3">{r.intitule}</small></td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.debit ? fmt(r.debit) : ''}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.credit ? fmt(r.credit) : ''}</td>
                  {showActions && (
                    <td className="px-3 py-1.5 border-b border-border/50">
                      {r.ecriture_id ? (
                        <button
                          type="button"
                          aria-label={`Extourner l'écriture ${r.piece || ''}`}
                          title="Contre-passation (l'écriture validée reste conservée)"
                          onClick={() => {
                            const motif = window.prompt('Motif de l\u2019extourne (5 caractères minimum) :');
                            if (!motif) return;
                            if (motif.trim().length < 5) { toast.error('Motif trop court'); return; }
                            extournerEcriture(r.id, motif.trim());
                          }}
                          className="text-accent text-[11px] font-semibold hover:underline"
                        >
                          ⟲ Extourner
                        </button>
                      ) : canDelete ? (
                        <button
                          type="button"
                          aria-label={`Supprimer la ligne historique ${r.compte}`}
                          title="Ligne historique sans écriture rattachée"
                          onClick={() => deleteJournalEntry(r.id)}
                          className="text-destructive text-[11px] hover:underline"
                        >
                          Supprimer
                        </button>
                      ) : <span className="text-[10px] text-fg3">—</span>}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="bg-bg3 font-bold">
                <td colSpan={5} className="px-3 py-1.5 text-[11px] border-t border-border-2">TOTAUX</td>
                <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-t border-border-2">{fmt(td)}</td>
                <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-t border-border-2">{fmt(tc)}</td>
                {showActions && <td className="border-t border-border-2"></td>}
              </tr>

            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}