import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/** Accès d'urgence au dossier clinique : motif obligatoire, 1 h, tracé et signalé aux administrateurs. */
export function BrisGlaceButton({ patientId, onOpened }: { patientId: string; onOpened: () => void }) {
  const ouvrir = async () => {
    const motif = window.prompt("Accès d'urgence (1 heure, tracé et signalé à l'administrateur).\nMotif obligatoire :") ?? '';
    if (!motif.trim()) return;
    const { error } = await supabase.rpc('sante_bris_de_glace', { _patient_id: patientId, _motif: motif });
    if (error) { toast.error(error.message); return; }
    toast.success("Accès d'urgence ouvert pour 1 heure.");
    onOpened();
  };
  return <Button size="sm" variant="outline" className="mt-2" onClick={ouvrir}><ShieldAlert />Accès d'urgence</Button>;
}

type Acces = { id: string; motif: string; created_at: string; expire_le: string; revu_le: string | null; user_id: string; patient: { numero_dossier: string } | null };
type Acte = { code: string; libelle: string };

/** Réglages administrateur : facturation automatique + revue des accès d'urgence. */
export function SecuriteFacturationCard({ structureId }: { structureId: string }) {
  const [acces, setAcces] = useState<Acces[]>([]);
  const [actes, setActes] = useState<Acte[]>([]);
  const [auto, setAuto] = useState(false);
  const [acte, setActe] = useState('');

  const load = async () => {
    const [b, a, s] = await Promise.all([
      supabase.from('sante_bris_glace').select('id, motif, created_at, expire_le, revu_le, user_id, patient:sante_patients(numero_dossier)').eq('structure_id', structureId).order('created_at', { ascending: false }).limit(30),
      supabase.from('sante_actes').select('code, libelle').eq('structure_id', structureId).eq('actif', true),
      supabase.from('structures').select('facturation_auto, acte_consultation_code').eq('id', structureId).maybeSingle(),
    ]);
    setAcces((b.data ?? []) as Acces[]); setActes(a.data ?? []);
    setAuto(Boolean(s.data?.facturation_auto)); setActe(s.data?.acte_consultation_code ?? '');
  };
  useEffect(() => { void load(); }, [structureId]);

  const enregistrer = async () => {
    const { error } = await supabase.rpc('sante_config_facturation', { _structure_id: structureId, _auto: auto, _acte_code: acte || null });
    if (error) toast.error(error.message); else toast.success('Réglage enregistré.');
  };
  const revoir = async (id: string) => {
    const { error } = await supabase.rpc('sante_revoir_bris_glace', { _id: id });
    if (error) toast.error(error.message); else void load();
  };

  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-4 space-y-4">
      <div className="space-y-2">
        <h3 className="font-semibold">Facturation automatique</h3>
        <p className="text-xs text-fg3">Si activée : une facture est créée à la clôture de chaque consultation (acte choisi) et à la validation de chaque demande d'analyses. La prise en charge active du patient est appliquée.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Activer</label>
        <select aria-label="Acte de consultation" className="bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={acte} onChange={e => setActe(e.target.value)}>
          <option value="">— Acte facturé à la clôture —</option>
          {actes.map(a => <option key={a.code} value={a.code}>{a.libelle}</option>)}
        </select>
        <div><Button size="sm" onClick={enregistrer}>Enregistrer</Button></div>
      </div>
      <div className="border-t border-border pt-3">
        <h3 className="font-semibold mb-2">Accès d'urgence aux dossiers</h3>
        {acces.length === 0 ? <p className="text-xs text-fg3">Aucun accès d'urgence.</p> : acces.map(a => (
          <div key={a.id} className="flex flex-wrap justify-between gap-2 text-sm border border-border rounded-md p-2 mb-1">
            <span>{new Date(a.created_at).toLocaleString('fr-FR')} · dossier {a.patient?.numero_dossier ?? '—'} · « {a.motif} »</span>
            {a.revu_le ? <span className="text-xs text-fg3">Revu le {new Date(a.revu_le).toLocaleDateString('fr-FR')}</span>
              : <Button size="sm" variant="outline" onClick={() => revoir(a.id)}>Marquer revu (ferme l'accès)</Button>}
          </div>
        ))}
      </div>
    </section>
  );
}
