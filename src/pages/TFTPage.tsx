import ControleComptable from '@/components/ControleComptable';
import { useApp } from '@/stores/app-store';
import { calc, TFT, CR, fmt } from '@/lib/accounting';
import { exportEtatCsv } from '@/lib/csv-export';
import { exportTFTPdf } from '@/lib/pdf-export';

export default function TFTPage() {
  const { balance, balanceN1, entreprise, exercice } = useApp();
  const vCR = calc(balance, CR);
  const vT = calc(balance, TFT, { XI: vCR['XI'] || 0 });

  const hasN1 = balanceN1.length > 0;
  const vCRN1 = hasN1 ? calc(balanceN1, CR) : {};
  const vTN1 = hasN1 ? calc(balanceN1, TFT, { XI: vCRN1['XI'] || 0 }) : {};

  const handleExport = () => {
    const lines = TFT.filter(l => l.type !== 'sect' && !l.id.startsWith('_')).map(l => ({
      ref: l.id, label: l.label, valN: vT[l.id] || 0, valN1: hasN1 ? vTN1[l.id] || 0 : undefined,
    }));
    exportEtatCsv(lines, `tft_${exercice?.annee}`);
  };

  const handlePdf = () => {
    if (!entreprise || !exercice) return;
    exportTFTPdf(entreprise, exercice, TFT, vT, vTN1, hasN1);
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Tableau des Flux de Trésorerie</div><div className="text-[10px] text-fg3 font-mono">Méthode indirecte — SYSCOHADA</div></div>
        <div className="flex items-center gap-2">
          <button onClick={handlePdf} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-primary/30 text-primary hover:bg-primary/10">📄 PDF</button>
          <button onClick={handleExport} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">📥 CSV</button>
        </div>
      </div>
      <div className="p-5">
        <ControleComptable balance={balance} previous={balanceN1} />
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple uppercase tracking-[2px] font-mono">TABLEAU DES FLUX DE TRÉSORERIE — {exercice?.annee}</span>
          </div>
          <div className={`grid ${hasN1 ? 'grid-cols-[70px_1fr_140px_140px]' : 'grid-cols-[70px_1fr_140px]'} text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono bg-bg3 px-3 py-1 border-b border-border`}>
            <span>Réf.</span><span>Libellé</span><span className="text-right">N</span>
            {hasN1 && <span className="text-right">N-1</span>}
          </div>
          {TFT.filter(l => !l.id.startsWith('_')).map((l) => {
            if (l.type === 'sect') return (
              <div key={l.id} className="px-3 py-1.5 bg-bg3/50 font-bold text-[9px] text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border/30">{l.label}</div>
            );
            const v = vT[l.id] ?? 0;
            const vn1 = vTN1[l.id] ?? 0;
            const isGtotal = l.type === 'gtotal';
            return (
              <div key={l.id} className={`grid ${hasN1 ? 'grid-cols-[70px_1fr_140px_140px]' : 'grid-cols-[70px_1fr_140px]'} items-center px-3 py-1.5 border-b border-border/30 text-[11px] ${isGtotal ? 'font-bold bg-purple/5 border-t-2 border-t-purple' : ''}`}>
                <span className="text-[10px] text-fg3 font-mono">{l.id}</span>
                <span>{l.label}</span>
                <span className={`text-right font-mono ${v >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(v)}</span>
                {hasN1 && <span className={`text-right font-mono text-fg3 text-[10px]`}>{fmt(vn1)}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
