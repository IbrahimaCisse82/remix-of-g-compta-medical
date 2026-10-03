import { useCallback, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LIB: Record<string, string> = { envoye: 'Envoyé', echec: 'Échec', sans_fournisseur: 'Fournisseur SMS non connecté', en_attente: 'En attente' };

export default function RappelsSmsCard({ structureId }: { structureId: string }) {
  const [actifs, setActifs] = useState(false);
  const [exp, setExp] = useState('');
  const [hist, setHist] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('structures').select('rappels_sms_actifs, sms_expediteur').eq('id', structureId).maybeSingle();
    setActifs(Boolean(data?.rappels_sms_actifs)); setExp(data?.sms_expediteur ?? '');
    const { data: h } = await supabase.from('sante_rappels').select('id, statut, erreur, created_at, envoye_le').eq('structure_id', structureId).order('created_at', { ascending: false }).limit(8);
    setHist(h ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const { error } = await supabase.rpc('sante_config_rappels', { _structure_id: structureId, _actifs: actifs, _expediteur: exp });
    if (error) return toast.error(error.message);
    toast.success('Réglages enregistrés');
  };
  const envoyer = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('sante-rappels', { body: { structure_id: structureId } });
    setBusy(false);
    if (error) return toast.error(error instanceof FunctionsHttpError ? (await error.context.json().catch(() => ({}))).error ?? 'Échec' : error.message);
    toast.success(`${data.envoyes} envoyé(s), ${data.echecs} échec(s)${data.sans_fournisseur ? `, ${data.sans_fournisseur} en attente du fournisseur SMS` : ''}`);
    void load();
  };

  return (
    <section className="border border-border bg-bg2 rounded-md p-5 space-y-3">
      <div className="flex items-center gap-2"><MessageSquare className="text-primary" /><h2 className="font-semibold">Rappels de rendez-vous par SMS</h2></div>
      <p className="text-xs text-fg2">Envoyés la veille aux patients ayant un téléphone. Le message ne contient que la date, l’heure et le nom de la structure — aucune information médicale.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={actifs} onChange={e => setActifs(e.target.checked)} />Activer les rappels</label>
      <div className="flex gap-2"><Input aria-label="Numéro expéditeur" placeholder="Numéro expéditeur (+221…)" value={exp} onChange={e => setExp(e.target.value)} /><Button variant="outline" onClick={save}>Enregistrer</Button></div>
      <Button size="sm" onClick={envoyer} disabled={busy}>{busy ? 'Envoi…' : 'Envoyer les rappels de demain'}</Button>
      {hist.length > 0 && <div className="text-xs space-y-1 border-t border-border pt-2">{hist.map(h => <p key={h.id} className={h.statut === 'envoye' ? 'text-fg2' : 'text-destructive'}>{new Date(h.created_at).toLocaleString('fr-FR')} · {LIB[h.statut]}</p>)}</div>}
    </section>
  );
}
