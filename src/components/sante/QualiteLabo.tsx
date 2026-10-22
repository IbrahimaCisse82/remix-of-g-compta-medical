import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const msg = (e: { message: string }) => e.message.includes('row-level') ? 'Action réservée au biologiste ou à l’administrateur' : e.message;
const TYPES_NC: Record<string, string> = { preanalytique: 'Pré-analytique', analytique: 'Analytique', postanalytique: 'Post-analytique', eeq: 'Évaluation externe', equipement: 'Équipement', reclamation: 'Réclamation', autre: 'Autre' };
const sel = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

/** Registre des non-conformités : déclaration par le personnel, clôture avec action corrective par biologiste/admin (imposé par la base). */
export function NonConformites({ structureId }: { structureId: string }) {
  const [rows, setRows] = useState<Tables<'sante_non_conformites'>[]>([]);
  const [f, setF] = useState({ type: 'analytique', gravite: 'mineure', description: '' });
  const [actions, setActions] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const { data } = await supabase.from('sante_non_conformites').select('*').eq('structure_id', structureId).order('cree_le', { ascending: false }).limit(100);
    setRows(data ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);
  const declarer = async () => {
    const { error } = await supabase.rpc('sante_declarer_non_conformite', { _structure_id: structureId, _demande_id: null as unknown as string, _type: f.type, _gravite: f.gravite, _description: f.description });
    if (error) return toast.error(msg(error));
    setF({ ...f, description: '' }); toast.success('Non-conformité déclarée'); void load();
  };
  const traiter = async (id: string, cloturer: boolean) => {
    const { error } = await supabase.rpc('sante_traiter_non_conformite', { _id: id, _action: actions[id] ?? '', _cloturer: cloturer });
    if (error) return toast.error(msg(error));
    void load();
  };
  return <section className="space-y-3">
    <div className="border border-border bg-bg2 rounded-md p-3 grid sm:grid-cols-[auto_auto_1fr_auto] gap-2">
      <select aria-label="Type" className={sel} value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{Object.entries(TYPES_NC).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Gravité" className={sel} value={f.gravite} onChange={e => setF({ ...f, gravite: e.target.value })}><option value="mineure">Mineure</option><option value="majeure">Majeure</option><option value="critique">Critique</option></select>
      <Input aria-label="Description" placeholder="Description (10 caractères minimum)" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
      <Button size="sm" disabled={f.description.trim().length < 10} onClick={declarer}><Plus />Déclarer</Button>
    </div>
    <div className="border border-border bg-bg2 rounded-md divide-y divide-border">
      {rows.length === 0 ? <p className="p-4 text-sm text-fg3">Aucune non-conformité.</p> : rows.map(n => <div key={n.id} className="p-3 text-sm space-y-1">
        <div className="flex flex-wrap justify-between gap-2"><span><span className="text-xs uppercase text-fg3">{TYPES_NC[n.type]} · {n.gravite}</span> — {n.description}</span>
          <span className={`text-xs ${n.statut === 'cloturee' ? 'text-primary' : 'text-destructive'}`}>{n.statut === 'cloturee' ? `Clôturée le ${new Date(n.cloture_le).toLocaleDateString('fr-FR')}` : n.statut === 'en_cours' ? 'En cours' : 'Ouverte'}</span></div>
        {n.action_corrective && <p className="text-xs text-fg2">Action : {n.action_corrective}</p>}
        {n.statut !== 'cloturee' && <div className="flex flex-wrap gap-2"><Input aria-label="Action corrective" className="h-8 max-w-md" placeholder="Action corrective" value={actions[n.id] ?? ''} onChange={e => setActions(a => ({ ...a, [n.id]: e.target.value }))} />
          <Button size="sm" variant="outline" className="h-8" onClick={() => traiter(n.id, false)}>Enregistrer</Button><Button size="sm" className="h-8" onClick={() => traiter(n.id, true)}>Clôturer</Button></div>}
      </div>)}
    </div>
  </section>;
}

/** Évaluations externes de la qualité : z-score calculé par la base ; |z| > 2 ouvre une non-conformité. */
export function Eeq({ structureId }: { structureId: string }) {
  const [rows, setRows] = useState<Tables<'sante_eeq'>[]>([]);
  const [f, setF] = useState({ organisme: '', campagne: '', analyse: '', obtenue: '', cible: '', ecart: '' });
  const load = useCallback(async () => {
    const { data } = await supabase.from('sante_eeq').select('*').eq('structure_id', structureId).order('date_campagne', { ascending: false }).limit(100);
    setRows(data ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);
  const n = (s: string) => Number(s.replace(',', '.'));
  const ok = f.organisme && f.campagne && f.analyse && [f.obtenue, f.cible, f.ecart].every(x => x.trim() && !Number.isNaN(n(x))) && n(f.ecart) > 0;
  const saisir = async () => {
    const { error } = await supabase.rpc('sante_saisir_eeq', { _structure_id: structureId, _organisme: f.organisme, _campagne: f.campagne, _analyse: f.analyse, _date: null as unknown as string, _obtenue: n(f.obtenue), _cible: n(f.cible), _ecart: n(f.ecart) });
    if (error) return toast.error(msg(error));
    setF({ ...f, analyse: '', obtenue: '', cible: '', ecart: '' }); void load();
  };
  return <section className="space-y-3">
    <div className="border border-border bg-bg2 rounded-md p-3 grid sm:grid-cols-3 lg:grid-cols-7 gap-2">
      <Input aria-label="Organisme" placeholder="Organisme" value={f.organisme} onChange={e => setF({ ...f, organisme: e.target.value })} />
      <Input aria-label="Campagne" placeholder="Campagne" value={f.campagne} onChange={e => setF({ ...f, campagne: e.target.value })} />
      <Input aria-label="Analyse" placeholder="Analyse" value={f.analyse} onChange={e => setF({ ...f, analyse: e.target.value })} />
      <Input aria-label="Valeur obtenue" placeholder="Obtenue" inputMode="decimal" value={f.obtenue} onChange={e => setF({ ...f, obtenue: e.target.value })} />
      <Input aria-label="Valeur cible" placeholder="Cible" inputMode="decimal" value={f.cible} onChange={e => setF({ ...f, cible: e.target.value })} />
      <Input aria-label="Écart-type" placeholder="Écart-type" inputMode="decimal" value={f.ecart} onChange={e => setF({ ...f, ecart: e.target.value })} />
      <Button size="sm" disabled={!ok} onClick={saisir}><Plus />Enregistrer</Button>
    </div>
    <div className="border border-border bg-bg2 rounded-md overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-fg3 text-left"><tr><th className="p-2">Date</th><th className="p-2">Organisme / campagne</th><th className="p-2">Analyse</th><th className="p-2">Obtenu</th><th className="p-2">Cible</th><th className="p-2">z</th><th className="p-2">Résultat</th></tr></thead>
      <tbody className="divide-y divide-border">{rows.map(r => { const z = Number(r.zscore); return <tr key={r.id}><td className="p-2 text-xs">{new Date(r.date_campagne).toLocaleDateString('fr-FR')}</td><td className="p-2">{r.organisme} · {r.campagne}</td><td className="p-2">{r.analyse_libelle}</td><td className="p-2 font-mono">{r.valeur_obtenue}</td><td className="p-2 font-mono">{r.valeur_cible}</td><td className="p-2 font-mono">{z}</td><td className={`p-2 text-xs ${Math.abs(z) > 2 ? 'text-destructive font-semibold' : 'text-primary'}`}>{Math.abs(z) <= 2 ? 'Satisfaisant' : Math.abs(z) <= 3 ? 'Discutable — non-conformité ouverte' : 'Insatisfaisant — non-conformité ouverte'}</td></tr>; })}</tbody></table>
      {rows.length === 0 && <p className="p-4 text-sm text-fg3">Aucune évaluation externe.</p>}</div>
  </section>;
}

/** Conservation des échantillons, envois en sous-traitance et élimination tracée. */
export function Echantillons({ structureId }: { structureId: string }) {
  const [jours, setJours] = useState<number | null>(null);
  const [envois, setEnvois] = useState<(Pick<Tables<'sante_sous_traitance'>, 'id' | 'laboratoire' | 'reference_externe' | 'statut' | 'envoye_le' | 'recu_le'> & { demande: { numero: string } | null; analyse: { libelle: string } | null })[]>([]);
  const load = useCallback(async () => {
    const [{ data: s }, { data: e }] = await Promise.all([
      supabase.from('structures').select('conservation_echantillons_jours').eq('id', structureId).maybeSingle(),
      supabase.from('sante_sous_traitance').select('id, laboratoire, reference_externe, statut, envoye_le, recu_le, demande:sante_demandes_labo(numero), analyse:sante_analyses(libelle)').eq('structure_id', structureId).order('envoye_le', { ascending: false }).limit(100),
    ]);
    setJours(s?.conservation_echantillons_jours ?? 7); setEnvois(e ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);
  const eliminer = async () => {
    const { data, error } = await supabase.rpc('sante_eliminer_echantillons', { _structure_id: structureId });
    if (error) return toast.error(msg(error));
    toast.success(`${data} échantillon(s) marqué(s) comme éliminé(s)`);
  };
  const recevoir = async (id: string) => {
    const { error } = await supabase.rpc('sante_recevoir_sous_traitance', { _id: id, _reference: '' });
    if (error) return toast.error(msg(error));
    void load();
  };
  return <section className="space-y-4">
    <div className="border border-border bg-bg2 rounded-md p-4 flex flex-wrap justify-between items-center gap-3">
      <div><h2 className="font-semibold text-sm">Élimination des échantillons</h2><p className="text-xs text-fg3">Durée de conservation après validation : {jours ?? '…'} jours (paramètre de la structure). Chaque élimination est journalisée.</p></div>
      <Button size="sm" variant="outline" onClick={eliminer}>Éliminer les échantillons échus</Button>
    </div>
    <div className="border border-border bg-bg2 rounded-md">
      <h2 className="font-semibold text-sm p-3 border-b border-border">Analyses envoyées en sous-traitance</h2>
      {envois.length === 0 ? <p className="p-4 text-sm text-fg3">Aucun envoi. Envoyez une analyse depuis le détail d’une demande.</p> : envois.map(e => <div key={e.id} className="p-3 text-sm flex flex-wrap justify-between gap-2 border-t border-border first:border-0">
        <span><span className="font-mono text-xs text-primary">{e.demande?.numero}</span> · {e.analyse?.libelle} → <strong>{e.laboratoire}</strong>{e.reference_externe && <span className="text-xs text-fg3"> (réf. {e.reference_externe})</span>}</span>
        {e.statut === 'envoye' ? <Button size="sm" variant="outline" className="h-7" onClick={() => recevoir(e.id)}>Résultat reçu</Button> : <span className="text-xs text-primary">Reçu le {new Date(e.recu_le).toLocaleDateString('fr-FR')}</span>}
      </div>)}
    </div>
  </section>;
}
