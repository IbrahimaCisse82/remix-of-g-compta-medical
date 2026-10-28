import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import type { TypeStructure } from '@/lib/navigation-sante';

type Member = { id: string; user_id: string; nom: string; email: string; statut: string; roles: string[] };
const ROLES = ['admin_structure','medecin','biologiste','technicien','preleveur','secretaire','caissier','comptable','lecteur','tiers_payant'];
export default function EquipeCard({ structureId, type }: { structureId: string; type: TypeStructure }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await supabase.rpc('sante_equipe_lister', { _structure_id: structureId });
    if (r.error) { setError('Impossible de charger l’équipe.'); return; }
    setError(''); setMembers(r.data ?? []);
  };
  useEffect(() => { void load(); }, [structureId]);
  const save = async (m: Member, statut: string) => {
    setBusy(true);
    try {
      const r = await supabase.rpc('sante_equipe_modifier', { _structure_id: structureId, _membership_id: m.id, _roles: m.roles, _statut: statut });
      if (r.error) { toast.error(r.error.message); return; }
      toast.success('Accès actualisés.'); await load();
    } finally { setBusy(false); }
  };
  const roles = ROLES.filter(r => !(type === 'laboratoire' && r === 'medecin') && !(type === 'cabinet' && ['biologiste','technicien','preleveur'].includes(r)));
  return <section className="mt-8 space-y-4">
    <h2 className="font-semibold">Membres et habilitations</h2>
    {error && <p role="alert" className="text-destructive">{error}<Button variant="ghost" onClick={() => void load()}>Réessayer</Button></p>}
    {members.map(m => <div key={m.id} className="border border-border rounded-md p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2"><span className="font-medium break-all">{m.nom || m.email || m.user_id}</span><span className="text-xs text-fg2">{m.statut}</span></div>
      <div className="flex flex-wrap gap-4">{roles.map(role => <label key={role} className="flex items-center gap-2 text-sm"><Checkbox disabled={busy} checked={m.roles.includes(role)} onCheckedChange={checked => setMembers(prev => prev.map(item => item.id === m.id ? { ...item, roles: checked ? [...item.roles, role] : item.roles.filter(r => r !== role) } : item))} />{role.replace(/_/g,' ')}</label>)}</div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !m.roles.length} onClick={() => void save(m, m.statut)}>Enregistrer les rôles</Button><Button variant="outline" disabled={busy || !m.roles.length} onClick={() => void save(m, m.statut === 'actif' ? 'suspendu' : 'actif')}>{m.statut === 'actif' ? 'Suspendre l’accès' : 'Réactiver l’accès'}</Button></div>
    </div>)}
  </section>;
}