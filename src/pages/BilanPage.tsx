import ControleComptable from '@/components/ControleComptable';
import { useApp } from '@/stores/app-store';
import { calc, calculateActif, ACTIF, PASSIF, fmt, fmtSigned, type MapLine, type BalanceLine } from '@/lib/accounting';
import { exportCsv } from '@/lib/csv-export';
import { exportBilanPdf } from '@/lib/pdf-export';

function BilanTable({ def, vals, valsN1, valsBrut, valsAmort, title, acColor }: {
  def: MapLine[];
  vals: Record<string, number>;
  valsN1: Record<string, number>;
  valsBrut: Record<string, number>;
  valsAmort: Record<string, number>;
  title: string;
  acColor: string;
}) {
  const hasN1 = Object.values(valsN1).some(v => v !== 0);
  const isActif = title === 'ACTIF';

  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 text-center font-bold text-[11px] tracking-[3px] uppercase" style={{ background: acColor, color: '#fff' }}>{title}</div>
      <div className={`grid ${isActif ? (hasN1 ? 'grid-cols-[40px_1fr_80px_80px_80px_80px]' : 'grid-cols-[40px_1fr_80px_80px_80px]') : (hasN1 ? 'grid-cols-[40px_1fr_90px_90px]' : 'grid-cols-[40px_1fr_90px]')} text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono bg-bg3 px-3 py-1 border-b border-border`}>
        <span>Réf</span>
        <span>Libellé</span>
        {isActif ? (
          <>
            <span className="text-right">Brut</span>
            <span className="text-right">Amort/Dép.</span>
            <span className="text-right">Net N</span>
            {hasN1 && <span className="text-right">Net N-1</span>}
          </>
        ) : (
          <>
            <span className="text-right">Net N</span>
            {hasN1 && <span className="text-right">Net N-1</span>}
          </>
        )}
      </div>
      {def.map((l) => {
        if (l.type === 'sect') return (
          <div key={l.id} className="px-3 py-1 bg-bg3 font-bold text-[9px] text-fg3 uppercase tracking-[1.5px] font-mono border-b border-border/30">
            {l.label}
          </div>
        );
        const v = vals[l.id] ?? 0;
        const vn1 = valsN1[l.id] ?? 0;
        const brut = valsBrut[l.id] ?? 0;
        const amort = valsAmort[l.id] ?? 0;
        const isTot = l.type === 'total' || l.type === 'gtotal';
        
        return (
          <div key={l.id} className={`grid ${isActif ? (hasN1 ? 'grid-cols-[40px_1fr_80px_80px_80px_80px]' : 'grid-cols-[40px_1fr_80px_80px_80px]') : (hasN1 ? 'grid-cols-[40px_1fr_90px_90px]' : 'grid-cols-[40px_1fr_90px]')} items-center px-3 py-1 border-b border-border/30 text-[11px] ${isTot ? 'bg-success/5 font-extrabold border-t-2 border-t-success font-mono' : ''}`}>
            <span className="text-[9px] text-fg3 font-mono">{l.id}</span>
            <span>{l.label}</span>
            {isActif ? (
              <>
                <span className="font-mono text-right text-fg2">{fmtSigned(brut)}</span>
                <span className="font-mono text-right text-destructive/70">{amort ? fmtSigned(-amort) : '—'}</span>
                <span className={`font-mono text-right ${v >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtSigned(v)}</span>
                {hasN1 && <span className="font-mono text-right text-fg3 text-[10px]">{vn1 ? fmtSigned(vn1) : '—'}</span>}
              </>
            ) : (
              <>
                <span className={`font-mono text-right ${v >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtSigned(v)}</span>
                {hasN1 && <span className="font-mono text-right text-fg3 text-[10px]">{vn1 ? fmtSigned(vn1) : '—'}</span>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BilanPage() {
  const { balance, balanceN1, entreprise, exercice } = useApp();
  const vA = calc(balance, ACTIF);
  const vP = calc(balance, PASSIF);
  const vAN1 = calc(balanceN1, ACTIF);
  const vPN1 = calc(balanceN1, PASSIF);
  const { brut: vABrut, amort: vAAmort } = calculateActif(balance);
  const tA = vA['BZ'] || 0;
  const tP = vP['DZ'] || 0;
  const eq = Math.abs(tA - tP) < 1;

  const handleExport = () => {
    const actifLines = ACTIF.filter(l => l.type !== 'sect').map(l => [
      l.id, l.label, vABrut[l.id] || 0, vAAmort[l.id] || 0, vA[l.id] || 0, vAN1[l.id] || 0,
    ]);
    const passifLines = PASSIF.filter(l => l.type !== 'sect').map(l => [
      l.id, l.label, '', '', vP[l.id] || 0, vPN1[l.id] || 0,
    ]);
    exportCsv(
      ['Réf', 'Libellé', 'Brut', 'Amort/Dép', 'Net N', 'Net N-1'],
      [...actifLines, ['', '---PASSIF---', '', '', '', ''], ...passifLines] as any,
      `bilan_${exercice?.annee}`,
    );
  };

  const handlePdf = () => {
    if (!entreprise || !exercice) return;
    exportBilanPdf(entreprise, exercice, ACTIF, PASSIF, vA, vP, vAN1, vPN1, vABrut, vAAmort);
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Bilan</div><div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — Au {exercice?.date_fin || exercice?.annee}</div></div>
        <div className="flex items-center gap-2">
          <button onClick={handlePdf} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-primary/30 text-primary hover:bg-primary/10">📄 PDF</button>
          <button onClick={handleExport} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">📥 CSV</button>
        </div>
      </div>
      <div className="p-5">
        <ControleComptable balance={balance} previous={balanceN1} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <BilanTable def={ACTIF} vals={vA} valsN1={vAN1} valsBrut={vABrut} valsAmort={vAAmort} title="ACTIF" acColor="#0B1F3A" />
          <BilanTable def={PASSIF} vals={vP} valsN1={vPN1} valsBrut={{}} valsAmort={{}} title="PASSIF" acColor="#163158" />
        </div>
        <div className={`rounded-lg px-4 py-2 text-center font-bold text-sm ${eq ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {eq ? '✓ BILAN ÉQUILIBRÉ' : '⚠ BILAN NON ÉQUILIBRÉ'} — Actif: {fmt(tA)} / Passif: {fmt(tP)}
        </div>
      </div>
    </div>
  );
}
