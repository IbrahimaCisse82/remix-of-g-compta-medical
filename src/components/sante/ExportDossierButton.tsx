import { toast } from 'sonner';
import { toastErreurSante } from '@/lib/sante-acces';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { telecharger } from './BrisGlace';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

/** Droit d'accès : export complet du dossier (données structurées + version imprimable A4), tracé en base. */
export default function ExportDossierButton({ patientId, numero }: { patientId: string; numero: string }) {
  const exporter = async () => {
    const { data, error } = await supabase.rpc('sante_export_dossier', { _patient_id: patientId });
    if (error) { void toastErreurSante(error); return; }
    const d = data as Record<string, unknown>;
    telecharger(`dossier-${numero}.json`, JSON.stringify(d, null, 2), 'application/json');
    const w = window.open('', '_blank'); if (!w) return;
    const sections = Object.entries(d).filter(([k]) => !['genere_le', 'genere_par'].includes(k)).map(([k, v]) => {
      const rows = Array.isArray(v) ? v : v ? [v] : [];
      const body = rows.length ? rows.map(r => `<pre>${esc(JSON.stringify(r, null, 1))}</pre>`).join('') : '<p>—</p>';
      return `<h2>${esc(k.replace('_', ' '))}</h2>${body}`;
    }).join('');
    w.document.write(`<html><head><title>Dossier ${esc(numero)}</title><style>@page{size:A4;margin:15mm}body{font-family:sans-serif;font-size:11px}h1{font-size:16px}h2{font-size:13px;border-bottom:1px solid #999;text-transform:capitalize}pre{white-space:pre-wrap;font-size:10px;margin:4px 0}</style></head><body><h1>Export du dossier ${esc(numero)} — droit d'accès</h1><p>Généré le ${new Date().toLocaleString('fr-FR')}</p>${sections}<script>print()</script></body></html>`);
    toast.success('Export généré et tracé dans le journal des accès.');
  };
  return <Button size="sm" variant="outline" className="mt-2 ml-2" onClick={exporter}><Download />Export droit d'accès</Button>;
}
