import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCheck, Plus, Printer, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { toastErreurSante } from '@/lib/sante-acces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fcfa } from '@/domain/sante/tiers-payant';
import { TYPES_CRENEAU, aValider, construireCreneau, dureeHeures, verifierCreneau, type TypeCreneau } from '@/domain/sante/personnel';

type Personne = { employee_id: string | null; membership_id: string | null; nom: string; fonction: string };
type Ligne = { id: string; employee_id: string | null; membership_id: string | null; type: TypeCreneau; debut: string; fin: string; statut: 'prevu' | 'effectue' | 'annule'; note: string | null };
type Recap = { forfait_garde: number; forfait_astreinte: number; personnes: { nom: string; heures_poste: number | null; gardes: number; astreintes: number; jours_conge: number; a_valider: number; prime_gardes: number; employee_id: string | null }[] };

const cle = (p: { employee_id: string | null; membership_id: string | null }) => p.employee_id ? `e:${p.employee_id}` : `m:${p.membership_id}`;
const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });

export default function PersonnelPage({ structureId, structureNom }: { structureId: string; structureNom: string }) {
  const now = new Date();
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [forfaits, setForfaits] = useState({ garde: '', astreinte: '' });
  const [admin, setAdmin] = useState(false);
  const [f, setF] = useState({ personne: '', type: 'poste' as TypeCreneau, date: now.toISOString().slice(0, 10), hd: '08:00', hf: '16:00', dateFin: '', note: '' });

  const load = useCallback(async () => {
    const debut = new Date(annee, mois - 1, 1).toISOString(), fin = new Date(annee, mois, 1).toISOString();
    const [p, l, r, ad] = await Promise.all([
      supabase.rpc('sante_personnel_liste', { _structure_id: structureId }),
      supabase.from('sante_plannings').select('id, employee_id, membership_id, type, debut, fin, statut, note').eq('structure_id', structureId).gte('debut', debut).lt('debut', fin).order('debut'),
      supabase.rpc('sante_recap_personnel', { _structure_id: structureId, _annee: annee, _mois: mois }),
      supabase.rpc('has_any_medical_role', { _structure_id: structureId, _roles: ['admin_structure'] }),
    ]);
    if (p.error) return void toastErreurSante(p.error, structureId);
    setPersonnes(p.data ?? []); setLignes((l.data ?? []) as Ligne[]); setAdmin(!!ad.data);
    if (!r.error) { const x = r.data as unknown as Recap; setRecap(x); setForfaits({ garde: String(x.forfait_garde ?? 0), astreinte: String(x.forfait_astreinte ?? 0) }); } else setRecap(null);
  }, [structureId, annee, mois]);
  useEffect(() => { void load(); }, [load]);

  const nomDe = useMemo(() => Object.fromEntries(personnes.map(p => [cle(p), p.nom])), [personnes]);
  const enAttente = aValider(lignes);

  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = personnes.find(x => cle(x) === f.personne);
    const c = { ...construireCreneau(f.date, f.hd, f.hf, f.dateFin || undefined), employee_id: p?.employee_id ?? null, membership_id: p?.membership_id ?? null };
    const err = verifierCreneau(c, lignes); if (err) return toast.error(err);
    const { error } = await supabase.from('sante_plannings').insert({ structure_id: structureId, ...c, type: f.type, note: f.note.trim() || null });
    if (error) return void toastErreurSante(error, structureId);
    toast.success('Créneau ajouté'); setF(s => ({ ...s, note: '' })); void load();
  };
  const annuler = async (l: Ligne) => {
    const { error } = l.statut === 'prevu' && new Date(l.debut) > new Date()
      ? await supabase.from('sante_plannings').delete().eq('id', l.id)
      : await supabase.from('sante_plannings').update({ statut: 'annule' }).eq('id', l.id);
    if (error) return void toastErreurSante(error, structureId);
    void load();
  };
  const validerTout = async () => {
    if (!confirm(`Valider ${enAttente.length} créneau(x) terminé(s) comme effectués ? Les gardes et astreintes validées alimentent la paie.`)) return;
    const { data, error } = await supabase.rpc('sante_valider_creneaux', { _ids: enAttente.map(x => x.id) });
    if (error) return void toastErreurSante(error, structureId);
    toast.success(`${data} créneau(x) validé(s)`); void load();
  };
  const enregistrerForfaits = async () => {
    const g = Number(forfaits.garde), a = Number(forfaits.astreinte);
    if (!(g >= 0) || !(a >= 0)) return toast.error('Forfaits invalides');
    const { error } = await supabase.from('sante_personnel_parametres').upsert({ structure_id: structureId, forfait_garde: g, forfait_astreinte: a, updated_at: new Date().toISOString() });
    if (error) return void toastErreurSante(error, structureId);
    toast.success('Forfaits enregistrés'); void load();
  };
  const imprimer = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const rows = lignes.filter(l => l.statut !== 'annule').map(l => `<tr><td>${jour(l.debut)}</td><td>${heure(l.debut)}–${heure(l.fin)}</td><td>${TYPES_CRENEAU.find(t => t.id === l.type)?.label}</td><td>${nomDe[cle(l)] ?? '—'}</td><td>${l.statut === 'effectue' ? 'effectué' : 'prévu'}</td></tr>`).join('');
    w.document.write(`<html><head><title>Planning ${mois}/${annee}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:sans-serif;font-size:11px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px}</style></head><body><h2>${structureNom} — planning ${new Date(annee, mois - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2><table><tr><th>Jour</th><th>Horaire</th><th>Type</th><th>Personne</th><th>Statut</th></tr>${rows}</table><script>print()</script></body></html>`);
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-mono uppercase text-primary mb-1">Exploitation</p><h1 className="font-serif text-3xl flex items-center gap-2"><CalendarClock className="text-primary" />Personnel, gardes et astreintes</h1>
          <p className="text-sm text-fg2">Les gardes et astreintes validées comme effectuées sont reprises automatiquement dans la paie du mois.</p></div>
        <div className="flex gap-2 items-center">
          <select aria-label="Mois" className="h-9 bg-bg3 border border-border rounded-md px-2 text-sm" value={mois} onChange={e => setMois(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2026, i).toLocaleDateString('fr-FR', { month: 'long' })}</option>)}</select>
          <Input aria-label="Année" className="w-24" type="number" value={annee} onChange={e => setAnnee(Number(e.target.value))} />
          <Button variant="outline" size="sm" onClick={imprimer}><Printer />Imprimer</Button>
        </div>
      </div>

      {admin && (
        <form onSubmit={ajouter} className="border border-border bg-bg2 rounded-md p-4 grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto]">
          <select required aria-label="Personne" className="h-10 w-full min-w-0 col-span-2 sm:col-span-3 xl:col-span-1 bg-bg3 border border-border rounded-md px-2 text-sm" value={f.personne} onChange={e => setF({ ...f, personne: e.target.value })}>
            <option value="">Personne…</option>{personnes.map(p => <option key={cle(p)} value={cle(p)}>{p.nom} · {p.fonction.length > 40 ? p.fonction.slice(0, 40) + '…' : p.fonction}{p.employee_id ? '' : ' (hors paie)'}</option>)}
          </select>
          <select aria-label="Type de créneau" className="h-10 w-full min-w-0 bg-bg3 border border-border rounded-md px-2 text-sm" value={f.type} onChange={e => setF({ ...f, type: e.target.value as TypeCreneau, ...(e.target.value === 'garde' ? { hd: '20:00', hf: '08:00' } : {}) })}>{TYPES_CRENEAU.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          <Input aria-label="Date de début" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          <Input aria-label="Heure de début" type="time" value={f.hd} onChange={e => setF({ ...f, hd: e.target.value })} />
          <Input aria-label="Heure de fin" type="time" value={f.hf} onChange={e => setF({ ...f, hf: e.target.value })} />
          <Input aria-label="Date de fin (congé sur plusieurs jours)" type="date" title="Facultatif : congé ou absence sur plusieurs jours" value={f.dateFin} onChange={e => setF({ ...f, dateFin: e.target.value })} />
          <Button aria-label="Ajouter le créneau"><Plus /></Button>
          <Input aria-label="Note" className="col-span-2 sm:col-span-3 xl:col-span-7" placeholder="Note (facultatif)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        </form>
      )}

      {admin && enAttente.length > 0 && (
        <div className="flex items-center justify-between border border-primary/40 bg-primary/5 rounded-md p-3 text-sm">
          <span>{enAttente.length} créneau(x) terminé(s) à valider comme effectué(s).</span>
          <Button size="sm" onClick={validerTout}><CheckCheck />Valider</Button>
        </div>
      )}

      <section className="border border-border bg-bg2 rounded-md">
        <h2 className="px-4 py-3 font-semibold border-b border-border">Planning du mois</h2>
        {lignes.length === 0 ? <p className="p-4 text-sm text-fg3">Aucun créneau ce mois-ci.</p> : (
          <ul className="divide-y divide-border">{lignes.map(l => {
            const t = TYPES_CRENEAU.find(x => x.id === l.type)!;
            return (
              <li key={l.id} className={`flex flex-wrap items-center gap-3 px-4 py-2 text-sm ${l.statut === 'annule' ? 'opacity-50 line-through' : ''}`}>
                <span className="w-28 text-fg2">{jour(l.debut)}</span>
                <span className="w-28 font-mono text-xs">{heure(l.debut)}–{heure(l.fin)} <span className="text-fg3">({dureeHeures(l)} h)</span></span>
                <span className={`rounded border px-2 py-0.5 text-xs ${t.classe}`}>{t.label}</span>
                <span className="flex-1">{nomDe[cle(l)] ?? '—'}{l.note ? <span className="text-fg3"> · {l.note}</span> : null}</span>
                <span className="text-xs text-fg3">{l.statut === 'effectue' ? 'effectué ✓' : l.statut === 'annule' ? 'annulé' : 'prévu'}</span>
                {admin && l.statut === 'prevu' && <Button size="icon" variant="ghost" aria-label="Annuler ce créneau" onClick={() => annuler(l)}>{new Date(l.debut) > new Date() ? <Trash2 /> : <XCircle />}</Button>}
              </li>
            );
          })}</ul>
        )}
      </section>

      {recap && (
        <section className="border border-border bg-bg2 rounded-md overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <h2 className="font-semibold">Récapitulatif pour la paie</h2>
            {admin && <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">Forfait garde<Input className="w-24 h-8" inputMode="numeric" value={forfaits.garde} onChange={e => setForfaits({ ...forfaits, garde: e.target.value })} /></label>
              <label className="flex items-center gap-1">astreinte<Input className="w-24 h-8" inputMode="numeric" value={forfaits.astreinte} onChange={e => setForfaits({ ...forfaits, astreinte: e.target.value })} /></label>
              <Button size="sm" variant="outline" onClick={enregistrerForfaits}>Enregistrer</Button>
            </div>}
          </div>
          <table className="w-full text-sm"><thead className="text-xs text-fg3"><tr><th className="p-2 text-left">Personne</th><th className="text-right">Heures (poste)</th><th className="text-right">Gardes</th><th className="text-right">Astreintes</th><th className="text-right">Jours de congé</th><th className="text-right">À valider</th><th className="p-2 text-right">Primes (paie)</th></tr></thead>
            <tbody>{recap.personnes.length === 0 ? <tr><td colSpan={7} className="p-3 text-center text-fg3">Aucune donnée</td></tr> : recap.personnes.map((p, i) => (
              <tr key={i} className="border-t border-border"><td className="p-2">{p.nom}{!p.employee_id && <span className="text-xs text-fg3"> (hors paie)</span>}</td><td className="text-right">{p.heures_poste ?? 0}</td><td className="text-right">{p.gardes}</td><td className="text-right">{p.astreintes}</td><td className="text-right">{p.jours_conge}</td><td className="text-right">{p.a_valider || ''}</td><td className="p-2 text-right font-semibold">{p.employee_id ? fcfa(p.prime_gardes) : '—'}</td></tr>
            ))}</tbody></table>
        </section>
      )}
    </div>
  );
}
