import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { couvertureValide } from '@/lib/tiers-payant-saisie';
import { useApp } from '@/stores/app-store';
import ImportOrganismes from './ImportOrganismes';

export function OrganismesPayeurs({ structureId, onChanged }: { structureId: string; onChanged: () => void }) {
  const { medicalRoles } = useApp();
  const writable = medicalRoles.some(r => r === 'admin_structure' || r === 'tiers_payant');
  const [rows, setRows] = useState<{ id: string; nom: string; type: string; actif: boolean }[]>([]);
  const [nom, setNom] = useState(''), [type, setType] = useState('ipm'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [partage, setPartage] = useState(false);
  const load = useCallback(async () => {
    setPartage(false);
    const groupe = await supabase.from('sante_repertoire_partages').select('structure_id').eq('structure_id', structureId).maybeSingle();
    setPartage(Boolean(groupe.data));
    setRows([]); const r = await supabase.from('sante_organismes').select('id,nom,type,actif').eq('structure_id', structureId).order('nom');
    setError(r.error?.message ?? ''); if (!r.error) setRows(r.data ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);
  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy || !nom.trim()) return;
    setBusy(true);
    try {
      const r = await supabase.from('sante_organismes').insert({ structure_id: structureId, nom: nom.trim(), type });
      if (r.error) return toast.error(r.error.message);
      setNom(''); toast.success('Organisme payeur enregistré'); await load(); onChanged();
    } finally { setBusy(false); }
  };
  return <section className="space-y-4 border-b border-border pb-6" aria-label="Organismes payeurs">
    <h2 className="font-semibold flex gap-2 items-center"><Building2 className="h-5 w-5 text-primary" />Organismes payeurs</h2>
    {partage && <p className="text-sm text-fg3">Répertoire partagé</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {writable && <ImportOrganismes key={structureId} structureId={structureId} onImported={() => { void load(); onChanged(); }} />}
    {writable && <form onSubmit={ajouter} className="flex flex-wrap gap-3 items-end"><div className="flex-1 min-w-48"><Label htmlFor="org-name">Nom de l’organisme</Label><Input id="org-name" required value={nom} onChange={e => setNom(e.target.value)} /></div><div className="w-44"><Label htmlFor="org-type">Type d’organisme</Label><Select value={type} onValueChange={setType}><SelectTrigger id="org-type"><SelectValue /></SelectTrigger><SelectContent>{['ipm','assurance','mutuelle','entreprise','autre'].map(t => <SelectItem value={t} key={t}>{t}</SelectItem>)}</SelectContent></Select></div><Button disabled={busy || !nom.trim()}><Plus className="h-4 w-4" />Enregistrer l’organisme</Button></form>}
    <div className="divide-y divide-border">{rows.map(o => <div key={o.id} className="flex justify-between py-2 text-sm"><span>{o.nom}</span><span className="text-fg3">{o.type} · {o.actif ? 'Actif' : 'Inactif'}</span></div>)}{!rows.length && !error && <p className="text-fg3 text-sm">Aucun organisme enregistré.</p>}</div>
  </section>;
}

export function CouverturePatient({ structureId, patientId, refresh, onSaved }: { structureId: string; patientId: string; refresh: number; onSaved: () => void }) {
  const [orgs, setOrgs] = useState<string[]>([]), [org, setOrg] = useState('');
  const [taux, setTaux] = useState(''), [plafond, setPlafond] = useState(''), [numero, setNumero] = useState('');
  const [debut, setDebut] = useState(''), [fin, setFin] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { setOrg(''); void supabase.from('sante_organismes').select('nom').eq('structure_id', structureId).eq('actif', true).order('nom').then(r => { if (r.error) toast.error(r.error.message); setOrgs((r.data ?? []).map(o => o.nom)); }); }, [structureId, refresh]);
  const save = async () => {
    if (busy || !org) return;
    let values;
    try { values = couvertureValide(taux, plafond, debut, fin); } catch(e) { return toast.error((e as Error).message); }
    setBusy(true);
    try {
      const r = await supabase.from('sante_patient_assurances').insert({ patient_id: patientId, organisme: org, numero_adherent: numero.trim() || null, ...values });
      if (r.error) return toast.error(r.error.message);
      toast.success('Prise en charge enregistrée'); setTaux(''); setNumero(''); setPlafond(''); setOrg(''); onSaved();
    } finally { setBusy(false); }
  };
  return <details className="border-y border-border py-3"><summary className="cursor-pointer text-sm font-semibold">Ajouter une prise en charge</summary><div className="grid sm:grid-cols-3 gap-3 mt-4">
    <div><Label htmlFor="pec-org">Organisme payeur</Label><Select value={org} onValueChange={setOrg}><SelectTrigger id="pec-org"><SelectValue placeholder="Sélectionner" /></SelectTrigger><SelectContent>{orgs.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
    <div><Label htmlFor="pec-taux">Taux de couverture (%)</Label><Input id="pec-taux" type="number" min={0} max={100} value={taux} onChange={e => setTaux(e.target.value)} /></div>
    <div><Label htmlFor="pec-num">N° d’adhérent</Label><Input id="pec-num" value={numero} onChange={e => setNumero(e.target.value)} /></div>
    <div><Label htmlFor="pec-plafond">Plafond (FCFA, facultatif)</Label><Input id="pec-plafond" type="number" min={0} step={1} value={plafond} onChange={e => setPlafond(e.target.value)} /></div>
    <div><Label htmlFor="pec-debut">Début de validité</Label><Input id="pec-debut" type="date" value={debut} onChange={e => setDebut(e.target.value)} /></div>
    <div><Label htmlFor="pec-fin">Fin de validité</Label><Input id="pec-fin" type="date" value={fin} onChange={e => setFin(e.target.value)} /></div>
    <Button className="sm:col-span-3" disabled={busy || !org || !taux.trim()} onClick={save}>Enregistrer la prise en charge</Button>
  </div></details>;
}