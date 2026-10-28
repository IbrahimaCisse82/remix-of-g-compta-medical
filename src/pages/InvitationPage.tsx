import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AuthPage from '@/pages/AuthPage';
import MfaGate from '@/components/MfaGate';
import { Button } from '@/components/ui/button';
import { Check, Users } from 'lucide-react';

export default function InvitationPage() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const accept = async () => {
    if (busy || !id) return;
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('accept_medical_invitation', { _invitation_id: id });
      if (result.error) throw result.error;
      setAccepted(true);
    } catch {
      setError('Invitation invalide, expirée ou destinée à un autre compte. Contactez votre administrateur.');
    } finally { setBusy(false); }
  };
  if (loading) return <p className="p-8 text-fg2">Chargement…</p>;
  if (!user) return <AuthPage />;
  return <MfaGate><main className="min-h-screen bg-background flex items-center justify-center p-5">
    <section className="max-w-md w-full space-y-5">
      <Users className="text-primary" />
      <h1 className="font-serif text-2xl">Rejoindre votre équipe</h1>
      {accepted ? <><p className="flex items-center gap-2"><Check className="text-primary" />Invitation acceptée.</p><Button asChild><Link to="/">Accéder à mon espace</Link></Button></> : <>
        <p className="text-sm text-fg2">Compte connecté : {user.email}</p>
        <Button disabled={busy || !id} onClick={accept}>{busy ? 'Acceptation…' : 'Accepter l’invitation'}</Button>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  </main></MfaGate>;
}