import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Lock, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { alertesConstantes, classeImc, imc, validerOrdonnance, type LigneOrdonnance } from '@/domain/sante/clinique';
import { libelleAge } from '@/domain/sante/patient';
import { imprimerOrdonnance } from './print-ordonnance';
import CertificatsAnalyses from './CertificatsAnalyses';
import { DelivranceConsultation } from './StocksSante';
import { saveBeforeClosing } from '@/lib/consultation-workflow';

const CHAMPS = [['motif', 'Motif'], ['anamnese', 'Anamnèse'], ['examen', 'Examen clinique'], ['diagnostic', 'Diagnostic'], ['conduite', 'Conduite à tenir']] as const;
const CONST = [['ta_sys', 'TA sys.'], ['ta_dia', 'TA dia.'], ['pouls', 'Pouls'], ['temperature', 'T° °C'], ['poids', 'Poids kg'], ['taille', 'Taille cm'], ['spo2', 'SpO₂ %'], ['glycemie', 'Glyc. g/L']] as const;

export default function ConsultationPage({ id, onBack }: { id: string; onBack: () => void }) {
  const [c, setC] = useState<Record<string, any> | null>(null);
  const [patient, setPatient] = useState<Record<string, any> | null>(null);
  const [historique, setHistorique] = useState<Record<string, any>[]>([]);
  const [constantes, setConstantes] = useState<Record<string, any>[]>([]);
  const [addenda, setAddenda] = useState<Record<string, any>[]>([]);
  const [ordonnances, setOrdonnances] = useState<Record<string, any>[]>([]);
  const [cst, setCst] = useState<Record<string, string>>({});
  const [addendum, setAddendum] = useState('');
  const [lignes, setLignes] = useState<LigneOrdonnance[]>([{ medicament: '', posologie: '', duree: '', quantite: '' }]);
  const [reco, setReco] = useState('');
  const [medocs, setMedocs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('sante_consultations').select('*').eq('id', id).maybeSingle();
    if (!data) { toast.error('Consultation non accessible'); return onBack(); }
    setC(data);
    const [p, h, k, a, o, m] = await Promise.all([
      supabase.from('sante_patients').select('*').eq('id', data.patient_id).maybeSingle(),
      supabase.from('sante_consultations').select('id, created_at, motif, diagnostic, statut').eq('patient_id', data.patient_id).neq('id', id).order('created_at', { ascending: false }).limit(10),
      supabase.from('sante_constantes').select('*').eq('consultation_id', id).order('created_at'),
      supabase.from('sante_consultation_addenda').select('*').eq('consultation_id', id).order('created_at'),
      supabase.from('sante_ordonnances').select('*, lignes:sante_ordonnance_lignes(*)').eq('consultation_id', id).order('emise_le'),
      supabase.from('sante_catalogue_medicaments').select('dci, nom_commercial, forme, dosage').eq('structure_id', data.structure_id).eq('actif', true),
    ]);
    setPatient(p.data); setHistorique(h.data ?? []); setConstantes(k.data ?? []); setAddenda(a.data ?? []); setOrdonnances(o.data ?? []);
    setMedocs((m.data ?? []).map(x => [x.dci, x.nom_commercial && `(${x.nom_commercial})`, x.forme, x.dosage].filter(Boolean).join(' ')));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!c || !patient) return <div className="text-sm text-fg3">Chargement…</div>;
  const verrou = c.statut === 'cloturee';

  const enregistrer = async (): Promise<boolean> => {
    const { error, data } = await supabase.from('sante_consultations').update({ motif: c.motif, anamnese: c.anamnese, examen: c.examen, diagnostic: c.diagnostic, conduite: c.conduite }).eq('id', id).select('id').single();
    if (error || !data) { toast.error(error?.message || 'Consultation non enregistrée.'); return false; }
    toast.success('Consultation enregistrée');
    return true;
  };
  const cloturer = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveBeforeClosing(enregistrer, () => confirm('Clôturer la consultation ? Elle ne pourra plus être modifiée (addendum uniquement).'), async () => {
        const { error } = await supabase.rpc('sante_cloturer_consultation', { _consultation_id: id });
        if (error) { toast.error(error.message); return; }
        toast.success('Consultation clôturée'); await load();
      });
    } catch { toast.error('Consultation non clôturée. Vérifiez votre connexion.'); }
    finally { setBusy(false); }
  };
  const ajouterConstantes = async () => {
    const row: Record<string, number | string> = { consultation_id: id, patient_id: c.patient_id };
    CONST.forEach(([k]) => { if (cst[k]) row[k] = Number(cst[k].replace(',', '.')); });
    if (Object.keys(row).length === 2) return;
    const { error } = await supabase.from('sante_constantes').insert(row as any);
    if (error) return toast.error('Valeur hors limites ou consultation clôturée');
    setCst({}); load();
  };
  const ajouterAddendum = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error('Veuillez vous reconnecter.');
    const { error } = await supabase.from('sante_consultation_addenda').insert({ consultation_id: id, patient_id: c.patient_id, texte: addendum, auteur: user.id });
    if (error) return toast.error('Addendum refusé (5 caractères minimum)');
    setAddendum(''); load();
  };
  const emettre = async () => {
    const errs = validerOrdonnance(lignes);
    if (errs.length) return toast.error(errs[0]);
    let envoi: any[] = lignes.filter(l => l.medicament.trim());
    let { data, error } = await supabase.rpc('sante_emettre_ordonnance', { _consultation_id: id, _lignes: envoi as any, _recommandations: reco });
    if (error?.message?.startsWith('ALLERGIE')) {
      const just = window.prompt(`${error.message.replace('ALLERGIE: ', '')}\n\nSaisissez la justification médicale pour maintenir la prescription :`);
      if (!just || just.trim().length < 15) return toast.error('Prescription annulée : justification de 15 caractères minimum requise');
      envoi = envoi.map(l => ({ ...l, justification_allergie: just.trim() }));
      ({ data, error } = await supabase.rpc('sante_emettre_ordonnance', { _consultation_id: id, _lignes: envoi as any, _recommandations: reco }));
    }
    if (error?.message?.startsWith('PEDIATRIE')) {
      const just = window.prompt(`${error.message.replace(/^PEDIATRIE_\w+: /, '')}\n\nSaisissez la justification médicale pour maintenir la prescription :`);
      if (!just || just.trim().length < 15) return toast.error('Prescription annulée : justification de 15 caractères minimum requise');
      envoi = envoi.map(l => ({ ...l, justification_pediatrie: just.trim() }));
      ({ data, error } = await supabase.rpc('sante_emettre_ordonnance', { _consultation_id: id, _lignes: envoi as any, _recommandations: reco }));
    }
    if (error) return toast.error(error.message);
    toast.success('Ordonnance émise');
    setLignes([{ medicament: '', posologie: '', duree: '', quantite: '' }]); setReco('');
    await load();
    imprimerOrdonnance(data as string);
  };

  const derniere = constantes[constantes.length - 1];
  const vImc = derniere?.poids && derniere?.taille ? imc(Number(derniere.poids), Number(derniere.taille)) : null;

  return (
    <div className="max-w-7xl">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4"><ArrowLeft />Agenda</Button>
      <div className="grid xl:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <div className="border border-border bg-bg2 rounded-md p-4 flex flex-wrap justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-primary">{patient.numero_dossier}</p>
              <h1 className="font-serif text-2xl">{patient.nom} {patient.prenoms}</h1>
              <p className="text-sm text-fg2">{patient.sexe === 'F' ? 'Féminin' : 'Masculin'}{patient.date_naissance ? ` · ${libelleAge(patient.date_naissance)}` : ''}</p>
            </div>
            <div className="flex gap-2 items-start">
              {verrou ? <span className="flex items-center gap-1 text-xs border border-border rounded px-2 py-1"><Lock className="h-3 w-3" />Clôturée le {new Date(c.cloturee_le).toLocaleString('fr-FR')}</span> : (
                <><Button disabled={busy} variant="outline" onClick={() => void enregistrer()}><Save />Enregistrer</Button><Button disabled={busy} onClick={cloturer}><Lock />Clôturer</Button></>
              )}
            </div>
          </div>

          <section className="border border-border bg-bg2 rounded-md p-4">
            <h2 className="font-semibold mb-3">Constantes</h2>
            {!verrou && <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-3">
              {CONST.map(([k, l]) => <div key={k}><Label htmlFor={k} className="text-xs">{l}</Label><Input id={k} inputMode="decimal" value={cst[k] ?? ''} onChange={e => setCst(s => ({ ...s, [k]: e.target.value }))} /></div>)}
            </div>}
            {!verrou && <Button size="sm" variant="outline" onClick={ajouterConstantes}><Plus />Ajouter la mesure</Button>}
            {constantes.map(k => {
              const al = alertesConstantes(k);
              return <div key={k.id} className="text-sm mt-2 border-t border-border pt-2">
                {new Date(k.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — {CONST.filter(([f]) => k[f] != null).map(([f, l]) => `${l} ${k[f]}`).join(' · ')}
                {al.length > 0 && <span className="ml-2 text-destructive text-xs">{al.join(', ')}</span>}
              </div>;
            })}
            {vImc && <p className="text-xs text-fg2 mt-2">IMC : {vImc} ({classeImc(vImc)})</p>}
          </section>

          <section className="border border-border bg-bg2 rounded-md p-4 space-y-3">
            {CHAMPS.map(([k, l]) => (
              <div key={k}><Label htmlFor={`c-${k}`}>{l}{(k === 'motif' || k === 'diagnostic') && ' *'}</Label>
                <Textarea id={`c-${k}`} rows={k === 'motif' ? 1 : 3} disabled={verrou || busy} value={c[k] ?? ''} onChange={e => setC(s => s ? ({ ...s, [k]: e.target.value }) : s)} /></div>
            ))}
          </section>

          {verrou && <section className="border border-border bg-bg2 rounded-md p-4">
            <h2 className="font-semibold mb-3">Addenda</h2>
            {addenda.map(a => <div key={a.id} className="text-sm border-l-2 border-primary pl-3 mb-2"><p className="text-xs text-fg3">{new Date(a.created_at).toLocaleString('fr-FR')}</p>{a.texte}</div>)}
            <Textarea placeholder="Complément horodaté et signé" value={addendum} onChange={e => setAddendum(e.target.value)} />
            <Button size="sm" className="mt-2" onClick={ajouterAddendum}>Ajouter l’addendum</Button>
          </section>}

          <section className="border border-border bg-bg2 rounded-md p-4">
            <h2 className="font-semibold mb-3">Ordonnance</h2>
            <datalist id="medocs">{medocs.map(m => <option key={m} value={m} />)}</datalist>
            {lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-2 mb-2">
                <Input list="medocs" aria-label="Médicament" placeholder="Médicament" value={l.medicament} onChange={e => setLignes(ls => ls.map((x, j) => j === i ? { ...x, medicament: e.target.value } : x))} />
                <Input aria-label="Posologie" placeholder="Posologie" value={l.posologie} onChange={e => setLignes(ls => ls.map((x, j) => j === i ? { ...x, posologie: e.target.value } : x))} />
                <Input aria-label="Durée" placeholder="Durée" value={l.duree} onChange={e => setLignes(ls => ls.map((x, j) => j === i ? { ...x, duree: e.target.value } : x))} />
                <Input aria-label="Quantité" placeholder="Qté" value={l.quantite} onChange={e => setLignes(ls => ls.map((x, j) => j === i ? { ...x, quantite: e.target.value } : x))} />
                <Input aria-label="Dose en mg par jour" placeholder="mg/j" title="Dose totale en mg par jour (contrôle pédiatrique)" value={l.dose_mg_jour ?? ''} onChange={e => setLignes(ls => ls.map((x, j) => j === i ? { ...x, dose_mg_jour: e.target.value } : x))} />
                <Button size="icon" variant="ghost" aria-label="Retirer" onClick={() => setLignes(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}><Trash2 /></Button>
              </div>
            ))}
            <Textarea placeholder="Recommandations" value={reco} onChange={e => setReco(e.target.value)} className="mb-2" />
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setLignes(ls => [...ls, { medicament: '', posologie: '', duree: '', quantite: '' }])}><Plus />Ligne</Button><Button size="sm" onClick={emettre}>Émettre et imprimer</Button></div>
            {ordonnances.map(o => (
              <div key={o.id} className="mt-3 border-t border-border pt-2 text-sm flex justify-between items-center">
                <span><span className="font-mono text-xs text-primary">{o.numero}</span> · {o.lignes?.length} médicament(s) · {new Date(o.emise_le).toLocaleDateString('fr-FR')}</span>
                <Button size="sm" variant="ghost" onClick={() => imprimerOrdonnance(o.id)}><Printer />Imprimer</Button>
              </div>
            ))}
          </section>
          <DelivranceConsultation consultationId={id} structureId={c.structure_id} />
          <CertificatsAnalyses consultation={c} />
        </div>

        <aside className="border border-border bg-bg2 rounded-md p-4 h-fit xl:sticky xl:top-4">
          <h2 className="font-semibold mb-3">Historique du patient</h2>
          {historique.length === 0 ? <p className="text-xs text-fg3">Première consultation.</p> : historique.map(h => (
            <div key={h.id} className="text-sm border-b border-border py-2">
              <p className="text-xs text-fg3">{new Date(h.created_at).toLocaleDateString('fr-FR')} · {h.statut === 'cloturee' ? 'clôturée' : 'brouillon'}</p>
              <p className="font-semibold">{h.motif || '—'}</p>
              <p className="text-fg2">{h.diagnostic || ''}</p>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
