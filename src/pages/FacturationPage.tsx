import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import { enregistrerLignesJournal } from '@/lib/ecritures';
import { lignesReglementClient } from '@/lib/reglements';

interface Client {
  id: string;
  entreprise_id: string;
  code: string;
  nom: string;
  ninea?: string | null;
  rccm?: string | null;
  adresse?: string | null;
  email?: string | null;
  tel?: string | null;
  compte_tiers: string;
  actif: boolean;
}

interface Ligne {
  id?: string;
  designation: string;
  quantite: number;
  prix_unitaire: number;
  remise_pct: number;
  montant_ht: number;
  ordre: number;
}

interface Facture {
  id: string;
  entreprise_id: string;
  exercice_id: string;
  client_id: string;
  numero: string;
  date_facture: string;
  date_echeance?: string | null;
  objet?: string | null;
  notes?: string | null;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  taux_tva: number;
  statut: 'brouillon' | 'validee' | 'payee' | 'annulee';
  compte_vente: string;
  comptabilisee: boolean;
}

const emptyLigne = (i = 0): Ligne => ({ designation: '', quantite: 1, prix_unitaire: 0, remise_pct: 0, montant_ht: 0, ordre: i });

export default function FacturationPage() {
  const { entreprise, exercice } = useApp();
  const { canWrite, canDelete } = useUserRole();
  const [tab, setTab] = useState<'factures' | 'clients'>('factures');
  const [factures, setFactures] = useState<Facture[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  // Facture form
  const [showFact, setShowFact] = useState(false);
  const [factForm, setFactForm] = useState<Partial<Facture>>({});
  const [lignes, setLignes] = useState<Ligne[]>([emptyLigne()]);
  const [viewFact, setViewFact] = useState<Facture | null>(null);
  const [viewLignes, setViewLignes] = useState<Ligne[]>([]);

  // Client form
  const [regFact, setRegFact] = useState<Facture | null>(null);
  const [regForm, setRegForm] = useState<{ montant: number; compte: string; type: 'acompte' | 'solde'; date: string }>({ montant: 0, compte: '521', type: 'solde', date: new Date().toISOString().slice(0, 10) });
  const [showClient, setShowClient] = useState(false);
  const [clientForm, setClientForm] = useState<Partial<Client>>({});

  const load = async () => {
    if (!entreprise) return;
    setLoading(true);
    const [f, c] = await Promise.all([
      supabase.from('factures').select('*').eq('entreprise_id', entreprise.id).order('date_facture', { ascending: false }),
      supabase.from('clients').select('*').eq('entreprise_id', entreprise.id).order('nom'),
    ]);
    if (f.error) toast.error(f.error.message); else setFactures((f.data || []) as any);
    if (c.error) toast.error(c.error.message); else setClients((c.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entreprise?.id]);

  // ===== CLIENTS =====
  const saveClient = async () => {
    if (!entreprise || !canWrite) return;
    if (!clientForm.code || !clientForm.nom) { toast.error('Code et nom requis'); return; }
    const payload: any = {
      entreprise_id: entreprise.id,
      code: clientForm.code, nom: clientForm.nom,
      ninea: clientForm.ninea || null, rccm: clientForm.rccm || null,
      adresse: clientForm.adresse || null, email: clientForm.email || null, tel: clientForm.tel || null,
      compte_tiers: clientForm.compte_tiers || '411',
      actif: clientForm.actif !== false,
    };
    const res = clientForm.id
      ? await supabase.from('clients').update(payload).eq('id', clientForm.id)
      : await supabase.from('clients').insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success('Client enregistré'); setShowClient(false); setClientForm({}); load(); }
  };

  const deleteClient = async (id: string) => {
    if (!canDelete || !confirm('Supprimer ce client ?')) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Supprimé'); load(); }
  };

  // ===== FACTURES =====
  const recomputeLigne = (l: Ligne): Ligne => {
    const brut = (l.quantite || 0) * (l.prix_unitaire || 0);
    const ht = brut * (1 - (l.remise_pct || 0) / 100);
    return { ...l, montant_ht: Math.round(ht) };
  };

  const totals = useMemo(() => {
    const ht = lignes.reduce((s, l) => s + (l.montant_ht || 0), 0);
    const taux = Number(factForm.taux_tva ?? 18);
    const tva = Math.round(ht * taux / 100);
    return { ht, tva, ttc: ht + tva };
  }, [lignes, factForm.taux_tva]);

  const nextNumero = () => {
    const year = new Date().getFullYear();
    const prefix = `FC-${year}-`;
    const max = factures.filter(f => f.numero.startsWith(prefix))
      .map(f => parseInt(f.numero.slice(prefix.length)) || 0)
      .reduce((m, n) => Math.max(m, n), 0);
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  };

  const openNewFacture = () => {
    if (!clients.length) { toast.error('Créez au moins un client'); return; }
    setFactForm({
      numero: nextNumero(),
      date_facture: new Date().toISOString().slice(0, 10),
      date_echeance: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      client_id: clients[0].id,
      taux_tva: 18, compte_vente: '701', statut: 'brouillon',
    });
    setLignes([emptyLigne()]);
    setShowFact(true);
  };

  const editFacture = async (f: Facture) => {
    setFactForm(f);
    const { data } = await supabase.from('facture_lignes').select('*').eq('facture_id', f.id).order('ordre');
    setLignes((data || []).map((l: any, i) => ({ ...l, ordre: l.ordre ?? i })) as any);
    setShowFact(true);
  };

  const saveFacture = async () => {
    if (!entreprise || !exercice || !canWrite) return;
    if (!factForm.client_id || !factForm.numero) { toast.error('Client et n° requis'); return; }
    if (!lignes.length || lignes.every(l => !l.designation)) { toast.error('Ajoutez au moins une ligne'); return; }
    const payload: any = {
      entreprise_id: entreprise.id, exercice_id: exercice.id,
      client_id: factForm.client_id, numero: factForm.numero,
      date_facture: factForm.date_facture, date_echeance: factForm.date_echeance || null,
      objet: factForm.objet || null, notes: factForm.notes || null,
      total_ht: totals.ht, total_tva: totals.tva, total_ttc: totals.ttc,
      taux_tva: Number(factForm.taux_tva ?? 18),
      statut: factForm.statut || 'brouillon',
      compte_vente: factForm.compte_vente || '701',
    };
    let factureId = factForm.id;
    if (factureId) {
      const r = await supabase.from('factures').update(payload).eq('id', factureId);
      if (r.error) { toast.error(r.error.message); return; }
      await supabase.from('facture_lignes').delete().eq('facture_id', factureId);
    } else {
      const r = await supabase.from('factures').insert(payload).select().single();
      if (r.error) { toast.error(r.error.message); return; }
      factureId = r.data.id;
    }
    const lignesPayload = lignes.filter(l => l.designation).map((l, i) => ({
      facture_id: factureId, designation: l.designation,
      quantite: l.quantite, prix_unitaire: l.prix_unitaire,
      remise_pct: l.remise_pct, montant_ht: l.montant_ht, ordre: i,
    }));
    if (lignesPayload.length) {
      const r2 = await supabase.from('facture_lignes').insert(lignesPayload);
      if (r2.error) { toast.error(r2.error.message); return; }
    }
    toast.success('Facture enregistrée');
    setShowFact(false); setFactForm({}); setLignes([emptyLigne()]); load();
  };

  // Comptabilisation : génère écritures dans le journal VT
  const comptabiliserFacture = async (f: Facture) => {
    if (!entreprise || !exercice || !canWrite) return;
    if (f.comptabilisee) { toast.error('Déjà comptabilisée'); return; }
    const client = clients.find(c => c.id === f.client_id);
    if (!client) { toast.error('Client introuvable'); return; }
    const compteClient = `${client.compte_tiers}${client.code}`.slice(0, 12);
    const piece = f.numero;
    const lib = `Facture ${f.numero} - ${client.nom}`;
    const lines: any[] = [
      // Débit 411 (TTC)
      { entreprise_id: entreprise.id, exercice_id: exercice.id,
        date_ecriture: f.date_facture, piece, journal_code: 'VT',
        libelle: lib, compte: compteClient, intitule: `Client ${client.nom}`,
        debit: f.total_ttc, credit: 0 },
      // Crédit 70x (HT)
      { entreprise_id: entreprise.id, exercice_id: exercice.id,
        date_ecriture: f.date_facture, piece, journal_code: 'VT',
        libelle: lib, compte: f.compte_vente, intitule: 'Ventes',
        debit: 0, credit: f.total_ht },
    ];
    if (f.total_tva > 0) {
      lines.push({
        entreprise_id: entreprise.id, exercice_id: exercice.id,
        date_ecriture: f.date_facture, piece, journal_code: 'VT',
        libelle: lib, compte: '4431', intitule: 'TVA collectée',
        debit: 0, credit: f.total_tva,
      });
    }
    try {
      await enregistrerLignesJournal(lines as any, { origine: 'facture_vente' });
    } catch (e) { toast.error((e as Error).message); return; }
    await supabase.from('factures').update({ comptabilisee: true, statut: 'validee' }).eq('id', f.id);
    toast.success(`Facture ${f.numero} comptabilisée dans le journal VT`);
    load();
  };

  // Règlement / acompte client — l'acompte est crédité en 4191 (jamais compensé avec 411)
  const openReglement = (f: Facture) => {
    setRegFact(f);
    setRegForm({ montant: f.total_ttc, compte: '521', type: 'solde', date: new Date().toISOString().slice(0, 10) });
  };

  const enregistrerReglement = async () => {
    if (!entreprise || !exercice || !regFact || !canWrite) return;
    const cl = clients.find(c => c.id === regFact.client_id);
    if (!cl) { toast.error('Client introuvable'); return; }
    const compteClient = `${cl.compte_tiers}${cl.code}`.slice(0, 12);
    const lib = `${regForm.type === 'acompte' ? 'Acompte' : 'Règlement'} ${regFact.numero} - ${cl.nom}`;
    const lignesReg = lignesReglementClient({
      compteTiers: compteClient, compteTresorerie: regForm.compte,
      montant: Number(regForm.montant), type: regForm.type, libelle: lib,
    });
    if (!lignesReg.length) { toast.error('Montant invalide'); return; }
    try {
      await enregistrerLignesJournal(lignesReg.map(l => ({
        entreprise_id: entreprise.id, exercice_id: exercice.id,
        date_ecriture: regForm.date, piece: `REG-${regFact.numero}`, journal_code: 'BQ',
        libelle: l.libelle || lib, compte: l.compte, intitule: l.intitule || '',
        debit: l.debit || 0, credit: l.credit || 0,
      })) as any, { origine: 'reglement_client' });
    } catch (e) { toast.error((e as Error).message); return; }
    if (regForm.type === 'solde' && Number(regForm.montant) >= regFact.total_ttc) {
      await supabase.from('factures').update({ statut: 'payee' }).eq('id', regFact.id);
    }
    toast.success('Règlement comptabilisé (journal BQ)');
    setRegFact(null); load();
  };

  const deleteFacture = async (id: string) => {
    if (!canDelete || !confirm('Supprimer cette facture ?')) return;
    const { error } = await supabase.from('factures').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Supprimée'); load(); }
  };

  const printFacture = async (f: Facture) => {
    const { data } = await supabase.from('facture_lignes').select('*').eq('facture_id', f.id).order('ordre');
    setViewFact(f); setViewLignes((data || []) as any);
    setTimeout(() => window.print(), 250);
  };

  const client = (id: string) => clients.find(c => c.id === id);
  const statutColor = (s: string) => ({
    brouillon: 'bg-fg3/20 text-fg3',
    validee: 'bg-primary/20 text-primary',
    payee: 'bg-accent/20 text-accent',
    annulee: 'bg-destructive/20 text-destructive',
  }[s] || 'bg-fg3/20');

  // SYNTHÈSE
  const stats = useMemo(() => {
    const ttc = factures.reduce((s, f) => s + (f.total_ttc || 0), 0);
    const enAttente = factures.filter(f => f.statut === 'validee').reduce((s, f) => s + f.total_ttc, 0);
    const brouillons = factures.filter(f => f.statut === 'brouillon').length;
    return { ttc, enAttente, brouillons, total: factures.length };
  }, [factures]);

  return (
    <div className="print:bg-white">
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5 print:hidden">
        <div className="font-serif text-[17px]">🧾 Facturation Client</div>
        <div className="flex items-center gap-1">
          <button onClick={() => setTab('factures')} className={`px-3 py-1 rounded-md text-xs ${tab === 'factures' ? 'bg-primary text-primary-foreground' : 'border border-border text-fg2'}`}>Factures</button>
          <button onClick={() => setTab('clients')} className={`px-3 py-1 rounded-md text-xs ${tab === 'clients' ? 'bg-primary text-primary-foreground' : 'border border-border text-fg2'}`}>Clients</button>
        </div>
      {String((entreprise as any)?.secteur_activite ?? '').startsWith('sante') && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-md border border-border bg-bg2 text-xs text-fg2 print:hidden">
          Honoraires réservés à la facturation d'entreprises clientes (conventions, prestations). Les patients se facturent dans <b>Facturation santé</b> : un même acte ou une même analyse ne peut être facturé qu'une seule fois, tous modules confondus.
        </div>
      )}
      </div>

      <div className="p-5 space-y-4 print:hidden">
        {tab === 'factures' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Nb factures" value={String(stats.total)} />
              <Stat label="CA TTC" value={fmt(stats.ttc)} />
              <Stat label="En attente paiement" value={fmt(stats.enAttente)} />
              <Stat label="Brouillons" value={String(stats.brouillons)} />
            </div>

            <div className="bg-bg2 border border-border rounded-lg">
              <div className="flex justify-between items-center p-3 border-b border-border">
                <span className="text-xs font-semibold">Factures émises</span>
                {canWrite && <button onClick={openNewFacture} className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground">+ Nouvelle facture</button>}
              </div>
              <table className="w-full text-xs">
                <thead className="bg-bg3 text-fg3">
                  <tr>
                    <th className="text-left p-2">N°</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Client</th>
                    <th className="text-left p-2">Objet</th>
                    <th className="text-right p-2">HT</th>
                    <th className="text-right p-2">TTC</th>
                    <th className="text-center p-2">Statut</th>
                    <th className="text-center p-2">Cpta</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={9} className="text-center p-6 text-fg3">Chargement…</td></tr>}
                  {!loading && !factures.length && <tr><td colSpan={9} className="text-center p-6 text-fg3">Aucune facture</td></tr>}
                  {factures.map(f => (
                    <tr key={f.id} className="border-t border-border hover:bg-bg3/50">
                      <td className="p-2 font-mono">{f.numero}</td>
                      <td className="p-2 font-mono text-[10px]">{f.date_facture}</td>
                      <td className="p-2">{client(f.client_id)?.nom || '—'}</td>
                      <td className="p-2 text-fg3 truncate max-w-[200px]">{f.objet || ''}</td>
                      <td className="p-2 text-right font-mono">{fmt(f.total_ht)}</td>
                      <td className="p-2 text-right font-mono font-semibold">{fmt(f.total_ttc)}</td>
                      <td className="p-2 text-center"><span className={`text-[10px] px-2 py-0.5 rounded ${statutColor(f.statut)}`}>{f.statut}</span></td>
                      <td className="p-2 text-center">{f.comptabilisee ? '✅' : '—'}</td>
                      <td className="p-2 text-right space-x-1 whitespace-nowrap">
                        <button onClick={() => printFacture(f)} className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3" title="Imprimer/PDF">🖨</button>
                        {canWrite && f.statut !== 'payee' && f.statut !== 'annulee' && <button onClick={() => openReglement(f)} className="text-[10px] px-2 py-1 rounded border border-accent/40 text-accent hover:bg-accent/10" title="Règlement / acompte">💰</button>}
                        {canWrite && !f.comptabilisee && <button onClick={() => comptabiliserFacture(f)} className="text-[10px] px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10" title="Comptabiliser (Journal VT)">💾</button>}
                        {canWrite && !f.comptabilisee && <button onClick={() => editFacture(f)} className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">✏️</button>}
                        {canDelete && !f.comptabilisee && <button onClick={() => deleteFacture(f.id)} className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10">🗑</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'clients' && (
          <div className="bg-bg2 border border-border rounded-lg">
            <div className="flex justify-between items-center p-3 border-b border-border">
              <span className="text-xs font-semibold">Fichier clients — {clients.length}</span>
              {canWrite && <button onClick={() => { setClientForm({ compte_tiers: '411', actif: true }); setShowClient(true); }} className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground">+ Nouveau client</button>}
            </div>
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3">
                <tr>
                  <th className="text-left p-2">Code</th>
                  <th className="text-left p-2">Nom</th>
                  <th className="text-left p-2">NINEA</th>
                  <th className="text-left p-2">RCCM</th>
                  <th className="text-left p-2">Tel / Email</th>
                  <th className="text-center p-2">Cpte</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!clients.length && <tr><td colSpan={7} className="text-center p-6 text-fg3">Aucun client</td></tr>}
                {clients.map(c => (
                  <tr key={c.id} className="border-t border-border hover:bg-bg3/50">
                    <td className="p-2 font-mono">{c.code}</td>
                    <td className="p-2 font-semibold">{c.nom}</td>
                    <td className="p-2 font-mono text-[10px]">{c.ninea || '—'}</td>
                    <td className="p-2 font-mono text-[10px]">{c.rccm || '—'}</td>
                    <td className="p-2 text-[10px]">{c.tel}{c.tel && c.email ? ' · ' : ''}{c.email}</td>
                    <td className="p-2 text-center font-mono text-[10px]">{c.compte_tiers}</td>
                    <td className="p-2 text-right space-x-1">
                      {canWrite && <button onClick={() => { setClientForm(c); setShowClient(true); }} className="text-[10px] px-2 py-1 rounded border border-border">✏️</button>}
                      {canDelete && <button onClick={() => deleteClient(c.id)} className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive">🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== RÈGLEMENT / ACOMPTE CLIENT ===== */}
      {regFact && (
        <Modal title={`Règlement — ${regFact.numero}`} onClose={() => setRegFact(null)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Nature">
              <select className="inp" value={regForm.type} onChange={e => setRegForm({ ...regForm, type: e.target.value as 'acompte' | 'solde' })}>
                <option value="solde">Règlement sur facture (411)</option>
                <option value="acompte">Avance / acompte reçu (4191)</option>
              </select>
            </Field>
            <Field label="Date"><input type="date" className="inp" value={regForm.date} onChange={e => setRegForm({ ...regForm, date: e.target.value })} /></Field>
            <Field label="Montant reçu"><input type="number" className="inp" value={regForm.montant} onChange={e => setRegForm({ ...regForm, montant: parseFloat(e.target.value) || 0 })} /></Field>
            <Field label="Compte de trésorerie"><input className="inp" value={regForm.compte} onChange={e => setRegForm({ ...regForm, compte: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setRegFact(null)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={enregistrerReglement} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Comptabiliser</button>
          </div>
        </Modal>
      )}

      {/* ===== FORM CLIENT ===== */}
      {showClient && (
        <Modal title={clientForm.id ? 'Modifier client' : 'Nouveau client'} onClose={() => setShowClient(false)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Code"><input className="inp" value={clientForm.code || ''} onChange={e => setClientForm({ ...clientForm, code: e.target.value })} /></Field>
            <Field label="Nom / Raison sociale"><input className="inp" value={clientForm.nom || ''} onChange={e => setClientForm({ ...clientForm, nom: e.target.value })} /></Field>
            <Field label="NINEA"><input className="inp" value={clientForm.ninea || ''} onChange={e => setClientForm({ ...clientForm, ninea: e.target.value })} /></Field>
            <Field label="RCCM"><input className="inp" value={clientForm.rccm || ''} onChange={e => setClientForm({ ...clientForm, rccm: e.target.value })} /></Field>
            <Field label="Téléphone"><input className="inp" value={clientForm.tel || ''} onChange={e => setClientForm({ ...clientForm, tel: e.target.value })} /></Field>
            <Field label="Email"><input className="inp" value={clientForm.email || ''} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Adresse"><textarea className="inp" rows={2} value={clientForm.adresse || ''} onChange={e => setClientForm({ ...clientForm, adresse: e.target.value })} /></Field></div>
            <Field label="Compte tiers (racine)"><input className="inp" value={clientForm.compte_tiers || '411'} onChange={e => setClientForm({ ...clientForm, compte_tiers: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowClient(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={saveClient} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}

      {/* ===== FORM FACTURE ===== */}
      {showFact && (
        <Modal title={factForm.id ? `Facture ${factForm.numero}` : 'Nouvelle facture'} onClose={() => setShowFact(false)} wide>
          <div className="grid grid-cols-4 gap-3 text-xs mb-4">
            <Field label="N° facture"><input className="inp" value={factForm.numero || ''} onChange={e => setFactForm({ ...factForm, numero: e.target.value })} /></Field>
            <Field label="Date facture"><input type="date" className="inp" value={factForm.date_facture || ''} onChange={e => setFactForm({ ...factForm, date_facture: e.target.value })} /></Field>
            <Field label="Échéance"><input type="date" className="inp" value={factForm.date_echeance || ''} onChange={e => setFactForm({ ...factForm, date_echeance: e.target.value })} /></Field>
            <Field label="Client">
              <select className="inp" value={factForm.client_id || ''} onChange={e => setFactForm({ ...factForm, client_id: e.target.value })}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.code} — {c.nom}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="Objet"><input className="inp" value={factForm.objet || ''} onChange={e => setFactForm({ ...factForm, objet: e.target.value })} /></Field></div>
            <Field label="Compte vente"><input className="inp" value={factForm.compte_vente || '701'} onChange={e => setFactForm({ ...factForm, compte_vente: e.target.value })} /></Field>
            <Field label="Taux TVA (%)"><input type="number" step="0.01" className="inp" value={factForm.taux_tva ?? 18} onChange={e => setFactForm({ ...factForm, taux_tva: Number(e.target.value) })} /></Field>
          </div>

          <div className="border border-border rounded">
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3">
                <tr>
                  <th className="text-left p-2 w-1/2">Désignation</th>
                  <th className="text-right p-2">Qté</th>
                  <th className="text-right p-2">PU</th>
                  <th className="text-right p-2">Rem.%</th>
                  <th className="text-right p-2">Mont. HT</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-1"><input className="inp" value={l.designation} onChange={e => { const n = [...lignes]; n[i] = recomputeLigne({ ...l, designation: e.target.value }); setLignes(n); }} /></td>
                    <td className="p-1"><input type="number" step="0.01" className="inp text-right" value={l.quantite} onChange={e => { const n = [...lignes]; n[i] = recomputeLigne({ ...l, quantite: Number(e.target.value) }); setLignes(n); }} /></td>
                    <td className="p-1"><input type="number" className="inp text-right" value={l.prix_unitaire} onChange={e => { const n = [...lignes]; n[i] = recomputeLigne({ ...l, prix_unitaire: Number(e.target.value) }); setLignes(n); }} /></td>
                    <td className="p-1"><input type="number" step="0.01" className="inp text-right" value={l.remise_pct} onChange={e => { const n = [...lignes]; n[i] = recomputeLigne({ ...l, remise_pct: Number(e.target.value) }); setLignes(n); }} /></td>
                    <td className="p-1 text-right font-mono">{fmt(l.montant_ht)}</td>
                    <td className="p-1 text-center"><button onClick={() => setLignes(lignes.filter((_, j) => j !== i))} className="text-destructive text-[10px]">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setLignes([...lignes, emptyLigne(lignes.length)])} className="w-full p-1.5 text-[10px] text-primary border-t border-border hover:bg-bg3">+ Ajouter une ligne</button>
          </div>

          <div className="flex justify-end mt-3">
            <div className="w-64 text-xs space-y-1">
              <div className="flex justify-between"><span>Total HT</span><span className="font-mono">{fmt(totals.ht)}</span></div>
              <div className="flex justify-between"><span>TVA {Number(factForm.taux_tva ?? 18)}%</span><span className="font-mono">{fmt(totals.tva)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Total TTC</span><span className="font-mono text-primary">{fmt(totals.ttc)}</span></div>
            </div>
          </div>

          <Field label="Notes / mentions" >
            <textarea className="inp" rows={2} value={factForm.notes || ''} onChange={e => setFactForm({ ...factForm, notes: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowFact(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={saveFacture} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}

      {/* ===== APERÇU IMPRESSION ===== */}
      {viewFact && (() => {
        const c = client(viewFact.client_id);
        return (
          <div className="fixed inset-0 bg-white z-[200] overflow-auto p-8 print:p-0" id="invoice-print">
            <div className="max-w-[210mm] mx-auto bg-white text-black p-8 font-sans">
              <div className="flex justify-between items-start mb-8 border-b-2 border-black pb-4">
                <div>
                  <h1 className="text-2xl font-bold">{entreprise?.nom}</h1>
                  {entreprise?.sigle && <div className="text-sm">{entreprise.sigle}</div>}
                  {entreprise?.adresse && <div className="text-xs mt-1">{entreprise.adresse}</div>}
                  {entreprise?.tel && <div className="text-xs">Tél : {entreprise.tel}</div>}
                  <div className="text-xs mt-1">
                    {entreprise?.ninea && <span>NINEA : {entreprise.ninea}</span>}
                    {entreprise?.ninea && entreprise?.rccm && <span> · </span>}
                    {entreprise?.rccm && <span>RCCM : {entreprise.rccm}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tracking-wider">FACTURE</div>
                  <div className="text-lg font-mono mt-1">N° {viewFact.numero}</div>
                  <div className="text-xs mt-2">Date : <strong>{viewFact.date_facture}</strong></div>
                  {viewFact.date_echeance && <div className="text-xs">Échéance : <strong>{viewFact.date_echeance}</strong></div>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div></div>
                <div className="border border-black p-3 text-sm">
                  <div className="text-[10px] uppercase tracking-wide font-bold mb-1">Facturé à</div>
                  <div className="font-bold">{c?.nom}</div>
                  {c?.adresse && <div className="text-xs whitespace-pre-line">{c.adresse}</div>}
                  {c?.ninea && <div className="text-xs">NINEA : {c.ninea}</div>}
                  {c?.rccm && <div className="text-xs">RCCM : {c.rccm}</div>}
                </div>
              </div>

              {viewFact.objet && <div className="mb-4 text-sm"><strong>Objet :</strong> {viewFact.objet}</div>}

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-black text-white">
                    <th className="text-left p-2 border border-black">Désignation</th>
                    <th className="text-right p-2 border border-black w-16">Qté</th>
                    <th className="text-right p-2 border border-black w-24">P.U.</th>
                    <th className="text-right p-2 border border-black w-16">Rem.%</th>
                    <th className="text-right p-2 border border-black w-32">Mont. HT</th>
                  </tr>
                </thead>
                <tbody>
                  {viewLignes.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2 border border-black">{l.designation}</td>
                      <td className="p-2 border border-black text-right font-mono">{l.quantite}</td>
                      <td className="p-2 border border-black text-right font-mono">{fmt(l.prix_unitaire)}</td>
                      <td className="p-2 border border-black text-right font-mono">{l.remise_pct || 0}</td>
                      <td className="p-2 border border-black text-right font-mono">{fmt(l.montant_ht)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end mt-4">
                <table className="text-sm border-collapse">
                  <tbody>
                    <tr><td className="p-2 border border-black">Total HT</td><td className="p-2 border border-black text-right font-mono w-40">{fmt(viewFact.total_ht)}</td></tr>
                    <tr><td className="p-2 border border-black">TVA {viewFact.taux_tva}%</td><td className="p-2 border border-black text-right font-mono">{fmt(viewFact.total_tva)}</td></tr>
                    <tr className="bg-black text-white font-bold"><td className="p-2 border border-black">TOTAL TTC</td><td className="p-2 border border-black text-right font-mono">{fmt(viewFact.total_ttc)} {entreprise?.monnaie || 'FCFA'}</td></tr>
                  </tbody>
                </table>
              </div>

              {viewFact.notes && <div className="mt-6 text-xs border-t border-black pt-3"><strong>Notes :</strong><br/>{viewFact.notes}</div>}

              <div className="mt-8 text-[10px] text-center border-t border-black pt-3">
                {entreprise?.nom} {entreprise?.ninea && `· NINEA ${entreprise.ninea}`} {entreprise?.rccm && `· RCCM ${entreprise.rccm}`}
                <br/>Document généré par G-Compta — Conforme SYSCOHADA
              </div>

              <div className="mt-6 text-center print:hidden">
                <button onClick={() => setViewFact(null)} className="px-4 py-2 bg-gray-200 text-black rounded mr-2">Fermer</button>
                <button onClick={() => window.print()} className="px-4 py-2 bg-black text-white rounded">🖨 Imprimer</button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        .inp{width:100%;padding:6px 8px;background:hsl(var(--bg3));border:1px solid hsl(var(--border));border-radius:4px;color:hsl(var(--foreground));font-size:11px;}
        @media print { body * { visibility: hidden; } #invoice-print, #invoice-print * { visibility: visible; } #invoice-print { position: absolute; left: 0; top: 0; width: 100%; } }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-fg3 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold font-mono mt-1">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] text-fg3 mb-1">{label}</span>{children}</label>;
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-bg2 border border-border rounded-xl p-5 w-full max-h-[90vh] overflow-y-auto ${wide ? 'max-w-5xl' : 'max-w-2xl'}`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-base">{title}</h3>
          <button onClick={onClose} className="text-fg3 hover:text-foreground">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
