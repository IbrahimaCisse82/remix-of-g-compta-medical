import { useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import AuthPage from '@/pages/AuthPage';
import { Link } from 'react-router-dom';
import { Stethoscope, FlaskConical, Receipt, Calculator, ShieldCheck, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const POLES = [
  { icon: Stethoscope, title: 'Médical & soins', desc: 'Dossier patient, agenda, file d’attente, consultations, ordonnances et certificats A4.' },
  { icon: FlaskConical, title: 'Laboratoire & qualité', desc: 'Demandes, validation technique et biologique, valeurs critiques, Westgard, réactifs.' },
  { icon: Receipt, title: 'Facturation & tiers payant', desc: 'Caisse, quote-part assurance, Wave, Orange Money, bordereaux par organisme.' },
  { icon: Calculator, title: 'Gestion & comptabilité', desc: 'Écritures automatiques SYSCOHADA, pharmacie, paie, immobilisations, états financiers.' },
  { icon: ShieldCheck, title: 'Sécurité & traçabilité', desc: 'Accès par rôle, accès d’urgence tracé, journal d’audit protégé.' },
  { icon: Users, title: 'Multi-sites & équipe', desc: 'Clinique, cabinet médical, laboratoire ou structure mixte, plusieurs sites.' },
];

const CHAIN = ['Accueil patient', 'Consultation', 'Analyses', 'Facture', 'Encaissement', 'Écriture comptable', 'Bilan annuel'];

// La démo n'existe que sur l'aperçu (build de développement) : absente du site publié.
const DEMO_DISPONIBLE = !import.meta.env.PROD || import.meta.env.VITE_DEMO_ENABLED === 'true';

export default function Landing() {
  const { launchHealth } = useApp();
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const launchDemo = async () => {
    setDemoBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('demo-sante', { body: {} });
      if (error || !data?.email) throw new Error('indisponible');
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
      if (e2) throw e2;
      await launchHealth();
    } catch {
      toast.error('La démo Clinique est momentanément indisponible.');
    }
    setDemoBusy(false);
  };

  if (showAuth && !user) return <AuthPage />;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <section className="relative px-5 pt-16 pb-20 flex flex-col items-center text-center">
        <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4">
          <span className="font-serif text-xl text-primary">G‑Santé ERP</span>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/tarifs" className="text-fg2 hover:text-primary transition-colors">Tarifs</Link>
            <span className="text-[10px] text-fg3 font-mono hidden sm:inline">par GROW HUB SARL</span>
          </div>
        </nav>

        <span className="mt-10 mb-4 inline-block px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider uppercase border border-primary/30 text-primary bg-primary/5">
          Cliniques · Cabinets médicaux · Laboratoires · Zone OHADA
        </span>
        <h1 className="font-serif text-4xl sm:text-6xl text-foreground tracking-tight mb-4 max-w-3xl leading-tight">
          La gestion intégrée de votre <span className="text-primary">structure de santé.</span>
        </h1>
        <p className="text-sm sm:text-base text-fg2 max-w-xl leading-relaxed mb-8">
          Un seul logiciel, de l’admission du patient jusqu’au bilan comptable annuel conforme SYSCOHADA.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-10 max-w-3xl">
          {CHAIN.map((s, i) => (
            <span key={s} className="flex items-center gap-2 text-xs text-fg2">
              <span className="px-3 py-1 rounded-md border border-border bg-bg2">{s}</span>
              {i < CHAIN.length - 1 && <ArrowRight className="h-3 w-3 text-primary" />}
            </span>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-[760px]">
          {DEMO_DISPONIBLE && <div className="bg-bg2 border border-border rounded-xl p-6 flex-1">
            <div className="font-serif text-lg text-primary text-center mb-3">Démo Clinique</div>
            <p className="text-xs text-fg2 text-center leading-relaxed mb-4">Clinique fictive à Dakar : patients, consultations, laboratoire, caisse et comptabilité. Données de test uniquement.</p>
            <Button className="w-full" disabled={demoBusy} onClick={launchDemo}><Stethoscope />{demoBusy ? 'Préparation…' : 'Lancer la démo Clinique'}</Button>
          </div>}
          <div className="bg-bg2 border border-border rounded-xl p-6 flex-1">
            <div className="font-serif text-lg text-primary text-center mb-3">Mon espace</div>
            {user ? (
              <>
                <p className="text-xs text-fg2 text-center leading-relaxed mb-4">Connecté : <strong className="text-primary">{user.email}</strong></p>
                <Button variant="secondary" className="w-full" onClick={() => void launchHealth()}>Accéder à mon espace</Button>
              </>
            ) : (
              <>
                <p className="text-xs text-fg2 text-center leading-relaxed mb-4">Connectez-vous pour accéder aux données de votre structure.</p>
                <Button variant="secondary" className="w-full" onClick={() => setShowAuth(true)}>Se connecter / S'inscrire</Button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 border-t border-border bg-bg2">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-serif text-2xl sm:text-3xl text-foreground mb-2">Tous vos services dans un seul environnement</h2>
            <p className="text-sm text-fg3">Le médical et la gestion financière ne font plus qu’un.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {POLES.map(p => (
              <div key={p.title} className="border border-border bg-background rounded-md p-5">
                <p.icon className="h-5 w-5 text-primary mb-3" />
                <p className="font-semibold text-sm mb-2">{p.title}</p>
                <p className="text-xs text-fg3 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-serif text-2xl text-foreground mb-4">Développé par GROW HUB SARL</h2>
          <p className="text-sm text-fg2 leading-relaxed mb-6">
            Société de droit sénégalais basée à Dakar, spécialisée dans les solutions numériques pour les structures de santé et les entreprises de la zone OHADA.
          </p>
          <a href="mailto:g-compta@growhubsenegal.com" className="text-xs text-primary hover:underline">✉ g-compta@growhubsenegal.com</a>
        </div>
      </section>

      <footer className="bg-bg2 border-t border-border px-5 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-serif text-lg text-primary">G‑Santé ERP</span>
            <span className="text-[10px] text-fg3 ml-2 font-mono">© {new Date().getFullYear()} GROW HUB SARL</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-fg2">
            <Link to="/cgu" className="hover:text-primary transition-colors">CGU</Link>
            <Link to="/confidentialite" className="hover:text-primary transition-colors">Confidentialité</Link>
            <Link to="/protection-donnees" className="hover:text-primary transition-colors">Protection des données</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
