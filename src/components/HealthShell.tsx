import { useEffect, useState } from 'react';
import { Building2, ClipboardList, FlaskConical, LayoutDashboard, LogOut, MapPin, Plus, Send, Settings, Stethoscope, SunMoon, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/stores/app-store';
import { useMedicalPalette, useTheme, type MedicalPalette } from '@/hooks/use-theme';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AgendaPage from '@/components/sante/AgendaPage';
import ConsultationPage from '@/components/sante/ConsultationPage';
import PatientsPage from '@/components/sante/PatientsPage';
import LaboratoirePage from '@/components/sante/LaboratoirePage';
import CataloguePage from '@/components/sante/CataloguePage';
import QualitePage from '@/components/sante/QualitePage';
import FacturationPage from '@/components/sante/FacturationPage';
import LierEntrepriseCard from '@/components/LierEntrepriseCard';
import RappelsSmsCard from '@/components/sante/RappelsSmsCard';
import ViolationsCard from '@/components/sante/ViolationsCard';
import { SecuriteFacturationCard } from '@/components/sante/BrisGlace';

const PALETTES: MedicalPalette[] = ['clinique', 'laboratoire', 'urgences'];

export type HealthView = 'accueil' | 'patients' | 'agenda' | 'laboratoire' | 'qualite' | 'facturation' | 'catalogue' | 'parametres';

export default function HealthShell({ embeddedView }: { embeddedView?: HealthView } = {}) {
  const { medicalStructure, logout } = useApp();
  const { toggle } = useTheme();
  const { palette, setPalette } = useMedicalPalette(medicalStructure?.theme_medical);
  const [stateView, setView] = useState<HealthView>('accueil');
  const view = embeddedView ?? stateView;
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [sites, setSites] = useState<{ id: string; nom: string; principal: boolean }[]>([]);
  const [invitations, setInvitations] = useState<{ id: string; email: string; role: string; statut: string }[]>([]);
  const [siteName, setSiteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'medecin' | 'biologiste' | 'technicien' | 'preleveur' | 'secretaire' | 'caissier' | 'comptable' | 'lecteur'>('medecin');

  const refreshSettings = async () => {
    if (!medicalStructure) return;
    const [sitesResult, invitationsResult] = await Promise.all([
      supabase.from('sites').select('id, nom, principal').eq('structure_id', medicalStructure.id).order('principal', { ascending: false }),
      supabase.from('medical_invitations').select('id, email, role, statut').eq('structure_id', medicalStructure.id).order('created_at', { ascending: false }),
    ]);
    setSites(sitesResult.data || []);
    setInvitations(invitationsResult.data || []);
  };

  useEffect(() => { void refreshSettings(); }, [medicalStructure?.id]);

  const changePalette = async (next: MedicalPalette) => {
    setPalette(next);
    if (!medicalStructure) return;
    const { error } = await supabase.rpc('set_medical_theme', { _structure_id: medicalStructure.id, _theme: next });
    if (error) toast.error("La palette n’a pas pu être enregistrée.");
  };

  const addSite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!medicalStructure) return;
    const { error } = await supabase.rpc('create_medical_site', { _structure_id: medicalStructure.id, _nom: siteName, _principal: sites.length === 0 });
    if (error) toast.error(error.message);
    else { setSiteName(''); toast.success('Site ajouté.'); await refreshSettings(); }
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!medicalStructure) return;
    const { error } = await supabase.rpc('create_medical_invitation', { _structure_id: medicalStructure.id, _email: inviteEmail, _role: inviteRole });
    if (error) toast.error(error.message);
    else { setInviteEmail(''); toast.success('Invitation enregistrée.'); await refreshSettings(); }
  };

  const content = (
        <main className="p-5 sm:p-8">
          {view === 'facturation' && medicalStructure ? <FacturationPage structureId={medicalStructure.id} /> : view === 'laboratoire' && medicalStructure ? <LaboratoirePage structureId={medicalStructure.id} /> : view === 'qualite' && medicalStructure ? <QualitePage structureId={medicalStructure.id} /> : view === 'catalogue' && medicalStructure ? <CataloguePage structureId={medicalStructure.id} /> : view === 'agenda' && medicalStructure ? (consultationId ? <ConsultationPage id={consultationId} onBack={() => setConsultationId(null)} /> : <AgendaPage structureId={medicalStructure.id} onConsultation={setConsultationId} />) : view === 'patients' && medicalStructure ? <PatientsPage structureId={medicalStructure.id} /> : view === 'accueil' ? (
          <div className="max-w-5xl">
            <p className="text-xs font-mono uppercase text-primary mb-2">Espace Santé</p>
            <h1 className="font-serif text-3xl mb-2">Fondations opérationnelles</h1>
            <p className="text-sm text-fg2 max-w-2xl">Votre structure, ses rôles et ses accès sont isolés et protégés. Le dossier patient est disponible : création rapide, détection des doublons et journal des accès.</p>
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
          ) : (
            <div className="max-w-5xl">
              <p className="text-xs font-mono uppercase text-primary mb-2">Configuration</p>
              <h1 className="font-serif text-3xl mb-2">Sites et équipe</h1>
              <p className="text-sm text-fg2 mb-8">Ajoutez vos lieux d’exercice et préparez les accès de chaque collaborateur.</p>
              <div className="grid gap-8 lg:grid-cols-2">
                <section className="border border-border bg-bg2 rounded-md p-5">
                  <div className="flex items-center gap-2 mb-5"><MapPin className="text-primary" /><h2 className="font-semibold">Sites</h2></div>
                  <form onSubmit={addSite} className="flex gap-2 mb-5"><div className="flex-1"><Label htmlFor="site-name" className="sr-only">Nom du site</Label><Input id="site-name" required minLength={2} value={siteName} onChange={event => setSiteName(event.target.value)} placeholder="Nom du site" /></div><Button type="submit" size="icon" aria-label="Ajouter le site"><Plus /></Button></form>
                  <div className="space-y-2">{sites.length === 0 ? <p className="text-xs text-fg3">Aucun site enregistré.</p> : sites.map(site => <div key={site.id} className="flex justify-between border border-border rounded-md p-3 text-sm"><span>{site.nom}</span>{site.principal && <span className="text-xs text-primary">Principal</span>}</div>)}</div>
                </section>
                <section className="border border-border bg-bg2 rounded-md p-5">
                  <div className="flex items-center gap-2 mb-5"><Users className="text-primary" /><h2 className="font-semibold">Invitations</h2></div>
                  <form onSubmit={invite} className="space-y-3 mb-5">
                    <div><Label htmlFor="invite-email" className="sr-only">Email</Label><Input id="invite-email" type="email" required value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="collaborateur@structure.sn" /></div>
                    <Select value={inviteRole} onValueChange={value => setInviteRole(value as typeof inviteRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['medecin','biologiste','technicien','preleveur','secretaire','caissier','comptable','lecteur'].map(role => <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>)}</SelectContent></Select>
                    <Button type="submit" className="w-full"><Send />Enregistrer l’invitation</Button>
                  </form>
                  <div className="space-y-2">{invitations.length === 0 ? <p className="text-xs text-fg3">Aucune invitation.</p> : invitations.map(item => <div key={item.id} className="border border-border rounded-md p-3"><p className="text-sm truncate">{item.email}</p><p className="text-xs text-fg3 capitalize">{item.role} · {item.statut.replace('_', ' ')}</p></div>)}</div>
                </section>
              </div>
              {medicalStructure && <LierEntrepriseCard structureId={medicalStructure.id} />}
              {medicalStructure && <div className="mt-8"><RappelsSmsCard structureId={medicalStructure.id} /></div>}
              {medicalStructure && <ViolationsCard structureId={medicalStructure.id} />}
              {medicalStructure && <SecuriteFacturationCard structureId={medicalStructure.id} />}
            </div>
          )}
        </main>
  );
  if (embeddedView) return content;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="hidden md:flex w-60 border-r border-border bg-bg2 p-4 flex-col">
        <div className="flex items-center gap-2 text-primary font-serif text-xl mb-8"><Stethoscope />G‑Santé</div>
        <nav className="space-y-1">
          <Button variant={view === 'accueil' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setView('accueil')}><LayoutDashboard />Accueil</Button>
          <Button variant={view === 'patients' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setView('patients')}><Users />Patients</Button>
          <Button variant={view === 'agenda' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => { setConsultationId(null); setView('agenda'); }}><ClipboardList />Agenda & consultations</Button>
          <Button variant={view === 'laboratoire' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setView('laboratoire')}><FlaskConical />Laboratoire</Button>
          <Button variant={view === 'qualite' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setView('qualite')}><ClipboardList />Qualité & réactifs</Button>
          <Button variant={view === 'facturation' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setView('facturation')}><ClipboardList />Factures & caisse</Button>
          <Button variant={view === 'catalogue' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setView('catalogue')}><Building2 />Catalogue & tarifs</Button>
          <Button variant={view === 'parametres' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setView('parametres')}><Settings />Paramètres</Button>
        </nav>
        <div className="mt-auto text-xs text-fg3">Clinique · Laboratoire</div>
      </aside>
      <div className="flex-1 min-w-0">
        <nav className="md:hidden flex gap-1 border-b border-border bg-bg2 p-2 overflow-x-auto">{(['accueil','patients','agenda','laboratoire','qualite','facturation','catalogue','parametres'] as const).map(v => <Button key={v} size="sm" variant={view === v ? 'secondary' : 'ghost'} onClick={() => setView(v)} className="capitalize">{v === 'parametres' ? 'Paramètres' : v}</Button>)}</nav>
        <header className="h-16 border-b border-border bg-bg2 flex items-center justify-between px-4 sm:px-6">
          <div><p className="font-semibold truncate">{medicalStructure?.nom}</p><p className="text-xs text-fg3 capitalize">{medicalStructure?.type}</p></div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex border border-border rounded-md p-1 gap-1" aria-label="Palette médicale">
              {PALETTES.map(value => <Button key={value} size="sm" variant={palette === value ? 'default' : 'ghost'} onClick={() => void changePalette(value)} className="capitalize">{value}</Button>)}
            </div>
            <Button size="icon" variant="outline" onClick={toggle} aria-label="Changer le thème"><SunMoon /></Button>
            <Button size="icon" variant="ghost" onClick={logout} aria-label="Quitter"><LogOut /></Button>
          </div>
        </header>
        {content}
      </div>
    </div>
  );
}