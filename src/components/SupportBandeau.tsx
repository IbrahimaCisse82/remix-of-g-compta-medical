import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { rpcPlateforme } from '@/lib/rpc-plateforme';

type Demande = { id: string; operateur_email: string | null; motif: string; duree_heures: number; statut: 'demande' | 'accorde'; created_at: string; expire_le: string | null };

/** Côté structure : l'administrateur accorde, refuse ou révoque un accès de support (lecture seule, sans dossiers patients). */
export default function SupportBandeau() {
  const { medicalStructure, medicalRoles } = useApp();
  const estAdmin = medicalRoles.includes('admin_structure');
  const [liste, setListe] = useState<Demande[]>([]);
  const charger = useCallback(async () => {
    if (!medicalStructure || !estAdmin) { setListe([]); return; }
    const { data } = await rpcPlateforme<Demande[]>('support_demandes_structure', { _structure_id: medicalStructure.id });
    setListe(data ?? []);
  }, [medicalStructure, estAdmin]);
  useEffect(() => { charger(); }, [charger]);

  async function agir(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await rpcPlateforme<null>(fn, args);
    if (error) toast.error(error.message); else { toast.success(ok); charger(); }
  }
  if (!liste.length) return null;
  return (
    <div className="space-y-2 border-b border-border bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" role="region" aria-label="Accès de support">
      {liste.map(d => d.statut === 'demande' ? (
        <div key={d.id} className="flex flex-wrap items-center gap-2">
          <span><strong>L'équipe G-Santé</strong> ({d.operateur_email}) demande un accès en lecture seule pendant {d.duree_heures} h, sans accès aux dossiers patients. Motif : « {d.motif} »</span>
          <Button size="sm" onClick={() => agir('support_decider', { _id: d.id, _accepter: true }, 'Accès accordé')}>Accorder</Button>
          <Button size="sm" variant="outline" onClick={() => agir('support_decider', { _id: d.id, _accepter: false }, 'Demande refusée')}>Refuser</Button>
        </div>
      ) : (
        <div key={d.id} className="flex flex-wrap items-center gap-2">
          <span>Accès de support actif ({d.operateur_email}) jusqu'à {d.expire_le ? new Date(d.expire_le).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'short', timeStyle: 'short' }) : '—'}.</span>
          <Button size="sm" variant="outline" onClick={() => agir('support_revoquer', { _id: d.id }, 'Accès révoqué')}>Révoquer maintenant</Button>
        </div>
      ))}
    </div>
  );
}
