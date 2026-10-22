import { useApp, type PageId } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import NotificationsBell from '@/components/NotificationsBell';
import Dashboard from '@/pages/Dashboard';
import JournalPage from '@/pages/JournalPage';
import BalancePage from '@/pages/BalancePage';
import BilanPage from '@/pages/BilanPage';
import ResultatPage from '@/pages/ResultatPage';
import TFTPage from '@/pages/TFTPage';
import PlanComptablePage from '@/pages/PlanComptablePage';
import ExercicesPage from '@/pages/ExercicesPage';
import ParametresPage from '@/pages/ParametresPage';
import SaisiePage from '@/pages/SaisiePage';
import GrandLivrePage from '@/pages/GrandLivrePage';
import BalanceAgeePage from '@/pages/BalanceAgeePage';
import RapprochementPage from '@/pages/RapprochementPage';
import NotesAnnexesPage from '@/pages/NotesAnnexesPage';
import AuditTrailPage from '@/pages/AuditTrailPage';
import LiasseFiscalePage from '@/pages/LiasseFiscalePage';
import ImportPage from '@/pages/ImportPage';
import CabinetPage from '@/pages/CabinetPage';
import LettragePage from '@/pages/LettragePage';
import AnalytiquePage from '@/pages/AnalytiquePage';
import BudgetPage from '@/pages/BudgetPage';
import TvaPage from '@/pages/TvaPage';
import AbonnementPage from '@/pages/AbonnementPage';
import MonAbonnementPage from '@/pages/MonAbonnementPage';
import AbonnementsClientsPage from '@/pages/AbonnementsClientsPage';
import CloturePage from '@/pages/CloturePage';
import ImmobilisationsPage from '@/pages/ImmobilisationsPage';
import FacturationPage from '@/pages/FacturationPage';
import FournisseursPage from '@/pages/FournisseursPage';
import PaiePage from '@/pages/PaiePage';
import EcheancierPage from '@/pages/EcheancierPage';
import StocksPage from '@/pages/StocksPage';
import ProvisionsPage from '@/pages/ProvisionsPage';
import DocumentsPage from '@/pages/DocumentsPage';
import ValidationPage from '@/pages/ValidationPage';
import PortailPage from '@/pages/PortailPage';
import KpiCollabPage from '@/pages/KpiCollabPage';
import MobileMoneyPage from '@/pages/MobileMoneyPage';
import FacturesDgidPage from '@/pages/FacturesDgidPage';
import AnomaliesPage from '@/pages/AnomaliesPage';
import HealthShell, { type HealthView } from '@/components/HealthShell';
import HealthOnboarding from '@/components/HealthOnboarding';

type NavItem = { id: PageId; icon: string; label: string; shortcut?: string; cabinet?: boolean };
type NavSection = { key: string; section: string; icon: string; groups: { title?: string; items: NavItem[] }[] };

const NAV: NavSection[] = [
  { key: 'clinique', section: 'Clinique & soins', icon: '🏥', groups: [{ items: [
    { id: 'sante_accueil', icon: '✚', label: 'Accueil santé' },
    { id: 'sante_patients', icon: '🩺', label: 'Patients', shortcut: 'Alt+N' },
    { id: 'sante_agenda', icon: '📅', label: 'Agenda & consultations' },
    { id: 'stocks', icon: '💊', label: 'Pharmacie & consommables' },
  ]}]},
  { key: 'labo', section: 'Laboratoire & qualité', icon: '🧪', groups: [{ items: [
    { id: 'sante_laboratoire', icon: '🧪', label: 'Laboratoire' },
    { id: 'sante_qualite', icon: '🧫', label: 'Qualité & réactifs' },
  ]}]},
  { key: 'factu', section: 'Facturation & tiers-payant', icon: '💳', groups: [{ items: [
    { id: 'sante_facturation', icon: '💳', label: 'Factures & caisse' },
    { id: 'sante_retrocessions', icon: '🤝', label: 'Rétrocessions praticiens' },
    { id: 'facturation', icon: '🧾', label: 'Honoraires & facturation' },
    { id: 'factures_dgid', icon: '📄', label: 'e-Facturation DGID' },
    { id: 'fournisseurs', icon: '📥', label: 'Fournisseurs & laboratoires' },
  ]}]},
  { key: 'pilotage', section: 'Pilotage', icon: '📊', groups: [{ items: [
    { id: 'sante_pilotage', icon: '📊', label: 'Tableaux de bord santé' },
    { id: 'sante_personnel', icon: '🗓️', label: 'Personnel & gardes' },
    { id: 'sante_exploitation', icon: '🛡️', label: 'Supervision & sauvegardes' },
    { id: 'dashboard', icon: '◈', label: 'Tableau de bord financier', shortcut: 'Alt+D' },
    { id: 'clients', icon: '👥', label: 'Mes Clients', cabinet: true },
    { id: 'cabinet_mgmt', icon: '🏛️', label: 'Gestion Cabinet', cabinet: true },
    { id: 'kpi_collab', icon: '📈', label: 'KPI Collaborateurs', cabinet: true },
    { id: 'abonnements_clients', icon: '🗂️', label: 'Abonnements Clients', cabinet: true },
  ]}]},
  { key: 'compta', section: 'Comptabilité SYSCOHADA', icon: '⚖️', groups: [
    { title: 'Écritures', items: [
      { id: 'saisie', icon: '✏️', label: "Saisie d'écritures", shortcut: 'Alt+S' },
      { id: 'journal', icon: '📋', label: 'Journal', shortcut: 'Alt+J' },
      { id: 'grandlivre', icon: '📖', label: 'Grand Livre', shortcut: 'Alt+G' },
      { id: 'lettrage', icon: '🔗', label: 'Lettrage' },
      { id: 'validation', icon: '✅', label: 'Validation écritures' },
      { id: 'import', icon: '📥', label: 'Import FEC/CSV' },
      { id: 'abonnement', icon: '🔄', label: 'Écritures récurrentes' },
    ]},
    { title: 'Trésorerie', items: [
      { id: 'rapprochement', icon: '🏦', label: 'Rapprochement' },
      { id: 'mobile_money', icon: '📱', label: 'Mobile Money' },
      { id: 'balance_agee', icon: '⏳', label: 'Balance âgée' },
    ]},
    { title: 'Contrôles', items: [
      { id: 'balance', icon: '⚖️', label: 'Balance', shortcut: 'Alt+B' },
      { id: 'anomalies', icon: '🔎', label: 'Contrôles de cohérence' },
      { id: 'audit', icon: '🔍', label: "Piste d'audit" },
    ]},
    { title: 'Actifs & personnel', items: [
      { id: 'immobilisations', icon: '🏭', label: 'Immobilisations' },
      { id: 'provisions', icon: '🛡️', label: 'Provisions & dépréc.' },
      { id: 'paie', icon: '💼', label: 'Paie du personnel' },
    ]},
    { title: 'Fiscalité & gestion', items: [
      { id: 'tva', icon: '🧾', label: 'TVA & fiscalité' },
      { id: 'echeancier', icon: '📅', label: 'Échéancier fiscal' },
      { id: 'analytique', icon: '📊', label: 'Comptabilité analytique' },
      { id: 'budget', icon: '💰', label: 'Gestion budgétaire' },
    ]},
  ]},
  { key: 'etats', section: 'États financiers', icon: '🏛️', groups: [{ items: [
    { id: 'bilan', icon: '🏛️', label: 'Bilan', shortcut: 'Alt+I' },
    { id: 'resultat', icon: '📊', label: 'Compte de résultat', shortcut: 'Alt+R' },
    { id: 'tft', icon: '💸', label: 'Flux de trésorerie' },
    { id: 'note34', icon: '📝', label: 'Notes annexes' },
    { id: 'liasse', icon: '📦', label: 'Liasse fiscale DSF' },
  ]}]},
  { key: 'docs', section: 'Documents & partage', icon: '📁', groups: [{ items: [
    { id: 'documents', icon: '📁', label: 'Documents (GED)' },
    { id: 'portail', icon: '🌐', label: 'Portail client' },
  ]}]},
  { key: 'params', section: 'Structure & paramètres', icon: '⚙️', groups: [{ items: [
    { id: 'sante_parametres', icon: '🏥', label: 'Structure & équipe' },
    { id: 'sante_catalogue', icon: '📋', label: 'Catalogue & tarifs' },
    { id: 'plan', icon: '🗂️', label: 'Plan comptable', shortcut: 'Alt+P' },
    { id: 'exercices', icon: '📅', label: 'Exercices', shortcut: 'Alt+E' },
    { id: 'cloture', icon: '🔒', label: 'Clôture / réouverture' },
    { id: 'mon_abonnement', icon: '💳', label: 'Mon abonnement' },
    { id: 'parametres', icon: '⚙️', label: 'Paramètres' },
  ]}]},
];

const NAV_STORAGE = 'gsante.nav.open';

const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard, journal: JournalPage, balance: BalancePage,
  bilan: BilanPage, resultat: ResultatPage, tft: TFTPage,
  anomalies: AnomaliesPage,
  plan: PlanComptablePage, exercices: ExercicesPage, parametres: ParametresPage,
  saisie: SaisiePage, grandlivre: GrandLivrePage,
  balance_agee: BalanceAgeePage, rapprochement: RapprochementPage,
  note34: NotesAnnexesPage, audit: AuditTrailPage, liasse: LiasseFiscalePage,
  import: ImportPage, cabinet_mgmt: CabinetPage,
  lettrage: LettragePage, analytique: AnalytiquePage, budget: BudgetPage,
  tva: TvaPage, abonnement: AbonnementPage, mon_abonnement: MonAbonnementPage,
  abonnements_clients: AbonnementsClientsPage, cloture: CloturePage,
  immobilisations: ImmobilisationsPage,
  facturation: FacturationPage,
  fournisseurs: FournisseursPage,
  paie: PaiePage,
  echeancier: EcheancierPage,
  stocks: StocksPage,
  provisions: ProvisionsPage,
  documents: DocumentsPage,
  validation: ValidationPage,
  portail: PortailPage,
  kpi_collab: KpiCollabPage,
  mobile_money: MobileMoneyPage,
  factures_dgid: FacturesDgidPage,
};

function ClientsPage() {
  const { entreprises, entreprise, switchEntreprise, loading } = useApp();
  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">👥 Mes Clients</div>
        <span className="text-[10px] text-fg3 font-mono">{entreprises.length} entreprise(s)</span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {entreprises.map(ent => (
            <button key={ent.id} disabled={loading}
              className={`text-left bg-bg2 border rounded-lg p-4 hover:border-primary transition-all ${ent.id === entreprise?.id ? 'border-primary bg-primary/5' : 'border-border'}`}
              onClick={() => switchEntreprise(ent.id)}>
              <div className="font-bold text-sm text-foreground mb-1">{ent.nom}</div>
              <div className="text-[10px] text-fg3 font-mono">{ent.sigle && `${ent.sigle} · `}{ent.ninea || '—'}</div>
              <div className="text-[10px] text-fg3">{ent.forme_juridique} · {ent.secteur || '—'}</div>
              {ent.id === entreprise?.id && <div className="text-[9px] text-primary font-bold mt-2">✓ Sélectionné</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const shortcuts = [
    { keys: 'Alt+D', action: 'Tableau de bord' },
    { keys: 'Alt+S', action: "Saisie d'écritures" },
    { keys: 'Alt+J', action: 'Journal' },
    { keys: 'Alt+B', action: 'Balance' },
    { keys: 'Alt+G', action: 'Grand Livre' },
    { keys: 'Alt+I', action: 'Bilan' },
    { keys: 'Alt+R', action: 'Compte de Résultat' },
    { keys: 'Alt+P', action: 'Plan Comptable' },
    { keys: 'Alt+E', action: 'Exercices' },
    { keys: 'Alt+T', action: 'Basculer thème' },
    { keys: 'Alt+M', action: 'Menu latéral' },
    { keys: 'Alt+?', action: 'Aide raccourcis' },
  ];
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-xl p-5 w-[360px] max-h-[80vh] overflow-y-auto shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-base text-foreground">⌨️ Raccourcis clavier</h3>
          <button onClick={onClose} className="text-fg3 hover:text-foreground text-sm">✕</button>
        </div>
        <div className="space-y-1">
          {shortcuts.map(s => (
            <div key={s.keys} className="flex items-center justify-between py-1.5 border-b border-border/30">
              <span className="text-xs text-fg2">{s.action}</span>
              <kbd className="px-2 py-0.5 bg-bg3 border border-border rounded text-[10px] font-mono text-primary font-bold">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { env, currentPage, setPage, entreprise, exercice, logout, demo, isExerciceCloture } = useApp();
  const { user } = useAuth();
  const { resolved, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const locked = isExerciceCloture();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(NAV_STORAGE) || '{}'); } catch { return {}; }
  });
  const toggleSection = (key: string, open: boolean) => setOpenSections(prev => {
    const next = { ...prev, [key]: open };
    try { localStorage.setItem(NAV_STORAGE, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), []);

  useKeyboardShortcuts({
    setPage: (page: PageId) => { setPage(page); setSidebarOpen(false); },
    toggleTheme: toggle,
    toggleSidebar,
  });

  useEffect(() => {
    const handler = () => setShowShortcuts(true);
    window.addEventListener('show-shortcuts', handler);
    return () => window.removeEventListener('show-shortcuts', handler);
  }, []);

  const { medicalStructure, workspace } = useApp();
  useEffect(() => { if (workspace === 'sante') setPage('sante_accueil'); }, [workspace]); // eslint-disable-line react-hooks/exhaustive-deps
  const healthView = currentPage.startsWith('sante_') ? currentPage.slice(6) as HealthView : null;
  const PageComponent = currentPage === 'clients' ? ClientsPage : (PAGES[currentPage] || Dashboard);

  const handlePageChange = (page: PageId) => {
    setPage(page);
    setSidebarOpen(false);
  };

  return (
    <div className="h-screen flex flex-col">
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* TOPBAR */}
      <div className="h-[50px] bg-bg2 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <button onClick={toggleSidebar} className="lg:hidden text-fg2 text-lg">☰</button>
          <span className="font-serif text-lg text-primary">✚ G-Santé ERP</span>
          <div className="hidden sm:flex items-center bg-bg3 border border-border rounded-full overflow-hidden text-[11px]">
            <span className={`px-2.5 py-1 font-bold border-r border-border ${env === 'cabinet' ? 'text-purple' : 'text-accent'}`}>
              {env === 'cabinet' ? '⚖️ Cabinet' : '🏭 Entreprise'}
            </span>
            <span className="px-2.5 py-1 text-primary font-semibold truncate max-w-[150px]">{entreprise?.nom || '—'}</span>
            <span className="px-2 text-fg3 text-[10px]">›</span>
            <span className="px-2.5 py-1 text-accent font-mono font-bold">Ex. {exercice?.annee || '—'}</span>
            {locked && <span className="px-2 py-0.5 text-[9px] text-destructive font-bold">🔒</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          {/* Theme toggle */}
          <button onClick={toggle} title="Alt+T : Basculer thème"
            className="px-2 py-1 rounded-md text-xs border border-border text-fg2 hover:bg-bg3 transition-colors">
            {resolved === 'dark' ? '☀️' : '🌙'}
          </button>
          {/* Shortcuts help */}
          <button onClick={() => setShowShortcuts(true)} title="Alt+? : Raccourcis"
            className="hidden sm:inline px-2 py-1 rounded-md text-xs border border-border text-fg2 hover:bg-bg3">⌨️</button>
          {demo && <span className="hidden sm:inline text-[10px] text-fg3 font-mono px-2 py-0.5 bg-bg3 border border-border rounded-xl">démo</span>}
          {user && !demo && <span className="hidden sm:inline text-[10px] text-fg3 font-mono px-2 py-0.5 bg-bg3 border border-border rounded-xl truncate max-w-[150px]">{user.email}</span>}
          <button onClick={() => window.print()} className="hidden sm:inline px-2 py-1 rounded-md text-xs border border-border text-fg2 hover:bg-bg3">🖨</button>
          <button onClick={logout} className="px-3 py-1 rounded-md text-xs border border-border text-fg2 hover:bg-bg3">⬅ Quitter</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:relative z-50 lg:z-auto w-[225px] h-full bg-bg2 border-r border-border flex flex-col overflow-y-auto shrink-0 sidebar transition-transform duration-200`}>
          <nav className="py-1.5 flex-1">
            {NAV.map(section => {
              const groups = (section.groups ?? [])
                .map(g => ({ ...g, items: (g.items ?? []).filter(i => !i.cabinet || env === 'cabinet') }))
                .filter(g => g.items.length);
              if (!groups.length) return null;
              const hasActive = groups.some(g => g.items.some(i => i.id === currentPage));
              const isOpen = openSections[section.key] ?? hasActive;
              return (
                <div key={section.key} className="border-b border-border/40 last:border-b-0">
                  <button onClick={() => toggleSection(section.key, !isOpen)}
                    aria-expanded={isOpen}
                    className={`w-full flex items-center gap-2 px-3.5 py-2 text-[10px] uppercase tracking-[1.5px] font-mono transition-colors ${hasActive ? 'text-primary' : 'text-fg3 hover:text-foreground'}`}>
                    <span className="text-[12px] w-4 text-center normal-case">{section.icon}</span>
                    <span className="flex-1 text-left font-bold">{section.section}</span>
                    <span className={`text-[9px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                  </button>
                  {isOpen && (
                    <div className="pb-1.5">
                      {groups.map((g, gi) => (
                        <div key={gi}>
                          {g.title && <div className="pl-9 pr-3.5 pt-1.5 pb-0.5 text-[9px] text-fg3 uppercase tracking-[1px]">{g.title}</div>}
                          {g.items.map(item => (
                            <button key={item.id} onClick={() => handlePageChange(item.id)}
                              title={item.shortcut || undefined}
                              className={`w-full flex items-center gap-2.5 pl-5 pr-3.5 py-1.5 text-xs border-l-2 transition-all group ${
                                currentPage === item.id
                                  ? 'bg-gradient-to-r from-primary/10 to-transparent text-primary border-l-primary font-semibold'
                                  : 'text-fg2 border-l-transparent hover:bg-bg3 hover:text-foreground hover:border-l-border-2'
                              }`}>
                              <span className="text-[13px] w-4 text-center">{item.icon}</span>
                              <span className="flex-1 text-left">{item.label}</span>
                              {item.shortcut && <span className="hidden group-hover:inline text-[8px] text-fg3 font-mono">{item.shortcut}</span>}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="p-2.5 border-t border-border">
            <div className={`px-2.5 py-1 rounded-2xl text-[10px] font-extrabold font-mono text-center ${locked ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}>
              {locked ? '🔒 ' : ''}Exercice {exercice?.annee || '—'}{locked ? ' (Clôturé)' : ''}
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {healthView ? (medicalStructure ? <HealthShell embeddedView={healthView} /> : <HealthOnboarding />) : <PageComponent />}
        </main>
      </div>
    </div>
  );
}
