import { AppProvider, useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import Landing from '@/components/Landing';
import AuthPage from '@/pages/AuthPage';
import AppShell from '@/components/AppShell';
import HealthOnboarding from '@/components/HealthOnboarding';
import HealthShell from '@/components/HealthShell';

function AppContent() {
  const { launched, workspace, medicalStructure } = useApp();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary font-mono text-sm animate-pulse">Chargement...</div>
      </div>
    );
  }

  if (launched && workspace === 'sante') return medicalStructure ? <HealthShell /> : <HealthOnboarding />;
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
