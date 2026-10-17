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
import { parseAutomate } from '@/domain/sante/automate';

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
  const [params, setParams] = useState<{ id: string; code: string; libelle: string; unite: string | null; type: string; decimales: number; analyse: string }[]>([]);
  const [res, setRes] = useState<Map<string, Record<string, any>>>(new Map());
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [motif, setMotif] = useState('');
  const [anterieurs, setAnterieurs] = useState<Map<string, number>>(new Map());
  const [rectifs, setRectifs] = useState<any[]>([]);
  const [lesAnalyses, setLesAnalyses] = useState<{ id: string; libelle: string }[]>([]);
  const [rect, setRect] = useState<{ parametre: string; valeur: string; motif: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('sante_demandes_labo').select('*, patient:sante_patients(nom, prenoms, sexe, date_naissance, numero_dossier)').eq('id', id).maybeSingle();
    setD(data);
    const [{ data: das }, { data: r }] = await Promise.all([
      supabase.from('sante_demande_analyses').select('analyse:sante_analyses(id, libelle, parametres:sante_analyse_parametres(id, code, libelle, unite, type, decimales, ordre))').eq('demande_id', id),
      supabase.from('sante_resultats').select('*').eq('demande_id', id),
    ]);
    setLesAnalyses((das ?? []).map((x: any) => ({ id: x.analyse.id, libelle: x.analyse.libelle })));
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
        {st === 'prelevee' && <Button size="sm" onClick={() => avancer('recue')}>Échantillon reçu conforme</Button>}
        {st === 'recue' && <Button size="sm" onClick={() => avancer('en_analyse')}>Mettre en analyse</Button>}
        {st === 'en_analyse' && <Button size="sm" onClick={() => valider('technique')}><CheckCircle2 />Validation technique</Button>}
        {st === 'validee_technique' && <><Button size="sm" onClick={() => valider('biologique')}><CheckCircle2 />Validation biologique</Button></>}
        {d.demande_origine_id && <span className="text-xs text-fg3">Nouveau prélèvement suite à un rejet</span>}
      </div>
      {st === 'enregistree' && <Prelevement id={id} onDone={load} />}
      {['prelevee', 'recue'].includes(st) && <RejetEchantillon id={id} onDone={load} />}
      {st === 'en_analyse' && <ImportAutomate id={id} params={params} onDone={load} />}
      {['prelevee', 'recue', 'en_analyse'].includes(st) && <SousTraitance id={id} analyses={lesAnalyses} />}
      {['en_analyse', 'validee_technique', 'validee'].includes(st) && <Microbiologie id={id} editable={st === 'en_analyse'} />}
      {st === 'validee' && <RemiseMainPropre demande={d} />}

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

const MOTIFS_REJET: Record<string, string> = { hemolyse: 'Hémolyse', volume_insuffisant: 'Volume insuffisant', tube_errone: 'Tube erroné', etiquette_illisible: 'Étiquette illisible', delai_depasse: 'Délai d’acheminement dépassé', coagule: 'Échantillon coagulé', autre: 'Autre' };

/** Prélèvement : identification positive du patient (au moins 2 identifiants vérifiés, imposé par la base). */
function Prelevement({ id, onDone }: { id: string; onDone: () => void }) {
  const [ids, setIds] = useState<string[]>([]);
  const [site, setSite] = useState('');
  const [ajeun, setAjeun] = useState(false);
  const IDS: [string, string][] = [['nom', 'Nom et prénoms'], ['date_naissance', 'Date de naissance'], ['numero_dossier', 'N° de dossier'], ['piece_identite', 'Pièce d’identité']];
  const go = async () => {
    const { error } = await supabase.rpc('sante_prelever' as never, { _demande_id: id, _identifiants: ids, _site: site, _conditions: { a_jeun: ajeun } } as never);
    if (error) return toast.error(error.message);
    toast.success('Prélèvement enregistré'); onDone();
  };
  return <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
    <h2 className="font-semibold text-sm">Prélèvement — identification du patient</h2>
    <p className="text-xs text-fg3">Demandez au patient de décliner son identité et cochez au moins deux éléments vérifiés.</p>
    <div className="flex flex-wrap gap-3">{IDS.map(([k, l]) => <label key={k} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={ids.includes(k)} onChange={e => setIds(x => e.target.checked ? [...x, k] : x.filter(y => y !== k))} />{l}</label>)}</div>
    <div className="flex flex-wrap gap-2 items-center"><Input className="max-w-xs h-9" placeholder="Site de prélèvement (ex. pli du coude)" value={site} onChange={e => setSite(e.target.value)} /><label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={ajeun} onChange={e => setAjeun(e.target.checked)} />À jeun</label>
      <Button size="sm" disabled={ids.length < 2} onClick={go}>Prélèvement effectué</Button></div>
  </section>;
}

/** Rejet pré-analytique avec motif codifié ; option de créer automatiquement une nouvelle demande liée. */
function RejetEchantillon({ id, onDone }: { id: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [com, setCom] = useState('');
  const [nouveau, setNouveau] = useState(true);
  const go = async () => {
    const { data, error } = await supabase.rpc('sante_rejeter_echantillon' as never, { _demande_id: id, _code: code, _commentaire: com, _nouveau_prelevement: nouveau } as never);
    if (error) return toast.error(error.message);
    toast.success(data ? 'Échantillon rejeté — nouvelle demande de prélèvement créée' : 'Échantillon rejeté'); onDone();
  };
  return <section className="border border-border bg-bg2 rounded-md p-3 flex flex-wrap gap-2 items-center">
    <span className="text-sm font-semibold">Non-conformité :</span>
    <select aria-label="Motif de rejet" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={code} onChange={e => setCode(e.target.value)}>
      <option value="">Motif de rejet…</option>{Object.entries(MOTIFS_REJET).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
    <Input className="max-w-xs h-9" placeholder="Commentaire" value={com} onChange={e => setCom(e.target.value)} />
    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={nouveau} onChange={e => setNouveau(e.target.checked)} />Nouveau prélèvement</label>
    <Button size="sm" variant="destructive" disabled={!code} onClick={go}>Rejeter</Button>
  </section>;
}

type Germe = { id: string; type_examen: string; germe: string; quantification: string | null; statut: string; ab: { antibiotique: string; cmi: string | null; interpretation: string }[] };

/** Microbiologie : germes identifiés et antibiogramme (S/I/R). Un germe préliminaire bloque la validation. */
function Microbiologie({ id, editable }: { id: string; editable: boolean }) {
  const [germes, setGermes] = useState<Germe[]>([]);
  const [f, setF] = useState({ type: 'culture', germe: '', quant: '', ab: '' });
  const load = useCallback(async () => {
    const { data } = await supabase.from('sante_micro_germes' as never).select('id, type_examen, germe, quantification, statut, ab:sante_antibiogrammes(antibiotique, cmi, interpretation)').eq('demande_id', id).order('saisi_le');
    setGermes((data ?? []) as unknown as Germe[]);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (!editable && germes.length === 0) return null;
  // Format antibiogramme : une ligne par antibiotique « Amoxicilline S » ou « Ciprofloxacine R 0,5 »
  const parseAb = () => f.ab.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(.+?)\s+([SIRsir])(?:\s+(.+))?$/); return m ? { antibiotique: m[1], interpretation: m[2].toUpperCase(), cmi: m[3] ?? null } : null; });
  const ajouter = async () => {
    const ab = parseAb();
    if (ab.some(x => !x)) return toast.error('Antibiogramme : une ligne par antibiotique, suivie de S, I ou R');
    const { error } = await supabase.rpc('sante_saisir_germe' as never, { _demande_id: id, _type: f.type, _germe: f.germe, _quantification: f.quant, _commentaire: null, _definitif: false, _antibiogramme: ab } as never);
    if (error) return toast.error(error.message);
    setF({ type: f.type, germe: '', quant: '', ab: '' }); void load();
  };
  const definitif = async (gid: string) => {
    const { error } = await supabase.rpc('sante_germe_definitif' as never, { _germe_id: gid } as never);
    if (error) return toast.error(error.message);
    void load();
  };
  return <section className="border border-border bg-bg2 rounded-md p-4 space-y-3">
    <h2 className="font-semibold text-sm">Microbiologie</h2>
    {germes.map(g => <div key={g.id} className="border border-border rounded p-2 text-sm">
      <div className="flex justify-between gap-2"><span><span className="text-xs text-fg3 uppercase">{g.type_examen}</span> · <strong>{g.germe}</strong>{g.quantification && ` · ${g.quantification}`}</span>
        {g.statut === 'preliminaire' ? (editable ? <Button size="sm" variant="outline" className="h-7" onClick={() => definitif(g.id)}>Rendre définitif</Button> : <span className="text-xs">préliminaire</span>) : <span className="text-xs text-primary">définitif</span>}</div>
      {g.ab.length > 0 && <p className="text-xs mt-1">{g.ab.map(a => <span key={a.antibiotique} className={`mr-3 ${a.interpretation === 'R' ? 'text-destructive font-semibold' : ''}`}>{a.antibiotique} {a.interpretation}{a.cmi ? ` (${a.cmi})` : ''}</span>)}</p>}
    </div>)}
    {editable && <div className="grid sm:grid-cols-[auto_1fr_1fr] gap-2">
      <select aria-label="Type d’examen" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
        {[['culture', 'Culture'], ['ecbu', 'ECBU'], ['hemoculture', 'Hémoculture'], ['coproculture', 'Coproculture'], ['autre', 'Autre']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <Input aria-label="Germe" placeholder="Germe identifié (ex. E. coli)" value={f.germe} onChange={e => setF({ ...f, germe: e.target.value })} />
      <Input aria-label="Quantification" placeholder="Quantification (ex. 10^5 UFC/mL)" value={f.quant} onChange={e => setF({ ...f, quant: e.target.value })} />
      <Textarea aria-label="Antibiogramme" className="sm:col-span-3" placeholder={'Antibiogramme, une ligne par antibiotique :\nAmoxicilline R\nCiprofloxacine S 0,25'} value={f.ab} onChange={e => setF({ ...f, ab: e.target.value })} />
      <div className="sm:col-span-3"><Button size="sm" disabled={!f.germe.trim()} onClick={ajouter}><Plus />Ajouter (préliminaire)</Button></div>
    </div>}
  </section>;
}

/** Envoi d'une analyse de la demande à un laboratoire sous-traitant. */
export function RemiseMainPropre({ demande }: { demande: any }) {
  const [liste, setListe] = useState<any[]>([]);
  const [benef, setBenef] = useState<'patient' | 'mandataire'>('patient');
  const [nom, setNom] = useState(''); const [pt, setPt] = useState('CNI'); const [pn, setPn] = useState(''); const [proc, setProc] = useState(false);
  const load = useCallback(async () => { const { data } = await supabase.from('sante_remises_resultats').select('*').eq('demande_id', demande.id).order('created_at', { ascending: false }); setListe(data ?? []); }, [demande.id]);
  useEffect(() => { void load(); }, [load]);
  const enregistrer = async () => {
    if (pn.trim().length < 4) return toast.error('Numéro de pièce d’identité requis');
    if (benef === 'mandataire' && (!proc || nom.trim().length < 3)) return toast.error('Mandataire : nom et procuration obligatoires');
    const { error } = await supabase.from('sante_remises_resultats').insert({ structure_id: demande.structure_id, demande_id: demande.id, patient_id: demande.patient_id, beneficiaire: benef, nom_mandataire: benef === 'mandataire' ? nom.trim() : null, piece_type: pt, piece_numero: pn.trim(), procuration: benef === 'mandataire' && proc });
    if (error) return toast.error('Remise refusée : ' + error.message);
    toast.success('Remise enregistrée'); setPn(''); setNom(''); setProc(false); load();
  };
  return (
    <section className="border border-border bg-bg2 rounded-md p-3 space-y-2">
      <h3 className="text-sm font-medium">Remise en main propre</h3>
      <div className="flex flex-wrap gap-2 items-end">
        <select aria-label="Bénéficiaire" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={benef} onChange={e => setBenef(e.target.value as any)}><option value="patient">Patient</option><option value="mandataire">Mandataire</option></select>
        {benef === 'mandataire' && <Input aria-label="Nom du mandataire" className="w-48" placeholder="Nom du mandataire" value={nom} onChange={e => setNom(e.target.value)} />}
        <select aria-label="Pièce" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={pt} onChange={e => setPt(e.target.value)}>{['CNI', 'Passeport', 'Permis', 'Carte consulaire'].map(x => <option key={x}>{x}</option>)}</select>
        <Input aria-label="Numéro de pièce" className="w-40" placeholder="N° de pièce" value={pn} onChange={e => setPn(e.target.value)} />
        {benef === 'mandataire' && <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={proc} onChange={e => setProc(e.target.checked)} />Procuration vérifiée</label>}
        <Button size="sm" onClick={enregistrer}>Enregistrer la remise</Button>
      </div>
      {liste.map(r => <p key={r.id} className="text-xs text-fg2">{new Date(r.created_at).toLocaleString('fr-FR')} — {r.beneficiaire === 'patient' ? 'Patient' : `Mandataire ${r.nom_mandataire}`} · {r.piece_type} {r.piece_numero}</p>)}
    </section>
  );
}

export function SousTraitance({ id, analyses }: { id: string; analyses: { id: string; libelle: string }[] }) {
  const [envois, setEnvois] = useState<{ id: string; analyse_id: string; laboratoire: string; statut: string }[]>([]);
  const [f, setF] = useState({ analyse: '', labo: '', ref: '' });
  const load = useCallback(async () => {
    const { data } = await supabase.from('sante_sous_traitance').select('id, analyse_id, laboratoire, statut').eq('demande_id', id);
    setEnvois(data ?? []);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const envoyer = async () => {
    const { error } = await supabase.rpc('sante_envoyer_sous_traitance', { _demande_id: id, _analyse_id: f.analyse, _laboratoire: f.labo, _reference: f.ref });
    if (error) return toast.error(error.message);
    setF({ analyse: '', labo: '', ref: '' }); toast.success('Envoi en sous-traitance enregistré'); void load();
  };
  return <section className="border border-border bg-bg2 rounded-md p-3 space-y-2 text-sm">
    <h2 className="font-semibold text-sm">Sous-traitance</h2>
    {envois.map(e => <p key={e.id} className="text-xs">{analyses.find(a => a.id === e.analyse_id)?.libelle} → {e.laboratoire} · {e.statut === 'recu' ? 'reçu' : 'envoyé'}</p>)}
    <div className="flex flex-wrap gap-2">
      <select aria-label="Analyse à envoyer" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.analyse} onChange={e => setF({ ...f, analyse: e.target.value })}>
        <option value="">Analyse…</option>{analyses.filter(a => !envois.some(e => e.analyse_id === a.id)).map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
      </select>
      <Input className="h-9 max-w-xs" placeholder="Laboratoire destinataire" value={f.labo} onChange={e => setF({ ...f, labo: e.target.value })} />
      <Input className="h-9 max-w-[10rem]" placeholder="Référence" value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} />
      <Button size="sm" variant="outline" disabled={!f.analyse || !f.labo.trim()} onClick={envoyer}>Envoyer</Button>
    </div>
  </section>;
}

/** Import des résultats d'un automate : fichier ou copier-coller CSV « code;valeur » (séparateur ; , ou tabulation).
 *  Chaque valeur passe par la même saisie contrôlée que la saisie manuelle (bornes, drapeaux, CQ). */

function ImportAutomate({ id, params, onDone }: { id: string; params: { id: string; code: string; type: string; libelle: string }[]; onDone: () => void }) {
  const [texte, setTexte] = useState('');
  const importer = async () => {
    const lignes = parseAutomate(texte);
    let ok = 0; const erreurs: string[] = [];
    for (const l of lignes) {
      const p = params.find(x => (x.code ?? '').toUpperCase() === l.code);
      if (!p) { erreurs.push(`${l.code} : paramètre absent de la demande`); continue; }
      const num = p.type === 'numerique' ? Number(l.valeur.replace(',', '.')) : null;
      if (p.type === 'numerique' && Number.isNaN(num)) { erreurs.push(`${l.code} : valeur non numérique`); continue; }
      const { error } = await supabase.rpc('sante_saisir_resultat', { _demande_id: id, _parametre_id: p.id, _valeur_num: num as number, _valeur_texte: p.type === 'numerique' ? undefined : l.valeur });
      if (error) erreurs.push(`${l.code} : ${error.message}`); else ok++;
    }
    toast[erreurs.length ? 'warning' : 'success'](`${ok} résultat(s) importé(s)${erreurs.length ? ` · ${erreurs.length} refusé(s) : ${erreurs.join(' ; ')}` : ''}`);
    if (ok) setTexte('');
    onDone();
  };
  return <section className="border border-border bg-bg2 rounded-md p-3 space-y-2">
    <h2 className="font-semibold text-sm">Import automate</h2>
    <p className="text-xs text-fg3">Fichier exporté par l’automate ou copier-coller : une ligne par paramètre « CODE;valeur ». Les valeurs critiques restent à acquitter.</p>
    <input type="file" accept=".csv,.txt" aria-label="Fichier automate" className="text-xs" onChange={async e => { const fi = e.target.files?.[0]; if (fi) setTexte(await fi.text()); }} />
    <Textarea aria-label="Résultats automate" placeholder={'GLY;1,05\nUREE;0,32'} value={texte} onChange={e => setTexte(e.target.value)} />
    <Button size="sm" variant="outline" disabled={!texte.trim()} onClick={importer}>Importer</Button>
  </section>;
}
