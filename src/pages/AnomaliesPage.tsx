import ControleComptable from '@/components/ControleComptable';
import { controlesSyscohada } from '@/lib/conformite-syscohada';
import { useMemo, useState } from 'react';
import { useApp } from '@/stores/app-store';
import { executerControles, resumeAnomalies, type NiveauAnomalie } from '@/lib/anomalies';

const COULEUR: Record<NiveauAnomalie, string> = {
  bloquant: 'text-destructive border-destructive/40 bg-destructive/10',
  majeur: 'text-accent border-accent/40 bg-accent/10',
  info: 'text-fg2 border-border bg-bg3',
};

const LIBELLE_NIVEAU: Record<NiveauAnomalie, string> = {
  bloquant: 'Bloquant',
  majeur: 'Majeur',
  info: 'Information',
};

export default function AnomaliesPage() {
  const { journal, balance, balanceN1, plan, exercice, setPage } = useApp();
  const [filtre, setFiltre] = useState<'tous' | NiveauAnomalie>('tous');

  const anomalies = useMemo(() => executerControles({
    journal: journal as any,
    balance: balance as any,
    comptesPlan: plan.map(p => p.numero),
    exercice: exercice ? { date_debut: exercice.date_debut, date_fin: exercice.date_fin, statut: exercice.statut } : null,
  }), [journal, balance, plan, exercice]);

  const resume = resumeAnomalies(anomalies);
  const clotureOk = resume.clotureAutorisee && controlesSyscohada(balance, balanceN1).every(c => !c.bloquant || c.ok);
  const liste = filtre === 'tous' ? anomalies : anomalies.filter(a => a.niveau === filtre);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <h1 className="font-serif text-[17px]">Contrôles de cohérence</h1>
          <div className="text-[10px] text-fg3 font-mono">Anomalies détectées automatiquement sur l'exercice courant</div>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border ${clotureOk ? 'text-success border-success/40 bg-success/10' : COULEUR.bloquant}`}>
          {clotureOk ? '✔ Clôture autorisée' : '⛔ Clôture bloquée'}
        </span>
      </div>

      <div className="p-5 space-y-4">
        <ControleComptable balance={balance} previous={balanceN1} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['Total', resume.total, 'tous'],
            ['Bloquants', resume.bloquant, 'bloquant'],
            ['Majeurs', resume.majeur, 'majeur'],
            ['Informations', resume.info, 'info'],
          ] as const).map(([label, valeur, cle]) => (
            <button key={cle} onClick={() => setFiltre(cle as any)}
              className={`text-left bg-bg2 border rounded-lg p-3 transition-colors ${filtre === cle ? 'border-primary' : 'border-border hover:border-primary/40'}`}>
              <div className="text-[10px] uppercase tracking-[1px] text-fg3 font-mono">{label}</div>
              <div className="text-2xl font-semibold">{valeur}</div>
            </button>
          ))}
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border text-xs font-semibold">
            {liste.length} anomalie(s) affichée(s)
          </div>
          {liste.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-fg3">
              Aucune anomalie sur ce filtre — la comptabilité est cohérente avec le journal.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead><tr>
                {['Criticité', 'Contrôle', 'Anomalie', 'Détail', ''].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {liste.map((a, i) => (
                  <tr key={`${a.code}-${i}`} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 border-b border-border/50">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${COULEUR[a.niveau]}`}>{LIBELLE_NIVEAU[a.niveau]}</span>
                    </td>
                    <td className="px-3 py-1.5 text-[10px] font-mono text-fg3 border-b border-border/50">{a.code}</td>
                    <td className="px-3 py-1.5 text-[11px] font-semibold border-b border-border/50">{a.libelle}</td>
                    <td className="px-3 py-1.5 text-[11px] text-fg2 border-b border-border/50">{a.detail}</td>
                    <td className="px-3 py-1.5 border-b border-border/50 text-right">
                      {a.page && (
                        <button onClick={() => setPage(a.page as any)} className="text-primary text-[11px] font-semibold hover:underline">
                          Ouvrir →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
