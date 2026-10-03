import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical, Plus, Printer, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LIBELLE_DRAPEAU, STATUTS_DEMANDE, estCritique, type Drapeau, type StatutDemande } from '@/domain/sante/reference';
import { imprimerCompteRendu, imprimerEtiquettes } from './print-sante';
import { deltaCheck } from '@/domain/sante/reference';

const PAGE = 25;
type Demande = { id: string; numero: string; statut: StatutDemande; urgence: boolean; created_at: string; patient: { nom: string; prenoms: string; numero_dossier: string } | null };

export default function LaboratoirePage({ structureId }: { structureId: string }) {
  const [rows, setRows] = useState<Demande[]>([]);
  const [page, setPage] = useState(0);
  const [statut, setStatut] = useState<string>('actives');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from('sante_demandes_labo').select('id, numero, statut, urgence, created_at, patient:sante_patients(nom, prenoms, numero_dossier)')
      .eq('structure_id', structureId).order('urgence', { ascending: false }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (statut === 'actives') q = q.not('statut', 'in', '(validee,rejetee)'); else if (statut !== 'toutes') q = q.eq('statut', statut);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    setRows((data ?? []) as unknown as Demande[]);
  }, [structureId, page, statut]);
  useEffect(() => { void load(); }, [load]);

  if (ouverte) return <DemandeDetail id={ouverte} onBack={() => { setOuverte(null); void load(); }} />;
  if (nouvelle) return <NouvelleDemande structureId={structureId} onDone={id => { setNouvelle(false); if (id) setOuverte(id); else void load(); }} />;

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap justify-between items-end gap-3 mb-6">
        <div><p className="text-xs font-mono uppercase text-primary mb-1">Laboratoire</p><h1 className="font-serif text-3xl">Demandes d’analyses</h1></div>
        <Button onClick={() => setNouvelle(true)}><Plus />Nouvelle demande</Button>
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        {[['actives', 'En cours'], ...Object.entries(STATUTS_DEMANDE), ['toutes', 'Toutes']].map(([k, l]) => (
          <Button key={k} size="sm" variant={statut === k ? 'secondary' : 'ghost'} onClick={() => { setPage(0); setStatut(k); }}>{l}</Button>
        ))}
      </div>
      <div className="border border-border rounded-md bg-bg2 divide-y divide-border">
        {rows.length === 0 ? <p className="p-6 text-sm text-fg3">Aucune demande.</p> : rows.map(d => (
          <button key={d.id} onClick={() => setOuverte(d.id)} className="w-full text-left p-3 flex flex-wrap justify-between gap-2 hover:bg-bg3">
            <span><span className="font-mono text-xs text-primary">{d.numero}</span> · <strong>{d.patient?.nom} {d.patient?.prenoms}</strong> <span className="text-xs text-fg3">{d.patient?.numero_dossier}</span>{d.urgence && <span className="ml-2 text-xs text-destructive font-semibold">URGENT</span>}</span>
            <span className="text-xs text-fg2">{STATUTS_DEMANDE[d.statut]} · {new Date(d.created_at).toLocaleString('fr-FR')}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-3"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédent</Button><Button size="sm" variant="outline" disabled={rows.length < PAGE} onClick={() => setPage(p => p + 1)}>Suivant</Button></div>
    </div>
  );
}

export function NouvelleDemande({ structureId, patientId, consultationId, prescripteur, onDone }: { structureId: string; patientId?: string; consultationId?: string; prescripteur?: string; onDone: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const [patients, setPatients] = useState<{ id: string; nom: string; prenoms: string; numero_dossier: string }[]>([]);
  const [patient, setPatient] = useState<string | null>(patientId ?? null);
  const [analyses, setAnalyses] = useState<{ id: string; code: string; libelle: string; section: string; tarif: number }[]>([]);
  const [choix, setChoix] = useState<string[]>([]);
  const [presc, setPresc] = useState(prescripteur ?? '');
  const [urgence, setUrgence] = useState(false);
  const [rc, setRc] = useState('');

  useEffect(() => { void supabase.from('sante_analyses').select('id, code, libelle, section, tarif').eq('structure_id', structureId).eq('actif', true).order('section').then(({ data }) => setAnalyses(data ?? [])); }, [structureId]);
  const chercher = async () => {
    const { data, error } = await supabase.rpc('sante_rechercher_patients', { _structure_id: structureId, _q: q, _limit: 10, _offset: 0 });
    if (error) return toast.error(error.message);
    setPatients(data ?? []);
  };
  const total = analyses.filter(a => choix.includes(a.id)).reduce((s, a) => s + Number(a.tarif), 0);
  const creer = async () => {
    if (!patient) return toast.error('Choisissez un patient');
    const { data, error } = await supabase.rpc('sante_creer_demande_labo', { _patient_id: patient, _analyses: choix, _prescripteur: presc, _urgence: urgence, _renseignements: rc, _consultation_id: consultationId });
    if (error) return toast.error(error.message);
    toast.success('Demande enregistrée');
    onDone(data as string);
  };

  return (
    <div className="max-w-3xl space-y-4">
      {!patientId && <Button variant="ghost" size="sm" onClick={() => onDone(null)}><ArrowLeft />Retour</Button>}
      <h2 className="font-serif text-2xl">Nouvelle demande d’analyses</h2>
      {!patientId && <section className="border border-border bg-bg2 rounded-md p-4">
        <Label>Patient *</Label>
        <div className="flex gap-2 mt-1"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, n° dossier, téléphone" onKeyDown={e => e.key === 'Enter' && chercher()} /><Button variant="outline" size="icon" aria-label="Rechercher" onClick={chercher}><Search /></Button></div>
        <div className="mt-2 space-y-1">{patients.map(p => <button key={p.id} onClick={() => setPatient(p.id)} className={`block w-full text-left text-sm p-2 rounded border ${patient === p.id ? 'border-primary bg-bg3' : 'border-border'}`}>{p.numero_dossier} · {p.nom} {p.prenoms}</button>)}</div>
      </section>}
      <section className="border border-border bg-bg2 rounded-md p-4">
        <Label>Analyses *</Label>
        <div className="grid sm:grid-cols-2 gap-2 mt-2">{analyses.map(a => (
          <label key={a.id} className="flex items-center gap-2 text-sm border border-border rounded p-2 cursor-pointer">
            <input type="checkbox" checked={choix.includes(a.id)} onChange={e => setChoix(c => e.target.checked ? [...c, a.id] : c.filter(x => x !== a.id))} />
            <span className="flex-1">{a.libelle} <span className="text-xs text-fg3">({a.section})</span></span><span className="font-mono text-xs">{Number(a.tarif).toLocaleString('fr-FR')}</span>
          </label>))}
          {analyses.length === 0 && <p className="text-xs text-fg3">Aucune analyse au catalogue (Paramètres → Catalogue).</p>}
        </div>
        <p className="text-right text-sm mt-2">Total : <strong>{total.toLocaleString('fr-FR')} FCFA</strong></p>
      </section>
      <section className="border border-border bg-bg2 rounded-md p-4 grid sm:grid-cols-2 gap-3">
        <div><Label htmlFor="presc">Prescripteur</Label><Input id="presc" value={presc} onChange={e => setPresc(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={urgence} onChange={e => setUrgence(e.target.checked)} />Urgent</label>
        <div className="sm:col-span-2"><Label htmlFor="rc">Renseignements cliniques</Label><Textarea id="rc" value={rc} onChange={e => setRc(e.target.value)} /></div>
      </section>
      <div className="flex gap-2">{patientId && <Button variant="ghost" onClick={() => onDone(null)}>Annuler</Button>}<Button onClick={creer} disabled={!choix.length}><FlaskConical />Enregistrer la demande</Button></div>
    </div>
  );
}

function DemandeDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Record<string, any> | null>(null);
  const [params, setParams] = useState<{ id: string; libelle: string; unite: string | null; type: string; decimales: number; analyse: string }[]>([]);
  const [res, setRes] = useState<Map<string, Record<string, any>>>(new Map());
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [motif, setMotif] = useState('');
  const [anterieurs, setAnterieurs] = useState<Map<string, number>>(new Map());
  const [rectifs, setRectifs] = useState<any[]>([]);
  const [rect, setRect] = useState<{ parametre: string; valeur: string; motif: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('sante_demandes_labo').select('*, patient:sante_patients(nom, prenoms, sexe, date_naissance, numero_dossier)').eq('id', id).maybeSingle();
    setD(data);
    const [{ data: das }, { data: r }] = await Promise.all([
      supabase.from('sante_demande_analyses').select('analyse:sante_analyses(libelle, parametres:sante_analyse_parametres(id, libelle, unite, type, decimales, ordre))').eq('demande_id', id),
      supabase.from('sante_resultats').select('*').eq('demande_id', id),
    ]);
    setParams((das ?? []).flatMap((x: any) => [...x.analyse.parametres].sort((a: any, b: any) => a.ordre - b.ordre).map((p: any) => ({ ...p, analyse: x.analyse.libelle }))));
    setRes(new Map((r ?? []).map(x => [x.parametre_id, x])));
    const { data: rc } = await supabase.from('sante_rectificatifs').select('*').eq('demande_id', id).order('le');
    setRectifs(rc ?? []);
    if (data) {
      const { data: prev } = await supabase.from('sante_demandes_labo').select('id').eq('patient_id', data.patient_id).eq('statut', 'validee').neq('id', id).lt('created_at', data.created_at).order('created_at', { ascending: false }).limit(5);
      const ids = (prev ?? []).map(x => x.id);
      const m = new Map<string, number>();
      if (ids.length) {
        const { data: pr } = await supabase.from('sante_resultats').select('parametre_id, valeur_num, saisi_le').in('demande_id', ids).not('valeur_num', 'is', null).order('saisi_le', { ascending: false });
        (pr ?? []).forEach(x => { if (!m.has(x.parametre_id)) m.set(x.parametre_id, Number(x.valeur_num)); });
      }
      setAnterieurs(m);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (!d) return <p className="text-sm text-fg3">Chargement…</p>;

  const avancer = async (statut: string) => {
    const { error } = await supabase.rpc('sante_avancer_demande', { _demande_id: id, _statut: statut, _motif: motif });
    if (error) return toast.error(error.message);
    setMotif(''); await load();
  };
  const valider = async (niveau: 'technique' | 'biologique') => {
    const { error } = await supabase.rpc('sante_valider_demande', { _demande_id: id, _niveau: niveau });
    if (error) return toast.error(error.message);
    toast.success(niveau === 'technique' ? 'Validation technique enregistrée' : 'Résultats validés'); await load();
  };
  const enregistrer = async (p: (typeof params)[number]) => {
    const raw = (saisie[p.id] ?? '').trim();
    if (!raw) return;
    const num = p.type === 'numerique' ? Number(raw.replace(',', '.')) : null;
    if (p.type === 'numerique' && Number.isNaN(num)) return toast.error('Valeur numérique invalide');
    const { data, error } = await supabase.rpc('sante_saisir_resultat', { _demande_id: id, _parametre_id: p.id, _valeur_num: num as number, _valeur_texte: p.type === 'numerique' ? undefined : raw });
    if (error) return toast.error(error.message);
    if (estCritique(data as Drapeau)) toast.error(`Valeur critique sur ${p.libelle} : prévenir le prescripteur puis acquitter`);
    setSaisie(s => ({ ...s, [p.id]: '' })); await load();
  };
  const acquitter = async (rid: string) => {
    const { error } = await supabase.rpc('sante_acquitter_critique', { _resultat_id: rid });
    if (error) return toast.error(error.message);
    await load();
  };
  const rectifier = async () => {
    if (!rect) return;
    const num = Number(rect.valeur.replace(',', '.'));
    const { data, error } = await supabase.rpc('sante_rectifier_resultat', { _demande_id: id, _parametre_id: rect.parametre, _valeur_num: Number.isNaN(num) ? (null as unknown as number) : num, _valeur_texte: Number.isNaN(num) ? rect.valeur : (null as unknown as string), _motif: rect.motif });
    if (error) return toast.error(error.message);
    toast.success(`Compte rendu rectificatif version ${data} — prévenir le prescripteur et le patient`);
    setRect(null); await load();
  };
  const st = d.statut as StatutDemande;
  const p = d.patient;

  return (
    <div className="max-w-5xl space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft />Demandes</Button>
      <div className="border border-border bg-bg2 rounded-md p-4 flex flex-wrap justify-between gap-3">
        <div><p className="font-mono text-xs text-primary">{d.numero}{d.urgence && <span className="ml-2 text-destructive">URGENT</span>}</p><h1 className="font-serif text-2xl">{p.nom} {p.prenoms}</h1><p className="text-sm text-fg2">{p.numero_dossier} · {p.sexe === 'F' ? 'Féminin' : 'Masculin'} · Prescripteur : {d.prescripteur ?? '—'}</p>{d.renseignements && <p className="text-xs text-fg3 mt-1">{d.renseignements}</p>}</div>
        <div className="text-right"><p className="text-sm font-semibold">{STATUTS_DEMANDE[st]}</p>{d.motif_rejet && <p className="text-xs text-destructive">{d.motif_rejet}</p>}
          <div className="flex gap-2 justify-end mt-2"><Button size="sm" variant="outline" onClick={() => imprimerEtiquettes(id)}><Printer />Étiquettes</Button><Button size="sm" variant="outline" onClick={() => imprimerCompteRendu(id)}><Printer />Compte rendu{d.version > 1 ? ` v${d.version}` : ''}</Button></div></div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {st === 'enregistree' && <Button size="sm" onClick={() => avancer('prelevee')}>Prélèvement effectué</Button>}
        {st === 'prelevee' && <Button size="sm" onClick={() => avancer('recue')}>Échantillon reçu conforme</Button>}
        {st === 'recue' && <Button size="sm" onClick={() => avancer('en_analyse')}>Mettre en analyse</Button>}
        {st === 'en_analyse' && <Button size="sm" onClick={() => valider('technique')}><CheckCircle2 />Validation technique</Button>}
        {st === 'validee_technique' && <><Button size="sm" onClick={() => valider('biologique')}><CheckCircle2 />Validation biologique</Button></>}
        {['enregistree', 'prelevee', 'recue'].includes(st) && <><Input className="max-w-xs h-9" placeholder="Motif de rejet" value={motif} onChange={e => setMotif(e.target.value)} /><Button size="sm" variant="destructive" disabled={!motif.trim()} onClick={() => avancer('rejetee')}>Rejeter</Button></>}
      </div>

      <section className="border border-border bg-bg2 rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-fg3 text-left"><tr><th className="p-2">Analyse</th><th className="p-2">Paramètre</th><th className="p-2">Résultat</th><th className="p-2">Réf.</th><th className="p-2">Drapeau</th><th className="p-2">Antérieur</th>{st === 'validee' && <th className="p-2"></th>}{st === 'en_analyse' && <th className="p-2">Saisie</th>}</tr></thead>
          <tbody className="divide-y divide-border">{params.map(pa => {
            const r = res.get(pa.id); const f = (r?.drapeau ?? 'N') as Drapeau;
            return <tr key={pa.id}>
              <td className="p-2 text-xs text-fg3">{pa.analyse}</td><td className="p-2">{pa.libelle} <span className="text-xs text-fg3">{pa.unite}</span></td>
              <td className={`p-2 font-mono ${f === 'N' ? '' : 'font-bold'} ${estCritique(f) ? 'text-destructive' : ''}`}>{r ? (r.valeur_num != null ? Number(r.valeur_num).toFixed(pa.decimales) : r.valeur_texte) : '—'}</td>
              <td className="p-2 text-xs">{r && (r.ref_bas != null || r.ref_haut != null) ? `${r.ref_bas ?? ''} – ${r.ref_haut ?? ''}` : ''}</td>
              <td className="p-2 text-xs">{LIBELLE_DRAPEAU[f]}{r && estCritique(f) && (r.critique_acquitte_le ? <span className="block text-fg3">acquitté</span> : <Button size="sm" variant="destructive" className="ml-2 h-7" onClick={() => acquitter(r.id)}><AlertTriangle />Acquitter</Button>)}</td>
              <td className="p-2 text-xs">{(() => { const a = anterieurs.get(pa.id); if (a === undefined) return '—'; const dc = r?.valeur_num != null ? deltaCheck(Number(r.valeur_num), a) : null; return <span className={dc?.alerte ? 'text-destructive font-semibold' : ''}>{a}{dc ? ` (${dc.variation > 0 ? '+' : ''}${dc.variation} %)` : ''}{dc?.alerte ? ' Δ' : ''}</span>; })()}</td>
              {st === 'validee' && <td className="p-2">{r && <Button size="sm" variant="ghost" onClick={() => setRect({ parametre: pa.id, valeur: '', motif: '' })}>Rectifier</Button>}</td>}
              {st === 'en_analyse' && <td className="p-2"><Input aria-label={`Saisie ${pa.libelle}`} className="h-8 w-28" inputMode={pa.type === 'numerique' ? 'decimal' : 'text'} value={saisie[pa.id] ?? ''} onChange={e => setSaisie(s => ({ ...s, [pa.id]: e.target.value }))} onBlur={() => enregistrer(pa)} onKeyDown={e => e.key === 'Enter' && enregistrer(pa)} /></td>}
            </tr>;
          })}</tbody>
        </table>
      </section>
      {rect && <section className="border border-destructive rounded-md p-4 space-y-2">
        <h2 className="font-semibold">Compte rendu rectificatif — {params.find(x => x.id === rect.parametre)?.libelle}</h2>
        <p className="text-xs text-fg2">L’original est conservé ; une nouvelle version est émise. Réservé au biologiste.</p>
        <div className="grid sm:grid-cols-[1fr_3fr_auto_auto] gap-2"><Input aria-label="Nouvelle valeur" placeholder="Nouvelle valeur" value={rect.valeur} onChange={e => setRect({ ...rect, valeur: e.target.value })} /><Input aria-label="Motif" placeholder="Motif obligatoire" value={rect.motif} onChange={e => setRect({ ...rect, motif: e.target.value })} /><Button variant="ghost" onClick={() => setRect(null)}>Annuler</Button><Button variant="destructive" disabled={!rect.valeur.trim() || rect.motif.trim().length < 5} onClick={rectifier}>Émettre</Button></div>
      </section>}
      {rectifs.length > 0 && <section className="border border-border bg-bg2 rounded-md p-4 text-sm"><h2 className="font-semibold mb-2">Historique des rectifications</h2>{rectifs.map(x => <p key={x.id} className="text-xs border-t border-border py-1">v{x.version} · {new Date(x.le).toLocaleString('fr-FR')} · {params.find(p => p.id === x.parametre_id)?.libelle} : {x.ancienne_valeur_num ?? x.ancienne_valeur_texte} → {x.nouvelle_valeur_num ?? x.nouvelle_valeur_texte} · {x.motif}</p>)}</section>}
      <p className="text-xs text-fg3">La validation technique doit être faite par une autre personne que celle qui a saisi les résultats ; la validation biologique est réservée au biologiste. Un résultat validé ne peut plus être modifié.</p>
    </div>
  );
}
