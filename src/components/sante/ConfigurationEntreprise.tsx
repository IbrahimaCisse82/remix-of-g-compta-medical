import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

type Form = Record<string, string>;
const steps = [
  [['nom', 'Dénomination sociale'], ['sigle', 'Sigle'], ['forme_juridique', 'Forme juridique']],
  [['adresse', 'Adresse'], ['telephone', 'Téléphone']],
  [['ninea', 'NINEA'], ['rccm', 'RCCM'], ['autorisation_exercice', 'Autorisation d’exercice'], ['inscription_ordre', 'Inscription à l’ordre']],
];
export default function ConfigurationEntreprise({ structureId }: { structureId: string }) {
  const { launchHealth } = useApp();
  const [form, setForm] = useState<Form>({});
  const [step, setStep] = useState(0), [ready, setReady] = useState(false), [done, setDone] = useState(false);
  const [status, setStatus] = useState('Chargement…'), [error, setError] = useState('');
  const revision = useRef(0), queue = useRef<Promise<void>>(Promise.resolve());
  const active = useRef(true);
  const latest = useRef({ form, step });
  latest.current = { form, step };
  const persist = (values: Form, etape: number, terminer = false) => {
    const task = queue.current.then(async () => {
      if (!active.current) return;
      setStatus('Enregistrement…');
      const r = await supabase.rpc('sante_configuration_sauver', { _structure_id: structureId, _donnees: values, _etape: etape, _revision: revision.current, _terminer: terminer });
      if (r.error) { setError(r.error.message); setStatus('Non enregistré'); throw r.error; }
      revision.current = r.data.revision;
      if (active.current) { setError(''); setStatus('Enregistré'); if (terminer) setDone(true); }
    });
    queue.current = task.catch(() => {});
    return task;
  };
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    void (async () => {
      const s = await supabase.from('structures').select('nom,ninea,rccm,telephone,adresse,autorisation_exercice,inscription_ordre,entreprise_id').eq('id', structureId).single();
      if (s.error) throw s.error;
      const [draft, company] = await Promise.all([
        supabase.from('sante_configuration_brouillons').select('*').eq('structure_id', structureId).maybeSingle(),
        supabase.from('entreprises').select('sigle,forme_juridique').eq('id', s.data.entreprise_id ?? '').maybeSingle(),
      ]);
      if (draft.error || company.error) throw draft.error ?? company.error;
      if (cancelled) return;
      const initial: Form = {};
      for (const [k, v] of Object.entries({ ...s.data, ...company.data })) if (k !== 'entreprise_id') initial[k] = String(v ?? '');
      setForm(draft.data ? draft.data.donnees as Form : initial);
      setStep(draft.data?.etape ?? 0); revision.current = draft.data?.revision ?? 0;
      setDone(draft.data?.termine ?? false); setReady(true); setStatus(draft.data ? 'Enregistré' : 'Prêt');
    })().catch(e => { if (!cancelled) { setError(e.message); setStatus('Chargement impossible'); } });
    return () => { cancelled = true; active.current = false; };
  }, [structureId]);
  useEffect(() => {
    if (!ready || done) return;
    const timer = window.setTimeout(() => { void persist(form, step).catch(() => {}); }, 600);
    return () => window.clearTimeout(timer);
  }, [form, step, ready, done]); // eslint-disable-line react-hooks/exhaustive-deps
  if (done) return <section className="mb-8 border-b border-border pb-6"><h2 className="font-semibold">Configuration de l’entreprise</h2><p className="text-sm text-fg3 mt-2">Configuration terminée</p><Button className="mt-3" variant="outline" onClick={() => setDone(false)}>Modifier la configuration</Button></section>;
  return <section aria-label="Configuration de l’entreprise" className="mb-8 border-b border-border pb-6">
    <div className="flex flex-wrap justify-between gap-2 mb-4"><h2 className="font-semibold">Configuration de l’entreprise</h2><span role="status" className="text-sm text-fg3">{status}</span></div>
    {error && <div role="alert" className="text-destructive mb-3">{error}<Button variant="outline" className="ml-2" onClick={() => window.location.reload()}>Recharger</Button></div>}
    <p className="text-sm text-primary mb-4">Étape {step + 1} sur 3 · {['Identité', 'Coordonnées', 'Mentions légales'][step]}</p>
    <div className="grid sm:grid-cols-2 gap-4">{steps[step].map(([key, label]) => <div key={key}><Label htmlFor={`config-${key}`}>{label}</Label><Input id={`config-${key}`} disabled={!ready} value={form[key] ?? ''} onChange={e => { setStatus('Modifications en attente'); setForm(prev => ({ ...prev, [key]: e.target.value })); }} onBlur={() => { if (ready) void persist(latest.current.form, latest.current.step).catch(() => {}); }} /></div>)}</div>
    <div className="flex justify-between mt-5 gap-2"><Button variant="outline" disabled={!ready || step === 0} onClick={() => { const next = step - 1; setStep(next); void persist(form, next).catch(() => {}); }}><ArrowLeft />Précédent</Button>{step < 2 ? <Button disabled={!ready} onClick={() => { const next = step + 1; setStep(next); void persist(form, next).catch(() => {}); }}>Suivant<ArrowRight /></Button> : <Button disabled={!ready || (form.nom ?? '').trim().length < 2} onClick={() => { void persist(form, step, true).then(() => launchHealth()).catch(() => {}); }}><Check />Terminer la configuration</Button>}</div>
  </section>;
}