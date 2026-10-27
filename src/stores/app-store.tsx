import React, { createContext, useContext, useState, useCallback } from 'react';
import type { BalanceLine, JournalLine, PlanCompte, Entreprise, Exercice } from '@/lib/accounting';
import { supabase } from '@/integrations/supabase/client';
import { DEMO_ENTREPRISE, DEMO_EXERCICE, DEMO_LBH_BALANCE, DEMO_LBH_JOURNAL, buildPlan } from '@/lib/demo-data';
import { creerEcriture, contrepasserEcriture, enregistrerLignesJournal, getBalanceDerivee } from '@/lib/ecritures';
import { toast } from 'sonner';
import type { RoleMedical } from '@/lib/navigation-sante';


export type EnvMode = 'entreprise' | 'cabinet';
export type Workspace = 'compta' | 'sante';
export type MedicalPalette = 'clinique' | 'laboratoire' | 'urgences';
export interface MedicalStructure {
  id: string;
  nom: string;
  type: 'cabinet' | 'laboratoire' | 'mixte';
  theme_medical: MedicalPalette;
}
export type PageId = 'dashboard' | 'clients' | 'cabinet_mgmt' | 'kpi_collab' | 'abonnements_clients' | 'journal' | 'balance' | 'grandlivre' | 'bilan' | 'resultat' | 'tft' | 'note34' | 'liasse' | 'rapprochement' | 'saisie' | 'plan' | 'exercices' | 'parametres' | 'balance_agee' | 'audit' | 'import' | 'lettrage' | 'analytique' | 'budget' | 'tva' | 'abonnement' | 'mon_abonnement' | 'cloture' | 'immobilisations' | 'facturation' | 'fournisseurs' | 'paie' | 'echeancier' | 'stocks' | 'provisions' | 'documents' | 'validation' | 'portail' | 'mobile_money' | 'factures_dgid' | 'anomalies' | 'sante_accueil' | 'sante_patients' | 'sante_agenda' | 'sante_laboratoire' | 'sante_qualite' | 'sante_facturation' | 'sante_pilotage' | 'sante_catalogue' | 'sante_parametres' | 'sante_plannings' | 'sante_retrocessions';

interface AppState {
  workspace: Workspace;
  env: EnvMode;
  demo: boolean;
  launched: boolean;
  loading: boolean;
  currentPage: PageId;
  entreprise: Entreprise | null;
  exercice: Exercice | null;
  exercices: Exercice[];
  balance: BalanceLine[];
  balanceN1: BalanceLine[];
  journal: JournalLine[];
  plan: PlanCompte[];
  entreprises: Entreprise[];
  medicalStructure: MedicalStructure | null;
  medicalRoles: RoleMedical[];
  setPage: (page: PageId) => void;
  launchDemo: (env: EnvMode) => void;
  launchUser: (env: EnvMode) => void;
  launchHealth: () => Promise<void>;
  completeHealthOnboarding: (structure: MedicalStructure) => void;
  setWorkspace: (workspace: Workspace) => void;
  logout: () => void;
  addJournalEntry: (lines: JournalLine[]) => void;
  deleteJournalEntry: (id: string) => void;
  extournerEcriture: (journalLineId: string, motif: string) => Promise<void>;

  addCompte: (c: PlanCompte) => Promise<void>;
  deleteCompte: (id: string) => Promise<void>;
  toggleCompte: (id: string) => void;
  addExercice: (e: Omit<Exercice, 'id'>) => Promise<void>;
  deleteExercice: (id: string) => Promise<void>;
  openExercice: (id: string) => void;
  updateEntreprise: (updates: Partial<Entreprise>) => Promise<void>;
  clotureExercice: () => Promise<void>;
  isExerciceCloture: () => boolean;
  switchEntreprise: (entrepriseId: string) => Promise<void>;
}

// Contexte stable entre rechargements à chaud (évite "useApp must be used within AppProvider")
const g = globalThis as unknown as { __gcomptaAppContext?: React.Context<AppState | null> };
const AppContext = g.__gcomptaAppContext ?? (g.__gcomptaAppContext = createContext<AppState | null>(null));

const DEMO_ENTREPRISE_ID = 'a0000000-0000-0000-0000-000000000001';
const DEMO_EXERCICE_ID = 'b0000000-0000-0000-0000-000000000001';

function mapEntreprise(data: any): Entreprise {
  return {
    id: data.id, nom: data.nom, sigle: data.sigle || '',
    ninea: data.ninea || '', rccm: data.rccm || '', tel: data.tel || '',
    adresse: data.adresse || '', forme_juridique: data.forme_juridique || '',
    secteur: data.secteur || '', monnaie: data.monnaie || 'FCFA',
  };
}

function mapExercice(data: any): Exercice {
  return {
    id: data.id, entreprise_id: data.entreprise_id,
    annee: data.annee, date_debut: data.date_debut,
    date_fin: data.date_fin, statut: data.statut as 'en_cours' | 'cloture',
  };
}

function mapBalance(data: any[]): BalanceLine[] {
  return data.map(d => ({
    id: d.id, exercice_id: d.exercice_id, entreprise_id: d.entreprise_id,
    compte: d.compte, intitule: d.intitule,
    sd: Number(d.sd), sc: Number(d.sc), md: Number(d.md), mc: Number(d.mc),
    sfd: Number(d.sfd), sfc: Number(d.sfc),
  }));
}

function mapJournal(data: any[]): JournalLine[] {
  return data.map(d => ({
    id: d.id, exercice_id: d.exercice_id, entreprise_id: d.entreprise_id,
    date_ecriture: d.date_ecriture, piece: d.piece, journal_code: d.journal_code,
    libelle: d.libelle, compte: d.compte, intitule: d.intitule,
    debit: Number(d.debit), credit: Number(d.credit),
    ecriture_id: d.ecriture_id ?? null,
    ecriture_numero: d.ecriture_numero ?? null,
    compte_auxiliaire: d.compte_auxiliaire ?? null,
    auxiliaire_libelle: d.auxiliaire_libelle ?? null,
  }));
}


function mapPlan(data: any[]): PlanCompte[] {
  return data.map(d => ({
    id: d.id, entreprise_id: d.entreprise_id, numero: d.numero,
    intitule: d.intitule, classe: d.classe, sens: d.sens,
    type_compte: d.type_compte, actif: d.actif,
  }));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>('compta');
  const [env, setEnv] = useState<EnvMode>('entreprise');
  const [demo, setDemo] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [exercice, setExercice] = useState<Exercice | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [balance, setBalance] = useState<BalanceLine[]>([]);
  const [balanceN1, setBalanceN1] = useState<BalanceLine[]>([]);
  const [journal, setJournal] = useState<JournalLine[]>([]);
  const [plan, setPlan] = useState<PlanCompte[]>([]);
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [medicalStructure, setMedicalStructure] = useState<MedicalStructure | null>(null);
  const [medicalRoles, setMedicalRoles] = useState<RoleMedical[]>([]);

  const isExerciceCloture = useCallback(() => {
    return exercice?.statut === 'cloture';
  }, [exercice]);

  // Balance dérivée du serveur (fn_balance) = source de vérité.
  // Repli sur la table `balance` stockée (mode démo / anon, RPC non autorisée).
  const chargerBalance = useCallback(async (entrepriseId: string, exerciceId: string): Promise<BalanceLine[]> => {
    try {
      const derivee = await getBalanceDerivee(entrepriseId, exerciceId);
      if (derivee.length > 0) {
        return derivee.map(d => ({
          id: `${exerciceId}-${d.compte}`,
          exercice_id: exerciceId,
          entreprise_id: entrepriseId,
          compte: d.compte,
          intitule: d.intitule,
          sd: 0, sc: 0,
          md: d.md, mc: d.mc,
          sfd: d.sfd, sfc: d.sfc,
        }));
      }
    } catch { /* repli ci-dessous */ }
    const { data } = await supabase.from('balance').select('*').eq('exercice_id', exerciceId);
    return data ? mapBalance(data) : [];
  }, []);

  const loadBalanceN1 = useCallback(async (exercicesList: Exercice[], currentExercice: Exercice) => {
    const prevExercice = exercicesList
      .filter(e => e.annee < currentExercice.annee)
      .sort((a, b) => b.annee - a.annee)[0];
    if (!prevExercice) { setBalanceN1([]); return; }
    try {
      setBalanceN1(await chargerBalance(prevExercice.entreprise_id, prevExercice.id));
    } catch { setBalanceN1([]); }
  }, [chargerBalance]);

  const loadExerciceData = useCallback(async (excId: string, allExercices: Exercice[], exc: Exercice) => {
    const [bal, jourRes] = await Promise.all([
      chargerBalance(exc.entreprise_id, excId),
      supabase.from('journal').select('*').eq('exercice_id', excId).order('date_ecriture'),
    ]);
    setBalance(bal);
    if (jourRes.data) setJournal(mapJournal(jourRes.data));
    await loadBalanceN1(allExercices, exc);
  }, [loadBalanceN1, chargerBalance]);


  // ─── LAUNCH DEMO ─────────────────────────────────────
  const launchDemo = useCallback(async (envMode: EnvMode) => {
    setEnv(envMode);
    setDemo(true);
    setLoading(true);
    setCurrentPage('dashboard');

    try {
      const [entRes, excsRes, balRes, jourRes, planRes] = await Promise.all([
        supabase.from('entreprises').select('*').eq('id', DEMO_ENTREPRISE_ID).single(),
        supabase.from('exercices').select('*').eq('entreprise_id', DEMO_ENTREPRISE_ID).order('annee', { ascending: false }),
        supabase.from('balance').select('*').eq('exercice_id', DEMO_EXERCICE_ID),
        supabase.from('journal').select('*').eq('exercice_id', DEMO_EXERCICE_ID).order('date_ecriture'),
        supabase.from('plan_comptable').select('*').eq('entreprise_id', DEMO_ENTREPRISE_ID).order('numero'),
      ]);

      if (entRes.data && excsRes.data && balRes.data && jourRes.data && planRes.data) {
        const ent = mapEntreprise(entRes.data);
        const allExercices = excsRes.data.map(mapExercice);
        const currentExc = allExercices.find(e => e.statut === 'en_cours') || allExercices[0];

        let balData = balRes.data;
        let jourData = jourRes.data;
        if (currentExc && currentExc.id !== DEMO_EXERCICE_ID) {
          const [b2, j2] = await Promise.all([
            supabase.from('balance').select('*').eq('exercice_id', currentExc.id),
            supabase.from('journal').select('*').eq('exercice_id', currentExc.id).order('date_ecriture'),
          ]);
          if (b2.data) balData = b2.data;
          if (j2.data) jourData = j2.data;
        }

        setEntreprise(ent);
        setExercice(currentExc);
        setExercices(allExercices);
        setBalance(mapBalance(balData));
        setJournal(mapJournal(jourData));
        setPlan(mapPlan(planRes.data));
        if (envMode === 'cabinet') setEntreprises([ent]);
        await loadBalanceN1(allExercices, currentExc);
        setLaunched(true);
        setLoading(false);
        return;
      }
    } catch { /* fallback */ }

    setEntreprise(DEMO_ENTREPRISE);
    setExercice(DEMO_EXERCICE);
    setExercices([DEMO_EXERCICE]);
    setBalance([...DEMO_LBH_BALANCE]);
    setJournal([...DEMO_LBH_JOURNAL]);
    setPlan(buildPlan(DEMO_ENTREPRISE.id));
    setBalanceN1([]);
    if (envMode === 'cabinet') setEntreprises([DEMO_ENTREPRISE]);
    setLaunched(true);
    setLoading(false);
  }, [loadBalanceN1]);

  // ─── LAUNCH USER (authenticated) ─────────────────────
  const launchUser = useCallback(async (envMode: EnvMode) => {
    setWorkspace('compta');
    setEnv(envMode);
    setDemo(false);
    setLoading(true);
    setCurrentPage('dashboard');
    setMedicalStructure(null);
    setMedicalRoles([]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Veuillez vous connecter.'); setLoading(false); return; }

      // Fetch user's entreprises (owned + shared via cabinet)
      const { data: entData } = await supabase.rpc('get_user_entreprise_ids', { _user_id: user.id });
      const entIds: string[] = (entData as string[]) || [];
      
      let allEntData: any[] = [];
      if (entIds.length > 0) {
        const { data } = await supabase.from('entreprises').select('*').in('id', entIds);
        allEntData = data || [];
      }
      
      if (allEntData.length === 0) {
        // Create default entreprise for new user
        const { data: newEnt, error: entErr } = await supabase.from('entreprises').insert({
          nom: 'Mon Entreprise',
          user_id: user.id,
          monnaie: 'FCFA',
        }).select().single();
        
        if (entErr || !newEnt) { toast.error('Erreur création entreprise'); setLoading(false); return; }

        const ent = mapEntreprise(newEnt);
        
        // Create default exercice
        const year = new Date().getFullYear();
        const { data: newExc, error: excErr } = await supabase.from('exercices').insert({
          entreprise_id: ent.id,
          annee: year,
          date_debut: `${year}-01-01`,
          date_fin: `${year}-12-31`,
          statut: 'en_cours',
        }).select().single();

        if (excErr || !newExc) { toast.error('Erreur création exercice'); setLoading(false); return; }

        const exc = mapExercice(newExc);
        
        // Copy default SYSCOHADA plan comptable
        const { data: demoPlan } = await supabase.from('plan_comptable').select('*').eq('entreprise_id', DEMO_ENTREPRISE_ID).order('numero');
        if (demoPlan && demoPlan.length > 0) {
          const planInserts = demoPlan.map(p => ({
            entreprise_id: ent.id,
            numero: p.numero,
            intitule: p.intitule,
            classe: p.classe,
            sens: p.sens,
            type_compte: p.type_compte,
            actif: p.actif,
          }));
          await supabase.from('plan_comptable').insert(planInserts);
        }

        const { data: userPlan } = await supabase.from('plan_comptable').select('*').eq('entreprise_id', ent.id).order('numero');

        setEntreprise(ent);
        setExercice(exc);
        setExercices([exc]);
        setBalance([]);
        setJournal([]);
        setPlan(userPlan ? mapPlan(userPlan) : []);
        setEntreprises([ent]);
        setLaunched(true);
        setLoading(false);
        return;
      }

      // Existing user with entreprises
      const allEnts = allEntData.map(mapEntreprise);
      const ent = allEnts[0];
      setEntreprise(ent);
      setEntreprises(allEnts);

      const { data: excsData } = await supabase.from('exercices').select('*').eq('entreprise_id', ent.id).order('annee', { ascending: false });
      const allExcs = (excsData || []).map(mapExercice);
      const currentExc = allExcs.find(e => e.statut === 'en_cours') || allExcs[0];
      
      if (!currentExc) {
        const year = new Date().getFullYear();
        const { data: newExc } = await supabase.from('exercices').insert({
          entreprise_id: ent.id, annee: year, date_debut: `${year}-01-01`, date_fin: `${year}-12-31`, statut: 'en_cours',
        }).select().single();
        if (newExc) {
          const exc = mapExercice(newExc);
          setExercice(exc);
          setExercices([exc]);
          setBalance([]);
          setJournal([]);
        }
      } else {
        setExercice(currentExc);
        setExercices(allExcs);
        await loadExerciceData(currentExc.id, allExcs, currentExc);
      }

      const { data: planData } = await supabase.from('plan_comptable').select('*').eq('entreprise_id', ent.id).order('numero');
      setPlan(planData ? mapPlan(planData) : []);

      setLaunched(true);
    } catch (err: any) {
      toast.error('Erreur: ' + (err?.message || 'Inconnue'));
    }
    setLoading(false);
  }, [loadExerciceData]);

  const launchHealth = useCallback(async () => {
    setWorkspace('sante');
    setDemo(false);
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Veuillez vous connecter.');
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('structure_memberships')
      .select('id, structure_id, structures(id, nom, type, theme_medical, entreprise_id)')
      .eq('user_id', user.id)
      .eq('statut', 'actif')
      .limit(1)
      .maybeSingle();
    if (error) toast.error("Impossible de charger l’espace Santé.");
    const structure = data?.structures as any;
    setMedicalStructure(structure ? {
      id: structure.id,
      nom: structure.nom,
      type: structure.type,
      theme_medical: structure.theme_medical,
    } : null);
    // Rôles médicaux du membre : pilotent le filtrage d'affichage du menu.
    if (data?.id) {
      const { data: rolesData } = await supabase
        .from('medical_user_roles')
        .select('role')
        .eq('membership_id', data.id);
      setMedicalRoles((rolesData || []).map(r => r.role as RoleMedical));
    } else {
      setMedicalRoles([]);
    }
    // Charger l'entreprise comptable liée pour que les menus compta du même environnement fonctionnent.
    if (structure?.entreprise_id) {
      try {
        const { data: entRow } = await supabase.from('entreprises').select('*').eq('id', structure.entreprise_id).maybeSingle();
        if (entRow) {
          const ent = mapEntreprise(entRow);
          setEntreprise(ent);
          setEntreprises([ent]);
          const { data: excsData } = await supabase.from('exercices').select('*').eq('entreprise_id', ent.id).order('annee', { ascending: false });
          const allExcs = (excsData || []).map(mapExercice);
          const currentExc = allExcs.find(e => e.statut === 'en_cours') || allExcs[0];
          if (currentExc) {
            setExercice(currentExc);
            setExercices(allExcs);
            await loadExerciceData(currentExc.id, allExcs, currentExc);
          }
          const { data: planData } = await supabase.from('plan_comptable').select('*').eq('entreprise_id', ent.id).order('numero');
          setPlan(planData ? mapPlan(planData) : []);
        }
      } catch { /* l'espace santé reste utilisable sans la comptabilité */ }
    }
    setLaunched(true);
    setLoading(false);
  }, [loadExerciceData]);

  const completeHealthOnboarding = useCallback((structure: MedicalStructure) => {
    setMedicalStructure(structure);
  }, []);

  const logout = useCallback(async () => {
    setLaunched(false);
    setDemo(false);
    setEntreprise(null);
    setExercice(null);
    setBalance([]);
    setBalanceN1([]);
    setJournal([]);
    setPlan([]);
    setCurrentPage('dashboard');
    setMedicalStructure(null);
    setMedicalRoles([]);
    await supabase.auth.signOut();
  }, []);

  // ─── JOURNAL ENTRIES ──────────────────────────────────
  // Double-tenue : la balance stockée reste maintenue le temps de la période de
  // comparaison avec la balance dérivée (mv_balance). Elle n'est plus la source
  // de vérité : voir fn_balance / fn_balance_ecarts.
  const appliquerDeltaBalance = useCallback((newLines: JournalLine[], exId: string, entId: string) => {
    const balUpdates: Record<string, { debit: number; credit: number; intitule: string }> = {};
    for (const l of newLines) {
      if (!balUpdates[l.compte]) balUpdates[l.compte] = { debit: 0, credit: 0, intitule: l.intitule };
      balUpdates[l.compte].debit += l.debit || 0;
      balUpdates[l.compte].credit += l.credit || 0;
    }
    setBalance(prev => {
      const b = [...prev];
      const dbOps: Promise<any>[] = [];
      for (const [compte, delta] of Object.entries(balUpdates)) {
        const existing = b.find(x => x.compte === compte);
        if (existing) {
          existing.md += delta.debit;
          existing.mc += delta.credit;
          const net = (existing.sd || 0) + existing.md - ((existing.sc || 0) + existing.mc);
          existing.sfd = net > 0 ? net : 0;
          existing.sfc = net < 0 ? -net : 0;
          dbOps.push(supabase.from('balance').update({ md: existing.md, mc: existing.mc, sfd: existing.sfd, sfc: existing.sfc }).eq('id', existing.id).then() as Promise<any>);
        } else {
          const newBal: BalanceLine = {
            id: `temp-${Date.now()}-${compte}`, exercice_id: exId, entreprise_id: entId,
            compte, intitule: delta.intitule,
            sd: 0, sc: 0, md: delta.debit, mc: delta.credit,
            sfd: delta.debit > delta.credit ? delta.debit - delta.credit : 0,
            sfc: delta.credit > delta.debit ? delta.credit - delta.debit : 0,
          };
          b.push(newBal);
          dbOps.push(
            supabase.from('balance').insert({
              exercice_id: exId, entreprise_id: entId,
              compte, intitule: delta.intitule,
              sd: 0, sc: 0, md: delta.debit, mc: delta.credit,
              sfd: newBal.sfd, sfc: newBal.sfc,
            }).select().single().then(({ data }) => { if (data) newBal.id = data.id; }) as Promise<any>
          );
        }
      }
      Promise.all(dbOps).catch(e => toast.error('Erreur balance: ' + e.message));
      return b;
    });
  }, []);

  const addJournalEntry = useCallback(async (lines: JournalLine[]) => {
    if (!exercice || !entreprise) return;
    if (exercice.statut === 'cloture') { toast.error('Exercice clôturé — écritures verrouillées.'); return; }
    if (!lines.length) return;

    // Regroupement en écritures (en-tête) : date + journal + pièce
    const groupes = new Map<string, JournalLine[]>();
    for (const l of lines) {
      const k = `${l.date_ecriture}|${l.journal_code}|${l.piece || ''}`;
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k)!.push(l);
    }

    const idsCrees: string[] = [];
    try {
      for (const grp of groupes.values()) {
        const id = await creerEcriture({
          entrepriseId: entreprise.id,
          exerciceId: exercice.id,
          journalCode: grp[0].journal_code,
          date: grp[0].date_ecriture,
          libelle: grp[0].libelle,
          piece: grp[0].piece || null,
          statut: 'validee',
          lignes: grp.map(l => ({
            compte: l.compte, intitule: l.intitule, libelle: l.libelle,
            debit: l.debit || 0, credit: l.credit || 0,
          })),
        });
        idsCrees.push(id);
      }
    } catch (e: any) {
      toast.error('Écriture refusée : ' + e.message);
      return;
    }

    // Les lignes de journal ont été créées côté serveur par fn_creer_ecriture
    const { data: savedLines } = await supabase.from('journal').select('*').in('ecriture_id', idsCrees);
    const newLines = mapJournal(savedLines || []);
    setJournal(prev => [...prev, ...newLines]);
    appliquerDeltaBalance(newLines, exercice.id, entreprise.id);

    toast.success(`${newLines.length} ligne(s) enregistrée(s) — écriture équilibrée validée en base`);
  }, [exercice, entreprise, appliquerDeltaBalance]);

  /** Extourne (contre-passation) : seule façon d'annuler une écriture validée. */
  const extournerEcriture = useCallback(async (journalLineId: string, motif: string) => {
    if (!exercice || !entreprise) return;
    const entry = journal.find(j => j.id === journalLineId);
    if (!entry?.ecriture_id) { toast.error('Ligne historique : aucune écriture rattachée.'); return; }
    try {
      const newId = await contrepasserEcriture(entry.ecriture_id, motif);
      const { data } = await supabase.from('journal').select('*').eq('ecriture_id', newId);
      const newLines = mapJournal(data || []);
      setJournal(prev => [...prev, ...newLines]);
      appliquerDeltaBalance(newLines, exercice.id, entreprise.id);
      toast.success('Écriture extournée — contre-passation enregistrée');
    } catch (e: any) {
      toast.error('Extourne refusée : ' + e.message);
    }
  }, [journal, exercice, entreprise, appliquerDeltaBalance]);

  /** Suppression physique : uniquement pour les lignes historiques sans écriture. */
  const deleteJournalEntry = useCallback(async (id: string) => {
    if (exercice?.statut === 'cloture') { toast.error('Exercice clôturé — suppression impossible.'); return; }

    const entry = journal.find(j => j.id === id);
    if (!entry) return;
    if (entry.ecriture_id) {
      toast.error('Écriture comptable : utilisez l\u2019extourne (contre-passation).');
      return;
    }

    const { error } = await supabase.from('journal').delete().eq('id', id);
    if (error) { toast.error('Erreur suppression: ' + error.message); return; }

    setJournal(prev => prev.filter(j => j.id !== id));

    setBalance(prev => {
      const b = [...prev];
      const existing = b.find(x => x.compte === entry.compte);
      if (existing) {
        existing.md -= entry.debit || 0;
        existing.mc -= entry.credit || 0;
        const net = (existing.sd || 0) + existing.md - ((existing.sc || 0) + existing.mc);
        existing.sfd = net > 0 ? net : 0;
        existing.sfc = net < 0 ? -net : 0;
        supabase.from('balance').update({ md: existing.md, mc: existing.mc, sfd: existing.sfd, sfc: existing.sfc }).eq('id', existing.id).then();
      }
      return b;
    });

    toast.success('Ligne historique supprimée');
  }, [journal, exercice]);


  // ─── PLAN COMPTABLE (persisted) ───────────────────────
  const addCompte = useCallback(async (c: PlanCompte) => {
    if (!entreprise) return;
    const { data, error } = await supabase.from('plan_comptable').insert({
      entreprise_id: entreprise.id, numero: c.numero, intitule: c.intitule,
      classe: c.classe, sens: c.sens, type_compte: c.type_compte, actif: c.actif,
    }).select().single();
    if (error) { toast.error('Erreur ajout compte: ' + error.message); return; }
    if (data) setPlan(prev => [...prev, mapPlan([data])[0]]);
    toast.success(`Compte ${c.numero} ajouté`);
  }, [entreprise]);

  const deleteCompte = useCallback(async (id: string) => {
    const { error } = await supabase.from('plan_comptable').delete().eq('id', id);
    if (error) { toast.error('Erreur suppression compte: ' + error.message); return; }
    setPlan(prev => prev.filter(p => p.id !== id));
    toast.success('Compte supprimé');
  }, []);

  const toggleCompte = useCallback(async (id: string) => {
    const compte = plan.find(p => p.id === id);
    if (!compte) return;
    const newActif = !compte.actif;
    setPlan(prev => prev.map(p => p.id === id ? { ...p, actif: newActif } : p));
    await supabase.from('plan_comptable').update({ actif: newActif }).eq('id', id);
  }, [plan]);

  // ─── EXERCICES (persisted) ────────────────────────────
  const addExercice = useCallback(async (e: Omit<Exercice, 'id'>) => {
    const { data, error } = await supabase.from('exercices').insert({
      entreprise_id: e.entreprise_id, annee: e.annee,
      date_debut: e.date_debut, date_fin: e.date_fin, statut: e.statut,
    }).select().single();
    if (error) { toast.error('Erreur ajout exercice: ' + error.message); return; }
    if (data) setExercices(prev => [...prev, mapExercice(data)]);
    toast.success(`Exercice ${e.annee} créé`);
  }, []);

  const deleteExercice = useCallback(async (id: string) => {
    const exc = exercices.find(e => e.id === id);
    if (exc?.statut === 'cloture') { toast.error('Impossible de supprimer un exercice clôturé.'); return; }
    const { error } = await supabase.from('exercices').delete().eq('id', id);
    if (error) { toast.error('Erreur suppression exercice: ' + error.message); return; }
    setExercices(prev => prev.filter(e => e.id !== id));
    toast.success('Exercice supprimé');
  }, [exercices]);

  const openExercice = useCallback(async (id: string) => {
    const e = exercices.find(x => x.id === id);
    if (!e) return;
    setExercice(e);
    setLoading(true);
    try {
      await loadExerciceData(id, exercices, e);
    } catch { /* keep current */ }
    setLoading(false);
  }, [exercices, loadExerciceData]);

  // ─── PARAMETRES (persisted) ───────────────────────────
  const updateEntreprise = useCallback(async (updates: Partial<Entreprise>) => {
    if (!entreprise) return;
    setEntreprise(prev => prev ? { ...prev, ...updates } : prev);
    const { error } = await supabase.from('entreprises').update(updates).eq('id', entreprise.id);
    if (error) toast.error('Erreur sauvegarde: ' + error.message);
  }, [entreprise]);

  // ─── SWITCH ENTREPRISE (cabinet mode) ─────────────────
  const switchEntreprise = useCallback(async (entrepriseId: string) => {
    const ent = entreprises.find(e => e.id === entrepriseId);
    if (!ent) return;
    setEntreprise(ent);
    setLoading(true);
    try {
      const [excsRes, planRes] = await Promise.all([
        supabase.from('exercices').select('*').eq('entreprise_id', entrepriseId).order('annee', { ascending: false }),
        supabase.from('plan_comptable').select('*').eq('entreprise_id', entrepriseId).order('numero'),
      ]);
      const allExcs = (excsRes.data || []).map(mapExercice);
      const currentExc = allExcs.find(e => e.statut === 'en_cours') || allExcs[0];
      setExercices(allExcs);
      setPlan(planRes.data ? mapPlan(planRes.data) : []);
      if (currentExc) {
        setExercice(currentExc);
        await loadExerciceData(currentExc.id, allExcs, currentExc);
      } else {
        setExercice(null);
        setBalance([]);
        setJournal([]);
      }
    } catch { /* keep current */ }
    setLoading(false);
    setCurrentPage('dashboard');
  }, [entreprises, loadExerciceData]);

  // ─── CLÔTURE D'EXERCICE ──────────────────────────────
  const clotureExercice = useCallback(async () => {
    if (!exercice || !entreprise) { toast.error('Aucun exercice ou entreprise sélectionné.'); return; }
    setLoading(true);
    try {
      const { error: clErr } = await supabase.rpc('fn_cloturer_exercice', { _exercice_id: exercice.id });
      if (clErr) throw clErr;

      const newAnnee = exercice.annee + 1;
      const newDebut = `${newAnnee}-01-01`;
      const newFin = `${newAnnee}-12-31`;
      const { data: newExcData, error: excErr } = await supabase.from('exercices').insert({
        entreprise_id: entreprise.id, annee: newAnnee,
        date_debut: newDebut, date_fin: newFin, statut: 'en_cours',
      }).select().single();
      if (excErr || !newExcData) throw excErr || new Error('Erreur création exercice');

      const newExercice = mapExercice(newExcData);

      const bilanAccounts = balance.filter(b => /^[1-5]/.test(b.compte));
      const resultatNet = balance
        .filter(b => /^[6-8]/.test(b.compte))
        .reduce((sum, b) => sum + ((b.sfc || 0) - (b.sfd || 0)), 0);

      const aNouveaux: any[] = [];
      for (const b of bilanAccounts) {
        const soldeNet = (b.sfd || 0) - (b.sfc || 0);
        if (Math.abs(soldeNet) < 0.01) continue;
        aNouveaux.push({
          exercice_id: newExercice.id, entreprise_id: entreprise.id,
          compte: b.compte, intitule: b.intitule,
          sd: soldeNet > 0 ? soldeNet : 0, sc: soldeNet < 0 ? -soldeNet : 0,
          md: 0, mc: 0,
          sfd: soldeNet > 0 ? soldeNet : 0, sfc: soldeNet < 0 ? -soldeNet : 0,
        });
      }

      if (Math.abs(resultatNet) > 0.01) {
      // SYSCOHADA: RAN = compte 121 (créditeur) ou 129 (débiteur)
      const ranCompte = resultatNet >= 0 ? '121000' : '129000';
      const existingRAN = aNouveaux.find(a => a.compte === ranCompte);
      if (existingRAN) {
        const newSolde = (existingRAN.sc - existingRAN.sd) + resultatNet;
        existingRAN.sd = newSolde < 0 ? -newSolde : 0;
        existingRAN.sc = newSolde > 0 ? newSolde : 0;
        existingRAN.sfd = existingRAN.sd;
        existingRAN.sfc = existingRAN.sc;
      } else {
        aNouveaux.push({
          exercice_id: newExercice.id, entreprise_id: entreprise.id,
          compte: ranCompte, intitule: 'Report à nouveau',
          sd: resultatNet < 0 ? -resultatNet : 0, sc: resultatNet > 0 ? resultatNet : 0,
          md: 0, mc: 0,
          sfd: resultatNet < 0 ? -resultatNet : 0, sfc: resultatNet > 0 ? resultatNet : 0,
        });
      }
      }

      if (aNouveaux.length > 0) {
        const { error: balErr } = await supabase.from('balance').insert(aNouveaux);
        if (balErr) throw balErr;
      }

      const aNouveauxJournal: any[] = [];
      for (const an of aNouveaux) {
        if (an.sd > 0) {
          aNouveauxJournal.push({
            exercice_id: newExercice.id, entreprise_id: entreprise.id,
            date_ecriture: newDebut, piece: 'AN', journal_code: 'AN',
            libelle: 'À-nouveau', compte: an.compte, intitule: an.intitule,
            debit: an.sd, credit: 0,
          });
        }
        if (an.sc > 0) {
          aNouveauxJournal.push({
            exercice_id: newExercice.id, entreprise_id: entreprise.id,
            date_ecriture: newDebut, piece: 'AN', journal_code: 'AN',
            libelle: 'À-nouveau', compte: an.compte, intitule: an.intitule,
            debit: 0, credit: an.sc,
          });
        }
      }
      if (aNouveauxJournal.length > 0) {
        // Les à-nouveaux passent par le moteur serveur : équilibre et droits contrôlés en base.
        await enregistrerLignesJournal(aNouveauxJournal, { statut: 'validee', origine: 'a_nouveau' });
      }

      const updatedCurrent = { ...exercice, statut: 'cloture' as const };
      setExercices(prev => {
        const updated = prev.map(e => e.id === exercice.id ? updatedCurrent : e);
        return [...updated, newExercice];
      });

      setBalanceN1(balance);
      setExercice(newExercice);
      setBalance(mapBalance(aNouveaux.map((a, i) => ({ ...a, id: `an-${i}` }))));
      setJournal(mapJournal(aNouveauxJournal.map((j, i) => ({ ...j, id: `anj-${i}` }))));

      toast.success(`Exercice ${exercice.annee} clôturé. Exercice ${newAnnee} créé.`);
    } catch (err: any) {
      toast.error('Erreur clôture: ' + (err?.message || 'Erreur inconnue'));
    }
    setLoading(false);
  }, [exercice, entreprise, balance]);

  return (
    <AppContext.Provider value={{
      workspace, env, demo, launched, loading, currentPage, entreprise, exercice, exercices,
      balance, balanceN1, journal, plan, entreprises, medicalStructure, medicalRoles,
      setPage: setCurrentPage, launchDemo, launchUser, logout, addJournalEntry,
      launchHealth, completeHealthOnboarding, setWorkspace,
      deleteJournalEntry, extournerEcriture, addCompte, deleteCompte, toggleCompte,
      addExercice, deleteExercice, openExercice, updateEntreprise,
      clotureExercice, isExerciceCloture, switchEntreprise,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
