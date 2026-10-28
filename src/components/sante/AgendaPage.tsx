import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { creneaux, LIBELLE_RDV, transitionsPossibles, type StatutRdv } from '@/domain/sante/clinique';

type Praticien = { id: string; nom: string; specialite: string | null };
type Rdv = { id: string; debut: string; duree_min: number; motif: string | null; statut: StatutRdv; praticien_id: string; patient_id: string; arrive_le: string | null; patient: { nom: string; prenoms: string; numero_dossier: string } | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const heure = (s: string) => new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function AgendaPage({ structureId, onConsultation }: { structureId: string; onConsultation: (id: string) => void }) {
  const [jour, setJour] = useState(iso(new Date()));
  const [praticiens, setPraticiens] = useState<Praticien[]>([]);
  const [filtre, setFiltre] = useState<string>('');
  const [rdvs, setRdvs] = useState<Rdv[]>([]);
  const [form, setForm] = useState(false);

  useEffect(() => {
    supabase.from('sante_praticiens').select('id, nom, specialite').eq('structure_id', structureId).eq('actif', true).order('nom')
      .then(({ data }) => setPraticiens(data ?? []));
  }, [structureId]);

  const load = useCallback(async () => {
    const debut = new Date(jour + 'T00:00:00'), fin = new Date(debut.getTime() + 86_400_000);
    let req = supabase.from('sante_rendez_vous').select('id, debut, duree_min, motif, statut, praticien_id, patient_id, arrive_le, patient:sante_patients(nom, prenoms, numero_dossier)')
      .eq('structure_id', structureId).gte('debut', debut.toISOString()).lt('debut', fin.toISOString()).order('debut');
    if (filtre) req = req.eq('praticien_id', filtre);
    const { data, error } = await req;
    if (error) return toast.error('Agenda non accessible avec votre rôle');
    setRdvs((data ?? []) as unknown as Rdv[]);
  }, [structureId, jour, filtre]);
  useEffect(() => { load(); }, [load]);

  const changer = async (r: Rdv, statut: StatutRdv) => {
    const { error } = await supabase.from('sante_rendez_vous').update({ statut }).eq('id', r.id);
    if (error) return toast.error(error.message);
    load();
  };
  const demarrer = async (r: Rdv) => {
    const { data, error } = await supabase.rpc('sante_demarrer_consultation', { _patient_id: r.patient_id, _praticien_id: r.praticien_id, _rdv_id: r.id });
    if (error) return toast.error(error.message);
    onConsultation(data as string);
  };
  const decaler = (n: number) => { const d = new Date(jour + 'T00:00:00'); d.setDate(d.getDate() + n); setJour(iso(d)); };

  const file = rdvs.filter(r => r.statut === 'arrive').sort((a, b) => (a.arrive_le ?? '').localeCompare(b.arrive_le ?? ''));
  const nomPraticien = (id: string) => praticiens.find(p => p.id === id)?.nom ?? '';

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div><p className="text-xs font-mono uppercase text-primary mb-1">Clinique</p><h1 className="font-serif text-3xl">Agenda et file d’attente</h1></div>
        <Button onClick={() => setForm(true)} disabled={praticiens.length === 0}><Plus />Nouveau rendez-vous</Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <Button size="icon" variant="outline" aria-label="Jour précédent" onClick={() => decaler(-1)}><ChevronLeft /></Button>
        <Input type="date" aria-label="Jour" className="w-44" value={jour} onChange={e => setJour(e.target.value)} />
        <Button size="icon" variant="outline" aria-label="Jour suivant" onClick={() => decaler(1)}><ChevronRight /></Button>
        <Button variant="ghost" size="sm" onClick={() => setJour(iso(new Date()))}>Aujourd’hui</Button>
        <select aria-label="Praticien" className="bg-bg3 border border-border rounded-md px-2 h-10 text-sm" value={filtre} onChange={e => setFiltre(e.target.value)}>
          <option value="">Tous les praticiens</option>
          {praticiens.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
      </div>
      {form && <NouveauRdv structureId={structureId} jour={jour} praticiens={praticiens} onClose={() => { setForm(false); load(); }} />}
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <section className="border border-border bg-bg2 rounded-md divide-y divide-border">
          {rdvs.length === 0 ? <p className="p-6 text-sm text-fg3 text-center">Aucun rendez-vous ce jour.</p> : rdvs.map(r => (
            <div key={r.id} className="p-3 flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm w-14">{heure(r.debut)}</span>
              <div className="flex-1 min-w-40">
                <p className="font-semibold text-sm">{r.patient?.nom} {r.patient?.prenoms}</p>
                <p className="text-xs text-fg3">{r.motif || 'Sans motif'} · {nomPraticien(r.praticien_id)} · {r.duree_min} min</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded border ${r.statut === 'arrive' ? 'border-primary text-primary' : 'border-border text-fg2'}`}>{LIBELLE_RDV[r.statut]}</span>
              <div className="flex gap-1 flex-wrap">
                {r.statut === 'arrive' && <Button size="sm" onClick={() => demarrer(r)}><Stethoscope />Consulter</Button>}
                {transitionsPossibles(r.statut).filter(s => s !== 'en_consultation' && s !== 'termine').map(s => (
                  <Button key={s} size="sm" variant="outline" onClick={() => changer(r, s)}>{LIBELLE_RDV[s]}</Button>
                ))}
              </div>
            </div>
          ))}
        </section>
        <aside className="border border-border bg-bg2 rounded-md p-4 h-fit">
          <h2 className="font-semibold mb-3">File d’attente ({file.length})</h2>
          {file.length === 0 ? <p className="text-xs text-fg3">Aucun patient en salle d’attente.</p> : (
            <ol className="space-y-2">{file.map((r, i) => (
              <li key={r.id} className="text-sm flex justify-between gap-2"><span>{i + 1}. {r.patient?.nom} {r.patient?.prenoms}</span><span className="text-xs text-fg3">depuis {r.arrive_le ? heure(r.arrive_le) : ''}</span></li>
            ))}</ol>
          )}
        </aside>
      </div>
    </div>
  );
}

function NouveauRdv({ structureId, jour, praticiens, onClose }: { structureId: string; jour: string; praticiens: Praticien[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ id: string; nom: string; prenoms: string; numero_dossier: string }[]>([]);
  const [patient, setPatient] = useState<{ id: string; label: string } | null>(null);
  const [praticien, setPraticien] = useState(praticiens[0]?.id ?? '');
  const [h, setH] = useState('09:00');
  const [duree, setDuree] = useState(20);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('sante_rechercher_patients', { _structure_id: structureId, _q: q, _limit: 8 });
      setRes(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, structureId]);

  const save = async () => {
    if (busy) return;
    if (!patient || !praticien) return toast.error('Patient et praticien obligatoires');
    if (!Number.isInteger(duree) || duree < 5 || duree > 240) return toast.error('Durée attendue : entre 5 et 240 minutes.');
    setBusy(true);
    try {
    const { error } = await supabase.from('sante_rendez_vous').insert({
      structure_id: structureId, patient_id: patient.id, praticien_id: praticien,
      debut: new Date(`${jour}T${h}:00`).toISOString(), duree_min: duree, motif: motif || null,
    });
    if (error) return toast.error(error.message);
    toast.success('Rendez-vous enregistré');
    onClose();
    } catch { toast.error('Rendez-vous non enregistré. Vérifiez votre connexion.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="border border-primary/40 bg-bg2 rounded-md p-4 mb-4 space-y-3">
      <div className="relative">
        <Label htmlFor="rdv-patient">Patient</Label>
        {patient ? <div className="flex justify-between items-center border border-border rounded-md p-2 text-sm">{patient.label}<Button size="sm" variant="ghost" onClick={() => setPatient(null)}>Changer</Button></div> : (
          <>
            <Input id="rdv-patient" placeholder="Rechercher (2 lettres minimum)" value={q} onChange={e => setQ(e.target.value)} />
            {res.length > 0 && <ul className="absolute z-10 w-full bg-bg2 border border-border rounded-md mt-1 max-h-56 overflow-auto">{res.map(r => (
              <li key={r.id}><button className="w-full text-left p-2 text-sm hover:bg-bg3" onClick={() => { setPatient({ id: r.id, label: `${r.nom} ${r.prenoms} (${r.numero_dossier})` }); setRes([]); }}>{r.nom} {r.prenoms} <span className="text-fg3 text-xs">{r.numero_dossier}</span></button></li>
            ))}</ul>}
          </>
        )}
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <div><Label htmlFor="rdv-prat">Praticien</Label><select id="rdv-prat" className="w-full bg-bg3 border border-border rounded-md px-2 h-10 text-sm" value={praticien} onChange={e => setPraticien(e.target.value)}>{praticiens.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></div>
        <div><Label htmlFor="rdv-h">Heure</Label><select id="rdv-h" className="w-full bg-bg3 border border-border rounded-md px-2 h-10 text-sm" value={h} onChange={e => setH(e.target.value)}>{creneaux(7, 20, 10).map(c => <option key={c}>{c}</option>)}</select></div>
        <div><Label htmlFor="rdv-d">Durée (min)</Label><Input id="rdv-d" type="number" min={5} max={240} value={duree} onChange={e => setDuree(Number(e.target.value))} /></div>
        <div><Label htmlFor="rdv-m">Motif</Label><Input id="rdv-m" value={motif} onChange={e => setMotif(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 justify-end"><Button disabled={busy} variant="ghost" onClick={onClose}>Annuler</Button><Button disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
    </div>
  );
}
