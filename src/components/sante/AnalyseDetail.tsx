import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { referenceValide, type ReferenceSaisie } from '@/lib/catalogue-analyse';

const SECTIONS = ['biochimie', 'hematologie', 'serologie', 'bacteriologie', 'parasitologie', 'hormonologie', 'urines'];
type Analyse = { id: string; code: string; libelle: string; section: string; tube: string | null; echantillon: string | null; delai_heures: number; jeune: boolean; sensible: boolean };
type Ref = { id: string; sexe: string | null; age_min_jours: number; age_max_jours: number; bas: number | null; haut: number | null; critique_bas: number | null; critique_haut: number | null };
type Param = { id: string; code: string; libelle: string; unite: string | null; type: string; decimales: number; ordre: number; refs: Ref[] };

const REF_VIDE: ReferenceSaisie = { sexe: '', ageMin: '0', ageMax: '150', bas: '', haut: '', critiqueBas: '', critiqueHaut: '' };
const msg = (e: { message: string }) => e.message.includes('row-level') ? 'Réservé à l’administrateur ou au biologiste de la structure' : e.message;
const ans = (j: number) => Math.round(j / 365.25);

/** Fiche analyse : identité, paramètres mesurés et valeurs de référence, saisis par le biologiste. Aucune valeur proposée par le logiciel. */
export default function AnalyseDetail({ structureId, analyseId, onClose, onSaved }: { structureId: string; analyseId: string | null; onClose: () => void; onSaved: () => void }) {
  const [a, setA] = useState<Analyse | null>(null);
  const [params, setParams] = useState<Param[]>([]);
  const [busy, setBusy] = useState(false);
  const [np, setNp] = useState({ code: '', libelle: '', unite: '', type: 'numerique', decimales: '1' });
  const [refs, setRefs] = useState<Record<string, ReferenceSaisie>>({});

  const load = useCallback(async () => {
    if (!analyseId) return;
    const [x, p] = await Promise.all([
      supabase.from('sante_analyses').select('id, code, libelle, section, tube, echantillon, delai_heures, jeune, sensible').eq('id', analyseId).single(),
      supabase.from('sante_analyse_parametres').select('id, code, libelle, unite, type, decimales, ordre, refs:sante_valeurs_reference(id, sexe, age_min_jours, age_max_jours, bas, haut, critique_bas, critique_haut)').eq('analyse_id', analyseId).order('ordre'),
    ]);
    if (x.error || p.error) { toast.error('Fiche analyse indisponible. Réessayez.'); return; }
    setA(x.data as Analyse); setParams((p.data ?? []) as unknown as Param[]);
  }, [analyseId]);
  useEffect(() => { setA(null); setParams([]); void load(); }, [load]);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    if (busy) return false; setBusy(true);
    try { const { error } = await fn(); if (error) { toast.error(msg(error)); return false; } toast.success(ok); await load(); onSaved(); return true; }
    finally { setBusy(false); }
  };

  const saveIdentite = async (e: React.FormEvent) => {
    e.preventDefault(); if (!a) return;
    if (!a.libelle.trim()) return toast.error('Libellé obligatoire');
    if (!Number.isSafeInteger(a.delai_heures) || a.delai_heures <= 0) return toast.error('Délai de rendu positif obligatoire');
    await run(async () => supabase.from('sante_analyses').update({ libelle: a.libelle.trim(), section: a.section, tube: a.tube?.trim() || null, echantillon: a.echantillon?.trim() || null, delai_heures: a.delai_heures, jeune: a.jeune, sensible: a.sensible }).eq('id', a.id), 'Analyse mise à jour');
  };
  const addParam = async (e: React.FormEvent) => {
    e.preventDefault(); if (!a) return;
    const d = Number(np.decimales);
    if (!np.code.trim() || !np.libelle.trim()) return toast.error('Code et libellé du paramètre obligatoires');
    if (!Number.isInteger(d) || d < 0 || d > 4) return toast.error('Décimales entre 0 et 4');
    const ordre = params.reduce((m, p) => Math.max(m, p.ordre), 0) + 1;
    if (await run(async () => supabase.from('sante_analyse_parametres').insert({ structure_id: structureId, analyse_id: a.id, code: np.code.trim().toUpperCase(), libelle: np.libelle.trim(), unite: np.unite.trim() || null, type: np.type, decimales: d, ordre }), 'Paramètre ajouté'))
      setNp({ code: '', libelle: '', unite: '', type: 'numerique', decimales: '1' });
  };
  const addRef = async (p: Param) => {
    const r = referenceValide(refs[p.id] ?? REF_VIDE);
    if ('erreur' in r) return toast.error(r.erreur);
    if (await run(async () => supabase.from('sante_valeurs_reference').insert({ structure_id: structureId, parametre_id: p.id, ...r.valeur }), 'Valeur de référence ajoutée'))
      setRefs({ ...refs, [p.id]: REF_VIDE });
  };
  const delRef = (id: string) => run(async () => supabase.from('sante_valeurs_reference').delete().eq('id', id), 'Valeur de référence supprimée');

  return <Dialog open={!!analyseId} onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{a ? <><span className="font-mono text-primary">{a.code}</span> · {a.libelle}</> : 'Chargement…'}</DialogTitle></DialogHeader>
      {a && <div className="space-y-6">
        <form onSubmit={saveIdentite} className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label htmlFor="an-libelle">Libellé</Label><Input id="an-libelle" value={a.libelle} onChange={e => setA({ ...a, libelle: e.target.value })} /></div>
          <div><Label htmlFor="an-section">Section</Label><select id="an-section" className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={a.section} onChange={e => setA({ ...a, section: e.target.value })}>{SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><Label htmlFor="an-delai">Délai de rendu (heures)</Label><Input id="an-delai" inputMode="numeric" value={a.delai_heures} onChange={e => setA({ ...a, delai_heures: Number(e.target.value) })} /></div>
          <div><Label htmlFor="an-tube">Tube</Label><Input id="an-tube" value={a.tube ?? ''} onChange={e => setA({ ...a, tube: e.target.value })} /></div>
          <div><Label htmlFor="an-echantillon">Échantillon</Label><Input id="an-echantillon" value={a.echantillon ?? ''} onChange={e => setA({ ...a, echantillon: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.jeune} onChange={e => setA({ ...a, jeune: e.target.checked })} />À jeun requis</label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={a.sensible} onChange={e => setA({ ...a, sensible: e.target.checked })} /><span>Résultat sensible<br /><span className="text-xs text-fg3">Jamais publié sur le portail patient : remise en main propre uniquement (ex. VIH, grossesse). À confirmer par le biologiste.</span></span></label>
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>Enregistrer l’analyse</Button></div>
        </form>

        <section className="space-y-3">
          <h3 className="font-semibold text-sm">Paramètres mesurés</h3>
          {params.length === 0 && <p className="text-xs text-fg3">Aucun paramètre : l’analyse ne peut pas être activée tant qu’au moins un paramètre n’est pas saisi.</p>}
          {params.map(p => { const f = refs[p.id] ?? REF_VIDE; const set = (k: keyof ReferenceSaisie, v: string) => setRefs({ ...refs, [p.id]: { ...f, [k]: v } });
            return <div key={p.id} className="border border-border rounded-md p-3 space-y-2">
              <p className="text-sm"><span className="font-mono text-xs text-primary">{p.code}</span> {p.libelle} <span className="text-xs text-fg3">· {p.unite || 'sans unité'} · {p.type === 'numerique' ? `nombre, ${p.decimales} déc.` : p.type === 'qualitatif' ? 'positif / négatif' : 'texte'}</span></p>
              {p.type === 'numerique' && <>
                {p.refs.length === 0 ? <p className="text-xs text-fg3">Aucune valeur de référence.</p> :
                  <ul className="space-y-1">{p.refs.map(r => <li key={r.id} className="flex items-center justify-between text-xs border border-border rounded px-2 py-1">
                    <span>{r.sexe ?? 'Tous'} · {ans(r.age_min_jours)}–{ans(r.age_max_jours)} ans · normal {r.bas ?? '—'} à {r.haut ?? '—'}{(r.critique_bas != null || r.critique_haut != null) && <> · critique &lt; {r.critique_bas ?? '—'} / &gt; {r.critique_haut ?? '—'}</>}</span>
                    <Button size="sm" variant="ghost" aria-label="Supprimer la valeur de référence" disabled={busy} onClick={() => void delRef(r.id)}><Trash2 /></Button></li>)}</ul>}
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-end">
                  <select aria-label={`Sexe ${p.code}`} className="h-9 rounded-md border border-border bg-background px-2 text-xs" value={f.sexe} onChange={e => set('sexe', e.target.value)}><option value="">Tous</option><option value="M">Homme</option><option value="F">Femme</option></select>
                  <Input aria-label={`Âge minimum ${p.code}`} className="h-9" placeholder="Âge min (ans)" value={f.ageMin} onChange={e => set('ageMin', e.target.value)} />
                  <Input aria-label={`Âge maximum ${p.code}`} className="h-9" placeholder="Âge max (ans)" value={f.ageMax} onChange={e => set('ageMax', e.target.value)} />
                  <Input aria-label={`Borne basse ${p.code}`} className="h-9" placeholder="Bas" value={f.bas} onChange={e => set('bas', e.target.value)} />
                  <Input aria-label={`Borne haute ${p.code}`} className="h-9" placeholder="Haut" value={f.haut} onChange={e => set('haut', e.target.value)} />
                  <Input aria-label={`Critique bas ${p.code}`} className="h-9" placeholder="Critique bas" value={f.critiqueBas} onChange={e => set('critiqueBas', e.target.value)} />
                  <Input aria-label={`Critique haut ${p.code}`} className="h-9" placeholder="Critique haut" value={f.critiqueHaut} onChange={e => set('critiqueHaut', e.target.value)} />
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void addRef(p)}><Plus />Ajouter la valeur de référence</Button>
              </>}
            </div>; })}
          <form onSubmit={addParam} className="grid grid-cols-2 sm:grid-cols-5 gap-2 border-t border-border pt-3">
            <Input aria-label="Code du paramètre" placeholder="Code" value={np.code} onChange={e => setNp({ ...np, code: e.target.value })} />
            <Input aria-label="Libellé du paramètre" className="sm:col-span-2" placeholder="Libellé du paramètre" value={np.libelle} onChange={e => setNp({ ...np, libelle: e.target.value })} />
            <Input aria-label="Unité du paramètre" placeholder="Unité" value={np.unite} onChange={e => setNp({ ...np, unite: e.target.value })} />
            <select aria-label="Type du paramètre" className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={np.type} onChange={e => setNp({ ...np, type: e.target.value })}><option value="numerique">Nombre</option><option value="qualitatif">Positif / négatif</option><option value="texte">Texte</option></select>
            {np.type === 'numerique' && <Input aria-label="Décimales" placeholder="Décimales" value={np.decimales} onChange={e => setNp({ ...np, decimales: e.target.value })} />}
            <Button type="submit" size="sm" className="sm:col-span-2" disabled={busy}><Plus />Ajouter le paramètre</Button>
          </form>
        </section>
      </div>}
    </DialogContent>
  </Dialog>;
}
