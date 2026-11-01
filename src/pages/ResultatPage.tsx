import ControleComptable from '@/components/ControleComptable';
import { useApp } from '@/stores/app-store';
import { calc, CR, fmt, fmtSigned } from '@/lib/accounting';
import { exportEtatCsv } from '@/lib/csv-export';
import { exportCRPdf } from '@/lib/pdf-export';

export default function ResultatPage() {
  const { balance, balanceN1, entreprise, exercice } = useApp();
  const vCR = calc(balance, CR);
  const vCRN1 = calc(balanceN1, CR);
  const rn = vCR['XI'] || 0;
  const hasN1 = balanceN1.length > 0;

  const handleExport = () => {
    const lines = CR.filter(l => l.type !== 'sect').map(l => ({
      ref: l.id, label: l.label, valN: vCR[l.id] || 0, valN1: hasN1 ? vCRN1[l.id] || 0 : undefined,
    }));
    exportEtatCsv(lines, `compte_resultat_${exercice?.annee}`);
  };

  const handlePdf = () => {
    if (!entreprise || !exercice) return;
    exportCRPdf(entreprise, exercice, CR, vCR, vCRN1, hasN1);
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Compte de Résultat</div><div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — {exercice?.date_debut} au {exercice?.date_fin}</div></div>
        <div className="flex items-center gap-2">
          <button onClick={handlePdf} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-primary/30 text-primary hover:bg-primary/10">📄 PDF</button>
          <button onClick={handleExport} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">📥 CSV</button>
        </div>
      </div>
      <div className="p-5">
        <ControleComptable balance={balance} previous={balanceN1} />
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[10px] font-bold text-primary uppercase tracking-[2px] font-mono">COMPTE DE RÉSULTAT — SYSTÈME NORMAL</span>
            <span className="text-[9px] text-fg3 font-mono">{entreprise?.nom} · {exercice?.annee}</span>
          </div>
          <div className="grid grid-cols-[70px_1fr_50px_140px_140px] text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono bg-bg3 px-3 py-1.5 border-b border-border">
            <span>Réf.</span><span>Libellés</span><span>Note</span><span className="text-right">Exercice N</span><span className="text-right">N-1</span>
          </div>
          {CR.map((l) => {
            if (l.type === 'sect') return (
              <div key={l.id} className="px-3 py-1.5 bg-bg3/50 font-bold text-[9px] text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border/30 col-span-5">{l.label}</div>
            );
            const v = vCR[l.id] ?? 0;
            const vn1 = vCRN1[l.id] ?? 0;
            const isGtotal = l.type === 'gtotal';
            const isTotal = l.type === 'total';
            const bg = isGtotal ? 'bg-[#0B1F3A]' : isTotal ? 'bg-accent/5' : '';
            const fg = isGtotal ? 'text-foreground' : isTotal ? 'text-primary font-semibold' : v < 0 ? 'text-destructive' : '';
            const last = l.id === 'XI';

            return (
              <div key={l.id} className={`grid grid-cols-[70px_1fr_50px_140px_140px] items-center px-3 py-1.5 border-b border-border/30 text-[11px] ${bg} ${isGtotal || isTotal ? 'font-bold' : ''} ${last ? (rn >= 0 ? 'border-t-2 border-t-success bg-success/5' : 'border-t-2 border-t-destructive bg-destructive/5') : ''}`}>
                <span className="text-[10px] text-fg3 font-mono">{l.id}</span>
                <span className={`${fg} ${isGtotal ? '' : 'pl-2'}`}>{l.label}</span>
                <span className="text-[9px] text-fg3 font-mono"></span>
                <span className={`text-right font-mono ${isGtotal ? 'text-foreground' : fg || (v >= 0 ? 'text-success' : 'text-destructive')}`}>{fmt(v)}</span>
                <span className={`text-right font-mono ${hasN1 ? (vn1 >= 0 ? 'text-fg3' : 'text-destructive/60') : 'text-fg3'}`}>
                  {hasN1 ? fmt(vn1) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
