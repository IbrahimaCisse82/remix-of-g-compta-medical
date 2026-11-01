import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import { calculerMouvement, valeurStock, compterRuptures, lignesEcritureStock, variationValeur, compteDeprecStock, lignesDepreciationStock } from '@/lib/stocks';
import { enregistrerLignesJournal } from '@/lib/ecritures';

type Article = {
  id: string;
  entreprise_id: string;
  code: string;
  designation: string;
  unite: string;
  methode_valorisation: 'CUMP';
  compte_stock: string;
  compte_achat: string;
  compte_vente: string;
  compte_variation: string;
  prix_achat_moyen: number;
  quantite_stock: number;
  stock_minimum: number;
  actif: boolean;
};

type Mvt = {
  id: string;
  article_id: string;
  date_mvt: string;
  type_mvt: 'entree' | 'sortie' | 'inventaire' | 'ajustement';
  reference: string | null;
  quantite: number;
  prix_unitaire: number;
  montant: number;
  cump_apres: number;
  qte_apres: number;
  notes: string | null;
};

const emptyArticle = (): Partial<Article> => ({
  code: '', designation: '', unite: 'U', methode_valorisation: 'CUMP',
  compte_stock: '311', compte_achat: '601', compte_vente: '701', compte_variation: '6031',
  prix_achat_moyen: 0, quantite_stock: 0, stock_minimum: 0, actif: true,
});

export default function StocksPage() {
  const { entreprise, exercice } = useApp();
  const [articles, setArticles] = useState<Article[]>([]);
  const [mvts, setMvts] = useState<Mvt[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Article>>(emptyArticle());
  const [showMvt, setShowMvt] = useState(false);
  const [showDep, setShowDep] = useState(false);
  const [depForm, setDepForm] = useState({ valeur_realisation: 0, date: new Date().toISOString().slice(0, 10) });
  const [mvtForm, setMvtForm] = useState({
    type_mvt: 'entree' as Mvt['type_mvt'], date_mvt: new Date().toISOString().slice(0, 10),
    reference: '', quantite: 0, prix_unitaire: 0, notes: '',
  });

  const load = useCallback(async () => {
    if (!entreprise) return;
    setLoading(true);
    const { data, error } = await supabase.from('articles').select('*')
      .eq('entreprise_id', entreprise.id).order('code');
    if (error) toast.error(error.message);
    else setArticles((data || []).map((a: any) => ({
      ...a,
      prix_achat_moyen: Number(a.prix_achat_moyen),
      quantite_stock: Number(a.quantite_stock),
      stock_minimum: Number(a.stock_minimum),
    })));
    setLoading(false);
  }, [entreprise]);

  useEffect(() => { load(); }, [load]);

  const loadMvts = async (articleId: string) => {
    const { data } = await supabase.from('mouvements_stock').select('*')
      .eq('article_id', articleId).order('date_mvt', { ascending: false });
    setMvts((data || []).map((m: any) => ({
      ...m,
      quantite: Number(m.quantite), prix_unitaire: Number(m.prix_unitaire),
      montant: Number(m.montant), cump_apres: Number(m.cump_apres), qte_apres: Number(m.qte_apres),
    })));
  };

  const saveArticle = async () => {
    if (!entreprise || !form.code || !form.designation) {
      toast.error('Code et désignation requis'); return;
    }
    const payload = { ...form, entreprise_id: entreprise.id };
    const res = form.id
      ? await supabase.from('articles').update(payload).eq('id', form.id)
      : await supabase.from('articles').insert(payload as any);
    if (res.error) toast.error(res.error.message);
    else { toast.success('Article enregistré'); setShowForm(false); setForm(emptyArticle()); load(); }
  };

  const saveMvt = async () => {
    if (!selected || !entreprise) return;
    let calc;
    try {
      calc = calculerMouvement({
        type: mvtForm.type_mvt,
        stockAvant: selected.quantite_stock,
        cumpAvant: selected.prix_achat_moyen,
        quantite: Number(mvtForm.quantite),
        prixUnitaire: Number(mvtForm.prix_unitaire),
      });
    } catch (e) { toast.error((e as Error).message); return; }
    const qte = Number(mvtForm.quantite);
    const { qteApres, cumpApres, montant, prixUtilise } = calc;

    const { error } = await supabase.from('mouvements_stock').insert({
      entreprise_id: entreprise.id,
      exercice_id: exercice?.id,
      article_id: selected.id,
      date_mvt: mvtForm.date_mvt,
      type_mvt: mvtForm.type_mvt,
      reference: mvtForm.reference,
      quantite: qte,
      prix_unitaire: prixUtilise,
      montant,
      cump_apres: cumpApres,
      qte_apres: qteApres,
      notes: mvtForm.notes,
    });
    if (error) { toast.error(error.message); return; }

    await supabase.from('articles')
      .update({ quantite_stock: qteApres, prix_achat_moyen: cumpApres })
      .eq('id', selected.id);

    // Inventaire permanent : chaque mouvement génère son écriture 3XX / 603X
    if (exercice) {
      const variation = variationValeur(selected.quantite_stock, selected.prix_achat_moyen, qteApres, cumpApres);
      const lignes = lignesEcritureStock({
        type: mvtForm.type_mvt,
        compteStock: selected.compte_stock,
        compteVariation: selected.compte_variation,
        designation: selected.designation,
        montant: variation,
      });
      if (lignes.length) {
        const piece = mvtForm.reference || `STK-${selected.code}-${mvtForm.date_mvt}`;
        try {
          await enregistrerLignesJournal(lignes.map(l => ({
            entreprise_id: entreprise.id,
            exercice_id: exercice.id,
            date_ecriture: mvtForm.date_mvt,
            piece,
            journal_code: 'OD',
            libelle: `Mouvement stock ${selected.code} — ${mvtForm.type_mvt}`,
            compte: l.compte,
            intitule: l.intitule,
            debit: l.debit,
            credit: l.credit,
          })), { origine: 'stock' });
        } catch (e: any) {
          toast.error(`Mouvement enregistré, écriture refusée : ${e.message}`);
        }
      }
    }

    toast.success('Mouvement enregistré et comptabilisé');
    setShowMvt(false);
    setMvtForm({ type_mvt: 'entree', date_mvt: new Date().toISOString().slice(0, 10), reference: '', quantite: 0, prix_unitaire: 0, notes: '' });
    await load();
    const refreshed = (await supabase.from('articles').select('*').eq('id', selected.id).single()).data;
    if (refreshed) setSelected({ ...refreshed, prix_achat_moyen: Number(refreshed.prix_achat_moyen), quantite_stock: Number(refreshed.quantite_stock), stock_minimum: Number(refreshed.stock_minimum) } as Article);
    loadMvts(selected.id);
  };

  // Dépréciation SYSCOHADA : ajuste 39X par dotation 6593 ou reprise 7593
  const enregistrerDepreciation = async () => {
    if (!selected || !entreprise || !exercice) return;
    const valeurComptable = Math.round(selected.quantite_stock * selected.prix_achat_moyen);
    const compteDeprec = compteDeprecStock(selected.compte_stock);
    const { data: existant } = await supabase
      .from('journal')
      .select('debit, credit')
      .eq('entreprise_id', entreprise.id)
      .eq('exercice_id', exercice.id)
      .eq('compte', compteDeprec);
    const deprecExistante = (existant || []).reduce((s, l: any) => s + Number(l.credit || 0) - Number(l.debit || 0), 0);
    const lignes = lignesDepreciationStock({
      compteStock: selected.compte_stock,
      designation: selected.designation,
      valeurComptable,
      valeurRealisation: Number(depForm.valeur_realisation || 0),
      deprecExistante,
    });
    if (!lignes.length) { toast.info('Dépréciation déjà au niveau requis — aucune écriture'); setShowDep(false); return; }
    const piece = `DEP-${selected.code}-${depForm.date}`;
    try {
      await enregistrerLignesJournal(lignes.map(l => ({
        entreprise_id: entreprise.id,
        exercice_id: exercice.id,
        date_ecriture: depForm.date,
        piece,
        journal_code: 'OD',
        libelle: `Dépréciation stock ${selected.code}`,
        compte: l.compte,
        intitule: l.intitule,
        debit: l.debit,
        credit: l.credit,
      })), { origine: 'depreciation_stock' });
      toast.success(`Dépréciation comptabilisée (pièce ${piece})`);
      setShowDep(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    if (!confirm('Supprimer cet article ?')) return;
    const { error } = await supabase.from('articles').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Supprimé'); load(); }
  };

  const totals = useMemo(() => ({
    count: articles.length,
    valeur: valeurStock(articles),
    alerteRupture: compterRuptures(articles),
  }), [articles]);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">📦 Gestion des Stocks (CUMP — inventaire permanent)</div>
        <button onClick={() => { setForm(emptyArticle()); setShowForm(true); }}
          className="px-3 py-1 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90">
          + Nouvel article
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Nb articles" value={String(totals.count)} />
          <Stat label="Valeur du stock (FCFA)" value={fmt(totals.valeur)} />
          <Stat label="Ruptures (≤ stock min)" value={String(totals.alerteRupture)} color={totals.alerteRupture > 0 ? 'text-red-500' : ''} />
          <Stat label="Exercice" value={String(exercice?.annee || '—')} />
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-bg3 text-fg3">
              <tr>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Désignation</th>
                <th className="text-center p-2">Unité</th>
                <th className="text-center p-2">Méthode</th>
                <th className="text-left p-2">Compte stock</th>
                <th className="text-right p-2">Stock</th>
                <th className="text-right p-2">CUMP</th>
                <th className="text-right p-2">Valeur</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center p-6 text-fg3">Chargement…</td></tr>}
              {!loading && articles.length === 0 && (
                <tr><td colSpan={9} className="text-center p-6 text-fg3">Aucun article</td></tr>
              )}
              {articles.map(a => {
                const rupture = a.quantite_stock <= a.stock_minimum;
                return (
                  <tr key={a.id} className={`border-t border-border hover:bg-bg3/50 ${rupture ? 'bg-red-500/5' : ''}`}>
                    <td className="p-2 font-mono">{a.code}</td>
                    <td className="p-2">{a.designation}</td>
                    <td className="p-2 text-center text-fg2">{a.unite}</td>
                    <td className="p-2 text-center"><span className="text-[10px] px-2 py-0.5 rounded bg-bg3 font-mono">{a.methode_valorisation}</span></td>
                    <td className="p-2 font-mono text-[10px]">{a.compte_stock}</td>
                    <td className={`p-2 text-right font-mono ${rupture ? 'text-red-500 font-bold' : ''}`}>
                      {a.quantite_stock.toFixed(2)}{rupture && ' ⚠'}
                    </td>
                    <td className="p-2 text-right font-mono">{fmt(a.prix_achat_moyen)}</td>
                    <td className="p-2 text-right font-mono text-primary">{fmt(a.quantite_stock * a.prix_achat_moyen)}</td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => { setSelected(a); loadMvts(a.id); }}
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">📊 Mvt</button>
                      <button onClick={() => { setSelected(a); setShowMvt(true); }}
                        className="text-[10px] px-2 py-1 rounded border border-primary text-primary hover:bg-primary/10">+ Mvt</button>
                      <button onClick={() => { setSelected(a); setDepForm({ valeur_realisation: Math.round(a.quantite_stock * a.prix_achat_moyen), date: new Date().toISOString().slice(0, 10) }); setShowDep(true); }}
                        className="text-[10px] px-2 py-1 rounded border border-amber-500/50 text-amber-500 hover:bg-amber-500/10" title="Dépréciation (valeur nette de réalisation)">📉</button>
                      <button onClick={() => { setForm(a); setShowForm(true); }}
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">✏️</button>
                      <button onClick={() => remove(a.id)}
                        className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Historique mvts */}
        {selected && mvts.length > 0 && (
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-serif text-sm">📊 Mouvements — {selected.code} {selected.designation}</h3>
              <button onClick={() => { setSelected(null); setMvts([]); }} className="text-fg3 text-xs">✕</button>
            </div>
            <table className="w-full text-[11px]">
              <thead className="bg-bg3 text-fg3">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Réf</th>
                  <th className="text-right p-2">Qté</th>
                  <th className="text-right p-2">PU</th>
                  <th className="text-right p-2">Montant</th>
                  <th className="text-right p-2">CUMP après</th>
                  <th className="text-right p-2">Qté après</th>
                </tr>
              </thead>
              <tbody>
                {mvts.map(m => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-2 font-mono">{m.date_mvt}</td>
                    <td className="p-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        m.type_mvt === 'entree' ? 'bg-emerald-500/20 text-emerald-500' :
                        m.type_mvt === 'sortie' ? 'bg-red-500/20 text-red-500' :
                        'bg-blue-500/20 text-blue-500'
                      }`}>{m.type_mvt}</span>
                    </td>
                    <td className="p-2 font-mono text-fg2">{m.reference || '—'}</td>
                    <td className="p-2 text-right font-mono">{m.quantite.toFixed(2)}</td>
                    <td className="p-2 text-right font-mono">{fmt(m.prix_unitaire)}</td>
                    <td className="p-2 text-right font-mono">{fmt(m.montant)}</td>
                    <td className="p-2 text-right font-mono text-primary">{fmt(m.cump_apres)}</td>
                    <td className="p-2 text-right font-mono">{m.qte_apres.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Formulaire article */}
      {showForm && (
        <Modal title={form.id ? 'Modifier article' : 'Nouvel article'} onClose={() => setShowForm(false)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Code"><input className="inp" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Désignation"><input className="inp" value={form.designation || ''} onChange={e => setForm({ ...form, designation: e.target.value })} /></Field>
            <Field label="Unité"><input className="inp" value={form.unite || 'U'} onChange={e => setForm({ ...form, unite: e.target.value })} /></Field>
            <Field label="Méthode">
              <select className="inp" value={form.methode_valorisation || 'CUMP'} onChange={e => setForm({ ...form, methode_valorisation: e.target.value as any })}>
                <option value="CUMP">CUMP (Coût Unitaire Moyen Pondéré)</option>
              </select>
            </Field>
            <Field label="Compte stock (31X/32X/33X)"><input className="inp" value={form.compte_stock || '311'} onChange={e => setForm({ ...form, compte_stock: e.target.value })} /></Field>
            <Field label="Compte achat (60X)"><input className="inp" value={form.compte_achat || '601'} onChange={e => setForm({ ...form, compte_achat: e.target.value })} /></Field>
            <Field label="Compte vente (70X)"><input className="inp" value={form.compte_vente || '701'} onChange={e => setForm({ ...form, compte_vente: e.target.value })} /></Field>
            <Field label="Compte variation (603X)"><input className="inp" value={form.compte_variation || '6031'} onChange={e => setForm({ ...form, compte_variation: e.target.value })} /></Field>
            <Field label="Stock initial"><input type="number" step="0.01" className="inp" value={form.quantite_stock || 0} onChange={e => setForm({ ...form, quantite_stock: Number(e.target.value) })} /></Field>
            <Field label="PU initial"><input type="number" step="0.01" className="inp" value={form.prix_achat_moyen || 0} onChange={e => setForm({ ...form, prix_achat_moyen: Number(e.target.value) })} /></Field>
            <Field label="Stock minimum"><input type="number" step="0.01" className="inp" value={form.stock_minimum || 0} onChange={e => setForm({ ...form, stock_minimum: Number(e.target.value) })} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={saveArticle} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}

      {/* Mouvement */}
      {showMvt && selected && (
        <Modal title={`Mouvement — ${selected.code} ${selected.designation}`} onClose={() => setShowMvt(false)}>
          <div className="text-[11px] text-fg2 mb-3">
            Stock actuel : <span className="font-mono font-bold text-foreground">{selected.quantite_stock.toFixed(2)} {selected.unite}</span>
            {' · '}CUMP : <span className="font-mono font-bold text-primary">{fmt(selected.prix_achat_moyen)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Type">
              <select className="inp" value={mvtForm.type_mvt} onChange={e => setMvtForm({ ...mvtForm, type_mvt: e.target.value as any })}>
                <option value="entree">Entrée (achat)</option>
                <option value="sortie">Sortie (vente/conso)</option>
                <option value="inventaire">Inventaire (constat)</option>
                <option value="ajustement">Ajustement</option>
              </select>
            </Field>
            <Field label="Date"><input type="date" className="inp" value={mvtForm.date_mvt} onChange={e => setMvtForm({ ...mvtForm, date_mvt: e.target.value })} /></Field>
            <Field label="Référence"><input className="inp" value={mvtForm.reference} onChange={e => setMvtForm({ ...mvtForm, reference: e.target.value })} placeholder="ex: BL-001, FAC-2026-005" /></Field>
            <Field label="Quantité"><input type="number" step="0.01" className="inp" value={mvtForm.quantite} onChange={e => setMvtForm({ ...mvtForm, quantite: Number(e.target.value) })} /></Field>
            {mvtForm.type_mvt !== 'sortie' && (
              <Field label="Prix unitaire"><input type="number" step="0.01" className="inp" value={mvtForm.prix_unitaire} onChange={e => setMvtForm({ ...mvtForm, prix_unitaire: Number(e.target.value) })} /></Field>
            )}
            <div className="col-span-2"><Field label="Notes"><textarea className="inp" rows={2} value={mvtForm.notes} onChange={e => setMvtForm({ ...mvtForm, notes: e.target.value })} /></Field></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowMvt(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={saveMvt} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Valider</button>
          </div>
        </Modal>
      )}

      {showDep && selected && (
        <Modal title={`📉 Dépréciation — ${selected.code} ${selected.designation}`} onClose={() => setShowDep(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valeur comptable (CUMP × quantité)">
              <input className="inp" disabled value={fmt(Math.round(selected.quantite_stock * selected.prix_achat_moyen))} />
            </Field>
            <Field label="Valeur nette de réalisation">
              <input type="number" className="inp" value={depForm.valeur_realisation}
                onChange={e => setDepForm({ ...depForm, valeur_realisation: Number(e.target.value) })} />
            </Field>
            <Field label="Date">
              <input type="date" className="inp" value={depForm.date} onChange={e => setDepForm({ ...depForm, date: e.target.value })} />
            </Field>
          </div>
          <p className="text-[10px] text-fg3 mt-3">
            Une dotation (6593) est passée si la valeur de réalisation est inférieure au coût, une reprise (7593) si la dépréciation antérieure devient excessive.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowDep(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={enregistrerDepreciation} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Comptabiliser</button>
          </div>
        </Modal>
      )}


      <style>{`.inp{width:100%;padding:6px 8px;background:hsl(var(--bg3));border:1px solid hsl(var(--border));border-radius:4px;color:hsl(var(--foreground));font-size:11px;}`}</style>
    </div>
  );
}

function Stat({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-fg3 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold font-mono mt-1 ${color || 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] text-fg3 mb-1">{label}</span>{children}</label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-xl p-5 max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-base text-foreground">{title}</h3>
          <button onClick={onClose} className="text-fg3 hover:text-foreground">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
