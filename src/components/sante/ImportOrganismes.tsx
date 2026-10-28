import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cleOrganisme, lireOrganismesCsv } from '@/lib/organismes-import';

export default function ImportOrganismes({ structureId, onImported }: { structureId: string; onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ReturnType<typeof lireOrganismesCsv> | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lire = async (file: File) => {
    setPreview(null); setError(''); setBusy(true);
    try {
      const r = await supabase.from('sante_organismes').select('nom').eq('structure_id', structureId);
      if (r.error) throw r.error;
      setPreview(lireOrganismesCsv(await file.text(), (r.data ?? []).map(o => o.nom)));
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const importer = async () => {
    if (!preview || busy || preview.erreurs.length) return;
    setBusy(true); setError('');
    try {
      // Relire avant insertion : ne jamais écraser une fiche créée depuis la prévisualisation.
      const current = await supabase.from('sante_organismes').select('nom').eq('structure_id', structureId);
      if (current.error) throw current.error;
      const keys = new Set((current.data ?? []).map(o => cleOrganisme(o.nom)));
      const rows = preview.rows.filter(o => !keys.has(cleOrganisme(o.nom)));
      if (rows.length) {
        const r = await supabase.from('sante_organismes').insert(rows.map(o => ({ ...o, structure_id: structureId })));
        if (r.error) throw r.error;
      }
      toast.success(`${rows.length} organisme(s) enregistré(s)`); setPreview(null); onImported();
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3">
    <input ref={input} aria-label="Fichier des organismes payeurs" type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void lire(file); e.target.value = ''; }} />
    <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />Importer les organismes (CSV)</Button>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    {preview && <div className="space-y-2 border-y border-border py-3">
      <p className="text-sm">{preview.rows.length} à ajouter · {preview.ignores} déjà présent(s) ou répété(s)</p>
      {preview.erreurs.length > 0 && <ul role="alert" className="text-destructive text-sm">{preview.erreurs.map(e => <li key={e}>{e}</li>)}</ul>}
      <div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Organisme</th><th className="text-left">Type</th></tr></thead><tbody>{preview.rows.map(o => <tr className="border-t border-border" key={o.nom}><td className="py-2">{o.nom}</td><td>{o.type}</td></tr>)}</tbody></table></div>
      <div className="flex gap-2"><Button disabled={busy || !preview.rows.length || !!preview.erreurs.length} onClick={() => void importer()}>Confirmer l’import</Button><Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>Annuler</Button></div>
    </div>}
  </div>;
}