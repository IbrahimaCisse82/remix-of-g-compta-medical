import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Relie la structure santé à une entreprise G-Compta (facturation et comptabilité partagées). */
export default function LierEntrepriseCard({ structureId }: { structureId: string }) {
  const [entreprises, setEntreprises] = useState<{ id: string; nom: string }[]>([]);
  const [lie, setLie] = useState<string | null>(null);
  const [choix, setChoix] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: e }] = await Promise.all([
        supabase.from('structures').select('entreprise_id').eq('id', structureId).maybeSingle(),
        supabase.from('entreprises').select('id, nom').order('nom'),
      ]);
      setLie(s?.entreprise_id ?? null);
      setEntreprises(e ?? []);
    })();
  }, [structureId]);

  const lier = async () => {
    const { error } = await supabase.rpc('lier_structure_entreprise', { _structure_id: structureId, _entreprise_id: choix });
    if (error) return toast.error(error.message);
    setLie(choix);
    toast.success('Structure reliée à l’entreprise');
  };

  const nomLie = entreprises.find(e => e.id === lie)?.nom;
  return (
    <section className="border border-border bg-bg2 rounded-md p-5 mt-8">
      <div className="flex items-center gap-2 mb-3"><Link2 className="text-primary" /><h2 className="font-semibold">Entreprise G-Compta</h2></div>
      {lie ? <p className="text-sm">Reliée à <strong>{nomLie ?? 'une entreprise'}</strong>. Les modules santé suivent son secteur et ses options.</p> : (
        <div className="flex gap-2 flex-wrap">
          <Select value={choix} onValueChange={setChoix}>
            <SelectTrigger className="w-64" aria-label="Entreprise"><SelectValue placeholder="Choisir une entreprise" /></SelectTrigger>
            <SelectContent>{entreprises.map(e => <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={lier} disabled={!choix}>Relier</Button>
        </div>
      )}
      <p className="text-xs text-fg3 mt-2">Seul un administrateur de la structure et de l’entreprise peut effectuer ce lien.</p>
    </section>
  );
}
