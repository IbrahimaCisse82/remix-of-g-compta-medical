import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Exige le code TOTP lorsque le compte a un facteur vérifié mais que la session est encore en aal1. */
export default function MfaGate({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth() as { user: unknown; signOut?: () => Promise<void> };
  const [besoin, setBesoin] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setBesoin(false); return; }
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setBesoin(data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2');
    });
  }, [user]);

  async function verifier(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const { data: f } = await supabase.auth.mfa.listFactors();
    const totp = f?.totp?.find(x => x.status === 'verified');
    if (!totp) { setBusy(false); setBesoin(false); return; }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
    setBusy(false);
    if (error) setErr('Code invalide ou expiré.'); else setBesoin(false);
  }

  if (besoin === null) return null;
  if (!besoin) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={verifier} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold text-foreground">Double authentification</h1>
        <p className="text-sm text-muted-foreground">Saisissez le code à 6 chiffres affiché dans votre application d'authentification.</p>
        <Input inputMode="numeric" autoFocus maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy ? 'Vérification…' : 'Valider'}</Button>
        <button type="button" className="w-full text-xs text-muted-foreground underline" onClick={() => (signOut ? signOut() : supabase.auth.signOut())}>Se déconnecter</button>
      </form>
    </div>
  );
}
