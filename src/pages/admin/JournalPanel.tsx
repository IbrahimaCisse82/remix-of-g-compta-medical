import { useEffect, useState } from 'react';
import { rpcPlateforme } from './rpc';
import { Button } from '@/components/ui/button';
import { libelleAction } from '@/lib/backoffice';

type Ligne = { id: number; created_at: string; operateur_email: string | null; action: string; cible_type: string | null; cible_id: string | null; details: Record<string, unknown> };

/** Journal d'audit de la plateforme : chaque action d'opérateur, en ajout seul. */
export default function JournalPanel() {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [erreur, setErreur] = useState('');
  const [fin, setFin] = useState(false);

  async function charger(avant?: number) {
    const { data, error } = await rpcPlateforme<Ligne[]>('plateforme_journal', { _limite: 100, _avant: avant ?? null });
    if (error) { setErreur(error.message); return; }
    const d = (data ?? []) as Ligne[];
    setLignes(l => (avant ? [...l, ...d] : d)); setFin(d.length < 100);
  }
  useEffect(() => { charger(); }, []);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Journal d'audit</h1>
        <p className="text-sm text-muted-foreground">Toutes les actions des opérateurs, les plus récentes d'abord. Le journal ne peut être ni modifié ni supprimé.</p>
      </div>
      {erreur && <p role="alert" className="text-sm text-destructive">{erreur}</p>}
      {!erreur && !lignes.length && <p className="text-sm text-muted-foreground">Aucune action enregistrée pour l'instant.</p>}
      {!!lignes.length && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Date</th><th>Opérateur</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead>
          <tbody>
            {lignes.map(l => (
              <tr key={l.id} className="border-t border-border align-top">
                <td className="py-1.5 whitespace-nowrap">{new Date(l.created_at).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar' })}</td>
                <td>{l.operateur_email ?? '—'}</td>
                <td>{libelleAction(l.action)}</td>
                <td className="text-xs">{l.cible_type ?? ''}</td>
                <td className="text-xs font-mono break-all">{JSON.stringify(l.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!fin && !!lignes.length && <Button variant="outline" size="sm" onClick={() => charger(lignes.at(-1)!.id)}>Plus ancien</Button>}
    </section>
  );
}
