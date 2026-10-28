import LienPortailButton from './LienPortailButton';
import { BrisGlaceButton } from './BrisGlace';
import ExportDossierButton from './ExportDossierButton';
import ConsentementPatient from './ConsentementPatient';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { libelleAge, normaliserTelephone, validerPatient, type NouveauPatient } from '@/domain/sante/patient';

type Ligne = { id: string; numero_dossier: string; nom: string; prenoms: string; sexe: string; date_naissance: string | null; telephone: string | null; total: number };
const PAGE = 25;

export default function PatientsPage({ structureId }: { structureId: string }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Ligne[]>([]);
  const [mode, setMode] = useState<'liste' | 'nouveau' | { id: string }>('liste');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('sante_rechercher_patients', { _structure_id: structureId, _q: q, _limit: PAGE, _offset: page * PAGE });
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Ligne[]);
  }, [structureId, q, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  if (mode === 'nouveau') return <NouveauPatientForm structureId={structureId} onDone={id => setMode(id ? { id } : 'liste')} />;
  if (typeof mode === 'object') return <FichePatient id={mode.id} onBack={() => { setMode('liste'); load(); }} />;

  const total = rows[0]?.total ?? 0;
  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div><p className="text-xs font-mono uppercase text-primary mb-1">Dossier patient</p><h1 className="font-serif text-3xl">Patients</h1></div>
        <Button onClick={() => setMode('nouveau')}><Plus />Nouveau patient</Button>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg3" />
        <Input aria-label="Rechercher un patient" className="pl-9" placeholder="Nom, prénom, n° de dossier ou téléphone" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} />
      </div>
      <div className="border border-border rounded-md overflow-hidden bg-bg2">
        <table className="w-full text-sm">
          <thead className="bg-bg3 text-xs text-fg3"><tr><th className="text-left p-3">N° dossier</th><th className="text-left p-3">Patient</th><th className="text-left p-3 hidden sm:table-cell">Âge</th><th className="text-left p-3 hidden sm:table-cell">Téléphone</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-fg3">Aucun patient trouvé.</td></tr> : rows.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-bg3 cursor-pointer" onClick={() => setMode({ id: r.id })}>
                <td className="p-3 font-mono text-xs">{r.numero_dossier}</td>
                <td className="p-3"><span className="font-semibold">{r.nom}</span> {r.prenoms} <span className="text-fg3 text-xs">({r.sexe})</span></td>
                <td className="p-3 hidden sm:table-cell">{r.date_naissance ? libelleAge(r.date_naissance) : '—'}</td>
                <td className="p-3 hidden sm:table-cell">{r.telephone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center mt-3 text-xs text-fg3">
        <span>{total} patient(s)</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédent</Button>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Suivant</Button>
        </div>
      </div>
    </div>
  );
}

function NouveauPatientForm({ structureId, onDone }: { structureId: string; onDone: (id?: string) => void }) {
  const [f, setF] = useState<NouveauPatient & { adresse: string; urgence_nom: string; urgence_tel: string; consentement: boolean }>({
    nom: '', prenoms: '', sexe: '', date_naissance: '', date_naissance_estimee: false, telephone: '', adresse: '', urgence_nom: '', urgence_tel: '', consentement: false,
  });
  const [doublons, setDoublons] = useState<{ id: string; numero_dossier: string; nom: string; prenoms: string; date_naissance: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  const submit = async (ignorer = false) => {
    if (busy) return;
    const errs = validerPatient(f);
    if (errs.length) return toast.error(errs[0]);
    setBusy(true);
    try {
    const { data, error } = await supabase.rpc('sante_creer_patient', {
      _structure_id: structureId, _nom: f.nom, _prenoms: f.prenoms, _sexe: f.sexe,
      _date_naissance: f.date_naissance || undefined, _date_naissance_estimee: f.date_naissance_estimee, _telephone: f.telephone ? normaliserTelephone(f.telephone) : undefined,
      _adresse: f.adresse, _contact_urgence_nom: f.urgence_nom, _contact_urgence_tel: f.urgence_tel,
      _consentement: f.consentement, _ignorer_doublons: ignorer,
    });
    setBusy(false);
    if (error?.message.includes('DOUBLON_POSSIBLE')) {
      const { data: d } = await supabase.rpc('sante_doublons_patient', { _structure_id: structureId, _nom: f.nom, _prenoms: f.prenoms, _date_naissance: f.date_naissance || undefined, _telephone: f.telephone ? normaliserTelephone(f.telephone) : undefined });
      setDoublons(d ?? []);
      return;
    }
    if (error) return toast.error(error.message);
    toast.success('Patient créé');
    onDone(data as string);
    } catch { toast.error('Création non enregistrée. Vérifiez votre connexion.'); }
    finally { setBusy(false); }
  };

  const champ = (id: keyof typeof f, label: string, type = 'text') => (
    <div><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={String(f[id])} onChange={e => set(id, e.target.value)} /></div>
  );

  return (
    <div className="max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => onDone()} className="mb-4"><ArrowLeft />Retour</Button>
      <h1 className="font-serif text-3xl mb-6">Nouveau patient</h1>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-4 border border-border bg-bg2 rounded-md p-5">
        <div className="grid sm:grid-cols-2 gap-4">{champ('nom', 'Nom *')}{champ('prenoms', 'Prénoms *')}</div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>Sexe *</Label><div className="flex gap-2 mt-1">{(['F', 'M'] as const).map(s => <Button key={s} type="button" variant={f.sexe === s ? 'default' : 'outline'} onClick={() => set('sexe', s)}>{s === 'F' ? 'Féminin' : 'Masculin'}</Button>)}</div></div>
          <div>
            {champ('date_naissance', 'Date de naissance', 'date')}
            <label className="flex items-center gap-2 text-xs text-fg3 mt-1"><input type="checkbox" checked={f.date_naissance_estimee} onChange={e => set('date_naissance_estimee', e.target.checked)} />Date estimée (âge déclaratif)</label>
          </div>
          {champ('telephone', 'Téléphone', 'tel')}
        </div>
        {champ('adresse', 'Adresse')}
        <div className="grid sm:grid-cols-2 gap-4">{champ('urgence_nom', 'Personne à prévenir')}{champ('urgence_tel', 'Téléphone à prévenir', 'tel')}</div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.consentement} onChange={e => set('consentement', e.target.checked)} />Le patient consent au traitement de ses données de santé par la structure.</label>
        {doublons.length > 0 && (
          <div className="border border-destructive/40 rounded-md p-3 bg-destructive/5">
            <p className="text-sm font-semibold text-destructive mb-2">Patient(s) similaire(s) déjà enregistré(s) :</p>
            <ul className="text-sm space-y-1 mb-3">{doublons.map(d => <li key={d.id}><button type="button" className="underline" onClick={() => onDone(d.id)}>{d.numero_dossier} — {d.nom} {d.prenoms} {d.date_naissance ?? ''}</button></li>)}</ul>
            <Button type="button" disabled={busy} variant="outline" size="sm" onClick={() => submit(true)}>Créer quand même</Button>
          </div>
        )}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Enregistrement…' : 'Créer le dossier'}</Button>
      </form>
    </div>
  );
}

const ONGLETS = ['Identité', 'Assurances', 'Antécédents', 'Consentements', 'Documents'] as const;

function FichePatient({ id, onBack }: { id: string; onBack: () => void }) {
  const [p, setP] = useState<Record<string, any> | null>(null);
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number]>('Identité');
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [ajout, setAjout] = useState({ a: '', b: '', c: '' });

  useEffect(() => {
    (async () => {
      const { error } = await supabase.rpc('sante_ouvrir_dossier', { _patient_id: id, _ecran: 'fiche' });
      if (error) { toast.error('Accès refusé à ce dossier'); return onBack(); }
      const { data } = await supabase.from('sante_patients').select('*').eq('id', id).maybeSingle();
      setP(data);
    })();
  }, [id]);

  const table = onglet === 'Documents' ? 'sante_documents_patient' : onglet === 'Assurances' ? 'sante_patient_assurances' : onglet === 'Antécédents' ? 'sante_antecedents' : onglet === 'Consentements' ? 'sante_consentements' : null;
  const loadItems = useCallback(async () => {
    if (!table) return;
    const { data, error } = await supabase.from(table).select('*').eq('patient_id', id).order('created_at', { ascending: false });
    setItems(error ? [] : data ?? []);
    if (error) toast.error('Section non accessible avec votre rôle');
  }, [table, id]);
  useEffect(() => { setItems([]); loadItems(); }, [loadItems]);

  const ajouter = async () => {
    if (!ajout.a.trim()) return;
    const row = onglet === 'Assurances'
      ? { patient_id: id, organisme: ajout.a, numero_adherent: ajout.b || null, taux_couverture: ajout.c ? Number(ajout.c) : null }
      : { patient_id: id, type: ajout.b || 'medical', libelle: ajout.a, details: ajout.c || null };
    const { error } = await supabase.from(table as 'sante_antecedents').insert(row as any);
    if (error) return toast.error('Ajout refusé : ' + error.message);
    setAjout({ a: '', b: '', c: '' });
    loadItems();
  };

  if (!p) return <div className="text-fg3 text-sm">Chargement du dossier…</div>;
  return (
    <div className="max-w-4xl">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4"><ArrowLeft />Patients</Button>
      <div className="border border-border bg-bg2 rounded-md p-5 mb-4">
        <p className="font-mono text-xs text-primary">{p.numero_dossier}</p>
        <h1 className="font-serif text-2xl">{p.nom} {p.prenoms}</h1>
        <FusionPatient patientId={id} structureId={p.structure_id} onDone={onBack} />
        <BrisGlaceButton patientId={id} onOpened={loadItems} />
        <LienPortailButton patientId={id} />
        <ExportDossierButton patientId={id} numero={p.numero_dossier} />
        <p className="text-sm text-fg2">{p.sexe === 'F' ? 'Féminin' : 'Masculin'}{p.date_naissance ? ` · ${p.date_naissance_estimee ? '≈ ' : ''}${libelleAge(p.date_naissance)} (${new Date(p.date_naissance).toLocaleDateString('fr-FR')}${p.date_naissance_estimee ? ', estimée' : ''})` : ''}</p>
      </div>
      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto" role="tablist">
        {ONGLETS.map(o => <Button key={o} role="tab" aria-selected={onglet === o} variant={onglet === o ? 'secondary' : 'ghost'} size="sm" onClick={() => setOnglet(o)}>{o}</Button>)}
      </div>
      {onglet === 'Documents' ? <DocumentsPatient patientId={id} structureId={p.structure_id} items={items} onChange={loadItems} /> : onglet === 'Identité' ? (
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          {[['Téléphone', p.telephone], ['Adresse', p.adresse], ['Personne à prévenir', p.contact_urgence_nom], ['Tél. à prévenir', p.contact_urgence_tel], ['Créé le', new Date(p.created_at).toLocaleDateString('fr-FR')]].map(([k, v]) => (
            <div key={k} className="border border-border rounded-md p-3"><dt className="text-xs text-fg3">{k}</dt><dd>{v || '—'}</dd></div>
          ))}
        </dl>
      ) : (
        <div className="space-y-3">
          {onglet === 'Consentements' && <ConsentementPatient patientId={id} onSaved={loadItems} />}
          {onglet !== 'Consentements' && (
            <div className="flex flex-wrap gap-2 border border-border rounded-md p-3">
              <Input className="flex-1 min-w-40" placeholder={onglet === 'Assurances' ? 'Organisme' : 'Libellé'} value={ajout.a} onChange={e => setAjout(s => ({ ...s, a: e.target.value }))} />
              {onglet === 'Antécédents' ? (
                <select aria-label="Type" className="bg-bg3 border border-border rounded-md px-2 text-sm" value={ajout.b} onChange={e => setAjout(s => ({ ...s, b: e.target.value }))}>
                  {['medical', 'allergie', 'chirurgical', 'familial', 'traitement'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : <Input className="w-36" placeholder="N° adhérent" value={ajout.b} onChange={e => setAjout(s => ({ ...s, b: e.target.value }))} />}
              <Input className="w-32" placeholder={onglet === 'Assurances' ? 'Taux %' : 'Détails'} value={ajout.c} onChange={e => setAjout(s => ({ ...s, c: e.target.value }))} />
              <Button onClick={ajouter}><Plus />Ajouter</Button>
            </div>
          )}
          {items.length === 0 ? <p className="text-sm text-fg3">Aucun élément.</p> : items.map(it => (
            <div key={it.id} className="border border-border rounded-md p-3 text-sm">
              {onglet === 'Assurances' && <>{it.organisme} · {it.numero_adherent ?? '—'} · {it.taux_couverture ?? '—'} %</>}
              {onglet === 'Antécédents' && <><span className="text-xs uppercase text-primary mr-2">{it.type}</span>{it.libelle} {it.details && <span className="text-fg3">— {it.details}</span>}</>}
              {onglet === 'Consentements' && <><p>{it.type} ({it.version_texte}) : <strong>{it.accorde ? 'accordé' : 'refusé'}</strong> · {new Date(it.created_at).toLocaleDateString('fr-FR')}</p>{it.signataire_nom && <p className="text-xs text-fg2">{it.signataire_nom} · {it.signataire_qualite}</p>}{it.texte && <details className="mt-2"><summary>Texte signé</summary><p className="whitespace-pre-wrap mt-2">{it.texte}</p></details>}</>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FusionPatient({ patientId, structureId, onDone }: { patientId: string; structureId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [numero, setNumero] = useState('');
  const [motif, setMotif] = useState('');
  const [enAttente, setEnAttente] = useState<any[]>([]);
  const [confirmees, setConfirmees] = useState<any[]>([]);
  const charger = useCallback(async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('sante_fusions').select('id, patient_conserve, patient_fusionne, motif, created_at').eq('structure_id', structureId).eq('statut', 'proposee').or(`patient_conserve.eq.${patientId},patient_fusionne.eq.${patientId}`),
      supabase.from('sante_fusions').select('id, patient_conserve, patient_fusionne, motif, confirme_le').eq('structure_id', structureId).eq('statut', 'confirmee').or(`patient_conserve.eq.${patientId},patient_fusionne.eq.${patientId}`),
    ]);
    setEnAttente(p ?? []); setConfirmees(c ?? []);
  }, [patientId, structureId]);
  useEffect(() => { if (open) void charger(); }, [open, charger]);
  const proposer = async () => {
    const { data } = await supabase.rpc('sante_rechercher_patients', { _structure_id: structureId, _q: numero.trim(), _limit: 2 });
    const cible = (data ?? []).find(d => d.numero_dossier === numero.trim().toUpperCase());
    if (!cible || cible.id === patientId) return toast.error('Dossier en double introuvable');
    if (!confirm(`Proposer la fusion de ${cible.numero_dossier} (${cible.nom} ${cible.prenoms}) dans ce dossier ?\nLa fusion ne sera appliquée qu'après confirmation par un autre médecin ou secrétaire.`)) return;
    const { error } = await supabase.rpc('sante_proposer_fusion', { _conserve: patientId, _fusionne: cible.id, _motif: motif });
    if (error) return toast.error(error.message);
    toast.success('Fusion proposée — confirmation par une autre personne requise'); setNumero(''); setMotif(''); void charger();
  };
  const confirmer = async (id: string) => {
    if (!confirm('Confirmer la fusion ? Les antécédents, assurances et consentements du dossier en double seront transférés.')) return;
    const { error } = await supabase.rpc('sante_confirmer_fusion', { _fusion_id: id });
    if (error) return toast.error(error.message);
    toast.success('Dossiers fusionnés'); onDone();
  };
  const annuler = async (id: string) => {
    const m = prompt('Motif d’annulation (10 caractères minimum) — réservé à l’administrateur :');
    if (!m) return;
    const { error } = await supabase.rpc('sante_annuler_fusion', { _fusion_id: id, _motif: m });
    if (error) return toast.error(error.message);
    toast.success('Fusion annulée, dossiers restaurés'); void charger(); onDone();
  };
  if (!open) return <button className="float-right text-xs underline text-fg3" onClick={() => setOpen(true)}>Fusionner un doublon</button>;
  return (
    <div className="space-y-2 my-2">
      <div className="flex flex-wrap gap-2">
        <Input className="w-40" placeholder="N° dossier en double" value={numero} onChange={e => setNumero(e.target.value)} />
        <Input className="flex-1 min-w-40" placeholder="Motif (obligatoire)" value={motif} onChange={e => setMotif(e.target.value)} />
        <Button size="sm" onClick={proposer}>Proposer la fusion</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
      </div>
      <p className="text-xs text-fg3">La fusion s’applique en deux temps : proposition, puis confirmation par une personne différente. L’administrateur peut ensuite l’annuler avec restauration des données.</p>
      {enAttente.map(f => (
        <div key={f.id} className="border border-border rounded-md p-2 text-sm flex justify-between items-center gap-2">
          <span>Fusion proposée le {new Date(f.created_at).toLocaleDateString('fr-FR')} — {f.motif}</span>
          <Button size="sm" onClick={() => confirmer(f.id)}>Confirmer (autre personne)</Button>
        </div>
      ))}
      {confirmees.map(f => (
        <div key={f.id} className="border border-border rounded-md p-2 text-sm flex justify-between items-center gap-2">
          <span className="text-fg3">Fusion effectuée le {f.confirme_le ? new Date(f.confirme_le).toLocaleDateString('fr-FR') : '—'}</span>
          <Button size="sm" variant="outline" onClick={() => annuler(f.id)}>Annuler la fusion (admin)</Button>
        </div>
      ))}
    </div>
  );
}

function DocumentsPatient({ patientId, structureId, items, onChange }: { patientId: string; structureId: string; items: Record<string, any>[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const envoyer = async (file: File) => {
    if (busy) return;
    if (file.size > 20 * 1024 * 1024) return toast.error('Fichier trop volumineux (20 Mo max)');
    setBusy(true);
    const path = `${structureId}/${patientId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    try {
    const up = await supabase.storage.from('sante-documents').upload(path, file);
    if (up.error) throw up.error;
    const { error } = await supabase.from('sante_documents_patient').insert({ patient_id: patientId, structure_id: structureId, nom: file.name, storage_path: path, mime_type: file.type, taille_octets: file.size });
    setBusy(false);
    if (error) {
      await supabase.storage.from('sante-documents').remove([path]);
      throw error;
    }
    onChange();
    toast.success('Document enregistré.');
    } catch { toast.error('Document non enregistré. Vérifiez votre accès et réessayez.'); }
    finally { setBusy(false); }
  };
  const ouvrir = async (path: string) => {
    const { data } = await supabase.storage.from('sante-documents').createSignedUrl(path, 60);
    if (data) window.open(data.signedUrl, '_blank'); else toast.error('Accès refusé');
  };
  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 border border-border rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-bg3">
        <Plus className="h-4 w-4" />{busy ? 'Envoi…' : 'Joindre un document'}
        <input type="file" className="hidden" disabled={busy} onChange={e => e.target.files?.[0] && envoyer(e.target.files[0])} />
      </label>
      {items.length === 0 ? <p className="text-sm text-fg3">Aucun document.</p> : items.map(d => (
        <button key={d.id} onClick={() => ouvrir(d.storage_path)} className="w-full text-left border border-border rounded-md p-3 text-sm hover:bg-bg3">
          {d.nom} <span className="text-xs text-fg3">· {new Date(d.created_at).toLocaleDateString('fr-FR')}</span>
        </button>
      ))}
    </div>
  );
}
