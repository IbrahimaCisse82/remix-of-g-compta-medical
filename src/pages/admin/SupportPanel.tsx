import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { rpcPlateforme } from '@/lib/rpc-plateforme';

type Acces = { id: string; structure_id: string; structure_nom: string; operateur_email: string | null; motif: string; duree_heures: number;
  statut: string; created_at: string; decide_le: string | null; expire_le: string | null; termine_le: string | null };
type Client = { structure_id: string; nom: string; est_test: boolean };
const STATUTS: Record<string, string> = { demande: 'En attente de l\'administrateur', accorde: 'Accordé', refuse: 'Refusé', revoque: 'Révoqué', expire: 'Expiré' };

/** Demander un accès de support à une structure : l'administrateur de la structure l'accorde depuis l'application. */
export default function SupportPanel() {
  const [acces, setAcces] = useState<Acces[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [avecTests, setAvecTests] = useState(false);
  const [structure, setStructure] = useState('');
  const [motif, setMotif] = useState('');
  const [duree, setDuree] = useState(4);
  const [busy, setBusy] = useState(false);
  async function charger() {
    const [a, c] = await Promise.all([
      rpcPlateforme<Acces[]>('plateforme_support_lister'),
      rpcPlateforme<Client[]>('plateforme_clients_lister', { _inclure_test: true }),
    ]);
    if (a.error) toast.error(a.error.message); else setAcces(a.data ?? []);
    setClients(c.data ?? []);
  }
  useEffect(() => { charger(); }, []);
  async function demander() {
    setBusy(true);
    const { error } = await rpcPlateforme<string>('plateforme_support_demander', { _structure_id: structure, _motif: motif, _duree_heures: duree });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Demande envoyée : l\'administrateur de la structure doit l\'accorder dans l\'application.');
    setMotif(''); charger();
  }
  async function revoquer(id: string) {
    const { error } = await rpcPlateforme<null>('support_revoquer', { _id: id });
    if (error) toast.error(error.message); else charger();
  }
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Support</h1>
        <p className="text-sm text-muted-foreground">Pour aider une structure dans son espace, demandez un accès. Son administrateur l'accorde depuis l'application. L'accès est en lecture seule, sans dossiers patients, et se termine seul à l'échéance.</p>
      </div>
      <form className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_2fr_auto_auto] md:items-end" onSubmit={e => { e.preventDefault(); demander(); }}>
        <label className="text-xs">Structure
          <select required value={structure} onChange={e => setStructure(e.target.value)} className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Choisir…</option>
            {clients.filter(c => avecTests || !c.est_test).sort((a, b) => Number(a.est_test) - Number(b.est_test) || a.nom.localeCompare(b.nom)).map(c => <option key={c.structure_id} value={c.structure_id}>{c.nom}{c.est_test ? ' (test)' : ''}</option>)}
          </select>
          <span className="mt-1 flex items-center gap-1 text-muted-foreground"><input type="checkbox" checked={avecTests} onChange={e => setAvecTests(e.target.checked)} />Afficher les structures de test</span>
        </label>
        <label className="text-xs">Motif (visible par l'administrateur)<Input required minLength={5} maxLength={500} value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. : vérifier le paramétrage des tarifs signalé dans un retour" /></label>
        <label className="text-xs">Durée
          <select value={duree} onChange={e => setDuree(Number(e.target.value))} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">
            {[1, 2, 4, 8, 24, 48, 72].map(h => <option key={h} value={h}>{h} h</option>)}
          </select>
        </label>
        <Button type="submit" disabled={busy || !structure || motif.trim().length < 5}>Demander</Button>
      </form>
      {!acces.length ? <p className="text-sm text-muted-foreground">Aucune demande pour l'instant.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Structure</th><th>Opérateur</th><th>Motif</th><th>Durée</th><th>État</th><th /></tr></thead>
          <tbody>
            {acces.map(a => (
              <tr key={a.id} className="border-t border-border align-top">
                <td className="py-1.5">{a.structure_nom}</td>
                <td className="text-xs">{a.operateur_email}</td>
                <td>{a.motif}</td>
                <td>{a.duree_heures} h</td>
                <td className="text-xs">{STATUTS[a.statut] ?? a.statut}{a.statut === 'accorde' && a.expire_le ? ` jusqu'à ${new Date(a.expire_le).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'short', timeStyle: 'short' })}` : ''}</td>
                <td className="text-right">{(a.statut === 'demande' || a.statut === 'accorde') && <Button size="sm" variant="outline" onClick={() => revoquer(a.id)}>{a.statut === 'demande' ? 'Annuler' : 'Mettre fin'}</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
