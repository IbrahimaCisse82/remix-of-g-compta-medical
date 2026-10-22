import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Verif = { authentique: boolean; numero?: string; structure?: string; validee_le?: string; version?: number; rectifie?: boolean; empreinte?: string };

/** Page publique : vérifie l'authenticité d'un compte rendu à partir du QR code. N'affiche aucune donnée médicale ni identité patient. */
export default function VerifierCrPage() {
  const { token = '' } = useParams();
  const [v, setV] = useState<Verif | null>(null);
  useEffect(() => {
    document.title = 'Vérification de compte rendu — G-Santé';
    void supabase.rpc('sante_verifier_cr' as never, { _token: token } as never).then(({ data }) => setV((data as Verif) ?? { authentique: false }));
  }, [token]);
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-border rounded-md bg-card p-6 space-y-3">
        <p className="text-xs font-mono uppercase text-primary">G-Santé · Vérification</p>
        {!v ? <p className="text-sm text-muted-foreground">Vérification…</p> : v.authentique ? (
          <>
            <h1 className="flex items-center gap-2 text-xl font-semibold"><CheckCircle2 className="text-primary" />Compte rendu authentique</h1>
            <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Laboratoire</dt><dd>{v.structure}</dd>
              <dt className="text-muted-foreground">N° demande</dt><dd className="font-mono">{v.numero}</dd>
              <dt className="text-muted-foreground">Validé le</dt><dd>{v.validee_le ? new Date(v.validee_le).toLocaleString('fr-FR') : '—'}</dd>
              <dt className="text-muted-foreground">Version</dt><dd>{v.version}{v.rectifie ? ' (rectificatif)' : ''}</dd>
              <dt className="text-muted-foreground">Empreinte</dt><dd className="font-mono text-xs break-all">{v.empreinte}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">Comparez le n° et l’empreinte avec le document papier. Aucun résultat médical n’est affiché ici.</p>
          </>
        ) : (
          <>
            <h1 className="flex items-center gap-2 text-xl font-semibold"><XCircle className="text-destructive" />Compte rendu non reconnu</h1>
            <p className="text-sm text-muted-foreground">Ce code ne correspond à aucun compte rendu validé. Le document peut être falsifié : contactez le laboratoire émetteur.</p>
          </>
        )}
      </div>
    </main>
  );
}
