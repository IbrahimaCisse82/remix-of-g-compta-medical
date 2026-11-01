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

/** Personne planifiable : salarié de la paie (employee_id) ou membre de la structure (membership_id). */
type Personne = { cle: string; employee_id: string | null; membership_id: string | null; nom: string; fonction: string };
type Recap = { forfait_garde: number; forfait_astreinte: number; personnes: { nom: string; employee_id: string | null; gardes: number; astreintes: number; a_valider?: number; prime_gardes: number }[] };
type Planning = {
  id: string; membership_id: string | null; employee_id: string | null; type: string; debut: string; fin: string;
  statut: string; note: string | null; valide_le: string | null;
};

const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} FCFA`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Plannings, gardes et astreintes de l'équipe. Écriture réservée à l'administrateur de structure (RLS). */
export default function PlanningsPage({ structureId }: { structureId: string }) {
  const [mois, setMois] = useState(() => new Date().toISOString().slice(0, 7));
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [plannings, setPlannings] = useState<Planning[]>([]);
  const [forfaits, setForfaits] = useState({ garde: '', astreinte: '' });
  const [f, setF] = useState({ personne: '', type: 'poste' as string, debut: '', fin: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const debut = `${mois}-01T00:00:00Z`;
    const finMois = new Date(`${mois}-01T00:00:00Z`);
    finMois.setUTCMonth(finMois.getUTCMonth() + 1);
    const [annee, moisNum] = mois.split('-').map(Number);
    const [m, p, pf, r] = await Promise.all([
      supabase.rpc('sante_personnel_liste', { _structure_id: structureId }),
      supabase.from('sante_plannings').select('id, membership_id, employee_id, type, debut, fin, statut, note, valide_le').eq('structure_id', structureId)
        .gt('fin', debut).lt('debut', finMois.toISOString()).order('debut'),
      supabase.from('sante_personnel_parametres').select('forfait_garde, forfait_astreinte').eq('structure_id', structureId).maybeSingle(),
      supabase.rpc('sante_recap_personnel', { _structure_id: structureId, _annee: annee, _mois: moisNum }),
    ]);
    if (m.error || p.error || pf.error) { setError('Impossible de charger les plannings.'); return; }
    setError('');
    // Salariés de la paie (gardes payées sur le bulletin) puis membres de la structure (hors paie).
    setPersonnes((m.data ?? []).map(x => ({ cle: x.employee_id ? `e:${x.employee_id}` : `m:${x.membership_id}`, employee_id: x.employee_id, membership_id: x.membership_id, nom: x.nom, fonction: x.fonction })));
    // Récapitulatif réservé à l'administrateur et au comptable : absent pour les autres rôles.
    setRecap(r.error ? null : (r.data as unknown as Recap));
    setPlannings(p.data ?? []);
    if (pf.data) setForfaits({ garde: String(pf.data.forfait_garde || ''), astreinte: String(pf.data.forfait_astreinte || '') });
  }, [structureId, mois]);

  useEffect(() => { void load(); }, [load]);

  const nomPersonne = useMemo(() => {
    const map = new Map(personnes.map(x => [x.cle, x.nom]));
    return (pl: Pick<Planning, 'employee_id' | 'membership_id'>) =>
      map.get(pl.employee_id ? `e:${pl.employee_id}` : `m:${pl.membership_id}`) || '—';
  }, [personnes]);

  const ajouter = async (event: React.FormEvent) => {
    event.preventDefault();
    const pers = personnes.find(x => x.cle === f.personne);
    if (!pers || !f.debut || !f.fin) return void toast.error('Choisissez la personne, le début et la fin.');
    if (saving) return;
    if (new Date(f.fin).getTime() <= new Date(f.debut).getTime()) return toast.error('La fin doit être postérieure au début.');
    setSaving(true);
    const { error } = await supabase.from('sante_plannings').insert({
      structure_id: structureId, employee_id: pers.employee_id, membership_id: pers.membership_id, type: f.type,
      debut: new Date(f.debut).toISOString(), fin: new Date(f.fin).toISOString(), note: f.note || null,
    });
    setSaving(false);
    if (error) toast.error(messageErreur(error));
    else { setF({ personne: '', type: 'poste', debut: '', fin: '', note: '' }); toast.success('Plage ajoutée.'); await load(); }
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
    if (saving) return;
    if (![forfaits.garde, forfaits.astreinte].every(v => Number.isSafeInteger(Number(v)) && Number(v) >= 0)) return toast.error('Forfaits FCFA entiers positifs ou nuls requis.');
    const { error } = await supabase.from('sante_personnel_parametres').upsert({
      structure_id: structureId, forfait_garde: Number(forfaits.garde || 0), forfait_astreinte: Number(forfaits.astreinte || 0), updated_at: new Date().toISOString(),
    }, { onConflict: 'structure_id' });
    if (error) toast.error(messageErreur(error));
    else toast.success('Forfaits enregistrés.');
  };

  return (
    <div className="max-w-6xl space-y-6">
      {error && <div role="alert" className="text-destructive">{error}<Button variant="outline" onClick={() => void load()}>Réessayer</Button></div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-mono uppercase text-primary mb-1">Équipe</p><h1 className="font-serif text-3xl">Plannings et gardes</h1></div>
        <div><Label htmlFor="mois" className="sr-only">Mois</Label><Input id="mois" type="month" value={mois} onChange={e => setMois(e.target.value)} className="w-40" /></div>
      </div>

      <section className="border border-border bg-bg2 rounded-md p-5">
        <div className="flex items-center gap-2 mb-4"><Plus className="text-primary" /><h2 className="font-semibold">Ajouter une plage</h2></div>
        <form onSubmit={ajouter} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={f.personne} onValueChange={v => setF({ ...f, personne: v })}>
            <SelectTrigger aria-label="Personne"><SelectValue placeholder="Personne" /></SelectTrigger>
            <SelectContent>{personnes.map(x => <SelectItem key={x.cle} value={x.cle}>{x.nom}{x.employee_id ? ' · salarié' : ' · hors paie'}</SelectItem>)}</SelectContent>
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
                <span className="font-medium">{nomPersonne(p)}{!p.employee_id && (p.type === 'garde' || p.type === 'astreinte') && <span className="text-xs text-fg3 font-normal"> · hors paie</span>}</span>
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

      {recap && (
        <section className="border border-border bg-bg2 rounded-md p-5">
          <h2 className="font-semibold mb-1">Récapitulatif du mois et primes transmises à la paie</h2>
          <p className="text-xs text-fg3 mb-3">Seules les gardes et astreintes marquées « effectuées » et rattachées à un salarié de la paie sont ajoutées au brut de son bulletin (Paie, même mois). Un membre « hors paie » doit d'abord être créé comme salarié dans la Paie de l'entreprise liée.</p>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-fg3"><tr><th className="p-2 text-left">Personne</th><th className="text-right">Gardes</th><th className="text-right">Astreintes</th><th className="p-2 text-right">Prime (paie)</th></tr></thead>
            <tbody>{recap.personnes.length === 0 ? <tr><td colSpan={4} className="p-3 text-center text-fg3">Aucune plage effectuée ce mois-ci.</td></tr> : recap.personnes.map((x, i) => (
              <tr key={i} className="border-t border-border"><td className="p-2">{x.nom}{!x.employee_id && <span className="text-xs text-fg3"> (hors paie)</span>}</td><td className="text-right">{x.gardes}</td><td className="text-right">{x.astreintes}</td><td className="p-2 text-right font-semibold">{x.employee_id ? fcfa(Number(x.prime_gardes) || 0) : '—'}</td></tr>))}</tbody></table></div>
        </section>
      )}

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
