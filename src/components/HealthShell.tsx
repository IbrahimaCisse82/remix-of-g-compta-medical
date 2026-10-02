import { Building2, ClipboardList, FlaskConical, LayoutDashboard, LogOut, Settings, Stethoscope, SunMoon, Users } from 'lucide-react';
import { useApp } from '@/stores/app-store';
import { useMedicalPalette, useTheme, type MedicalPalette } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';

const PALETTES: MedicalPalette[] = ['clinique', 'laboratoire', 'urgences'];

export default function HealthShell() {
  const { medicalStructure, logout } = useApp();
  const { toggle } = useTheme();
  const { palette, setPalette } = useMedicalPalette(medicalStructure?.theme_medical);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="hidden md:flex w-60 border-r border-border bg-bg2 p-4 flex-col">
        <div className="flex items-center gap-2 text-primary font-serif text-xl mb-8"><Stethoscope />G‑Santé</div>
        <nav className="space-y-1">
          <Button variant="secondary" className="w-full justify-start"><LayoutDashboard />Accueil</Button>
          <Button variant="ghost" className="w-full justify-start" disabled><Users />Patients</Button>
          <Button variant="ghost" className="w-full justify-start" disabled><ClipboardList />Consultations</Button>
          <Button variant="ghost" className="w-full justify-start" disabled><FlaskConical />Laboratoire</Button>
          <Button variant="ghost" className="w-full justify-start" disabled><Settings />Paramètres</Button>
        </nav>
        <div className="mt-auto text-xs text-fg3">Phase 0 · Socle sécurisé</div>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="h-16 border-b border-border bg-bg2 flex items-center justify-between px-4 sm:px-6">
          <div><p className="font-semibold truncate">{medicalStructure?.nom}</p><p className="text-xs text-fg3 capitalize">{medicalStructure?.type}</p></div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex border border-border rounded-md p-1 gap-1" aria-label="Palette médicale">
              {PALETTES.map(value => <Button key={value} size="sm" variant={palette === value ? 'default' : 'ghost'} onClick={() => setPalette(value)} className="capitalize">{value}</Button>)}
            </div>
            <Button size="icon" variant="outline" onClick={toggle} aria-label="Changer le thème"><SunMoon /></Button>
            <Button size="icon" variant="ghost" onClick={logout} aria-label="Quitter"><LogOut /></Button>
          </div>
        </header>
        <main className="p-5 sm:p-8">
          <div className="max-w-5xl">
            <p className="text-xs font-mono uppercase text-primary mb-2">Espace Santé</p>
            <h1 className="font-serif text-3xl mb-2">Fondations opérationnelles</h1>
            <p className="text-sm text-fg2 max-w-2xl">Votre structure, ses rôles et ses accès sont isolés et protégés. Les dossiers patients seront ajoutés après validation de cette phase.</p>
            <div className="grid sm:grid-cols-3 gap-4 mt-8">
              {[
                [Building2, 'Structure', medicalStructure?.type || '—'],
                [Users, 'Accès', 'Rôles protégés'],
                [ClipboardList, 'Traçabilité', 'Journal immuable'],
              ].map(([Icon, title, value]) => {
                const Component = Icon as typeof Building2;
                return <div key={String(title)} className="border border-border bg-bg2 rounded-md p-5"><Component className="text-primary mb-5" /><p className="text-xs text-fg3">{String(title)}</p><p className="font-semibold capitalize mt-1">{String(value)}</p></div>;
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}