import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import { calcPlan, compteAmortFrom, compteDotationFrom, comptesCession, natureImmo, type Immo } from '@/lib/amortissement';
import { enregistrerLignesJournal } from '@/lib/ecritures';

type ImmoRow = Immo & {
  id: string;
  entreprise_id: string;
  categorie: string;
  compte_immo: string;
  compte_amort: string | null;
  compte_dotation: string | null;
  notes: string | null;
};

const empty = (): Partial<ImmoRow> => ({
  code: '', libelle: '', categorie: 'corporelle',
  compte_immo: '2441', compte_amort: '2841', compte_dotation: '6813',
  date_acquisition: new Date().toISOString().slice(0, 10),
  date_mise_service: new Date().toISOString().slice(0, 10),
  valeur_origine: 0, valeur_residuelle: 0,
  duree_annees: 5, mode_amortissement: 'lineaire', statut: 'actif',
});

export default function ImmobilisationsPage() {
  const { entreprise, exercice } = useApp();
  const { canWrite, canDelete } = useUserRole();
  const [items, setItems] = useState<ImmoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<ImmoRow>>(empty());
  const [planFor, setPlanFor] = useState<ImmoRow | null>(null);

  const load = async () => {
    if (!entreprise) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('immobilisations').select('*')
      .eq('entreprise_id', entreprise.id)
      .order('code');
    if (error) toast.error(error.message);
    else setItems((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entreprise?.id]);

  const save = async () => {
    if (!entreprise || !canWrite) return;
    if (!form.code || !form.libelle || !form.compte_immo) {
      toast.error('Code, libellé et compte requis');
      return;
    }
    const payload: any = {
      entreprise_id: entreprise.id,
      code: form.code,
      libelle: form.libelle,
      categorie: form.categorie || natureImmo(form.compte_immo),
      compte_immo: form.compte_immo,
      compte_amort: form.compte_amort || compteAmortFrom(form.compte_immo),
      compte_dotation: form.compte_dotation || compteDotationFrom(form.compte_immo),
      date_acquisition: form.date_acquisition,
      date_mise_service: form.date_mise_service || form.date_acquisition,
      valeur_origine: Number(form.valeur_origine || 0),
      valeur_residuelle: Number(form.valeur_residuelle || 0),
      duree_annees: Number(form.duree_annees || 5),
      mode_amortissement: form.mode_amortissement || 'lineaire',
      statut: form.statut || 'actif',
      date_cession: form.date_cession || null,
      prix_cession: form.prix_cession ? Number(form.prix_cession) : null,
      notes: form.notes || null,
    };
    let res;
    if (form.id) res = await supabase.from('immobilisations').update(payload).eq('id', form.id);
    else res = await supabase.from('immobilisations').insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success('Immobilisation enregistrée'); setShowForm(false); setForm(empty()); load(); }
  };

  const remove = async (id: string) => {
    if (!canDelete || !confirm('Supprimer cette immobilisation ?')) return;
    const { error } = await supabase.from('immobilisations').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Supprimée'); load(); }
  };

  const edit = (it: ImmoRow) => { setForm(it); setShowForm(true); };

  // Comptabiliser dotation année courante → journal OD
  const comptabiliserDotation = async (it: ImmoRow) => {
    if (!exercice || !canWrite) return;
    const annee = exercice.annee;
    const plan = calcPlan(it);
    const row = plan.find(p => p.annee === annee);
    if (!row || row.dotation <= 0) { toast.error("Aucune dotation pour l'exercice"); return; }
    const piece = `DOT-${it.code}-${annee}`;
    const date = exercice.date_fin;
    const lines = [
      {
        entreprise_id: entreprise!.id, exercice_id: exercice.id,
        date_ecriture: date, piece, journal_code: 'OD',
        libelle: `Dotation amortissement ${it.code} ${it.libelle}`,
        compte: it.compte_dotation || '6813', intitule: 'Dotations aux amortissements',
        debit: row.dotation, credit: 0,
      },
      {
        entreprise_id: entreprise!.id, exercice_id: exercice.id,
        date_ecriture: date, piece, journal_code: 'OD',
        libelle: `Dotation amortissement ${it.code} ${it.libelle}`,
        compte: it.compte_amort || compteAmortFrom(it.compte_immo),
        intitule: 'Amortissements', debit: 0, credit: row.dotation,
      },
    ];
    try {
      await enregistrerLignesJournal(lines as any, { origine: 'immobilisation' });
      toast.success(`Dotation ${fmt(row.dotation)} comptabilisée (pièce ${piece})`);
    } catch (e) { toast.error((e as Error).message); }
  };

  // Comptabiliser CESSION d'immobilisation (SYSCOHADA HAO)
  const comptabiliserCession = async (it: ImmoRow) => {
    if (!exercice || !entreprise || !canWrite) return;
    if (!it.date_cession || it.prix_cession == null) {
      toast.error('Renseignez date et prix de cession dans la fiche'); return;
    }
    const prix = Number(it.prix_cession);
    const vo = Number(it.valeur_origine);
    // cumul amortissements à la date de cession (jusqu'à année de cession incluse)
    const anneeCession = new Date(it.date_cession).getFullYear();
    const plan = calcPlan(it);
    const cumul = plan.filter(p => p.annee <= anneeCession).reduce((s, p) => s + p.dotation, 0);
    const vnc = vo - cumul;
    const compteAmort = it.compte_amort || compteAmortFrom(it.compte_immo);
    const cc = comptesCession(it.compte_immo);
    const piece = `CES-${it.code}-${anneeCession}`;
    const lines: any[] = [
      // 1. Sortie de l'immobilisation : 81X DEBIT VNC + 28XX DEBIT cumul = 2XX CREDIT valeur origine
      { entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: it.date_cession,
        piece, journal_code: 'OD', libelle: `Sortie immo ${it.code} (VCEAC)`,
        compte: cc.vnc, intitule: cc.vncLibelle,
        debit: Math.round(vnc), credit: 0 },
      { entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: it.date_cession,
        piece, journal_code: 'OD', libelle: `Annulation amortissements ${it.code}`,
        compte: compteAmort, intitule: 'Amortissements cumulés',
        debit: Math.round(cumul), credit: 0 },
      { entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: it.date_cession,
        piece, journal_code: 'OD', libelle: `Sortie ${it.code} ${it.libelle}`,
        compte: it.compte_immo, intitule: 'Immobilisation cédée',
        debit: 0, credit: Math.round(vo) },
      // 2. Encaissement / créance sur cession : 485 DEBIT prix = 82X CREDIT prix
      { entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: it.date_cession,
        piece, journal_code: 'OD', libelle: `Créance sur cession ${it.code}`,
        compte: '485', intitule: 'Créances sur cessions d\'immobilisations',
        debit: Math.round(prix), credit: 0 },
      { entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: it.date_cession,
        piece, journal_code: 'OD', libelle: `Produit cession ${it.code}`,
        compte: cc.produit, intitule: cc.produitLibelle,
        debit: 0, credit: Math.round(prix) },
    ];
    try {
      await enregistrerLignesJournal(lines as any, { origine: 'cession_immo' });
    } catch (e) { toast.error((e as Error).message); return; }
    await supabase.from('immobilisations').update({ statut: 'cede' }).eq('id', it.id);
    const pmv = prix - vnc;
    toast.success(`Cession comptabilisée (${piece}). ${pmv >= 0 ? 'Plus' : 'Moins'}-value HAO : ${fmt(Math.abs(pmv))} FCFA`);
    load();
  };


  const totals = useMemo(() => {
    const annee = exercice?.annee || new Date().getFullYear();
    let vo = 0, dot = 0, cumul = 0, vnc = 0;
    items.forEach(it => {
      vo += Number(it.valeur_origine || 0);
      const p = calcPlan(it).find(p => p.annee === annee);
      if (p) { dot += p.dotation; cumul = Math.max(cumul, p.cumul); vnc += p.vnc; }
    });
    return { vo, dot, vnc, count: items.length };
  }, [items, exercice]);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">🏭 Immobilisations & Amortissements</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-fg3 font-mono">{items.length} bien(s)</span>
          {canWrite && (
            <button onClick={() => { setForm(empty()); setShowForm(true); }}
              className="px-3 py-1 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90">
              + Nouvelle immo
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Synthèse */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Valeur d'origine" value={fmt(totals.vo)} />
          <Stat label={`Dotation ${exercice?.annee || ''}`} value={fmt(totals.dot)} />
          <Stat label="VNC fin de période" value={fmt(totals.vnc)} />
          <Stat label="Nb biens" value={String(totals.count)} />
        </div>

        {/* Tableau */}
        <div className="bg-bg2 border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-bg3 text-fg3">
              <tr>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Libellé</th>
                <th className="text-left p-2">Compte</th>
                <th className="text-right p-2">Val. origine</th>
                <th className="text-center p-2">Durée</th>
                <th className="text-center p-2">Mode</th>
                <th className="text-right p-2">Dot. {exercice?.annee}</th>
                <th className="text-right p-2">VNC</th>
                <th className="text-center p-2">Statut</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center p-6 text-fg3">Chargement…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={10} className="text-center p-6 text-fg3">Aucune immobilisation</td></tr>
              )}
              {items.map(it => {
                const p = exercice ? calcPlan(it).find(p => p.annee === exercice.annee) : null;
                return (
                  <tr key={it.id} className="border-t border-border hover:bg-bg3/50">
                    <td className="p-2 font-mono">{it.code}</td>
                    <td className="p-2">{it.libelle}</td>
                    <td className="p-2 font-mono text-[10px]">{it.compte_immo}</td>
                    <td className="p-2 text-right font-mono">{fmt(it.valeur_origine)}</td>
                    <td className="p-2 text-center">{it.duree_annees} ans</td>
                    <td className="p-2 text-center text-[10px]">{it.mode_amortissement}</td>
                    <td className="p-2 text-right font-mono text-primary">{p ? fmt(p.dotation) : '—'}</td>
                    <td className="p-2 text-right font-mono">{p ? fmt(p.vnc) : '—'}</td>
                    <td className="p-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        it.statut === 'actif' ? 'bg-accent/20 text-accent' :
                        it.statut === 'cede' ? 'bg-purple/20 text-purple' :
                        'bg-destructive/20 text-destructive'
                      }`}>{it.statut}</span>
                    </td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => setPlanFor(it)} title="Plan d'amortissement"
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">📊</button>
                      {canWrite && <button onClick={() => comptabiliserDotation(it)} title="Comptabiliser dotation"
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">💾</button>}
                      {canWrite && it.statut !== 'cede' && it.date_cession && (
                        <button onClick={() => comptabiliserCession(it)} title="Comptabiliser cession HAO"
                          className="text-[10px] px-2 py-1 rounded border border-purple-500/40 text-purple-500 hover:bg-purple-500/10">💸</button>
                      )}
                      {canWrite && <button onClick={() => edit(it)}
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">✏️</button>}
                      {canDelete && <button onClick={() => remove(it.id)}
                        className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10">🗑</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={form.id ? 'Modifier' : 'Nouvelle immobilisation'}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Code"><input className="inp" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Libellé"><input className="inp" value={form.libelle || ''} onChange={e => setForm({ ...form, libelle: e.target.value })} /></Field>
            <Field label="Catégorie">
              <select className="inp" value={form.categorie || 'corporelle'} onChange={e => setForm({ ...form, categorie: e.target.value })}>
                <option value="incorporelle">Incorporelle</option>
                <option value="corporelle">Corporelle</option>
                <option value="financiere">Financière</option>
              </select>
            </Field>
            <Field label="Compte immo (2XX)"><input className="inp" value={form.compte_immo || ''} onChange={e => setForm({ ...form, compte_immo: e.target.value, compte_amort: compteAmortFrom(e.target.value), compte_dotation: compteDotationFrom(e.target.value) })} /></Field>
            <Field label="Compte amortissement (28XX)"><input className="inp" value={form.compte_amort || ''} onChange={e => setForm({ ...form, compte_amort: e.target.value })} /></Field>
            <Field label="Compte dotation (681X)"><input className="inp" value={form.compte_dotation || compteDotationFrom(form.compte_immo || '')} onChange={e => setForm({ ...form, compte_dotation: e.target.value })} /></Field>
            <Field label="Date acquisition"><input type="date" className="inp" value={form.date_acquisition || ''} onChange={e => setForm({ ...form, date_acquisition: e.target.value })} /></Field>
            <Field label="Date mise en service"><input type="date" className="inp" value={form.date_mise_service || ''} onChange={e => setForm({ ...form, date_mise_service: e.target.value })} /></Field>
            <Field label="Valeur d'origine (FCFA)"><input type="number" className="inp" value={form.valeur_origine || 0} onChange={e => setForm({ ...form, valeur_origine: Number(e.target.value) })} /></Field>
            <Field label="Valeur résiduelle"><input type="number" className="inp" value={form.valeur_residuelle || 0} onChange={e => setForm({ ...form, valeur_residuelle: Number(e.target.value) })} /></Field>
            <Field label="Durée (années)"><input type="number" step="0.5" className="inp" value={form.duree_annees || 5} onChange={e => setForm({ ...form, duree_annees: Number(e.target.value) })} /></Field>
            <Field label="Mode">
              <select className="inp" value={form.mode_amortissement || 'lineaire'} onChange={e => setForm({ ...form, mode_amortissement: e.target.value as any })}>
                <option value="lineaire">Linéaire</option>
                <option value="degressif">Dégressif</option>
              </select>
            </Field>
            <Field label="Statut">
              <select className="inp" value={form.statut || 'actif'} onChange={e => setForm({ ...form, statut: e.target.value as any })}>
                <option value="actif">Actif</option>
                <option value="cede">Cédé</option>
                <option value="rebute">Rebuté</option>
              </select>
            </Field>
            {form.statut === 'cede' && <>
              <Field label="Date cession"><input type="date" className="inp" value={form.date_cession || ''} onChange={e => setForm({ ...form, date_cession: e.target.value })} /></Field>
              <Field label="Prix cession"><input type="number" className="inp" value={form.prix_cession || 0} onChange={e => setForm({ ...form, prix_cession: Number(e.target.value) })} /></Field>
            </>}
            <div className="col-span-2"><Field label="Notes"><textarea className="inp" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={save} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}

      {/* Plan d'amortissement */}
      {planFor && (
        <Modal onClose={() => setPlanFor(null)} title={`Plan d'amortissement — ${planFor.code} ${planFor.libelle}`}>
          <table className="w-full text-xs">
            <thead className="bg-bg3 text-fg3">
              <tr>
                <th className="p-2 text-left">Année</th>
                <th className="p-2 text-right">Dotation</th>
                <th className="p-2 text-right">Cumul</th>
                <th className="p-2 text-right">VNC</th>
              </tr>
            </thead>
            <tbody>
              {calcPlan(planFor).map(r => (
                <tr key={r.annee} className="border-t border-border">
                  <td className="p-2 font-mono">{r.annee}</td>
                  <td className="p-2 text-right font-mono">{fmt(r.dotation)}</td>
                  <td className="p-2 text-right font-mono">{fmt(r.cumul)}</td>
                  <td className="p-2 text-right font-mono">{fmt(r.vnc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      <style>{`.inp{width:100%;padding:6px 8px;background:hsl(var(--bg3));border:1px solid hsl(var(--border));border-radius:4px;color:hsl(var(--foreground));font-size:11px;}`}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-fg3 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold text-foreground font-mono mt-1">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-fg3 mb-1">{label}</span>
      {children}
    </label>
  );
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
