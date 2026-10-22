import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { NonConformites, Eeq, Echantillons } from './QualiteLabo';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { AlertesStockCard, ReactifsParAnalyse } from './StocksSante';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { alertesReactif } from '@/domain/sante/westgard';

const msg = (e: { message: string }) => e.message.includes('row-level') ? 'Action réservée au biologiste ou à l’administrateur' : e.message;

/** Graphique de Levey-Jennings (z-scores, lignes ±1/2/3 s). */
type Mesure = Pick<Tables<'sante_cq_mesures'>, 'controle_id' | 'valeur' | 'z' | 'statut' | 'regles' | 'saisi_le'>;
type Controle = Tables<'sante_controles_qualite'> & { parametre: { libelle: string; unite: string | null } | null };
type Lot = Pick<Tables<'sante_lots_reactifs'>, 'id' | 'numero_lot' | 'peremption' | 'quantite_restante' | 'quantite_recue'>;
type ReactifAvecLots = Tables<'sante_reactifs'> & { lots: Lot[] };

function LeveyJennings({ points }: { points: { z: number; statut: string }[] }) {
  const W = 520, H = 160, pad = 10, n = Math.max(points.length, 2);
  const y = (z: number) => H / 2 - (Math.max(-4, Math.min(4, z)) / 4) * (H / 2 - pad);
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (n - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" role="img" aria-label="Graphique de Levey-Jennings">
      {[-3, -2, -1, 0, 1, 2, 3].map(k => <g key={k}><line x1={0} x2={W} y1={y(k)} y2={y(k)} className={k === 0 ? 'stroke-primary' : Math.abs(k) === 3 ? 'stroke-destructive' : 'stroke-border'} strokeDasharray={k === 0 ? '' : '4 4'} /><text x={W - 2} y={y(k) - 2} textAnchor="end" className="fill-muted-foreground text-[9px]">{k === 0 ? 'cible' : `${k > 0 ? '+' : ''}${k}s`}</text></g>)}
      <polyline fill="none" className="stroke-primary" strokeWidth={1.5} points={points.map((p, i) => `${x(i)},${y(p.z)}`).join(' ')} />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.z)} r={4} className={p.statut === 'rejete' ? 'fill-destructive' : p.statut === 'alerte' ? 'fill-accent-foreground' : 'fill-primary'} />)}
    </svg>
  );
}

export default function QualitePage({ structureId }: { structureId: string }) {
  const [onglet, setOnglet] = useState<'cq' | 'reactifs' | 'nc' | 'eeq' | 'ech'>('cq');
  const tabs: [typeof onglet, string][] = [['cq', 'Contrôle qualité'], ['reactifs', 'Réactifs'], ['nc', 'Non-conformités'], ['eeq', 'Évaluations externes'], ['ech', 'Échantillons']];
  return (
    <div className="max-w-6xl space-y-6">
      <div><p className="text-xs font-mono uppercase text-primary mb-1">Laboratoire</p><h1 className="font-serif text-3xl">Qualité et réactifs</h1></div>
      <div className="flex flex-wrap gap-1">{tabs.map(([k, l]) => <Button key={k} size="sm" variant={onglet === k ? 'secondary' : 'ghost'} onClick={() => setOnglet(k)}>{l}</Button>)}</div>
      {onglet === 'cq' ? <ControleQualite structureId={structureId} /> : onglet === 'reactifs' ? <Reactifs structureId={structureId} /> : onglet === 'nc' ? <NonConformites structureId={structureId} /> : onglet === 'eeq' ? <Eeq structureId={structureId} /> : <Echantillons structureId={structureId} />}
    </div>
  );
}

function ControleQualite({ structureId }: { structureId: string }) {
  const [params, setParams] = useState<{ id: string; libelle: string }[]>([]);
  const [ctrls, setCtrls] = useState<Controle[]>([]);
  const [mesures, setMesures] = useState<Record<string, Mesure[]>>({});
  const [f, setF] = useState({ parametre_id: '', lot: '', niveau: 'normal', automate: '', cible: '', ecart_type: '' });
  const [val, setVal] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('sante_analyse_parametres').select('id, libelle, analyse:sante_analyses(libelle)').eq('structure_id', structureId).order('libelle'),
      supabase.from('sante_controles_qualite').select('*, parametre:sante_analyse_parametres(libelle, unite)').eq('structure_id', structureId).eq('actif', true).order('created_at'),
    ]);
    setParams((p.data ?? []).map(x => ({ id: x.id, libelle: `${x.analyse?.libelle} — ${x.libelle}` })));
    setCtrls((c.data ?? []) as Controle[]);
    const ids = (c.data ?? []).map(x => x.id);
    if (ids.length) {
      const { data } = await supabase.from('sante_cq_mesures').select('controle_id, valeur, z, statut, regles, saisi_le').in('controle_id', ids).order('saisi_le', { ascending: false }).limit(500);
      const g: Record<string, Mesure[]> = {};
      // 30 dernières mesures par contrôle (Levey-Jennings)
      (data ?? []).forEach(m => { const liste = (g[m.controle_id] ??= []); if (liste.length < 30) liste.push(m); });
      Object.values(g).forEach(a => a.reverse());
      setMesures(g);
    }
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('sante_controles_qualite').insert({ structure_id: structureId, parametre_id: f.parametre_id, lot: f.lot, niveau: f.niveau, automate: f.automate || null, cible: Number(f.cible), ecart_type: Number(f.ecart_type) });
    if (error) return toast.error(msg(error));
    setF({ parametre_id: '', lot: '', niveau: 'normal', automate: '', cible: '', ecart_type: '' }); toast.success('Contrôle créé'); void load();
  };
  const saisir = async (id: string) => {
    const v = Number((val[id] ?? '').replace(',', '.'));
    if (!val[id] || Number.isNaN(v)) return;
    const { data, error } = await supabase.rpc('sante_saisir_cq', { _controle_id: id, _valeur: v });
    if (error) return toast.error(msg(error));
    if (data === 'rejete') toast.error('Contrôle rejeté : validation des résultats bloquée aujourd’hui pour ce paramètre');
    else if (data === 'alerte') toast.warning('Alerte 1-2s');
    else toast.success('Contrôle accepté');
    setVal(s => ({ ...s, [id]: '' })); void load();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={creer} className="border border-border bg-bg2 rounded-md p-4 grid sm:grid-cols-6 gap-2">
        <select required aria-label="Paramètre" className="sm:col-span-2 h-10 rounded-md border border-input bg-background px-2 text-sm" value={f.parametre_id} onChange={e => setF({ ...f, parametre_id: e.target.value })}><option value="">Paramètre…</option>{params.map(p => <option key={p.id} value={p.id}>{p.libelle}</option>)}</select>
        <Input required aria-label="Lot" placeholder="Lot" value={f.lot} onChange={e => setF({ ...f, lot: e.target.value })} />
        <Input aria-label="Automate" placeholder="Automate" value={f.automate} onChange={e => setF({ ...f, automate: e.target.value })} />
        <Input required aria-label="Cible" inputMode="decimal" placeholder="Cible" value={f.cible} onChange={e => setF({ ...f, cible: e.target.value })} />
        <div className="flex gap-2"><Input required aria-label="Écart-type" inputMode="decimal" placeholder="ET" value={f.ecart_type} onChange={e => setF({ ...f, ecart_type: e.target.value })} /><Button size="icon" aria-label="Créer"><Plus /></Button></div>
      </form>
      {ctrls.length === 0 && <p className="text-sm text-fg3">Aucun contrôle défini.</p>}
      {ctrls.map(c => {
        const pts = (mesures[c.id] ?? []).map(m => ({ z: Number(m.z), statut: m.statut }));
        const last = mesures[c.id]?.[mesures[c.id].length - 1];
        return <section key={c.id} className="border border-border bg-bg2 rounded-md p-4">
          <div className="flex flex-wrap justify-between gap-2 mb-2">
            <div><strong>{c.parametre?.libelle}</strong> <span className="text-xs text-fg3">lot {c.lot} · {c.niveau}{c.automate ? ` · ${c.automate}` : ''} · cible {c.cible} ± {c.ecart_type} {c.parametre?.unite}</span>
              {last && <p className={`text-xs ${last.statut === 'rejete' ? 'text-destructive font-semibold' : 'text-fg2'}`}>Dernier : {last.valeur} ({last.statut}{last.regles?.length ? ` · ${last.regles.join(', ')}` : ''}) le {new Date(last.saisi_le).toLocaleString('fr-FR')}</p>}</div>
            <div className="flex gap-2"><Input aria-label="Valeur du contrôle" className="w-28 h-9" inputMode="decimal" value={val[c.id] ?? ''} onChange={e => setVal(s => ({ ...s, [c.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saisir(c.id)} /><Button size="sm" onClick={() => saisir(c.id)}>Saisir</Button></div>
          </div>
          {pts.length > 0 && <LeveyJennings points={pts} />}
        </section>;
      })}
    </div>
  );
}

function Reactifs({ structureId }: { structureId: string }) {
  const [rows, setRows] = useState<ReactifAvecLots[]>([]);
  const [f, setF] = useState({ nom: '', unite: 'test', seuil_alerte: '' });
  const [rec, setRec] = useState<Record<string, { lot: string; per: string; q: string }>>({});
  const [conso, setConso] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('sante_reactifs').select('*, lots:sante_lots_reactifs(id, numero_lot, peremption, quantite_restante, quantite_recue)').eq('structure_id', structureId).eq('actif', true).order('nom');
    setRows(data ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('sante_reactifs').insert({ structure_id: structureId, nom: f.nom, unite: f.unite, seuil_alerte: Number(f.seuil_alerte || 0) });
    if (error) return toast.error(msg(error));
    setF({ nom: '', unite: 'test', seuil_alerte: '' }); void load();
  };
  const mvt = async (reactif: string, type: 'reception' | 'consommation', lotId?: string) => {
    const r = rec[reactif];
    const { error } = await supabase.rpc('sante_mouvement_reactif', type === 'reception'
      ? { _reactif_id: reactif, _type: type, _quantite: Number(r?.q), _numero_lot: r?.lot, _peremption: r?.per }
      : { _reactif_id: reactif, _type: type, _quantite: Number(conso[lotId!]), _lot_id: lotId });
    if (error) return toast.error(msg(error));
    toast.success(type === 'reception' ? 'Lot réceptionné' : 'Consommation enregistrée');
    if (type === 'reception') setRec(s => ({ ...s, [reactif]: { lot: '', per: '', q: '' } })); else setConso(s => ({ ...s, [lotId!]: '' }));
    void load();
  };

  return (
    <div className="space-y-4">
      <AlertesStockCard structureId={structureId} />
      <form onSubmit={creer} className="border border-border bg-bg2 rounded-md p-4 grid grid-cols-[3fr_1fr_1fr_auto] gap-2">
        <Input required aria-label="Nom du réactif" placeholder="Réactif" value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} />
        <Input aria-label="Unité" placeholder="Unité" value={f.unite} onChange={e => setF({ ...f, unite: e.target.value })} />
        <Input aria-label="Seuil d'alerte" inputMode="numeric" placeholder="Seuil" value={f.seuil_alerte} onChange={e => setF({ ...f, seuil_alerte: e.target.value })} />
        <Button size="icon" aria-label="Ajouter"><Plus /></Button>
      </form>
      {rows.length === 0 && <p className="text-sm text-fg3">Aucun réactif.</p>}
      {rows.map(r => {
        const al = alertesReactif(r.lots, Number(r.seuil_alerte));
        const stock = r.lots.filter(l => new Date(l.peremption + 'T23:59:59') >= new Date()).reduce((s: number, l) => s + Number(l.quantite_restante), 0);
        const x = rec[r.id] ?? { lot: '', per: '', q: '' };
        return <section key={r.id} className="border border-border bg-bg2 rounded-md p-4 space-y-2">
          <div className="flex flex-wrap justify-between gap-2"><span><strong>{r.nom}</strong> <span className="text-sm text-fg2">· stock utilisable {stock} {r.unite} (seuil {r.seuil_alerte})</span></span>{al.length > 0 && <span className="text-xs text-destructive font-semibold">{al.join(' · ')}</span>}</div>
          <div className="grid grid-cols-[2fr_2fr_1fr_auto] gap-2"><Input aria-label="N° de lot" placeholder="N° de lot" value={x.lot} onChange={e => setRec(s => ({ ...s, [r.id]: { ...x, lot: e.target.value } }))} /><Input aria-label="Péremption" type="date" value={x.per} onChange={e => setRec(s => ({ ...s, [r.id]: { ...x, per: e.target.value } }))} /><Input aria-label="Quantité reçue" inputMode="numeric" placeholder="Qté" value={x.q} onChange={e => setRec(s => ({ ...s, [r.id]: { ...x, q: e.target.value } }))} /><Button size="sm" variant="outline" onClick={() => mvt(r.id, 'reception')}>Réceptionner</Button></div>
          {r.lots.filter(l => Number(l.quantite_restante) > 0).sort((a, b) => a.peremption.localeCompare(b.peremption)).map(l => {
            const perime = new Date(l.peremption + 'T23:59:59') < new Date();
            return <div key={l.id} className={`flex flex-wrap items-center justify-between gap-2 text-sm border-t border-border pt-2 ${perime ? 'text-destructive' : ''}`}>
              <span>Lot {l.numero_lot} · périme le {new Date(l.peremption).toLocaleDateString('fr-FR')} · reste {l.quantite_restante}/{l.quantite_recue}{perime && ' · PÉRIMÉ'}</span>
              {!perime && <span className="flex gap-2"><Input aria-label="Quantité consommée" className="w-20 h-8" inputMode="numeric" value={conso[l.id] ?? ''} onChange={e => setConso(s => ({ ...s, [l.id]: e.target.value }))} /><Button size="sm" variant="ghost" onClick={() => mvt(r.id, 'consommation', l.id)}>Consommer</Button></span>}
            </div>;
          })}
        </section>;
      })}
      <ReactifsParAnalyse structureId={structureId} />
    </div>
  );
}
