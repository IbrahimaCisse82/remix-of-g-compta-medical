import { confirmer } from '@/components/Confirmation';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { ventilerTvaDeductible } from '@/lib/tva';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import { enregistrerLignesJournal, round2 as r2, type LigneJournalPlate } from '@/lib/ecritures';
import { lignesReglementFournisseur } from '@/lib/reglements';

interface Fournisseur {
  id: string;
  entreprise_id: string;
  code: string;
  raison_sociale: string;
  ninea?: string | null;
  rccm?: string | null;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
  compte_tiers: string;
  delai_paiement_jours?: number | null;
  actif: boolean;
}

interface Ligne {
  id?: string;
  designation: string;
  quantite: number;
  prix_unitaire: number;
  taux_tva: number;
  compte_charge: string;
  montant_ht: number;
  ordre: number;
}

interface FactureAchat {
  id: string;
  entreprise_id: string;
  exercice_id: string;
  fournisseur_id: string;
  numero_interne: string;
  numero_fournisseur?: string | null;
  date_facture: string;
  date_reception?: string | null;
  date_echeance?: string | null;
  objet?: string | null;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  montant_paye: number;
  statut: 'brouillon' | 'validee' | 'payee_partiel' | 'payee' | 'annulee';
  comptabilisee: boolean;
  piece_journal?: string | null;
  notes?: string | null;
}

const emptyLigne = (i = 0): Ligne => ({
  designation: '', quantite: 1, prix_unitaire: 0, taux_tva: 18,
  compte_charge: '601', montant_ht: 0, ordre: i,
});

export default function FournisseursPage() {
  const { entreprise, exercice, addJournalEntry } = useApp();
  const { canWrite } = useUserRole();
  const [tab, setTab] = useState<'factures' | 'fournisseurs'>('factures');
  const [factures, setFactures] = useState<FactureAchat[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(false);

  // Facture form
  const [showFact, setShowFact] = useState(false);
  const [factForm, setFactForm] = useState<Partial<FactureAchat>>({});
  const [lignes, setLignes] = useState<Ligne[]>([emptyLigne()]);

  // Fournisseur form
  const [regFact, setRegFact] = useState<FactureAchat | null>(null);
  const [regForm, setRegForm] = useState<{ montant: number; compte: string; type: 'acompte' | 'solde'; date: string }>({ montant: 0, compte: '521', type: 'solde', date: new Date().toISOString().slice(0, 10) });
  const [showFrn, setShowFrn] = useState(false);
  const [frnForm, setFrnForm] = useState<Partial<Fournisseur>>({});

  const load = async () => {
    if (!entreprise) return;
    setLoading(true);
    const [f, fr] = await Promise.all([
      supabase.from('factures_achat').select('*').eq('entreprise_id', entreprise.id).order('date_facture', { ascending: false }),
      supabase.from('fournisseurs').select('*').eq('entreprise_id', entreprise.id).order('raison_sociale'),
    ]);
    if (f.error) toast.error(f.error.message); else setFactures((f.data || []) as any);
    if (fr.error) toast.error(fr.error.message); else setFournisseurs((fr.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entreprise?.id]);

  // ─── FOURNISSEURS ─────────────────────────────────────
  const openFrnNew = () => {
    if (!entreprise) return;
    const next = String(fournisseurs.length + 1).padStart(3, '0');
    setFrnForm({ code: `FRN${next}`, raison_sociale: '', compte_tiers: '401', actif: true, delai_paiement_jours: 30 });
    setShowFrn(true);
  };
  const openFrnEdit = (f: Fournisseur) => { setFrnForm({ ...f }); setShowFrn(true); };
  const saveFrn = async () => {
    if (!entreprise || !canWrite) return;
    if (!frnForm.raison_sociale?.trim()) { toast.error('Raison sociale requise'); return; }
    const payload = {
      entreprise_id: entreprise.id,
      code: frnForm.code || `FRN${Date.now()}`,
      raison_sociale: frnForm.raison_sociale,
      ninea: frnForm.ninea || null,
      rccm: frnForm.rccm || null,
      adresse: frnForm.adresse || null,
      telephone: frnForm.telephone || null,
      email: frnForm.email || null,
      compte_tiers: frnForm.compte_tiers || '401',
      delai_paiement_jours: frnForm.delai_paiement_jours || 30,
      actif: frnForm.actif ?? true,
    };
    const { error } = frnForm.id
      ? await supabase.from('fournisseurs').update(payload).eq('id', frnForm.id)
      : await supabase.from('fournisseurs').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Fournisseur enregistré');
    setShowFrn(false);
    load();
  };
  const deleteFrn = async (id: string) => {
    if (!(await confirmer('Supprimer ce fournisseur ?'))) return;
    const { error } = await supabase.from('fournisseurs').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Supprimé');
    load();
  };

  // ─── FACTURES ─────────────────────────────────────────
  const recomputeLignes = (ls: Ligne[]) => ls.map(l => ({
    ...l,
    montant_ht: Math.round((l.quantite || 0) * (l.prix_unitaire || 0) * 100) / 100,
  }));

  const totals = (ls: Ligne[]) => {
    let ht = 0, tva = 0;
    for (const l of ls) {
      const lht = (l.quantite || 0) * (l.prix_unitaire || 0);
      ht += lht;
      tva += lht * ((l.taux_tva || 0) / 100);
    }
    return { ht: Math.round(ht * 100) / 100, tva: Math.round(tva * 100) / 100, ttc: Math.round((ht + tva) * 100) / 100 };
  };

  const openFactNew = () => {
    if (!entreprise || !exercice) return;
    const yr = new Date().getFullYear();
    const next = String(factures.filter(f => f.numero_interne.includes(`FA-${yr}`)).length + 1).padStart(4, '0');
    setFactForm({
      numero_interne: `FA-${yr}-${next}`,
      date_facture: new Date().toISOString().slice(0, 10),
      date_reception: new Date().toISOString().slice(0, 10),
      statut: 'brouillon',
    });
    setLignes([emptyLigne()]);
    setShowFact(true);
  };

  const openFactEdit = async (f: FactureAchat) => {
    setFactForm({ ...f });
    const { data } = await supabase.from('factures_achat_lignes').select('*').eq('facture_id', f.id).order('ordre');
    setLignes((data || []).map((l: any, i: number) => ({
      id: l.id, designation: l.designation, quantite: Number(l.quantite),
      prix_unitaire: Number(l.prix_unitaire), taux_tva: Number(l.taux_tva),
      compte_charge: l.compte_charge, montant_ht: Number(l.montant_ht), ordre: i,
    })));
    setShowFact(true);
  };

  const saveFact = async () => {
    if (!entreprise || !exercice || !canWrite) return;
    if (!factForm.fournisseur_id) { toast.error('Sélectionnez un fournisseur'); return; }
    if (lignes.some(l => !l.designation.trim() || l.quantite <= 0)) { toast.error('Lignes incomplètes'); return; }
    const t = totals(lignes);
    const frn = fournisseurs.find(f => f.id === factForm.fournisseur_id);
    const echeance = factForm.date_echeance || (factForm.date_facture && frn?.delai_paiement_jours
      ? new Date(new Date(factForm.date_facture).getTime() + frn.delai_paiement_jours * 86400000).toISOString().slice(0, 10)
      : null);
    const payload = {
      entreprise_id: entreprise.id,
      exercice_id: exercice.id,
      fournisseur_id: factForm.fournisseur_id,
      numero_interne: factForm.numero_interne!,
      numero_fournisseur: factForm.numero_fournisseur || null,
      date_facture: factForm.date_facture!,
      date_reception: factForm.date_reception || null,
      date_echeance: echeance,
      objet: factForm.objet || null,
      total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc,
      statut: factForm.statut || 'brouillon',
      notes: factForm.notes || null,
    };
    let factId = factForm.id;
    if (factId) {
      const { error } = await supabase.from('factures_achat').update(payload).eq('id', factId);
      if (error) { toast.error(error.message); return; }
      await supabase.from('factures_achat_lignes').delete().eq('facture_id', factId);
    } else {
      const { data, error } = await supabase.from('factures_achat').insert(payload).select().single();
      if (error || !data) { toast.error(error?.message || 'Erreur'); return; }
      factId = data.id;
    }
    const lignesPayload = lignes.map((l, i) => ({
      facture_id: factId!, ordre: i, designation: l.designation,
      quantite: l.quantite, prix_unitaire: l.prix_unitaire, taux_tva: l.taux_tva,
      compte_charge: l.compte_charge, montant_ht: Math.round(l.quantite * l.prix_unitaire * 100) / 100,
    }));
    const { error: lErr } = await supabase.from('factures_achat_lignes').insert(lignesPayload);
    if (lErr) { toast.error(lErr.message); return; }
    toast.success('Facture enregistrée');
    setShowFact(false);
    load();
  };

  const deleteFact = async (id: string) => {
    if (!(await confirmer('Supprimer cette facture ?'))) return;
    const { error } = await supabase.from('factures_achat').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Supprimée');
    load();
  };

  const comptabiliser = async (f: FactureAchat) => {
    if (!entreprise || !exercice) return;
    if (f.comptabilisee) { toast.error('Déjà comptabilisée'); return; }
    if (exercice.statut === 'cloture') { toast.error('Exercice clôturé'); return; }
    const { data: lgs } = await supabase.from('factures_achat_lignes').select('*').eq('facture_id', f.id);
    if (!lgs || lgs.length === 0) { toast.error('Aucune ligne'); return; }
    const frn = fournisseurs.find(x => x.id === f.fournisseur_id);
    if (!frn) { toast.error('Fournisseur introuvable'); return; }

    // Construction de l'écriture journal AC — équilibre garanti :
    // le crédit fournisseur est la somme exacte des débits arrondis (HT par compte + TVA
    // par taux), jamais le TTC stocké, afin d'éliminer tout écart d'arrondi.
    const base = {
      exercice_id: exercice.id, entreprise_id: entreprise.id,
      date_ecriture: f.date_facture, piece: f.numero_interne, journal_code: 'AC',
    };
    const lines: LigneJournalPlate[] = [];
    const byCharge: Record<string, number> = {};
    const byTva: Record<string, number> = {}; // TVA ventilée : 4451 (immo) ou 4452 (achats)
    // Structure de santé exonérée / mixte : la TVA non récupérable s'incorpore à la charge ou à l'immobilisation (prorata).
    const { data: coefData } = await (supabase as any).rpc('sante_coef_tva_deductible', { _entreprise_id: entreprise.id });
    const coef = coefData == null ? 1 : Number(coefData);
    for (const l of lgs as any[]) {
      const ht = r2(Number(l.quantite) * Number(l.prix_unitaire));
      const tvaBrute = r2(ht * (Number(l.taux_tva) / 100));
      const { deductible: tva, nonDeductible } = ventilerTvaDeductible(tvaBrute, coef);
      byCharge[l.compte_charge] = r2((byCharge[l.compte_charge] || 0) + ht + nonDeductible);
      if (tva > 0) {
        const compteTva = /^2/.test(String(l.compte_charge)) ? '4451' : '4452';
        byTva[compteTva] = r2((byTva[compteTva] || 0) + tva);
      }
    }
    for (const [compte, ht] of Object.entries(byCharge)) {
      lines.push({ ...base, libelle: `Achat ${frn.raison_sociale} — ${f.numero_interne}`, compte, intitule: `Achat ${compte}`, debit: ht, credit: 0 });
    }
    for (const [compte, tva] of Object.entries(byTva)) {
      lines.push({
        ...base, libelle: `TVA déductible — ${f.numero_interne}`, compte,
        intitule: compte === '4451' ? 'TVA récupérable sur immobilisations' : 'TVA récupérable sur achats',
        debit: tva, credit: 0,
      });
    }
    const totalDebit = r2(lines.reduce((s, l) => s + (l.debit || 0), 0));
    const compteFrn = `${frn.compte_tiers}${frn.code.replace(/\D/g, '').slice(0, 4)}`;
    lines.push({
      ...base, libelle: `Facture ${frn.raison_sociale} — ${f.numero_interne}`,
      compte: compteFrn, intitule: `Fournisseur ${frn.raison_sociale}`,
      debit: 0, credit: totalDebit,
    });

    try {
      await enregistrerLignesJournal(lines, { origine: 'facture_achat' });
    } catch (e: any) {
      toast.error(e.message || 'Comptabilisation refusée');
      return;
    }
    await supabase.from('factures_achat').update({
      comptabilisee: true, piece_journal: f.numero_interne, statut: 'validee',
      total_ht: r2(Object.values(byCharge).reduce((s, v) => s + v, 0)),
      total_tva: r2(Object.values(byTva).reduce((s, v) => s + v, 0)),
      total_ttc: totalDebit,
    }).eq('id', f.id);
    toast.success('Facture comptabilisée au journal AC');
    load();
  };

  // ─── RÈGLEMENTS ET ACOMPTES (4091) ────────────────────
  const openReglement = (f: FactureAchat) => {
    setRegFact(f);
    setRegForm({
      montant: r2(Number(f.total_ttc) - Number(f.montant_paye || 0)),
      compte: '521', type: 'solde', date: new Date().toISOString().slice(0, 10),
    });
  };

  const enregistrerReglement = async () => {
    if (!entreprise || !exercice || !regFact || !canWrite) return;
    const frn = fournisseurs.find(x => x.id === regFact.fournisseur_id);
    if (!frn) { toast.error('Fournisseur introuvable'); return; }
    const compteFrn = `${frn.compte_tiers}${frn.code.replace(/\D/g, '').slice(0, 4)}`;
    const lib = `${regForm.type === 'acompte' ? 'Acompte versé' : 'Règlement'} ${regFact.numero_interne} — ${frn.raison_sociale}`;
    const lgs = lignesReglementFournisseur({
      compteTiers: compteFrn, compteTresorerie: regForm.compte,
      montant: Number(regForm.montant), type: regForm.type, libelle: lib,
    });
    if (!lgs.length) { toast.error('Montant invalide'); return; }
    try {
      await enregistrerLignesJournal(lgs.map(l => ({
        entreprise_id: entreprise.id, exercice_id: exercice.id,
        date_ecriture: regForm.date, piece: `REG-${regFact.numero_interne}`, journal_code: 'BQ',
        libelle: l.libelle || lib, compte: l.compte, intitule: l.intitule || '',
        debit: l.debit || 0, credit: l.credit || 0,
      })) as LigneJournalPlate[], { origine: 'reglement_fournisseur' });
    } catch (e: any) { toast.error(e.message || 'Comptabilisation refusée'); return; }
    if (regForm.type === 'solde') {
      const paye = r2(Number(regFact.montant_paye || 0) + Number(regForm.montant));
      await supabase.from('factures_achat').update({
        montant_paye: paye,
        statut: paye >= Number(regFact.total_ttc) ? 'payee' : 'payee_partiel',
      }).eq('id', regFact.id);
    }
    toast.success('Règlement comptabilisé au journal BQ');
    setRegFact(null);
    load();
  };

  // ─── STATS ────────────────────────────────────────────
  const stats = {
    nb: factures.length,
    ttc: factures.filter(f => f.statut !== 'annulee').reduce((s, f) => s + Number(f.total_ttc), 0),
    impayees: factures.filter(f => f.statut === 'validee' || f.statut === 'payee_partiel')
      .reduce((s, f) => s + Number(f.total_ttc) - Number(f.montant_paye), 0),
    enRetard: factures.filter(f => f.date_echeance && new Date(f.date_echeance) < new Date() && f.statut !== 'payee' && f.statut !== 'annulee').length,
  };

  if (!entreprise || !exercice) {
    return <div className="p-5 text-fg3">Sélectionnez une entreprise et un exercice.</div>;
  }

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">🧾 Facturation Fournisseurs</div>
        <div className="flex gap-2 text-[11px]">
          <button className={`px-3 py-1 rounded ${tab === 'factures' ? 'bg-primary text-primary-foreground' : 'bg-bg3 text-fg2'}`} onClick={() => setTab('factures')}>Factures d'achat</button>
          <button className={`px-3 py-1 rounded ${tab === 'fournisseurs' ? 'bg-primary text-primary-foreground' : 'bg-bg3 text-fg2'}`} onClick={() => setTab('fournisseurs')}>Fournisseurs</button>
        </div>
      </div>

      <div className="p-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase">Total factures</div>
            <div className="text-xl font-bold">{stats.nb}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase">Achats TTC</div>
            <div className="text-xl font-bold text-primary">{fmt(stats.ttc)}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase">Restant à payer</div>
            <div className="text-xl font-bold text-amber-500">{fmt(stats.impayees)}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase">Factures en retard</div>
            <div className="text-xl font-bold text-red-500">{stats.enRetard}</div>
          </div>
        </div>

        {tab === 'factures' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <div className="text-[11px] text-fg3">{factures.length} facture(s)</div>
              {canWrite && <button onClick={openFactNew} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[11px] font-bold">+ Nouvelle facture</button>}
            </div>
            {loading ? <div className="text-center text-fg3 py-8">Chargement…</div> : (
              <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-bg3 text-fg3 text-[10px] uppercase">
                    <tr>
                      <th className="text-left p-2">N° Interne</th>
                      <th className="text-left p-2">N° Frn</th>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Fournisseur</th>
                      <th className="text-right p-2">HT</th>
                      <th className="text-right p-2">TVA</th>
                      <th className="text-right p-2">TTC</th>
                      <th className="text-center p-2">Statut</th>
                      <th className="text-center p-2">Compta</th>
                      <th className="text-right p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map(f => {
                      const frn = fournisseurs.find(x => x.id === f.fournisseur_id);
                      const retard = f.date_echeance && new Date(f.date_echeance) < new Date() && f.statut !== 'payee' && f.statut !== 'annulee';
                      return (
                        <tr key={f.id} className="border-t border-border hover:bg-bg3">
                          <td className="p-2 font-mono">{f.numero_interne}</td>
                          <td className="p-2 font-mono text-fg3">{f.numero_fournisseur || '—'}</td>
                          <td className="p-2">{f.date_facture}</td>
                          <td className="p-2">{frn?.raison_sociale || '—'}</td>
                          <td className="p-2 text-right font-mono">{fmt(f.total_ht)}</td>
                          <td className="p-2 text-right font-mono text-fg3">{fmt(f.total_tva)}</td>
                          <td className="p-2 text-right font-mono font-bold">{fmt(f.total_ttc)}</td>
                          <td className="p-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase ${
                              f.statut === 'payee' ? 'bg-green-500/20 text-green-500' :
                              f.statut === 'annulee' ? 'bg-gray-500/20 text-gray-500' :
                              retard ? 'bg-red-500/20 text-red-500' :
                              f.statut === 'validee' ? 'bg-blue-500/20 text-blue-500' :
                              'bg-amber-500/20 text-amber-500'
                            }`}>{retard ? 'retard' : f.statut}</span>
                          </td>
                          <td className="p-2 text-center">{f.comptabilisee ? '✓' : '—'}</td>
                          <td className="p-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => openFactEdit(f)} className="text-primary hover:underline text-[10px]">Voir</button>
                              {canWrite && !f.comptabilisee && (
                                <button onClick={() => comptabiliser(f)} className="text-green-500 hover:underline text-[10px]">Comptab.</button>
                              )}
                               {canWrite && f.statut !== 'payee' && f.statut !== 'annulee' && (
                                 <button onClick={() => openReglement(f)} className="text-amber-500 hover:underline text-[10px]">Régler</button>
                               )}
                               {canWrite && <button onClick={() => deleteFact(f.id)} className="text-red-500 hover:underline text-[10px]">Suppr</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {factures.length === 0 && (
                      <tr><td colSpan={10} className="text-center text-fg3 py-6">Aucune facture d'achat</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'fournisseurs' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <div className="text-[11px] text-fg3">{fournisseurs.length} fournisseur(s)</div>
              {canWrite && <button onClick={openFrnNew} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[11px] font-bold">+ Nouveau fournisseur</button>}
            </div>
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-bg3 text-fg3 text-[10px] uppercase">
                  <tr>
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">Raison sociale</th>
                    <th className="text-left p-2">NINEA</th>
                    <th className="text-left p-2">RCCM</th>
                    <th className="text-left p-2">Compte</th>
                    <th className="text-center p-2">Délai</th>
                    <th className="text-center p-2">Actif</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fournisseurs.map(f => (
                    <tr key={f.id} className="border-t border-border hover:bg-bg3">
                      <td className="p-2 font-mono">{f.code}</td>
                      <td className="p-2 font-bold">{f.raison_sociale}</td>
                      <td className="p-2 font-mono text-fg3">{f.ninea || '—'}</td>
                      <td className="p-2 font-mono text-fg3">{f.rccm || '—'}</td>
                      <td className="p-2 font-mono">{f.compte_tiers}</td>
                      <td className="p-2 text-center">{f.delai_paiement_jours}j</td>
                      <td className="p-2 text-center">{f.actif ? '✓' : '✗'}</td>
                      <td className="p-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openFrnEdit(f)} className="text-primary hover:underline text-[10px]">Éditer</button>
                          {canWrite && <button onClick={() => deleteFrn(f.id)} className="text-red-500 hover:underline text-[10px]">Suppr</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {fournisseurs.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-fg3 py-6">Aucun fournisseur</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ─── MODAL FOURNISSEUR ─────────────────────────── */}
      {showFrn && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowFrn(false)}>
          <div className="bg-bg2 border border-border rounded-lg p-5 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="text-[15px] font-serif mb-4">{frnForm.id ? 'Modifier' : 'Nouveau'} fournisseur</div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <label className="text-fg3 uppercase text-[10px]">Code</label>
                <input value={frnForm.code || ''} onChange={e => setFrnForm({ ...frnForm, code: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
              <div className="col-span-2">
                <label className="text-fg3 uppercase text-[10px]">Raison sociale *</label>
                <input value={frnForm.raison_sociale || ''} onChange={e => setFrnForm({ ...frnForm, raison_sociale: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">NINEA</label>
                <input value={frnForm.ninea || ''} onChange={e => setFrnForm({ ...frnForm, ninea: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 font-mono" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">RCCM</label>
                <input value={frnForm.rccm || ''} onChange={e => setFrnForm({ ...frnForm, rccm: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 font-mono" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Téléphone</label>
                <input value={frnForm.telephone || ''} onChange={e => setFrnForm({ ...frnForm, telephone: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Email</label>
                <input value={frnForm.email || ''} onChange={e => setFrnForm({ ...frnForm, email: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
              <div className="col-span-2">
                <label className="text-fg3 uppercase text-[10px]">Adresse</label>
                <input value={frnForm.adresse || ''} onChange={e => setFrnForm({ ...frnForm, adresse: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Compte tiers</label>
                <input value={frnForm.compte_tiers || '401'} onChange={e => setFrnForm({ ...frnForm, compte_tiers: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 font-mono" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Délai paiement (j)</label>
                <input type="number" value={frnForm.delai_paiement_jours ?? 30} onChange={e => setFrnForm({ ...frnForm, delai_paiement_jours: parseInt(e.target.value) || 0 })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowFrn(false)} className="px-3 py-1.5 bg-bg3 rounded text-[11px]">Annuler</button>
              <button onClick={saveFrn} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[11px] font-bold">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL RÈGLEMENT / ACOMPTE ─────────────────── */}
      {regFact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRegFact(null)}>
          <div className="bg-bg2 border border-border rounded-lg p-5 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="text-[15px] font-serif mb-4">Règlement — {regFact.numero_interne}</div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <label className="text-fg3 uppercase text-[10px]">Nature</label>
                <select value={regForm.type} onChange={e => setRegForm({ ...regForm, type: e.target.value as 'acompte' | 'solde' })} className="w-full bg-bg3 border border-border rounded px-2 py-1">
                  <option value="solde">Règlement sur facture (401)</option>
                  <option value="acompte">Avance / acompte versé (4091)</option>
                </select>
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Date</label>
                <input type="date" value={regForm.date} onChange={e => setRegForm({ ...regForm, date: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Montant payé</label>
                <input type="number" value={regForm.montant} onChange={e => setRegForm({ ...regForm, montant: parseFloat(e.target.value) || 0 })} className="w-full bg-bg3 border border-border rounded px-2 py-1 font-mono" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Compte de trésorerie</label>
                <input value={regForm.compte} onChange={e => setRegForm({ ...regForm, compte: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRegFact(null)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
              <button onClick={enregistrerReglement} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Comptabiliser</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL FACTURE ─────────────────────────────── */}
      {showFact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowFact(false)}>
          <div className="bg-bg2 border border-border rounded-lg p-5 max-w-4xl w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="text-[15px] font-serif mb-4">{factForm.id ? 'Facture' : 'Nouvelle facture'} d'achat</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] mb-4">
              <div>
                <label className="text-fg3 uppercase text-[10px]">N° Interne</label>
                <input value={factForm.numero_interne || ''} onChange={e => setFactForm({ ...factForm, numero_interne: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 font-mono" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">N° Fournisseur</label>
                <input value={factForm.numero_fournisseur || ''} onChange={e => setFactForm({ ...factForm, numero_fournisseur: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 font-mono" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Date facture</label>
                <input type="date" value={factForm.date_facture || ''} onChange={e => setFactForm({ ...factForm, date_facture: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-fg3 uppercase text-[10px]">Échéance</label>
                <input type="date" value={factForm.date_echeance || ''} onChange={e => setFactForm({ ...factForm, date_echeance: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
              <div className="col-span-2">
                <label className="text-fg3 uppercase text-[10px]">Fournisseur *</label>
                <select value={factForm.fournisseur_id || ''} onChange={e => setFactForm({ ...factForm, fournisseur_id: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1">
                  <option value="">— Sélectionner —</option>
                  {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.code} — {f.raison_sociale}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-fg3 uppercase text-[10px]">Objet</label>
                <input value={factForm.objet || ''} onChange={e => setFactForm({ ...factForm, objet: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1" />
              </div>
            </div>

            <div className="mb-2 flex justify-between items-center">
              <div className="text-[11px] font-bold uppercase text-fg3">Lignes</div>
              <button onClick={() => setLignes([...lignes, emptyLigne(lignes.length)])} className="text-[10px] text-primary hover:underline">+ Ligne</button>
            </div>
            <div className="bg-bg3 rounded border border-border overflow-hidden mb-4">
              <table className="w-full text-[11px]">
                <thead className="bg-bg2 text-fg3 text-[10px] uppercase">
                  <tr>
                    <th className="text-left p-1.5">Désignation</th>
                    <th className="text-right p-1.5 w-16">Qté</th>
                    <th className="text-right p-1.5 w-24">PU</th>
                    <th className="text-right p-1.5 w-16">TVA%</th>
                    <th className="text-left p-1.5 w-20">Compte</th>
                    <th className="text-right p-1.5 w-24">HT</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1"><input value={l.designation} onChange={e => { const n = [...lignes]; n[i].designation = e.target.value; setLignes(n); }} className="w-full bg-transparent px-1 py-0.5" /></td>
                      <td className="p-1"><input type="number" step="0.01" value={l.quantite} onChange={e => { const n = [...lignes]; n[i].quantite = parseFloat(e.target.value) || 0; setLignes(recomputeLignes(n)); }} className="w-full bg-transparent text-right px-1 py-0.5" /></td>
                      <td className="p-1"><input type="number" step="0.01" value={l.prix_unitaire} onChange={e => { const n = [...lignes]; n[i].prix_unitaire = parseFloat(e.target.value) || 0; setLignes(recomputeLignes(n)); }} className="w-full bg-transparent text-right px-1 py-0.5" /></td>
                      <td className="p-1"><input type="number" step="0.01" value={l.taux_tva} onChange={e => { const n = [...lignes]; n[i].taux_tva = parseFloat(e.target.value) || 0; setLignes(n); }} className="w-full bg-transparent text-right px-1 py-0.5" /></td>
                      <td className="p-1"><input value={l.compte_charge} onChange={e => { const n = [...lignes]; n[i].compte_charge = e.target.value; setLignes(n); }} className="w-full bg-transparent font-mono px-1 py-0.5" /></td>
                      <td className="p-1 text-right font-mono">{fmt(l.quantite * l.prix_unitaire)}</td>
                      <td className="p-1 text-center">{lignes.length > 1 && <button onClick={() => setLignes(lignes.filter((_, j) => j !== i))} className="text-red-500 text-[10px]">×</button>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-bg2 text-[11px] font-bold">
                  <tr><td colSpan={5} className="p-1.5 text-right">Total HT</td><td className="p-1.5 text-right font-mono">{fmt(totals(lignes).ht)}</td><td></td></tr>
                  <tr><td colSpan={5} className="p-1.5 text-right text-fg3">TVA</td><td className="p-1.5 text-right font-mono text-fg3">{fmt(totals(lignes).tva)}</td><td></td></tr>
                  <tr><td colSpan={5} className="p-1.5 text-right">Total TTC</td><td className="p-1.5 text-right font-mono text-primary">{fmt(totals(lignes).ttc)}</td><td></td></tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowFact(false)} className="px-3 py-1.5 bg-bg3 rounded text-[11px]">Annuler</button>
              {canWrite && <button onClick={saveFact} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[11px] font-bold">Enregistrer</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
