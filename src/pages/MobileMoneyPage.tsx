import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import { enregistrerLignesJournal } from '@/lib/ecritures';

type Moyen = {
  id: string;
  entreprise_id: string;
  operateur: 'wave' | 'orange_money' | 'free_money' | 'wizall' | 'autre';
  libelle: string;
  numero: string | null;
  compte_associe: string;
  devise: string;
  actif: boolean;
};

type Trx = {
  id: string;
  entreprise_id: string;
  moyen_id: string;
  date_operation: string;
  sens: 'entree' | 'sortie';
  montant: number;
  frais: number;
  reference: string | null;
  contrepartie: string | null;
  telephone: string | null;
  libelle: string | null;
  statut: 'importee' | 'rapprochee' | 'ignoree';
  journal_id: string | null;
};

const OPERATEURS = [
  { code: 'wave', label: 'Wave', icon: '🌊', color: 'text-primary' },
  { code: 'orange_money', label: 'Orange Money', icon: '🟠', color: 'text-accent' },
  { code: 'free_money', label: 'Free Money', icon: '🔴', color: 'text-destructive' },
  { code: 'wizall', label: 'Wizall Money', icon: '💜', color: 'text-primary' },
  { code: 'autre', label: 'Autre', icon: '💳', color: 'text-fg3' },
] as const;

const opInfo = (code: string) => OPERATEURS.find(o => o.code === code) || OPERATEURS[4];

export default function MobileMoneyPage() {
  const { entreprise, exercice } = useApp();
  const [moyens, setMoyens] = useState<Moyen[]>([]);
  const [trx, setTrx] = useState<Trx[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'operations' | 'moyens' | 'import'>('operations');
  const [selectedMoyen, setSelectedMoyen] = useState<string>('all');

  // Form états
  const [showMoyenForm, setShowMoyenForm] = useState(false);
  const [moyenForm, setMoyenForm] = useState<Partial<Moyen>>({
    operateur: 'wave', libelle: '', numero: '', compte_associe: '521', devise: 'XOF', actif: true,
  });
  const [showTrxForm, setShowTrxForm] = useState(false);
  const [trxForm, setTrxForm] = useState<Partial<Trx>>({
    moyen_id: '', date_operation: new Date().toISOString().slice(0, 10),
    sens: 'entree', montant: 0, frais: 0, reference: '', contrepartie: '', telephone: '', libelle: '',
  });

  const [csvText, setCsvText] = useState('');
  const [csvMoyen, setCsvMoyen] = useState<string>('');

  const load = useCallback(async () => {
    if (!entreprise) return;
    setLoading(true);
    const [m, t] = await Promise.all([
      supabase.from('moyens_paiement').select('*').eq('entreprise_id', entreprise.id).order('operateur'),
      supabase.from('transactions_mm').select('*').eq('entreprise_id', entreprise.id).order('date_operation', { ascending: false }).limit(500),
    ]);
    setMoyens((m.data as Moyen[]) || []);
    setTrx((t.data as Trx[]) || []);
    setLoading(false);
  }, [entreprise]);

  useEffect(() => { load(); }, [load]);

  const soldes = useMemo(() => {
    const s: Record<string, { entree: number; sortie: number; solde: number; nb: number }> = {};
    moyens.forEach(m => { s[m.id] = { entree: 0, sortie: 0, solde: 0, nb: 0 }; });
    trx.forEach(t => {
      if (!s[t.moyen_id]) return;
      if (t.sens === 'entree') s[t.moyen_id].entree += Number(t.montant);
      else s[t.moyen_id].sortie += Number(t.montant) + Number(t.frais);
      s[t.moyen_id].nb++;
    });
    Object.values(s).forEach(v => { v.solde = v.entree - v.sortie; });
    return s;
  }, [moyens, trx]);

  const trxFiltered = useMemo(
    () => selectedMoyen === 'all' ? trx : trx.filter(t => t.moyen_id === selectedMoyen),
    [trx, selectedMoyen]
  );

  // ─────── Moyens ───────
  const saveMoyen = async () => {
    if (!entreprise || !moyenForm.libelle || !moyenForm.compte_associe) {
      toast.error('Libellé et compte comptable requis'); return;
    }
    const { error } = await supabase.from('moyens_paiement').insert({
      entreprise_id: entreprise.id,
      operateur: moyenForm.operateur!, libelle: moyenForm.libelle!,
      numero: moyenForm.numero || null, compte_associe: moyenForm.compte_associe!,
      devise: moyenForm.devise || 'XOF', actif: moyenForm.actif ?? true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Moyen de paiement ajouté');
    setShowMoyenForm(false); setMoyenForm({ operateur: 'wave', libelle: '', numero: '', compte_associe: '521', devise: 'XOF', actif: true });
    load();
  };

  const toggleMoyen = async (m: Moyen) => {
    await supabase.from('moyens_paiement').update({ actif: !m.actif }).eq('id', m.id);
    load();
  };

  const deleteMoyen = async (m: Moyen) => {
    if (!confirm(`Supprimer "${m.libelle}" et toutes ses transactions ?`)) return;
    await supabase.from('moyens_paiement').delete().eq('id', m.id);
    toast.success('Supprimé'); load();
  };

  // ─────── Transactions ───────
  const saveTrx = async () => {
    if (!entreprise || !trxForm.moyen_id || !trxForm.montant) {
      toast.error('Moyen et montant requis'); return;
    }
    const { error } = await supabase.from('transactions_mm').insert({
      entreprise_id: entreprise.id,
      moyen_id: trxForm.moyen_id!, date_operation: trxForm.date_operation!,
      sens: trxForm.sens!, montant: Number(trxForm.montant), frais: Number(trxForm.frais || 0),
      reference: trxForm.reference || null, contrepartie: trxForm.contrepartie || null,
      telephone: trxForm.telephone || null, libelle: trxForm.libelle || null,
      statut: 'importee',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Transaction ajoutée');
    setShowTrxForm(false);
    setTrxForm({ moyen_id: trxForm.moyen_id, date_operation: new Date().toISOString().slice(0, 10), sens: 'entree', montant: 0, frais: 0 });
    load();
  };

  const rapprocher = async (t: Trx) => {
    if (!entreprise || !exercice) { toast.error('Exercice requis'); return; }
    const moyen = moyens.find(m => m.id === t.moyen_id);
    if (!moyen) return;
    // Défaut : encaissement client 411 / MM ; décaissement fournisseur MM / 401
    const compteContrepartie = t.sens === 'entree' ? '411' : '401';
    const piece = `MM-${(t.reference || t.id).slice(0, 8)}`;
    const lib = `${opInfo(moyen.operateur).label} — ${t.libelle || t.contrepartie || (t.sens === 'entree' ? 'Encaissement' : 'Paiement')}`;
    type JLine = {
      entreprise_id: string; exercice_id: string; date_ecriture: string;
      piece: string; journal_code: string; libelle: string;
      compte: string; intitule: string; debit: number; credit: number;
    };
    const lines: JLine[] = [];
    if (t.sens === 'entree') {
      // Débit MM (521), Crédit 411
      lines.push({
        entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: t.date_operation,
        piece, journal_code: 'BQ', libelle: lib, compte: moyen.compte_associe, intitule: moyen.libelle,
        debit: Number(t.montant), credit: 0,
      });
      if (Number(t.frais) > 0) {
        lines.push({
          entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: t.date_operation,
          piece, journal_code: 'BQ', libelle: `Frais ${opInfo(moyen.operateur).label}`, compte: '6318', intitule: 'Frais Mobile Money',
          debit: Number(t.frais), credit: 0,
        });
      }
      lines.push({
        entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: t.date_operation,
        piece, journal_code: 'BQ', libelle: lib, compte: compteContrepartie, intitule: t.contrepartie || 'Client',
        debit: 0, credit: Number(t.montant) + Number(t.frais),
      });
    } else {
      // Débit 401, Crédit MM
      lines.push({
        entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: t.date_operation,
        piece, journal_code: 'BQ', libelle: lib, compte: compteContrepartie, intitule: t.contrepartie || 'Fournisseur',
        debit: Number(t.montant), credit: 0,
      });
      lines.push({
        entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: t.date_operation,
        piece, journal_code: 'BQ', libelle: lib, compte: moyen.compte_associe, intitule: moyen.libelle,
        debit: 0, credit: Number(t.montant),
      });
      if (Number(t.frais) > 0) {
        lines.push({
          entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: t.date_operation,
          piece, journal_code: 'BQ', libelle: `Frais ${opInfo(moyen.operateur).label}`, compte: '6318', intitule: 'Frais Mobile Money',
          debit: Number(t.frais), credit: 0,
        });
        lines.push({
          entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: t.date_operation,
          piece, journal_code: 'BQ', libelle: `Frais ${opInfo(moyen.operateur).label}`, compte: moyen.compte_associe, intitule: moyen.libelle,
          debit: 0, credit: Number(t.frais),
        });
      }
    }
    let journalId: string | null = null;
    try {
      await enregistrerLignesJournal(lines as any, { origine: 'mobile_money' });
      const { data: inserted } = await supabase.from('journal').select('id').eq('piece', piece).eq('entreprise_id', entreprise.id).limit(1);
      journalId = inserted?.[0]?.id ?? null;
    } catch (e) { toast.error((e as Error).message); return; }
    await supabase.from('transactions_mm').update({ statut: 'rapprochee', journal_id: journalId }).eq('id', t.id);
    toast.success('Écriture générée dans le journal BQ');
    load();
  };

  const ignorer = async (t: Trx) => {
    await supabase.from('transactions_mm').update({ statut: 'ignoree' }).eq('id', t.id);
    load();
  };

  const supprimerTrx = async (t: Trx) => {
    if (!confirm('Supprimer cette transaction ?')) return;
    await supabase.from('transactions_mm').delete().eq('id', t.id);
    load();
  };

  // ─────── Import CSV ───────
  const parseCsv = () => {
    if (!entreprise || !csvMoyen) { toast.error('Sélectionne un moyen de paiement'); return; }
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast.error('CSV vide'); return; }
    const header = lines[0].split(/[,;\t]/).map(h => h.toLowerCase().trim());
    const idx = {
      date: header.findIndex(h => /date|jour/.test(h)),
      montant: header.findIndex(h => /montant|amount/.test(h)),
      sens: header.findIndex(h => /sens|type|direction/.test(h)),
      ref: header.findIndex(h => /ref|id|txn/.test(h)),
      contrep: header.findIndex(h => /contrep|counterpart|nom/.test(h)),
      tel: header.findIndex(h => /tel|phone|num/.test(h)),
      lib: header.findIndex(h => /libel|desc|motif/.test(h)),
      frais: header.findIndex(h => /frais|fee/.test(h)),
    };
    if (idx.date < 0 || idx.montant < 0) {
      toast.error('Colonnes date et montant requises'); return;
    }
    const rows = lines.slice(1).map(l => {
      const c = l.split(/[,;\t]/).map(v => v.trim());
      const montantRaw = c[idx.montant] || '0';
      const montant = Math.abs(parseFloat(montantRaw.replace(/\s/g, '').replace(',', '.'))) || 0;
      let sens: 'entree' | 'sortie' = 'entree';
      if (idx.sens >= 0) {
        const s = (c[idx.sens] || '').toLowerCase();
        sens = /sortie|debit|out|envoi/.test(s) ? 'sortie' : 'entree';
      } else if (montantRaw.startsWith('-')) {
        sens = 'sortie';
      }
      const dateRaw = c[idx.date] || '';
      let date = dateRaw;
      const dm = dateRaw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (dm) date = `${dm[3]}-${dm[2]}-${dm[1]}`;
      return {
        entreprise_id: entreprise.id, moyen_id: csvMoyen,
        date_operation: date, sens, montant,
        frais: idx.frais >= 0 ? parseFloat((c[idx.frais] || '0').replace(',', '.')) || 0 : 0,
        reference: idx.ref >= 0 ? c[idx.ref] || null : null,
        contrepartie: idx.contrep >= 0 ? c[idx.contrep] || null : null,
        telephone: idx.tel >= 0 ? c[idx.tel] || null : null,
        libelle: idx.lib >= 0 ? c[idx.lib] || null : null,
        statut: 'importee' as const,
      };
    }).filter(r => r.montant > 0 && r.date_operation);
    if (!rows.length) { toast.error('Aucune ligne valide'); return; }
    supabase.from('transactions_mm').insert(rows).then(({ error }) => {
      if (error) toast.error(error.message);
      else {
        toast.success(`${rows.length} transaction(s) importée(s)`);
        setCsvText(''); setTab('operations'); load();
      }
    });
  };

  if (!entreprise) {
    return <div className="p-5 text-fg3">Sélectionne une entreprise.</div>;
  }

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">📱 Mobile Money</div>
          <div className="text-[10px] text-fg3 font-mono">Wave · Orange Money · Free Money · Wizall</div>
        </div>
        <div className="flex gap-1">
          {(['operations', 'moyens', 'import'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 text-[11px] rounded font-mono uppercase tracking-wider ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-bg3 text-fg2 hover:bg-bg4'}`}>
              {t === 'operations' ? 'Opérations' : t === 'moyens' ? 'Moyens' : 'Import CSV'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Soldes par moyen */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {moyens.filter(m => m.actif).map(m => {
            const info = opInfo(m.operateur);
            const s = soldes[m.id] || { entree: 0, sortie: 0, solde: 0, nb: 0 };
            return (
              <div key={m.id} className="bg-bg2 border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold">{info.icon} {m.libelle}</span>
                  <span className="text-[9px] text-fg3 font-mono">{s.nb} trx</span>
                </div>
                <div className={`text-lg font-bold font-mono ${s.solde >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(s.solde)}</div>
                <div className="text-[10px] text-fg3 font-mono flex justify-between">
                  <span className="text-success">↑ {fmt(s.entree)}</span>
                  <span className="text-destructive">↓ {fmt(s.sortie)}</span>
                </div>
              </div>
            );
          })}
          {moyens.length === 0 && (
            <div className="col-span-full bg-bg2 border border-dashed border-border rounded-lg p-6 text-center">
              <div className="text-fg3 text-sm mb-2">Aucun moyen Mobile Money configuré</div>
              <button onClick={() => setTab('moyens')} className="text-primary text-xs font-semibold hover:underline">
                → Configurer un moyen
              </button>
            </div>
          )}
        </div>

        {/* Tab OPERATIONS */}
        {tab === 'operations' && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">Transactions</span>
                <select value={selectedMoyen} onChange={e => setSelectedMoyen(e.target.value)}
                  className="bg-bg3 border border-border rounded px-2 py-1 text-[11px] font-mono">
                  <option value="all">Tous les moyens</option>
                  {moyens.map(m => <option key={m.id} value={m.id}>{opInfo(m.operateur).icon} {m.libelle}</option>)}
                </select>
              </div>
              <button onClick={() => { setTrxForm({ ...trxForm, moyen_id: selectedMoyen !== 'all' ? selectedMoyen : moyens[0]?.id || '' }); setShowTrxForm(true); }}
                disabled={moyens.length === 0}
                className="text-[11px] bg-primary text-primary-foreground px-2.5 py-1 rounded font-mono disabled:opacity-50">
                + Ajouter
              </button>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {['Date', 'Moyen', 'Sens', 'Montant', 'Frais', 'Réf.', 'Contrepartie', 'Statut', ''].map(h => (
                    <th key={h} className="bg-bg3 px-2 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="p-4 text-center text-fg3">Chargement…</td></tr>}
                {!loading && trxFiltered.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-fg3">Aucune transaction</td></tr>}
                {trxFiltered.map(t => {
                  const m = moyens.find(x => x.id === t.moyen_id);
                  const info = m ? opInfo(m.operateur) : opInfo('autre');
                  return (
                    <tr key={t.id} className="hover:bg-[rgba(56,189,248,.03)]">
                      <td className="px-2 py-1.5 font-mono border-b border-border/50">{t.date_operation}</td>
                      <td className="px-2 py-1.5 border-b border-border/50">{info.icon} {m?.libelle || '—'}</td>
                      <td className={`px-2 py-1.5 font-mono border-b border-border/50 ${t.sens === 'entree' ? 'text-success' : 'text-destructive'}`}>{t.sens === 'entree' ? '↑ Entrée' : '↓ Sortie'}</td>
                      <td className="px-2 py-1.5 font-mono text-right border-b border-border/50">{fmt(t.montant)}</td>
                      <td className="px-2 py-1.5 font-mono text-right text-fg3 border-b border-border/50">{t.frais ? fmt(t.frais) : '—'}</td>
                      <td className="px-2 py-1.5 font-mono text-fg3 border-b border-border/50">{t.reference || '—'}</td>
                      <td className="px-2 py-1.5 border-b border-border/50">{t.contrepartie || t.telephone || '—'}</td>
                      <td className="px-2 py-1.5 border-b border-border/50">
                        {t.statut === 'importee' && <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded text-[9px] font-mono">à rapprocher</span>}
                        {t.statut === 'rapprochee' && <span className="bg-success/10 text-success px-1.5 py-0.5 rounded text-[9px] font-mono">✓ rapprochée</span>}
                        {t.statut === 'ignoree' && <span className="bg-bg4 text-fg3 px-1.5 py-0.5 rounded text-[9px] font-mono">ignorée</span>}
                      </td>
                      <td className="px-2 py-1.5 border-b border-border/50">
                        <div className="flex gap-1 justify-end">
                          {t.statut === 'importee' && (
                            <>
                              <button onClick={() => rapprocher(t)} className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded font-mono hover:bg-success/20">Rapprocher</button>
                              <button onClick={() => ignorer(t)} className="text-[10px] bg-bg4 text-fg3 px-1.5 py-0.5 rounded font-mono hover:bg-bg3">Ignorer</button>
                            </>
                          )}
                          <button onClick={() => supprimerTrx(t)} className="text-[10px] text-destructive px-1 hover:underline">✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab MOYENS */}
        {tab === 'moyens' && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold">Moyens de paiement Mobile Money</span>
              <button onClick={() => setShowMoyenForm(true)} className="text-[11px] bg-primary text-primary-foreground px-2.5 py-1 rounded font-mono">+ Ajouter</button>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {['Opérateur', 'Libellé', 'Numéro', 'Compte', 'Devise', 'Statut', ''].map(h => (
                    <th key={h} className="bg-bg3 px-2 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moyens.map(m => {
                  const info = opInfo(m.operateur);
                  return (
                    <tr key={m.id} className="hover:bg-[rgba(56,189,248,.03)]">
                      <td className="px-2 py-1.5 border-b border-border/50">{info.icon} {info.label}</td>
                      <td className="px-2 py-1.5 border-b border-border/50 font-semibold">{m.libelle}</td>
                      <td className="px-2 py-1.5 font-mono text-fg3 border-b border-border/50">{m.numero || '—'}</td>
                      <td className="px-2 py-1.5 font-mono border-b border-border/50">{m.compte_associe}</td>
                      <td className="px-2 py-1.5 font-mono text-fg3 border-b border-border/50">{m.devise}</td>
                      <td className="px-2 py-1.5 border-b border-border/50">
                        <button onClick={() => toggleMoyen(m)} className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${m.actif ? 'bg-success/10 text-success' : 'bg-bg4 text-fg3'}`}>
                          {m.actif ? '● Actif' : '○ Inactif'}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 border-b border-border/50 text-right">
                        <button onClick={() => deleteMoyen(m)} className="text-[10px] text-destructive hover:underline">Supprimer</button>
                      </td>
                    </tr>
                  );
                })}
                {moyens.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-fg3">Aucun moyen — Ajoute Wave, Orange Money, Free Money ou Wizall.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab IMPORT */}
        {tab === 'import' && (
          <div className="bg-bg2 border border-border rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold">Importer un relevé CSV</div>
            <div className="text-[11px] text-fg3">
              Colonnes reconnues : <code className="font-mono">date, montant, sens, reference, contrepartie, telephone, libelle, frais</code>.
              Séparateurs : virgule, point-virgule ou tabulation. Dates : ISO (2026-01-15) ou FR (15/01/2026).
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[11px]">
                <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Moyen cible</div>
                <select value={csvMoyen} onChange={e => setCsvMoyen(e.target.value)}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] font-mono">
                  <option value="">— Choisir —</option>
                  {moyens.map(m => <option key={m.id} value={m.id}>{opInfo(m.operateur).icon} {m.libelle}</option>)}
                </select>
              </label>
            </div>
            <textarea
              value={csvText} onChange={e => setCsvText(e.target.value)}
              placeholder="date;montant;sens;reference;contrepartie;telephone;libelle;frais&#10;2026-01-15;25000;entree;TXN123;Client ABC;771234567;Facture 001;0"
              className="w-full h-52 bg-bg3 border border-border rounded p-2 text-[11px] font-mono resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCsvText('')} className="text-[11px] bg-bg3 text-fg2 px-3 py-1.5 rounded font-mono">Effacer</button>
              <button onClick={parseCsv} disabled={!csvText.trim() || !csvMoyen}
                className="text-[11px] bg-primary text-primary-foreground px-3 py-1.5 rounded font-mono disabled:opacity-50">
                Importer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Moyen */}
      {showMoyenForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowMoyenForm(false)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3">Nouveau moyen Mobile Money</div>
            <div className="space-y-2 text-[11px]">
              <label className="block">
                <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Opérateur</div>
                <select value={moyenForm.operateur} onChange={e => setMoyenForm({ ...moyenForm, operateur: e.target.value as Moyen['operateur'] })}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono">
                  {OPERATEURS.map(o => <option key={o.code} value={o.code}>{o.icon} {o.label}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Libellé</div>
                <input value={moyenForm.libelle || ''} onChange={e => setMoyenForm({ ...moyenForm, libelle: e.target.value })}
                  placeholder="Ex. Wave PME"
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Numéro</div>
                  <input value={moyenForm.numero || ''} onChange={e => setMoyenForm({ ...moyenForm, numero: e.target.value })}
                    placeholder="77 123 45 67"
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono" />
                </label>
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Compte comptable</div>
                  <input value={moyenForm.compte_associe || ''} onChange={e => setMoyenForm({ ...moyenForm, compte_associe: e.target.value })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono" />
                </label>
              </div>
              <div className="text-[10px] text-fg3">Suggéré : 521 (Wave), 5211 (Orange Money), 5212 (Free), 5213 (Wizall).</div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowMoyenForm(false)} className="text-[11px] bg-bg3 text-fg2 px-3 py-1.5 rounded font-mono">Annuler</button>
              <button onClick={saveMoyen} className="text-[11px] bg-primary text-primary-foreground px-3 py-1.5 rounded font-mono">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Trx */}
      {showTrxForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTrxForm(false)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3">Nouvelle transaction</div>
            <div className="space-y-2 text-[11px]">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Moyen</div>
                  <select value={trxForm.moyen_id} onChange={e => setTrxForm({ ...trxForm, moyen_id: e.target.value })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono">
                    <option value="">—</option>
                    {moyens.map(m => <option key={m.id} value={m.id}>{opInfo(m.operateur).icon} {m.libelle}</option>)}
                  </select>
                </label>
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Date</div>
                  <input type="date" value={trxForm.date_operation} onChange={e => setTrxForm({ ...trxForm, date_operation: e.target.value })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Sens</div>
                  <select value={trxForm.sens} onChange={e => setTrxForm({ ...trxForm, sens: e.target.value as 'entree' | 'sortie' })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono">
                    <option value="entree">↑ Entrée</option>
                    <option value="sortie">↓ Sortie</option>
                  </select>
                </label>
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Montant</div>
                  <input type="number" value={trxForm.montant} onChange={e => setTrxForm({ ...trxForm, montant: Number(e.target.value) })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono text-right" />
                </label>
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Frais</div>
                  <input type="number" value={trxForm.frais} onChange={e => setTrxForm({ ...trxForm, frais: Number(e.target.value) })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono text-right" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Référence</div>
                  <input value={trxForm.reference || ''} onChange={e => setTrxForm({ ...trxForm, reference: e.target.value })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono" />
                </label>
                <label className="block">
                  <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Téléphone</div>
                  <input value={trxForm.telephone || ''} onChange={e => setTrxForm({ ...trxForm, telephone: e.target.value })}
                    className="w-full bg-bg3 border border-border rounded px-2 py-1.5 font-mono" />
                </label>
              </div>
              <label className="block">
                <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Contrepartie</div>
                <input value={trxForm.contrepartie || ''} onChange={e => setTrxForm({ ...trxForm, contrepartie: e.target.value })}
                  placeholder="Nom client/fournisseur"
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5" />
              </label>
              <label className="block">
                <div className="text-fg3 mb-1 font-mono uppercase tracking-wider text-[9px]">Libellé</div>
                <input value={trxForm.libelle || ''} onChange={e => setTrxForm({ ...trxForm, libelle: e.target.value })}
                  className="w-full bg-bg3 border border-border rounded px-2 py-1.5" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowTrxForm(false)} className="text-[11px] bg-bg3 text-fg2 px-3 py-1.5 rounded font-mono">Annuler</button>
              <button onClick={saveTrx} className="text-[11px] bg-primary text-primary-foreground px-3 py-1.5 rounded font-mono">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
