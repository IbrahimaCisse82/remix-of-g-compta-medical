import { useEffect, useState } from 'react';
<<<<<<< HEAD
import { rpcPlateforme } from '@/lib/rpc-plateforme';
=======
import { rpcPlateforme } from './rpc';
>>>>>>> origin/main
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Operateur = { user_id: string; email: string; role: 'proprietaire' | 'operateur'; actif: boolean; created_at: string };

/** Équipe qui exploite la plateforme. Seul un propriétaire ajoute, change ou désactive un opérateur. */
export default function OperateursPanel({ proprietaire }: { proprietaire: boolean }) {
  const [liste, setListe] = useState<Operateur[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'operateur' | 'proprietaire'>('operateur');
  const [busy, setBusy] = useState(false);

  async function charger() {
    const { data, error } = await rpcPlateforme<Operateur[]>('plateforme_operateurs_lister');
    if (error) toast.error(error.message); else setListe(data ?? []);
  }
  useEffect(() => { charger(); }, []);

  async function definir(e: string, r: string, actif: boolean) {
    setBusy(true);
    const { error } = await rpcPlateforme<string>('plateforme_operateur_definir', { _email: e, _role: r, _actif: actif });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success('Enregistré'); charger(); return true;
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Opérateurs</h1>
        <p className="text-sm text-muted-foreground">Personnes de l'équipe Grow Hub qui exploitent la plateforme. Elles ne voient aucun dossier patient. Chaque changement est inscrit au journal.</p>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Adresse</th><th>Rôle</th><th>État</th><th>Depuis</th>{proprietaire && <th />}</tr></thead>
        <tbody>
          {liste.map(o => (
            <tr key={o.user_id} className="border-t border-border">
              <td className="py-1.5">{o.email}</td>
              <td>{o.role === 'proprietaire' ? 'Propriétaire' : 'Opérateur'}</td>
              <td>{o.actif ? 'Actif' : 'Désactivé'}</td>
              <td>{new Date(o.created_at).toLocaleDateString('fr-FR')}</td>
              {proprietaire && <td className="text-right"><Button variant="outline" size="sm" disabled={busy} onClick={() => definir(o.email, o.role, !o.actif)}>{o.actif ? 'Désactiver' : 'Réactiver'}</Button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {proprietaire && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async e => { e.preventDefault(); if (await definir(email, role, true)) setEmail(''); }}>
          <label className="text-xs">Adresse du compte<Input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-72" /></label>
          <label className="text-xs">Rôle
            <select value={role} onChange={e => setRole(e.target.value as 'operateur' | 'proprietaire')} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="operateur">Opérateur</option>
              <option value="proprietaire">Propriétaire</option>
            </select>
          </label>
          <Button type="submit" disabled={busy || !email}>Ajouter</Button>
        </form>
      )}
      {proprietaire && <p className="text-xs text-muted-foreground">La personne doit d'abord avoir créé son compte G-Santé avec cette adresse, puis activer la double authentification.</p>}
    </section>
  );
}
