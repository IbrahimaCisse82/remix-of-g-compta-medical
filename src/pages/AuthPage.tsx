import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { lovable } from '@/integrations/lovable/index';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) toast.error(error.message);
    else {
      // Auto-create profile since trigger on auth.users isn't available
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          full_name: fullName,
        }, { onConflict: 'id' });
      }
      toast.success('Vérifiez votre email pour confirmer votre inscription.');
    }
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success('Email de réinitialisation envoyé.');
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
      if (result.error) toast.error('Connexion Google impossible. Réessayez ou connectez-vous par e-mail.');
    } catch {
      toast.error('Connexion Google impossible. Réessayez ou connectez-vous par e-mail.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5"
      style={{ background: 'radial-gradient(ellipse at 65% 15%, rgba(56,189,248,.07) 0%, transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(167,139,250,.07) 0%, transparent 50%), hsl(var(--background))' }}>
      <h1 className="font-serif text-4xl text-primary tracking-tight mb-1">G-Compta</h1>
      <p className="text-[11px] text-fg3 tracking-[3px] uppercase font-mono mb-8">Comptabilité SYSCOHADA</p>

      <div className="bg-bg2 border border-border rounded-xl p-6 w-full max-w-[400px]">
        <Button type="button" variant="outline" disabled={loading} className="w-full mb-4" onClick={handleGoogle}>Continuer avec Google</Button>
        <div className="flex items-center gap-3 mb-4"><span className="h-px flex-1 bg-border" /><span className="text-[10px] uppercase text-fg3">ou</span><span className="h-px flex-1 bg-border" /></div>
        <div className="flex gap-1 mb-5 bg-bg3 rounded-lg p-0.5">
          <button onClick={() => setMode('login')} className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-fg2'}`}>Connexion</button>
          <button onClick={() => setMode('signup')} className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${mode === 'signup' ? 'bg-primary text-primary-foreground' : 'text-fg2'}`}>Inscription</button>
        </div>

        {mode === 'forgot' ? (
          <form onSubmit={handleForgot} className="space-y-3">
            <p className="text-xs text-fg2 text-center mb-2">Entrez votre email pour réinitialiser le mot de passe.</p>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full bg-bg3 border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
            <button type="submit" disabled={loading} className="w-full py-2 rounded-lg font-semibold text-sm bg-primary text-primary-foreground disabled:opacity-50">
              {loading ? '...' : 'Envoyer le lien'}
            </button>
            <button type="button" onClick={() => setMode('login')} className="w-full text-xs text-fg3 hover:text-primary">← Retour</button>
          </form>
        ) : (
          <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-3">
            {mode === 'signup' && (
              <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nom complet" className="w-full bg-bg3 border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
            )}
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full bg-bg3 border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe" className="w-full bg-bg3 border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
            <button type="submit" disabled={loading} className="w-full py-2 rounded-lg font-semibold text-sm bg-primary text-primary-foreground disabled:opacity-50">
              {loading ? '...' : mode === 'login' ? 'Se connecter' : "S'inscrire"}
            </button>
            {mode === 'login' && (
              <button type="button" onClick={() => setMode('forgot')} className="w-full text-xs text-fg3 hover:text-primary">Mot de passe oublié ?</button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
