import { AppProvider, useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import Landing from '@/components/Landing';
import AuthPage from '@/pages/AuthPage';
import AppShell from '@/components/AppShell';
import MfaGate from '@/components/MfaGate';

function AppContent() {
  const { launched, loading: ouverture } = useApp();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary font-mono text-sm animate-pulse">Chargement...</div>
      </div>
    );
  }

  if (launched) return <MfaGate><AppShell /></MfaGate>;
  // Ouverture ou changement de structure : écran d'attente plutôt que la page d'accueil.
  if (ouverture && user) {
    return (
      <div role="status" className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary font-mono text-sm animate-pulse">Ouverture de votre espace…</div>
      </div>
    );
  }
  return <Landing />;
}

export default function Index() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
