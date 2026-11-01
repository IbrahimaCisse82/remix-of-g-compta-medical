import { useApp } from '@/stores/app-store';
import { calc, CR, ACTIF, PASSIF, fmt, fmtSigned } from '@/lib/accounting';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const colorMap: Record<string, string> = {
  primary: 'text-primary',
  success: 'text-success',
  destructive: 'text-destructive',
  accent: 'text-accent',
};

const bgColorMap: Record<string, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  destructive: 'bg-destructive',
  accent: 'bg-accent',
};

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--warning))', 'hsl(var(--purple))', 'hsl(var(--info))'];

export default function Dashboard() {
  const { entreprise, exercice, balance, balanceN1 } = useApp();
  
  const vCR = calc(balance, CR);
  const vCRN1 = balanceN1.length > 0 ? calc(balanceN1, CR) : null;
  const vA = calc(balance, ACTIF);
  const vP = calc(balance, PASSIF);

  const tresoActif = vA['BT'] || 0;
  const tresoPassif = vP['DT'] || 0;
  const tresoNette = tresoActif - tresoPassif;
  const tresoNetteN1 = balanceN1.length > 0 ? ((calc(balanceN1, ACTIF)['BT'] || 0) - (calc(balanceN1, PASSIF)['DT'] || 0)) : null;

  const ca = vCR['XB'] || 0;
  const rn = vCR['XI'] || 0;
  const ebe = vCR['XD'] || 0;
  const va = vCR['XC'] || 0;
  const totalActif = vA['BZ'] || 0;
  const capitauxPropres = vP['CP'] || 0;
  const dettesFinancieres = vP['DD'] || 0;
  const actifCirculant = vA['BK'] || 0;
  const passifCirculant = vP['DP'] || 0;

  // ─── Ratios financiers ───────────────────────────
  const ratioRentaCA = ca ? (rn / ca) * 100 : 0;
  const ratioRentaCP = capitauxPropres ? (rn / capitauxPropres) * 100 : 0;
  const ratioLiqGen = passifCirculant ? actifCirculant / passifCirculant : 0;
  const ratioSolvabilite = totalActif ? (capitauxPropres / totalActif) * 100 : 0;
  const ratioEndettement = capitauxPropres ? (dettesFinancieres / capitauxPropres) * 100 : 0;
  const ratioEBECA = ca ? (ebe / ca) * 100 : 0;

  const kpis = [
    { label: "Chiffre d'Affaires (XB)", value: fmt(ca), color: 'primary' },
    { label: 'Résultat Net (XI)', value: fmtSigned(rn), color: rn >= 0 ? 'success' : 'destructive' },
    { label: "EBE (XD)", value: fmtSigned(ebe), sub: ca ? Math.round(ebe / ca * 100) + '% du CA' : '—', color: 'accent' },
    { label: 'Trésorerie Nette', value: fmtSigned(tresoNette), color: tresoNette >= 0 ? 'success' : 'destructive' },
  ];

  const sigs = [
    { ref: 'XB', lib: "Chiffre d'Affaires", n: ca, n1: vCRN1?.['XB'] },
    { ref: 'XA', lib: 'Marge Commerciale', n: vCR['XA'] || 0, n1: vCRN1?.['XA'] },
    { ref: 'XC', lib: 'Valeur Ajoutée', n: va, n1: vCRN1?.['XC'] },
    { ref: 'XD', lib: "Excédent Brut d'Expl.", n: ebe, n1: vCRN1?.['XD'] },
    { ref: 'XE', lib: "Résultat d'Exploitation", n: vCR['XE'] || 0, n1: vCRN1?.['XE'] },
    { ref: 'XF', lib: 'Résultat Financier', n: vCR['XF'] || 0, n1: vCRN1?.['XF'] },
    { ref: 'XG', lib: 'Résultat Activités Ord.', n: vCR['XG'] || 0, n1: vCRN1?.['XG'] },
    { ref: 'XH', lib: 'Résultat HAO', n: vCR['XH'] || 0, n1: vCRN1?.['XH'] },
    { ref: 'XI', lib: 'Résultat Net', n: rn, n1: vCRN1?.['XI'] },
    { ref: 'ZH', lib: 'Trésorerie Nette', n: tresoNette, n1: tresoNetteN1 },
  ];

  // Chart data
  const sigChartData = [
    { name: 'CA', N: ca, 'N-1': vCRN1?.['XB'] || 0 },
    { name: 'VA', N: va, 'N-1': vCRN1?.['XC'] || 0 },
    { name: 'EBE', N: ebe, 'N-1': vCRN1?.['XD'] || 0 },
    { name: 'RE', N: vCR['XE'] || 0, 'N-1': vCRN1?.['XE'] || 0 },
    { name: 'RN', N: rn, 'N-1': vCRN1?.['XI'] || 0 },
  ];

  const bilanPieData = [
    { name: 'Immo.', value: Math.abs(vA['AZ'] || 0) },
    { name: 'Stocks', value: Math.abs(vA['BB'] || 0) },
    { name: 'Créances', value: Math.abs(vA['BG'] || 0) },
    { name: 'Tréso.', value: Math.abs(tresoActif) },
  ].filter(d => d.value > 0);

  const ratios = [
    { label: 'Rentabilité / CA', value: ratioRentaCA, unit: '%', color: ratioRentaCA >= 0 ? 'text-success' : 'text-destructive', desc: 'RN / CA' },
    { label: 'Rentabilité / CP', value: ratioRentaCP, unit: '%', color: ratioRentaCP >= 0 ? 'text-success' : 'text-destructive', desc: 'RN / Capitaux Propres' },
    { label: 'Liquidité Générale', value: ratioLiqGen, unit: 'x', color: ratioLiqGen >= 1 ? 'text-success' : 'text-destructive', desc: 'AC / PC' },
    { label: 'Solvabilité', value: ratioSolvabilite, unit: '%', color: ratioSolvabilite >= 20 ? 'text-success' : 'text-destructive', desc: 'CP / Total Actif' },
    { label: 'Endettement', value: ratioEndettement, unit: '%', color: ratioEndettement <= 100 ? 'text-success' : 'text-destructive', desc: 'Dettes Fin. / CP' },
    { label: 'Marge EBE', value: ratioEBECA, unit: '%', color: ratioEBECA >= 0 ? 'text-success' : 'text-destructive', desc: 'EBE / CA' },
  ];

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Tableau de bord</div>
          <div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — {entreprise?.ninea} — {exercice?.annee}</div>
        </div>
        <div className="text-[10px] text-fg3 font-mono">
          {exercice?.statut === 'cloture' && <span className="bg-success/10 text-success rounded px-2 py-0.5 font-bold">🟢 Clôturé</span>}
          {exercice?.statut === 'en_cours' && <span className="bg-accent/10 text-accent rounded px-2 py-0.5 font-bold">🟡 En cours</span>}
        </div>
      </div>
      <div className="p-5 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="bg-bg2 border border-border rounded-lg p-3.5 relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${bgColorMap[k.color] || 'bg-primary'}`} />
              <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">{k.label}</div>
              <div className={`text-lg font-bold font-mono mt-1 ${colorMap[k.color] || 'text-primary'}`}>{k.value}</div>
              {k.sub && <div className="text-[10px] text-fg3">{k.sub}</div>}
              <div className="text-[10px] text-fg3">{entreprise?.monnaie || 'FCFA'}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2 border-b border-border">
              <span className="text-xs font-semibold">📊 SIG — Comparaison N / N-1</span>
            </div>
            <div className="p-3 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sigChartData} barGap={2}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip formatter={(v: number) => fmt(v)} labelStyle={{ fontSize: 11 }} />
                  <Bar dataKey="N" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="N-1" fill="hsl(var(--primary))" opacity={0.3} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2 border-b border-border">
              <span className="text-xs font-semibold">🏛️ Structure de l'Actif</span>
            </div>
            <div className="p-3 h-[220px] flex items-center">
              <div className="w-1/2 h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={bilanPieData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={2}>
                      {bilanPieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 space-y-1.5 pl-2">
                {bilanPieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-[10px]">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-fg2">{d.name}</span>
                    <span className="font-mono text-fg3 ml-auto">{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Ratios financiers */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">📈 Ratios Financiers</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-border">
            {ratios.map(r => (
              <div key={r.label} className="p-3 text-center">
                <div className="text-[9px] text-fg3 uppercase tracking-wider font-mono mb-1">{r.label}</div>
                <div className={`text-lg font-bold font-mono ${r.color}`}>
                  {isFinite(r.value) ? `${r.value.toFixed(1)}${r.unit}` : '—'}
                </div>
                <div className="text-[9px] text-fg3 mt-0.5">{r.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* SIG table */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">Soldes Intermédiaires de Gestion (SIG)</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">Réf.</th>
                <th className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">Indicateur</th>
                <th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">Exercice N</th>
                <th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">N-1</th>
                <th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">Variation</th>
              </tr>
            </thead>
            <tbody>
              {sigs.map(r => {
                const variation = r.n1 != null && r.n1 !== 0 ? ((r.n - r.n1) / Math.abs(r.n1)) * 100 : null;
                return (
                  <tr key={r.ref} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">
                      <span className="bg-bg4 border border-border rounded px-1.5 py-0.5 text-[9px] font-mono text-fg3">{r.ref}</span>
                    </td>
                    <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.lib}</td>
                    <td className={`px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50 ${r.n >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(r.n)}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-fg3 border-b border-border/50">
                      {r.n1 != null ? fmt(r.n1) : '—'}
                    </td>
                    <td className={`px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50 ${variation != null ? (variation >= 0 ? 'text-success' : 'text-destructive') : 'text-fg3'}`}>
                      {variation != null ? `${variation >= 0 ? '+' : ''}${variation.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
