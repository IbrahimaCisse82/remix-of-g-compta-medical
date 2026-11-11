import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { useAuth } from '@/hooks/useAuth';
import MfaGate from '@/components/MfaGate';
import MfaCard from '@/components/MfaCard';
import { Button } from '@/components/ui/button';
import { etatAcces, MODULES_BACKOFFICE, type MoiPlateforme } from '@/lib/backoffice';
import OperateursPanel from './OperateursPanel';
import JournalPanel from './JournalPanel';
import ReferentielsPanel from './ReferentielsPanel';
import RetoursPanel from './RetoursPanel';
import TableauPanel from './TableauPanel';
import ClientsPanel from './ClientsPanel';
import UtilisateursPanel from './UtilisateursPanel';
import SupportPanel from './SupportPanel';


/** Espace réservé aux opérateurs de la plateforme (équipe Grow Hub). Aucune donnée médicale n'y est affichée. */
export default function AdminPage() {
  const { user, loading, signOut } = useAuth();
  const [moi, setMoi] = useState<MoiPlateforme | null | undefined>(undefined);
  const [module, setModule] = useState('tableau');

  const charger = useCallback(async () => {
    if (!user) return;
    setMoi(undefined);
    await supabase.auth.refreshSession();
    const { data, error } = await rpcPlateforme<MoiPlateforme>('plateforme_moi');
    setMoi(error ? null : data);
  }, [user]);
  useEffect(() => { charger(); }, [charger]);

  const etat = etatAcces(loading ? null : !!user, moi);
  if (etat === 'chargement') return <div role="status" aria-live="polite" className="p-8 text-sm">Chargement…</div>;
  if (etat === 'non_connecte') return (
    <Centre titre="Back-office G-Santé">
      <p className="text-sm text-muted-foreground">Connectez-vous avec votre compte opérateur.</p>
      <Button asChild><Link to="/">Se connecter</Link></Button>
    </Centre>
  );
  if (etat === 'refuse') return (
    <Centre titre="Accès réservé">
      <p className="text-sm text-muted-foreground">Cet espace est réservé à l'équipe qui exploite la plateforme. Votre compte n'en fait pas partie.</p>
      <Button asChild variant="outline"><Link to="/">Revenir à l'application</Link></Button>
    </Centre>
  );

  return (
    <MfaGate>
      {etat === 'double_auth' ? (
        <Centre titre="Double authentification obligatoire">
          <p className="text-sm text-muted-foreground">Les opérateurs doivent activer la double authentification avant d'accéder au back-office.</p>
          <MfaCard />
          <Button onClick={charger}>J'ai activé la double authentification, continuer</Button>
        </Centre>
      ) : (
        <div className="min-h-screen bg-background text-foreground flex">
          <aside className="w-60 shrink-0 border-r border-border p-4 space-y-1">
            <div className="mb-4">
              <div className="font-serif text-lg">Back-office</div>
              <div className="text-xs text-muted-foreground">{user?.email} · {moi?.role === 'proprietaire' ? 'propriétaire' : 'opérateur'}</div>
            </div>
            <nav aria-label="Modules du back-office" className="space-y-1">
              {MODULES_BACKOFFICE.map(m => (
                <button key={m.id} type="button" disabled={!m.disponible} onClick={() => setModule(m.id)}
                  aria-current={module === m.id ? 'page' : undefined}
                  className={`w-full text-left rounded px-2 py-1.5 text-sm ${module === m.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'} disabled:opacity-50 disabled:hover:bg-transparent`}>
                  {m.libelle}{!m.disponible && <span className="ml-1 text-[10px] text-muted-foreground">bientôt</span>}
                </button>
              ))}
            </nav>
            <div className="pt-6 space-y-1">
              <Link to="/" className="block text-xs text-muted-foreground underline">Retour à l'application</Link>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => signOut()}>Se déconnecter</button>
            </div>
          </aside>
          <main className="flex-1 p-6 overflow-auto">
            {module === 'operateurs' && <OperateursPanel proprietaire={moi?.role === 'proprietaire'} />}
            {module === 'journal' && <JournalPanel />}
            {module === 'referentiels' && <ReferentielsPanel />}
            {module === 'retours' && <RetoursPanel />}
            {module === 'tableau' && <TableauPanel ouvrir={setModule} />}
            {module === 'clients' && <ClientsPanel />}
            {module === 'utilisateurs' && <UtilisateursPanel />}
            {module === 'support' && <SupportPanel />}
          </main>
        </div>
      )}
    </MfaGate>
  );
}

function Centre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold text-foreground">{titre}</h1>
        {children}
      </div>
    </div>
  );
}
