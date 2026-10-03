import { AppProvider, useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import Landing from '@/components/Landing';
import AuthPage from '@/pages/AuthPage';
import AppShell from '@/components/AppShell';

function AppContent() {
  const { launched } = useApp();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary font-mono text-sm animate-pulse">Chargement...</div>
      </div>
    );
  }

  if (launched) return <AppShell />;
  return <Landing />;
}

export default function Index() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
