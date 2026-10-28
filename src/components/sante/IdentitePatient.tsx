import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { normaliserTelephone, telephoneValide } from '@/domain/sante/patient';

type Identity = { id: string; telephone?: string; adresse?: string; contact_urgence_nom?: string; contact_urgence_tel?: string };
const FIELDS = [['telephone','Téléphone'],['adresse','Adresse'],['contact_urgence_nom','Personne à prévenir'],['contact_urgence_tel','Téléphone à prévenir']] as const;
export default function IdentitePatient({ patient, onSaved }: { patient: Identity; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    for (const k of ['telephone','contact_urgence_tel']) if (form[k]?.trim() && !telephoneValide(form[k])) return toast.error('Téléphone invalide.');
    setBusy(true);
    try {
      const result = await supabase.from('sante_patients').update({ telephone: form.telephone?.trim() ? normaliserTelephone(form.telephone) : null, adresse: form.adresse?.trim() || null, contact_urgence_nom: form.contact_urgence_nom?.trim() || null, contact_urgence_tel: form.contact_urgence_tel?.trim() ? normaliserTelephone(form.contact_urgence_tel) : null }).eq('id',patient.id).select('id').single();
      if (result.error || !result.data) throw new Error('Modification refusée.');
      toast.success('Coordonnées enregistrées.'); setEditing(false); onSaved();
    } catch { toast.error('Coordonnées non enregistrées. Vérifiez votre accès.'); }
    finally { setBusy(false); }
  };
  if (!editing) return <Button variant="outline" onClick={() => { setForm(Object.fromEntries(FIELDS.map(([k]) => [k,patient[k] || '']))); setEditing(true); }}>Modifier les coordonnées</Button>;
  return <form onSubmit={save} className="space-y-4 mt-4"><div className="grid sm:grid-cols-2 gap-4">{FIELDS.map(([k,label]) => <div key={k}><Label htmlFor={`edit-${k}`}>{label}</Label><Input id={`edit-${k}`} value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} /></div>)}</div><div className="flex gap-2"><Button type="submit" disabled={busy}>Enregistrer les coordonnées</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Annuler</Button></div></form>;
}