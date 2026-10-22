import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, PackageMinus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { toastErreurSante } from '@/lib/sante-acces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { nombreAlertes, verifierDelivrance, type AlertesStock, type ArticleStock } from '@/domain/sante/stocks-sante';

type Ligne = { article_id: string; quantite: string };

/** Délivrance de médicaments et consommables pendant la consultation (sortie de stock + écriture comptable). */
export function DelivranceConsultation({ consultationId, structureId }: { consultationId: string; structureId: string }) {
  const [articles, setArticles] = useState<(ArticleStock & { code: string })[] | null>(null);
  const [indispo, setIndispo] = useState<string | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([{ article_id: '', quantite: '1' }]);
  const [faites, setFaites] = useState<{ id: string; quantite: number; created_at: string; article_id: string }[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const load = useCallback(async () => {
    const [a, d] = await Promise.all([
      supabase.rpc('sante_articles_disponibles', { _structure_id: structureId }),
      supabase.from('sante_dispensations').select('id, quantite, created_at, article_id').eq('consultation_id', consultationId).order('created_at'),
    ]);
    if (a.error) { setIndispo(a.error.message); setArticles([]); } else { setIndispo(null); setArticles((a.data ?? []).map(x => ({ ...x, quantite_stock: Number(x.quantite_stock) }))); }
    setFaites((d.data ?? []).map(x => ({ ...x, quantite: Number(x.quantite) })));
  }, [consultationId, structureId]);
  useEffect(() => { void load(); }, [load]);

  if (articles === null) return null;
  if (indispo) return null; // rôle sans accès à la pharmacie : la section n'est pas proposée

  const nom = (id: string) => articles.find(a => a.id === id);
  const saisies = lignes.map(l => ({ article_id: l.article_id, quantite: Number(l.quantite.replace(',', '.')) }));
  const erreurs = lignes.some(l => l.article_id) ? verifierDelivrance(saisies, articles) : [];

  const delivrer = async () => {
    const e = verifierDelivrance(saisies, articles);
    if (e.length) return toast.error(e[0]);
    setEnvoi(true);
    const { data, error } = await supabase.rpc('sante_dispenser', { _consultation_id: consultationId, _lignes: saisies });
    setEnvoi(false);
    if (error) return void toastErreurSante(error, structureId);
    toast.success(`${data} ligne(s) délivrée(s) et sorties du stock.`);
    setLignes([{ article_id: '', quantite: '1' }]);
    void load();
  };

  return (
    <section className="border border-border bg-bg2 rounded-md p-4">
      <h2 className="font-semibold mb-1 flex items-center gap-2"><PackageMinus className="text-primary" />Pharmacie & consommables délivrés</h2>
      <p className="text-xs text-fg3 mb-3">Sortie de stock au coût moyen pondéré, écriture comptable automatique (sans identité du patient).</p>
      {articles.length === 0 ? <p className="text-sm text-fg3">Aucun article en stock. Créez les articles dans Pharmacie & consommables.</p> : <>
        {lignes.map((l, i) => {
          const a = nom(l.article_id);
          return (
            <div key={i} className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto] gap-2 mb-2">
              <select aria-label="Article" className="h-10 w-full min-w-0 bg-bg3 border border-border rounded-md px-2 text-sm" value={l.article_id} onChange={e => setLignes(ls => ls.map((x, j) => j === i ? { ...x, article_id: e.target.value } : x))}>
                <option value="">Choisir un article…</option>
                {articles.map(x => <option key={x.id} value={x.id} disabled={x.quantite_stock <= 0}>{x.designation} · {x.quantite_stock} {x.unite}</option>)}
              </select>
              <Input aria-label={`Quantité${a ? ` (${a.unite})` : ''}`} inputMode="decimal" value={l.quantite} onChange={e => setLignes(ls => ls.map((x, j) => j === i ? { ...x, quantite: e.target.value } : x))} />
              <Button size="icon" variant="ghost" aria-label="Retirer la ligne" onClick={() => setLignes(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ article_id: '', quantite: '1' }])}><Trash2 /></Button>
            </div>
          );
        })}
        {erreurs.length > 0 && <p className="text-xs text-destructive mb-2">{erreurs[0]}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLignes(ls => [...ls, { article_id: '', quantite: '1' }])}><Plus />Ligne</Button>
          <Button size="sm" disabled={envoi || erreurs.length > 0 || !lignes.some(l => l.article_id)} onClick={delivrer}>{envoi ? 'Enregistrement…' : 'Délivrer'}</Button>
        </div>
      </>}
      {faites.length > 0 && <div className="mt-3 border-t border-border pt-2 space-y-1">
        {faites.map(f => <p key={f.id} className="text-sm">{nom(f.article_id)?.designation ?? 'Article'} · {f.quantite} {nom(f.article_id)?.unite ?? ''} <span className="text-xs text-fg3">· {new Date(f.created_at).toLocaleString('fr-FR')}</span></p>)}
      </div>}
    </section>
  );
}

/** Réactifs consommés automatiquement par test, à la validation technique. */
export function ReactifsParAnalyse({ structureId }: { structureId: string }) {
  const [analyses, setAnalyses] = useState<{ id: string; code: string; libelle: string }[]>([]);
  const [reactifs, setReactifs] = useState<{ id: string; nom: string; unite: string }[]>([]);
  const [liens, setLiens] = useState<{ id: string; analyse_id: string; reactif_id: string; quantite_par_test: number }[]>([]);
  const [f, setF] = useState({ analyse_id: '', reactif_id: '', q: '1' });

  const load = useCallback(async () => {
    const [a, r, l] = await Promise.all([
      supabase.from('sante_analyses').select('id, code, libelle').eq('structure_id', structureId).eq('actif', true).order('code'),
      supabase.from('sante_reactifs').select('id, nom, unite').eq('structure_id', structureId).eq('actif', true).order('nom'),
      supabase.from('sante_analyse_reactifs').select('id, analyse_id, reactif_id, quantite_par_test').eq('structure_id', structureId),
    ]);
    setAnalyses(a.data ?? []); setReactifs(r.data ?? []); setLiens(l.data ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);

  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(f.q.replace(',', '.'));
    if (!f.analyse_id || !f.reactif_id || !(q > 0)) return toast.error('Choisissez l’analyse, le réactif et une quantité > 0.');
    const { error } = await supabase.from('sante_analyse_reactifs').upsert({ structure_id: structureId, analyse_id: f.analyse_id, reactif_id: f.reactif_id, quantite_par_test: q }, { onConflict: 'analyse_id,reactif_id' });
    if (error) return void toastErreurSante(error, structureId);
    toast.success('Consommation par test enregistrée'); setF({ analyse_id: '', reactif_id: '', q: '1' }); void load();
  };
  const retirer = async (id: string) => {
    const { error } = await supabase.from('sante_analyse_reactifs').delete().eq('id', id);
    if (error) return void toastErreurSante(error, structureId);
    void load();
  };

  const an = (id: string) => analyses.find(a => a.id === id);
  const re = (id: string) => reactifs.find(r => r.id === id);
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
      <h2 className="font-semibold">Consommation automatique par analyse</h2>
      <p className="text-xs text-fg3">À chaque validation technique, les quantités ci-dessous sont déduites des lots (le plus proche de la péremption d’abord). Un manque de stock est signalé mais ne bloque jamais la validation.</p>
      <form onSubmit={ajouter} className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] gap-2">
        <select aria-label="Analyse" className="h-10 w-full min-w-0 bg-bg3 border border-border rounded-md px-2 text-sm" value={f.analyse_id} onChange={e => setF({ ...f, analyse_id: e.target.value })}>
          <option value="">Analyse…</option>{analyses.map(a => <option key={a.id} value={a.id}>{a.code} · {a.libelle}</option>)}
        </select>
        <select aria-label="Réactif" className="h-10 w-full min-w-0 bg-bg3 border border-border rounded-md px-2 text-sm" value={f.reactif_id} onChange={e => setF({ ...f, reactif_id: e.target.value })}>
          <option value="">Réactif…</option>{reactifs.map(r => <option key={r.id} value={r.id}>{r.nom} ({r.unite})</option>)}
        </select>
        <Input aria-label="Quantité par test" inputMode="decimal" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <Button size="icon" aria-label="Ajouter"><Plus /></Button>
      </form>
      {liens.length === 0 ? <p className="text-xs text-fg3">Aucune consommation paramétrée.</p> : liens.map(l => (
        <div key={l.id} className="flex items-center justify-between text-sm border-t border-border pt-2">
          <span><span className="font-mono text-xs text-primary">{an(l.analyse_id)?.code ?? '?'}</span> {an(l.analyse_id)?.libelle} → {Number(l.quantite_par_test)} {re(l.reactif_id)?.unite} de {re(l.reactif_id)?.nom ?? '?'}</span>
          <Button size="icon" variant="ghost" aria-label="Retirer" onClick={() => retirer(l.id)}><Trash2 /></Button>
        </div>
      ))}
    </section>
  );
}

/** Alertes de stock : seuils, péremptions à 30 jours, ruptures constatées. */
export function AlertesStockCard({ structureId }: { structureId: string }) {
  const [a, setA] = useState<AlertesStock | null>(null);
  useEffect(() => {
    void supabase.rpc('sante_alertes_stock', { _structure_id: structureId }).then(({ data, error }) => { if (!error) setA(data as AlertesStock); });
  }, [structureId]);
  if (!a || nombreAlertes(a) === 0) return null;
  const date = (d: string) => new Date(d).toLocaleDateString('fr-FR');
  return (
    <section className="border border-destructive/40 bg-destructive/5 rounded-md p-4 space-y-1 text-sm" role="status">
      <h2 className="font-semibold flex items-center gap-2 text-destructive"><AlertTriangle />Alertes de stock ({nombreAlertes(a)})</h2>
      {(a.articles_sous_minimum ?? []).map(x => <p key={`a${x.id}`}>Pharmacie · <strong>{x.designation}</strong> : {Number(x.stock)} {x.unite} (minimum {Number(x.minimum)})</p>)}
      {(a.reactifs_sous_seuil ?? []).map(x => <p key={`r${x.id}`}>Réactif · <strong>{x.nom}</strong> : {Number(x.stock)} {x.unite} utilisable(s) (seuil {Number(x.seuil)})</p>)}
      {(a.lots_bientot_perimes ?? []).map((x, i) => <p key={`l${i}`}>{x.peremption < new Date().toISOString().slice(0, 10) ? <strong>PÉRIMÉ — à retirer</strong> : 'Péremption'} · {x.reactif}, lot {x.lot} : {date(x.peremption)} ({Number(x.quantite)} restant)</p>)}
      {(a.ruptures_30j ?? []).map((x, i) => <p key={`x${i}`}>Rupture · {x.reactif} : {Number(x.quantite)} manquant(s) sur {x.demandes} demande(s) en 30 jours</p>)}
    </section>
  );
}
