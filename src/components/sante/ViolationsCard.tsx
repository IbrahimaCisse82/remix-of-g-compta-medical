import { saisir } from '@/components/Confirmation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Violation = { id: string; detectee_le: string; nature: string; donnees_concernees: string; nb_personnes: number | null; mesures: string | null; notifiee_cdp_le: string | null; statut: string; echeance_notification: string | null; qualification: string | null; gravite: string | null; conclusion: string | null };

const ETAPES: Record<string, { label: string; suivantes: { statut: string; bouton: string; question: string }[] }> = {
  detectee: { label: 'Détectée', suivantes: [{ statut: 'qualifiee', bouton: 'Qualifier', question: 'Qualification (cause, ampleur, risque pour les personnes) :' }] },
  qualifiee: { label: 'Qualifiée', suivantes: [
    { statut: 'notifiee', bouton: 'Notifier la CDP', question: 'Référence / modalités de la notification à la CDP :' },
    { statut: 'cloturee', bouton: 'Clôturer sans notification', question: 'Justification de l’absence de notification :' }] },
  notifiee: { label: 'Notifiée', suivantes: [{ statut: 'cloturee', bouton: 'Clôturer', question: 'Conclusion et mesures correctives :' }] },
  cloturee: { label: 'Clôturée', suivantes: [] },
};

/** Procédure de violation : détection → qualification → notification → clôture, échéance 72 h. */
export default function ViolationsCard({ structureId }: { structureId: string }) {
  const [list, setList] = useState<Violation[]>([]);
  const [form, setForm] = useState({ nature: '', donnees: '', nb: '', mesures: '' });

  const load = () => supabase.from('sante_violations').select('id, detectee_le, nature, donnees_concernees, nb_personnes, mesures, notifiee_cdp_le, statut, echeance_notification, qualification, gravite, conclusion')
    .eq('structure_id', structureId).order('detectee_le', { ascending: false }).then(({ data }) => setList((data ?? []) as Violation[]));
  useEffect(() => { load(); }, [structureId]);

  const declarer = async () => {
    if (form.nature.trim().length < 5 || form.donnees.trim().length < 3) { toast.error('Décrivez la nature et les données concernées.'); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('sante_violations').insert({
      structure_id: structureId, nature: form.nature.trim(), donnees_concernees: form.donnees.trim(),
      nb_personnes: form.nb ? Number(form.nb) : null, mesures: form.mesures.trim() || null, declare_par: u.user?.id,
      echeance_notification: new Date(Date.now() + 72 * 3600_000).toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Incident enregistré. Qualification et décision de notification sous 72 h.");
    setForm({ nature: '', donnees: '', nb: '', mesures: '' }); load();
  };

  const avancer = async (id: string, statut: string, question: string) => {
    const texte = (await saisir(question)) ?? '';
    if (!texte.trim()) return;
    const gravite = statut === 'qualifiee' ? ((await saisir('Gravité (faible / moyenne / élevée) :', 'moyenne')) ?? 'moyenne') : null;
    const { error } = await supabase.rpc('sante_avancer_violation', { _id: id, _statut: statut, _texte: texte, _gravite: gravite as string });
    if (error) toast.error(error.message); else load();
  };

  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-4 space-y-3">
      <h3 className="font-semibold">Violations de données</h3>
      <p className="text-xs text-fg3">Déclarez toute fuite, perte ou consultation anormale de données patients. Ne saisissez aucun détail médical. Échéance de notification : 72 h après détection.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Nature (ex. ordinateur volé)" value={form.nature} onChange={e => setForm({ ...form, nature: e.target.value })} />
        <Input placeholder="Données concernées (ex. identités)" value={form.donnees} onChange={e => setForm({ ...form, donnees: e.target.value })} />
        <Input type="number" min="0" placeholder="Nombre de personnes" value={form.nb} onChange={e => setForm({ ...form, nb: e.target.value })} />
        <Textarea placeholder="Mesures prises" value={form.mesures} onChange={e => setForm({ ...form, mesures: e.target.value })} />
      </div>
      <Button onClick={declarer}>Déclarer l'incident</Button>
      {list.map(v => {
        const etape = ETAPES[v.statut] ?? ETAPES.detectee;
        const retard = v.statut !== 'cloturee' && v.statut !== 'notifiee' && v.echeance_notification && new Date(v.echeance_notification) < new Date();
        return (
          <div key={v.id} className="border border-border rounded-md p-3 text-sm space-y-1">
            <div className="flex flex-wrap justify-between gap-2">
              <span>{new Date(v.detectee_le).toLocaleString('fr-FR')} · <b>{v.nature}</b> · {v.donnees_concernees}{v.nb_personnes != null && ` · ${v.nb_personnes} pers.`}</span>
              <span className="text-xs">{etape.label}{v.gravite && ` · gravité ${v.gravite}`}{retard && <b className="ml-2 text-destructive">Échéance 72 h dépassée</b>}</span>
            </div>
            {v.qualification && <p className="text-xs text-fg3">Qualification : {v.qualification}</p>}
            {v.conclusion && <p className="text-xs text-fg3">Conclusion : {v.conclusion}</p>}
            <div className="flex gap-2">{etape.suivantes.map(s => <Button key={s.statut} size="sm" variant="outline" onClick={() => avancer(v.id, s.statut, s.question)}>{s.bouton}</Button>)}</div>
          </div>
        );
      })}
    </section>
  );
}
