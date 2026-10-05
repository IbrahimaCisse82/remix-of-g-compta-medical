import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export default function LienPortailButton({ patientId }: { patientId: string }) {
  const [busy, setBusy] = useState(false);
  const creer = async (heures: 24 | 48) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('portail-patient', { body: { action: 'lien', patient_id: patientId, heures } });
    setBusy(false);
    if (error) return toast.error(error instanceof FunctionsHttpError ? (await error.context.json().catch(() => ({}))).error ?? 'Échec' : error.message);
    const url = `${window.location.origin}/resultats?t=${data.token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success(`Lien patient copié (valable ${heures} h). Transmettez-le uniquement au patient.`);
  };
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => creer(48)}><Link2 />Lien résultats 48 h</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => creer(24)}>24 h</Button>
    </span>
  );
}
