import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Violation = { id: string; detectee_le: string; nature: string; donnees_concernees: string; nb_personnes: number | null; mesures: string | null; notifiee_cdp_le: string | null };

/** Registre des violations de données de santé (déclaration par tout membre, lecture par l'administrateur). */
export default function ViolationsCard({ structureId }: { structureId: string }) {
  const [list, setList] = useState<Violation[]>([]);
  const [form, setForm] = useState({ nature: '', donnees: '', nb: '', mesures: '' });

  const load = () => supabase.from('sante_violations').select('id, detectee_le, nature, donnees_concernees, nb_personnes, mesures, notifiee_cdp_le')
    .eq('structure_id', structureId).order('detectee_le', { ascending: false }).then(({ data }) => setList(data ?? []));
  useEffect(() => { load(); }, [structureId]);

  const declarer = async () => {
    if (form.nature.trim().length < 5 || form.donnees.trim().length < 3) { toast.error('Décrivez la nature et les données concernées.'); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('sante_violations').insert({
      structure_id: structureId, nature: form.nature.trim(), donnees_concernees: form.donnees.trim(),
      nb_personnes: form.nb ? Number(form.nb) : null, mesures: form.mesures.trim() || null, declare_par: u.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Incident enregistré. L\'administrateur doit évaluer la notification à la CDP.');
    setForm({ nature: '', donnees: '', nb: '', mesures: '' }); load();
  };

  const notifier = async (id: string) => {
    const { error } = await supabase.from('sante_violations').update({ notifiee_cdp_le: new Date().toISOString() }).eq('id', id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-4 space-y-3">
      <h3 className="font-semibold">Registre des violations de données</h3>
      <p className="text-xs text-fg3">Déclarez toute fuite, perte ou consultation anormale de données patients. Ne saisissez aucun détail médical.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Nature (ex. ordinateur volé)" value={form.nature} onChange={e => setForm({ ...form, nature: e.target.value })} />
        <Input placeholder="Données concernées (ex. identités)" value={form.donnees} onChange={e => setForm({ ...form, donnees: e.target.value })} />
        <Input type="number" min="0" placeholder="Nombre de personnes" value={form.nb} onChange={e => setForm({ ...form, nb: e.target.value })} />
        <Textarea placeholder="Mesures prises" value={form.mesures} onChange={e => setForm({ ...form, mesures: e.target.value })} />
      </div>
      <Button onClick={declarer}>Déclarer l'incident</Button>
      {list.map(v => (
        <div key={v.id} className="border border-border rounded-md p-3 text-sm flex flex-wrap justify-between gap-2">
          <span>{new Date(v.detectee_le).toLocaleString('fr-FR')} · <b>{v.nature}</b> · {v.donnees_concernees}{v.nb_personnes != null && ` · ${v.nb_personnes} pers.`}</span>
          {v.notifiee_cdp_le ? <span className="text-xs text-fg3">CDP notifiée le {new Date(v.notifiee_cdp_le).toLocaleDateString('fr-FR')}</span>
            : <Button size="sm" variant="outline" onClick={() => notifier(v.id)}>Marquer notifiée à la CDP</Button>}
        </div>
      ))}
    </section>
  );
}
