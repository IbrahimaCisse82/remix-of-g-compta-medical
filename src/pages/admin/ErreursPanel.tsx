import { Fragment, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { rpcPlateforme } from '@/lib/rpc-plateforme';

type Erreur = { id: number; jour: string; premiere: string; derniere: string; occurrences: number; utilisateurs: number;
  structure_nom: string | null; page: string | null; message: string; pile: string | null; contexte: Record<string, string> };

/** Erreurs survenues chez les utilisateurs (regroupées par jour), signalées automatiquement par l'application. */
export default function ErreursPanel() {
  const [jours, setJours] = useState(7);
  const [liste, setListe] = useState<Erreur[] | null>(null);
  const [ouverte, setOuverte] = useState<number | null>(null);
  useEffect(() => {
    setListe(null);
    rpcPlateforme<Erreur[]>('plateforme_erreurs_lister', { _jours: jours }).then(({ data, error }) => {
      if (error) { toast.error(error.message); setListe([]); } else setListe(data ?? []);
    });
  }, [jours]);
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Erreurs de l'application</h1>
        <p className="text-sm text-muted-foreground">Signalées automatiquement par les navigateurs des utilisateurs, nettoyées de toute donnée personnelle, regroupées par jour. Conservées 90 jours.</p>
      </div>
      <label className="text-xs">Période
        <select value={jours} onChange={e => setJours(Number(e.target.value))} className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-sm">
          {[1, 7, 30, 90].map(j => <option key={j} value={j}>{j === 1 ? '24 heures' : `${j} jours`}</option>)}
        </select>
      </label>
      {liste === null && <p role="status" className="text-sm text-muted-foreground">Chargement…</p>}
      {liste?.length === 0 && <p className="text-sm text-muted-foreground">Aucune erreur sur la période.</p>}
      {!!liste?.length && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Dernière</th><th>Message</th><th>Page</th><th>Structure</th><th>Fois</th><th>Utilisateurs</th></tr></thead>
          <tbody>
            {liste.map(e => (
              <Fragment key={e.id}>
                <tr onClick={() => setOuverte(ouverte === e.id ? null : e.id)} className="cursor-pointer border-t border-border align-top hover:bg-muted/50">
                  <td className="py-1.5 whitespace-nowrap text-xs">{new Date(e.derniere).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="max-w-md break-words">{e.message}</td>
                  <td className="text-xs">{e.page ?? '—'}</td>
                  <td className="text-xs">{e.structure_nom ?? '—'}</td>
                  <td className="tabular-nums">{e.occurrences}</td>
                  <td className="tabular-nums">{e.utilisateurs}</td>
                </tr>
                {ouverte === e.id && (
                  <tr className="bg-muted/30">
                    <td colSpan={6} className="p-2 text-xs">
                      <div className="text-muted-foreground">{Object.entries(e.contexte ?? {}).map(([k, v]) => `${k} : ${v}`).join(' · ')}</div>
                      {e.pile && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{e.pile}</pre>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
