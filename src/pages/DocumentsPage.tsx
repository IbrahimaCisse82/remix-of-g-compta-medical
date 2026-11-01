import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Doc {
  id: string;
  nom: string;
  storage_path: string;
  mime_type: string | null;
  taille_octets: number | null;
  categorie: string | null;
  description: string | null;
  ref_type: string;
  ref_id: string | null;
  tags: string[] | null;
  created_at: string;
}

const CATEGORIES = ['facture', 'contrat', 'bordereau', 'releve', 'justificatif', 'autre'];
const REF_TYPES = ['autre', 'journal', 'facture', 'facture_achat', 'immobilisation', 'bulletin', 'echeance'];

function fmtSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

export default function DocumentsPage() {
  const { entreprise, exercice, demo } = useApp();
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [meta, setMeta] = useState({ categorie: 'justificatif', description: '', ref_type: 'autre' });

  const load = useCallback(async () => {
    if (!entreprise || demo) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('entreprise_id', entreprise.id)
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else setDocs((data as Doc[]) || []);
    setLoading(false);
  }, [entreprise, demo]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!entreprise || !user) return;
    if (demo) { toast.info('Mode démo — upload désactivé'); return; }
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const path = `${entreprise.id}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('ged').upload(path, file);
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from('documents').insert({
        entreprise_id: entreprise.id,
        exercice_id: exercice?.id,
        ref_type: meta.ref_type,
        nom: file.name,
        storage_path: path,
        mime_type: file.type,
        taille_octets: file.size,
        categorie: meta.categorie,
        description: meta.description || null,
        uploaded_by: user.id,
      });
      if (dbErr) throw dbErr;

      toast.success('Document ajouté');
      setMeta(m => ({ ...m, description: '' }));
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const download = async (d: Doc) => {
    const { data, error } = await supabase.storage.from('ged').createSignedUrl(d.storage_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const remove = async (d: Doc) => {
    if (!confirm(`Supprimer « ${d.nom} » ?`)) return;
    await supabase.storage.from('ged').remove([d.storage_path]);
    await supabase.from('documents').delete().eq('id', d.id);
    toast.success('Supprimé');
    load();
  };

  const filtered = docs.filter(d => {
    if (filter && !d.nom.toLowerCase().includes(filter.toLowerCase())) return false;
    if (catFilter && d.categorie !== catFilter) return false;
    return true;
  });

  const totalSize = docs.reduce((s, d) => s + (d.taille_octets || 0), 0);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">📁 GED — Documents</div>
        <div className="text-[10px] text-fg3 font-mono">
          {docs.length} document(s) · {fmtSize(totalSize)}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {demo && <div className="px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-bold">⚡ Mode démo — GED désactivée</div>}

        {/* Upload */}
        <div className="bg-bg2 border border-border rounded-lg p-4">
          <div className="text-xs font-bold text-primary mb-3">📤 Déposer un document</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">Catégorie</label>
              <select value={meta.categorie} onChange={e => setMeta({ ...meta, categorie: e.target.value })}
                className="w-full bg-bg3 border border-border rounded-md px-2 py-1.5 text-xs mt-1">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">Rattachement</label>
              <select value={meta.ref_type} onChange={e => setMeta({ ...meta, ref_type: e.target.value })}
                className="w-full bg-bg3 border border-border rounded-md px-2 py-1.5 text-xs mt-1">
                {REF_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">Description</label>
              <input value={meta.description} onChange={e => setMeta({ ...meta, description: e.target.value })}
                placeholder="Optionnel"
                className="w-full bg-bg3 border border-border rounded-md px-2 py-1.5 text-xs mt-1" />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold cursor-pointer hover:opacity-90">
            {uploading ? 'Upload…' : '📎 Sélectionner un fichier'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading || demo} />
          </label>
        </div>

        {/* Filters */}
        <div className="flex gap-2 items-center">
          <input placeholder="🔍 Recherche" value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-bg3 border border-border rounded-md px-2.5 py-1.5 text-xs flex-1 max-w-xs" />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="bg-bg3 border border-border rounded-md px-2.5 py-1.5 text-xs">
            <option value="">Toutes catégories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-bg3">
              <tr className="text-fg3 uppercase text-[9px] font-mono tracking-wider">
                <th className="p-2 text-left">Nom</th>
                <th className="p-2 text-left">Catégorie</th>
                <th className="p-2 text-left">Rattachement</th>
                <th className="p-2 text-right">Taille</th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="p-4 text-center text-fg3">Chargement…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-fg3">Aucun document</td></tr>
              )}
              {filtered.map(d => (
                <tr key={d.id} className="border-t border-border hover:bg-bg3/50">
                  <td className="p-2">
                    <div className="font-semibold text-foreground">{d.nom}</div>
                    {d.description && <div className="text-[10px] text-fg3">{d.description}</div>}
                  </td>
                  <td className="p-2"><span className="px-2 py-0.5 rounded-xl bg-primary/10 text-primary text-[10px] font-bold">{d.categorie || '—'}</span></td>
                  <td className="p-2 text-fg2">{d.ref_type}</td>
                  <td className="p-2 text-right font-mono">{fmtSize(d.taille_octets)}</td>
                  <td className="p-2 text-fg2 font-mono text-[10px]">{new Date(d.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="p-2 text-right space-x-1">
                    <button onClick={() => download(d)} className="px-2 py-0.5 rounded text-[10px] border border-border hover:bg-bg3">⬇</button>
                    <button onClick={() => remove(d)} className="px-2 py-0.5 rounded text-[10px] border border-destructive/30 text-destructive hover:bg-destructive/10">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
