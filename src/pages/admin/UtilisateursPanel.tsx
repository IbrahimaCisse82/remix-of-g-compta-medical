import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { depuis } from '@/lib/backoffice';

type Utilisateur = { user_id: string; email: string; created_at: string; derniere_connexion: string | null; email_confirme: boolean;
  double_auth: boolean; operateur: boolean; rattachements: { structure: string; type: string; statut: string; roles: string[] }[] };

/** Retrouver un compte pour aider un utilisateur. Chaque recherche est inscrite au journal d'audit. */
export default function UtilisateursPanel() {
  const [email, setEmail] = useState('');
  const [liste, setListe] = useState<Utilisateur[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function chercher() {
    setBusy(true);
    const { data, error } = await rpcPlateforme<Utilisateur[]>('plateforme_utilisateur_chercher', { _email: email });
    setBusy(false);
    if (error) toast.error(error.message); else setListe(data ?? []);
  }
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">Retrouver un compte par son adresse : connexion, double authentification, structures et rôles. La recherche est inscrite au journal d'audit.</p>
      </div>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); chercher(); }}>
        <Input placeholder="Adresse e-mail (ou une partie)" value={email} onChange={e => setEmail(e.target.value)} className="w-80" aria-label="Adresse e-mail" />
        <Button type="submit" disabled={busy || email.trim().length < 3}>{busy ? 'Recherche…' : 'Rechercher'}</Button>
      </form>
      {liste?.length === 0 && <p className="text-sm text-muted-foreground">Aucun compte ne correspond.</p>}
      {liste?.map(u => (
        <div key={u.user_id} className="rounded-lg border border-border bg-card p-3 text-sm space-y-1">
          <div className="font-medium">{u.email}{u.operateur && <span className="ml-2 rounded bg-primary/10 px-1 text-[10px] text-primary">opérateur</span>}</div>
          <div className="text-xs text-muted-foreground">
            Créé le {new Date(u.created_at).toLocaleDateString('fr-FR')} · dernière connexion {depuis(u.derniere_connexion)} ·
            adresse {u.email_confirme ? 'confirmée' : 'non confirmée'} · double authentification {u.double_auth ? 'active' : 'non activée'}
          </div>
          {u.rattachements.length ? (
            <ul className="text-xs">{u.rattachements.map(r => <li key={r.structure}>{r.structure} ({r.type}) : {r.roles.join(', ') || 'aucun rôle'}{r.statut !== 'actif' ? ` — ${r.statut}` : ''}</li>)}</ul>
          ) : <div className="text-xs text-muted-foreground">Rattaché à aucune structure.</div>}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Mot de passe oublié : l'utilisateur clique sur « Mot de passe oublié » à l'écran de connexion. L'équipe ne voit ni ne choisit jamais de mot de passe.</p>
    </section>
  );
}
