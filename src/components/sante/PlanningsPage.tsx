import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { messageErreur } from '@/lib/erreurs';

const TYPES = ['poste', 'garde', 'astreinte', 'conge', 'absence', 'formation'] as const;
const STATUTS: Record<string, string> = { prevu: 'Prévu', effectue: 'Effectué', annule: 'Annulé' };

type Membre = { id: string; nom: string };
type Planning = {
  id: string; membership_id: string | null; type: string; debut: string; fin: string;
  statut: string; note: string | null; valide_le: string | null;
};

const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} FCFA`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Plannings, gardes et astreintes de l'équipe. Écriture réservée à l'administrateur de structure (RLS). */
export default function PlanningsPage({ structureId }: { structureId: string }) {
  const [mois, setMois] = useState(() => new Date().toISOString().slice(0, 7));
  const [membres, setMembres] = useState<Membre[]>([]);
  const [plannings, setPlannings] = useState<Planning[]>([]);
  const [forfaits, setForfaits] = useState({ garde: '', astreinte: '' });
  const [f, setF] = useState({ membership_id: '', type: 'poste' as string, debut: '', fin: '', note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const debut = `${mois}-01T00:00:00Z`;
    const finMois = new Date(`${mois}-01T00:00:00Z`);
    finMois.setUTCMonth(finMois.getUTCMonth() + 1);
    const [m, p, pf] = await Promise.all([
      supabase.from('structure_memberships').select('id, profiles(full_name, email)').eq('structure_id', structureId).eq('statut', 'actif'),
      supabase.from('sante_plannings').select('id, membership_id, type, debut, fin, statut, note, valide_le').eq('structure_id', structureId)
        .gte('debut', debut).lt('debut', finMois.toISOString()).order('debut'),
      supabase.from('sante_personnel_parametres').select('forfait_garde, forfait_astreinte').eq('structure_id', structureId).maybeSingle(),
    ]);
    setMembres((m.data ?? []).map((x: any) => ({ id: x.id, nom: x.profiles?.full_name || x.profiles?.email || 'Membre' })));
    setPlannings(p.data ?? []);
    if (pf.data) setForfaits({ garde: String(pf.data.forfait_garde || ''), astreinte: String(pf.data.forfait_astreinte || '') });
  }, [structureId, mois]);

  useEffect(() => { void load(); }, [load]);

  const nomMembre = useMemo(() => {
    const map = new Map(membres.map(m => [m.id, m.nom]));
    return (id: string | null) => (id && map.get(id)) || '—';
  }, [membres]);

  const ajouter = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!f.membership_id || !f.debut || !f.fin) return;
    setSaving(true);
    const { error } = await supabase.from('sante_plannings').insert({
      structure_id: structureId, membership_id: f.membership_id, type: f.type,
      debut: new Date(f.debut).toISOString(), fin: new Date(f.fin).toISOString(), note: f.note || null,
    });
    setSaving(false);
    if (error) toast.error(messageErreur(error));
    else { setF({ membership_id: '', type: 'poste', debut: '', fin: '', note: '' }); toast.success('Plage ajoutée.'); await load(); }
  };

  const changerStatut = async (id: string, statut: 'effectue' | 'annule') => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('sante_plannings').update(
      statut === 'effectue'
        ? { statut, valide_par: u.user?.id ?? null, valide_le: new Date().toISOString() }
        : { statut },
    ).eq('id', id);
    if (error) toast.error(messageErreur(error));
    else { toast.success(statut === 'effectue' ? 'Plage marquée effectuée.' : 'Plage annulée.'); await load(); }
  };

  const sauverForfaits = async () => {
    const { error } = await supabase.from('sante_personnel_parametres').upsert({
      structure_id: structureId, forfait_garde: Number(forfaits.garde || 0), forfait_astreinte: Number(forfaits.astreinte || 0), updated_at: new Date().toISOString(),
    }, { onConflict: 'structure_id' });
    if (error) toast.error(messageErreur(error));
    else toast.success('Forfaits enregistrés.');
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-mono uppercase text-primary mb-1">Équipe</p><h1 className="font-serif text-3xl">Plannings et gardes</h1></div>
        <div><Label htmlFor="mois" className="sr-only">Mois</Label><Input id="mois" type="month" value={mois} onChange={e => setMois(e.target.value)} className="w-40" /></div>
      </div>

      <section className="border border-border bg-bg2 rounded-md p-5">
        <div className="flex items-center gap-2 mb-4"><Plus className="text-primary" /><h2 className="font-semibold">Ajouter une plage</h2></div>
        <form onSubmit={ajouter} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={f.membership_id} onValueChange={v => setF({ ...f, membership_id: v })}>
            <SelectTrigger aria-label="Membre"><SelectValue placeholder="Membre" /></SelectTrigger>
            <SelectContent>{membres.map(m => <SelectItem key={m.id} value={m.id}>{m.nom}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={f.type} onValueChange={v => setF({ ...f, type: v })}>
            <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
          </Select>
          <div><Label htmlFor="p-debut" className="sr-only">Début</Label><Input id="p-debut" type="datetime-local" required value={f.debut} onChange={e => setF({ ...f, debut: e.target.value })} /></div>
          <div><Label htmlFor="p-fin" className="sr-only">Fin</Label><Input id="p-fin" type="datetime-local" required value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} /></div>
          <div className="flex gap-2"><Input placeholder="Note (optionnel)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /><Button type="submit" disabled={saving}>{saving ? '…' : 'Ajouter'}</Button></div>
        </form>
      </section>

      <section className="border border-border bg-bg2 rounded-md p-5">
        <div className="flex items-center gap-2 mb-4"><CalendarClock className="text-primary" /><h2 className="font-semibold">Plages du mois</h2></div>
        {plannings.length === 0 ? <p className="text-xs text-fg3">Aucune plage ce mois-ci.</p> : (
          <div className="space-y-2">
            {plannings.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 border border-border rounded-md p-3 text-sm">
                <span className="font-medium">{nomMembre(p.membership_id)}</span>
                <span className="capitalize text-fg2">{p.type}</span>
                <span className="text-fg3 text-xs">{fmtDate(p.debut)} → {fmtDate(p.fin)}</span>
                {p.note && <span className="text-xs text-fg3 italic">{p.note}</span>}
                <span className={`ml-auto text-xs ${p.statut === 'effectue' ? 'text-primary' : p.statut === 'annule' ? 'text-destructive' : 'text-fg3'}`}>{STATUTS[p.statut] ?? p.statut}</span>
                {p.statut === 'prevu' && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => void changerStatut(p.id, 'effectue')}><Check />Effectué</Button>
                    <Button size="sm" variant="ghost" onClick={() => void changerStatut(p.id, 'annule')}><X />Annuler</Button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-border bg-bg2 rounded-md p-5 max-w-xl">
        <h2 className="font-semibold mb-4">Forfaits garde et astreinte</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="f-garde">Forfait garde (FCFA)</Label><Input id="f-garde" type="number" min={0} value={forfaits.garde} onChange={e => setForfaits({ ...forfaits, garde: e.target.value })} /></div>
          <div><Label htmlFor="f-astreinte">Forfait astreinte (FCFA)</Label><Input id="f-astreinte" type="number" min={0} value={forfaits.astreinte} onChange={e => setForfaits({ ...forfaits, astreinte: e.target.value })} /></div>
        </div>
        <Button className="mt-3" onClick={() => void sauverForfaits()}>Enregistrer les forfaits</Button>
        <p className="text-xs text-fg3 mt-2">Ces montants servent au lien avec la paie. Exemple : garde {fcfa(Number(forfaits.garde || 0))}.</p>
      </section>
    </div>
  );
}
