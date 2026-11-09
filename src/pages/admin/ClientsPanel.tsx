import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { depuis } from '@/lib/backoffice';

type Client = { structure_id: string; nom: string; type: string; entreprise: string | null; ninea: string | null; telephone: string | null;
  created_at: string; est_test: boolean; membres: number; administrateurs: string[]; derniere_connexion: string | null;
  patients_30j: number; consultations_30j: number; demandes_labo_30j: number; factures_30j: number; retours_ouverts: number };

/** Structures clientes : comptes, usage sur 30 jours (comptages), retours ouverts. Aucune donnée de patient. */
export default function ClientsPanel() {
  const [recherche, setRecherche] = useState('');
  const [test, setTest] = useState(false);
  const [liste, setListe] = useState<Client[] | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const { data, error } = await rpcPlateforme<Client[]>('plateforme_clients_lister', { _recherche: recherche || null, _inclure_test: test });
      if (error) { toast.error(error.message); setListe([]); } else setListe(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [recherche, test]);
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Clients</h1>
        <p className="text-sm text-muted-foreground">Structures inscrites, leurs administrateurs et leur usage sur 30 jours.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Rechercher une structure" value={recherche} onChange={e => setRecherche(e.target.value)} className="w-72" aria-label="Rechercher une structure" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={test} onChange={e => setTest(e.target.checked)} /> Afficher les structures de test</label>
      </div>
      {liste === null && <p role="status" className="text-sm text-muted-foreground">Chargement…</p>}
      {liste?.length === 0 && <p className="text-sm text-muted-foreground">Aucune structure.</p>}
      {!!liste?.length && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th className="py-1">Structure</th><th>Administrateurs</th><th>Membres</th><th>Dernière connexion</th><th>Usage 30 j</th><th>Retours</th></tr></thead>
          <tbody>
            {liste.map(c => (
              <tr key={c.structure_id} className="border-t border-border align-top">
                <td className="py-1.5">
                  <div className="font-medium">{c.nom}{c.est_test && <span className="ml-2 rounded bg-muted px-1 text-[10px]">test</span>}</div>
                  <div className="text-xs text-muted-foreground">{c.type} · inscrite le {new Date(c.created_at).toLocaleDateString('fr-FR')}{c.telephone ? ` · ${c.telephone}` : ''}</div>
                </td>
                <td className="text-xs">{c.administrateurs.join(', ') || '—'}</td>
                <td className="tabular-nums">{c.membres}</td>
                <td className="text-xs">{depuis(c.derniere_connexion)}</td>
                <td className="text-xs">{c.patients_30j} patients · {c.consultations_30j} consult. · {c.demandes_labo_30j} labo · {c.factures_30j} factures</td>
                <td className="tabular-nums">{c.retours_ouverts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
