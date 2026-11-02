import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import {
  acomptesDisponibles, controlerReglement, facturesOuvertes, journalTresorerie, joursRetard, resteDu, trancheRetard,
  type FactureOuverte, type SensReglement,
} from '@/lib/reglements-tiers';

interface Tiers { id: string; code: string; nom: string }
interface Reglement {
  id: string; numero: string; date_reglement: string; fournisseur_id: string | null; client_id: string | null; compte_tresorerie: string;
  journal_code: string; mode: string | null; reference: string | null; montant: number; acompte: number; annule_le: string | null; motif_annulation: string | null;
}
interface Imputation {
  id: string; reglement_id: string; facture_achat_id: string | null; facture_id: string | null; montant: number; date_imputation: string;
  origine: 'reglement' | 'acompte'; annule_le: string | null;
}
type Saisie = { tiersId: string; factures: string[]; montants: Record<string, number>; acompte: number; date: string; compte: string; mode: string; reference: string };

const MODES = ['Virement', 'Chèque', 'Espèces', 'Mobile money', 'Carte', 'Prélèvement'];
const auj = () => new Date().toISOString().slice(0, 10);

/**
 * Règlements d'un sens (fournisseurs ou clients) : échéancier des factures ouvertes, règlement d'une ou plusieurs
 * factures d'un même tiers avec ou sans acompte, imputation des acomptes, historique et annulation.
 * Toute la comptabilisation est faite par les fonctions serveur (une transaction, reste dû contrôlé, lettrage).
 */
export default function ReglementsTiers({ sens, tiers, factures, canWrite, onMaj, ouvrirPour, onOuvert }: {
  sens: SensReglement; tiers: Tiers[]; factures: FactureOuverte[]; canWrite: boolean;
  onMaj: () => void; ouvrirPour?: string | null; onOuvert?: () => void;
}) {
  const { entreprise, exercice, plan, rafraichirComptabilite } = useApp();
  const [reglements, setReglements] = useState<Reglement[]>([]);
  const [imputations, setImputations] = useState<Imputation[]>([]);
  const [filtreTiers, setFiltreTiers] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [imput, setImput] = useState<{ reglement: Reglement; factureId: string; montant: number; date: string } | null>(null);
  const [annul, setAnnul] = useState<{ reglement: Reglement; imputation?: Imputation; motif: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fourn = sens === 'fournisseur';
  const tiersDe = (r: Reglement) => (fourn ? r.fournisseur_id : r.client_id) ?? '';
  const nomTiers = (id: string) => tiers.find(t => t.id === id)?.nom ?? '—';
  const numFacture = (id: string | null) => factures.find(f => f.id === id)?.numero ?? '—';

  const charger = useCallback(async () => {
    if (!entreprise) return;
    const [r, i] = await Promise.all([
      (supabase.from('reglements_tiers' as any) as any).select('*').eq('entreprise_id', entreprise.id).eq('sens', sens).order('date_reglement', { ascending: false }).order('numero', { ascending: false }),
      (supabase.from('reglements_tiers_imputations' as any) as any).select('*').eq('entreprise_id', entreprise.id).order('date_imputation'),
    ]);
    if (r.error) { toast.error(r.error.message); return; }
    setReglements((r.data ?? []).map((x: any) => ({ ...x, montant: Number(x.montant), acompte: Number(x.acompte) })));
    setImputations((i.data ?? []).map((x: any) => ({ ...x, montant: Number(x.montant) })));
  }, [entreprise, sens]);
  useEffect(() => { void charger(); }, [charger]);

  const ouvertes = useMemo(() => facturesOuvertes(factures).filter(f => !filtreTiers || f.tiers_id === filtreTiers), [factures, filtreTiers]);
  const disponibles = useMemo(() => acomptesDisponibles(reglements, imputations), [reglements, imputations]);
  const comptesTreso = useMemo(() => plan.filter(c => /^5[2-7]\d{2,}/.test(c.numero) && c.actif !== false).sort((a, b) => a.numero.localeCompare(b.numero)), [plan]);
  const aujourdhui = auj();
  const parTranche = useMemo(() => {
    const t: Record<string, number> = {};
    for (const f of ouvertes) { const k = trancheRetard(joursRetard(f, aujourdhui)); t[k] = (t[k] ?? 0) + resteDu(f); }
    return t;
  }, [ouvertes, aujourdhui]);

  const nouvelleSaisie = useCallback((ids: string[], tiersId: string, acompte = 0): Saisie => {
    const montants: Record<string, number> = {};
    for (const id of ids) { const f = factures.find(x => x.id === id); if (f) montants[id] = resteDu(f); }
    return { tiersId, factures: ids, montants, acompte, date: exercice && aujourdhui > exercice.date_fin ? exercice.date_fin : aujourdhui,
      compte: comptesTreso.find(c => c.numero.startsWith('52'))?.numero ?? '521', mode: 'Virement', reference: '' };
  }, [factures, exercice, aujourdhui, comptesTreso]);

  // Ouverture directe depuis le bouton « Régler » d'une facture.
  useEffect(() => {
    if (!ouvrirPour) return;
    const f = factures.find(x => x.id === ouvrirPour);
    if (f) setSaisie(nouvelleSaisie([f.id], f.tiers_id));
    onOuvert?.();
  }, [ouvrirPour, factures, nouvelleSaisie, onOuvert]);

  const reglerSelection = () => {
    const fs = ouvertes.filter(f => selection.has(f.id));
    if (!fs.length) return;
    if (new Set(fs.map(f => f.tiers_id)).size > 1) { toast.error('Sélectionnez les factures d’un seul tiers'); return; }
    setSaisie(nouvelleSaisie(fs.map(f => f.id), fs[0].tiers_id));
  };

  const valider = async () => {
    if (!saisie || !exercice) return;
    const fs = factures.filter(f => saisie.factures.includes(f.id));
    const err = controlerReglement({ factures: fs, montants: saisie.montants, acompte: saisie.acompte, compte: saisie.compte });
    if (err) { toast.error(err); return; }
    if (!saisie.tiersId) { toast.error(`Choisissez le ${fourn ? 'fournisseur' : 'client'}`); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_regler_tiers' as any, {
      _exercice_id: exercice.id, _sens: sens, _tiers_id: saisie.tiersId, _date: saisie.date, _compte_tresorerie: saisie.compte.trim(),
      _mode: saisie.mode, _reference: saisie.reference, _imputations: fs.map(f => ({ facture_id: f.id, montant: saisie.montants[f.id] ?? 0 })), _acompte: saisie.acompte,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { numero: string; journal: string; total: number; lettrees: number };
    toast.success(`${r.numero} comptabilisé au journal ${r.journal} : ${fmt(r.total)}${r.lettrees ? ` — ${r.lettrees} facture(s) soldée(s) et lettrée(s)` : ''}`);
    setSaisie(null); setSelection(new Set());
    await Promise.all([charger(), rafraichirComptabilite()]); onMaj();
  };

  const imputer = async () => {
    if (!imput) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_imputer_acompte_tiers' as any, { _reglement_id: imput.reglement.id, _facture_id: imput.factureId, _montant: imput.montant, _date: imput.date });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { reste_acompte: number };
    toast.success(`Acompte imputé${r.reste_acompte > 0 ? ` — reste ${fmt(r.reste_acompte)} disponible` : ' en totalité'}`);
    setImput(null); await Promise.all([charger(), rafraichirComptabilite()]); onMaj();
  };

  const annuler = async () => {
    if (!annul) return;
    if (annul.motif.trim().length < 5) { toast.error('Motif obligatoire (5 caractères au moins)'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('fn_annuler_reglement_tiers' as any, { _reglement_id: annul.reglement.id, _imputation_id: annul.imputation?.id ?? null, _motif: annul.motif.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(annul.imputation ? 'Imputation annulée (contre-passation passée)' : `Règlement ${annul.reglement.numero} annulé (contre-passation passée)`);
    setAnnul(null); await Promise.all([charger(), rafraichirComptabilite()]); onMaj();
  };

  const totalSaisie = saisie ? saisie.factures.reduce((s, id) => s + (saisie.montants[id] ?? 0), 0) + saisie.acompte : 0;
  const facturesTiers = (tiersId: string) => facturesOuvertes(factures).filter(f => f.tiers_id === tiersId);
  const champ = 'bg-bg3 border border-border rounded px-2 py-1 text-fg';

  return (
    <div className="space-y-4 text-[11px]">
      {/* Échéancier */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-2">
          <span className="font-bold text-xs">Échéancier {fourn ? 'fournisseurs (à payer)' : 'clients (à encaisser)'}</span>
          <select value={filtreTiers} onChange={e => { setFiltreTiers(e.target.value); setSelection(new Set()); }} className={champ} aria-label="Filtrer par tiers">
            <option value="">Tous les {fourn ? 'fournisseurs' : 'clients'}</option>{tiers.map(t => <option key={t.id} value={t.id}>{t.code} — {t.nom}</option>)}
          </select>
          <span className="text-fg3">{Object.entries(parTranche).map(([k, v]) => `${k} : ${fmt(v)}`).join(' · ') || 'Aucune facture ouverte'}</span>
          <span className="ml-auto flex gap-2">
            {canWrite && selection.size > 0 && <button onClick={reglerSelection} className="px-3 py-1 rounded bg-primary text-primary-foreground font-bold">Régler la sélection ({selection.size})</button>}
            {canWrite && <button onClick={() => setSaisie({ ...nouvelleSaisie([], filtreTiers), acompte: 0 })} className="px-3 py-1 rounded border border-border hover:bg-bg3">{fourn ? 'Verser un acompte' : 'Recevoir un acompte'}</button>}
          </span>
        </div>
        <table className="w-full">
          <thead className="bg-bg3 text-fg3 text-[10px] uppercase"><tr>
            <th className="w-6" /><th className="text-left p-2">Facture</th><th className="text-left p-2">{fourn ? 'Fournisseur' : 'Client'}</th><th className="text-left p-2">Échéance</th>
            <th className="text-right p-2">TTC</th><th className="text-right p-2">Payé</th><th className="text-right p-2">Reste dû</th><th className="text-left p-2">Retard</th><th />
          </tr></thead>
          <tbody>
            {ouvertes.map(f => {
              const j = joursRetard(f, aujourdhui);
              return (
                <tr key={f.id} className="border-t border-border">
                  <td className="p-2">{canWrite && <input type="checkbox" checked={selection.has(f.id)} aria-label={`Sélectionner ${f.numero}`}
                    onChange={() => setSelection(s => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} className="accent-primary" />}</td>
                  <td className="p-2 font-mono">{f.numero}</td><td className="p-2">{nomTiers(f.tiers_id)}</td><td className="p-2">{f.date_echeance ?? '—'}</td>
                  <td className="p-2 text-right font-mono">{fmt(f.total_ttc)}</td><td className="p-2 text-right font-mono">{fmt(f.montant_paye)}</td>
                  <td className="p-2 text-right font-mono font-bold">{fmt(resteDu(f))}</td>
                  <td className={`p-2 ${j > 0 ? 'text-destructive font-bold' : 'text-fg3'}`}>{j > 0 ? `${j} j` : 'non échue'}</td>
                  <td className="p-2 text-right">{canWrite && <button onClick={() => setSaisie(nouvelleSaisie([f.id], f.tiers_id))} className="text-primary hover:underline">Régler</button>}</td>
                </tr>
              );
            })}
            {!ouvertes.length && <tr><td colSpan={9} className="text-center text-fg3 py-4">Aucune facture comptabilisée en attente de règlement</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Acomptes disponibles */}
      {Object.keys(disponibles).length > 0 && (
        <div className="bg-bg2 border border-border rounded-lg p-3">
          <div className="font-bold text-xs mb-2">Acomptes {fourn ? 'versés (4091)' : 'reçus (4191)'} non imputés</div>
          {reglements.filter(r => disponibles[r.id]).map(r => (
            <div key={r.id} className="flex items-center gap-3 py-1 border-t border-border first:border-0">
              <span className="font-mono">{r.numero}</span><span>{r.date_reglement}</span><span>{nomTiers(tiersDe(r))}</span>
              <span className="font-mono">{fmt(disponibles[r.id])} disponible sur {fmt(r.acompte)}</span>
              {canWrite && <button className="ml-auto text-primary hover:underline" onClick={() => {
                const f = facturesTiers(tiersDe(r))[0];
                setImput({ reglement: r, factureId: f?.id ?? '', montant: f ? Math.min(disponibles[r.id], resteDu(f)) : disponibles[r.id], date: aujourdhui > (exercice?.date_fin ?? aujourdhui) ? exercice!.date_fin : aujourdhui });
              }}>Imputer sur une facture</button>}
            </div>
          ))}
        </div>
      )}

      {/* Historique */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border font-bold text-xs">Règlements enregistrés</div>
        <table className="w-full">
          <thead className="bg-bg3 text-fg3 text-[10px] uppercase"><tr>
            <th className="text-left p-2">N°</th><th className="text-left p-2">Date</th><th className="text-left p-2">{fourn ? 'Fournisseur' : 'Client'}</th><th className="text-left p-2">Mode / réf.</th>
            <th className="text-left p-2">Jnl / compte</th><th className="text-right p-2">Montant</th><th className="text-left p-2">Imputations</th><th />
          </tr></thead>
          <tbody>
            {reglements.map(r => {
              const imps = imputations.filter(i => i.reglement_id === r.id);
              return (
                <tr key={r.id} className={`border-t border-border align-top ${r.annule_le ? 'opacity-50 line-through' : ''}`}>
                  <td className="p-2 font-mono">{r.numero}</td><td className="p-2">{r.date_reglement}</td><td className="p-2">{nomTiers(tiersDe(r))}</td>
                  <td className="p-2">{r.mode ?? '—'}{r.reference ? ` · ${r.reference}` : ''}</td>
                  <td className="p-2 font-mono">{r.journal_code} {r.compte_tresorerie}</td>
                  <td className="p-2 text-right font-mono">{fmt(r.montant)}{r.acompte > 0 && <div className="text-fg3">dont acompte {fmt(r.acompte)}</div>}</td>
                  <td className="p-2 text-[10px]">
                    {imps.map(i => (
                      <div key={i.id} className={i.annule_le ? 'line-through text-fg3' : ''}>
                        {i.origine === 'acompte' ? 'Acompte imputé' : 'Facture'} {numFacture(i.facture_achat_id ?? i.facture_id)} : {fmt(i.montant)}
                        {i.origine === 'acompte' && !i.annule_le && !r.annule_le && canWrite && <button className="ml-1 text-destructive hover:underline" onClick={() => setAnnul({ reglement: r, imputation: i, motif: '' })}>annuler</button>}
                      </div>))}
                    {r.annule_le && <div className="text-destructive no-underline">Annulé : {r.motif_annulation}</div>}
                  </td>
                  <td className="p-2 text-right">{canWrite && !r.annule_le && <button onClick={() => setAnnul({ reglement: r, motif: '' })} className="text-destructive hover:underline">Annuler</button>}</td>
                </tr>
              );
            })}
            {!reglements.length && <tr><td colSpan={8} className="text-center text-fg3 py-4">Aucun règlement</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Saisie d'un règlement */}
      {saisie && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !busy && setSaisie(null)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-3">{saisie.factures.length ? (fourn ? 'Règlement fournisseur' : 'Encaissement client') : (fourn ? 'Acompte versé' : 'Acompte reçu')}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              <label className="text-fg3 text-[10px] uppercase">{fourn ? 'Fournisseur' : 'Client'}
                <select value={saisie.tiersId} disabled={saisie.factures.length > 0} onChange={e => setSaisie({ ...saisie, tiersId: e.target.value })} className={`block w-full normal-case ${champ}`}>
                  <option value="">— Choisir —</option>{tiers.map(t => <option key={t.id} value={t.id}>{t.code} — {t.nom}</option>)}
                </select></label>
              <label className="text-fg3 text-[10px] uppercase">Date<input type="date" value={saisie.date} min={exercice?.date_debut} max={exercice?.date_fin} onChange={e => setSaisie({ ...saisie, date: e.target.value })} className={`block w-full ${champ}`} /></label>
              <label className="text-fg3 text-[10px] uppercase">Compte de trésorerie (journal {journalTresorerie(saisie.compte)})
                <input list="comptes-treso" value={saisie.compte} onChange={e => setSaisie({ ...saisie, compte: e.target.value.trim() })} className={`block w-full font-mono ${champ}`} />
                <datalist id="comptes-treso">{comptesTreso.map(c => <option key={c.numero} value={c.numero}>{c.intitule}</option>)}</datalist></label>
              <label className="text-fg3 text-[10px] uppercase">Mode
                <select value={saisie.mode} onChange={e => setSaisie({ ...saisie, mode: e.target.value })} className={`block w-full normal-case ${champ}`}>{MODES.map(m => <option key={m}>{m}</option>)}</select></label>
              <label className="text-fg3 text-[10px] uppercase">Référence (n° chèque, virement…)<input value={saisie.reference} onChange={e => setSaisie({ ...saisie, reference: e.target.value })} className={`block w-full normal-case ${champ}`} /></label>
              <label className="text-fg3 text-[10px] uppercase">{fourn ? 'Acompte versé en plus (4091)' : 'Acompte reçu en plus (4191)'}
                <input type="number" min="0" value={saisie.acompte || ''} onChange={e => setSaisie({ ...saisie, acompte: Number(e.target.value) || 0 })} className={`block w-full text-right font-mono ${champ}`} /></label>
            </div>
            {saisie.factures.length > 0 && (
              <table className="w-full mb-2">
                <thead className="text-fg3 text-[10px] uppercase"><tr><th className="text-left p-1">Facture</th><th className="text-right p-1">Reste dû</th><th className="text-right p-1 w-36">Montant réglé</th></tr></thead>
                <tbody>{saisie.factures.map(id => { const f = factures.find(x => x.id === id)!; return (
                  <tr key={id} className="border-t border-border"><td className="p-1 font-mono">{f.numero}</td><td className="p-1 text-right font-mono">{fmt(resteDu(f))}</td>
                    <td className="p-1"><input type="number" min="0" max={resteDu(f)} value={saisie.montants[id] ?? 0} onChange={e => setSaisie({ ...saisie, montants: { ...saisie.montants, [id]: Number(e.target.value) || 0 } })} className={`w-full text-right font-mono ${champ}`} /></td></tr>); })}</tbody>
              </table>
            )}
            {saisie.factures.length > 0 && saisie.tiersId && facturesTiers(saisie.tiersId).some(f => !saisie.factures.includes(f.id)) && (
              <div className="mb-2 text-[10px]">Ajouter : {facturesTiers(saisie.tiersId).filter(f => !saisie.factures.includes(f.id)).map(f => (
                <button key={f.id} onClick={() => setSaisie({ ...saisie, factures: [...saisie.factures, f.id], montants: { ...saisie.montants, [f.id]: resteDu(f) } })} className="mr-2 text-primary hover:underline">{f.numero} ({fmt(resteDu(f))})</button>))}</div>
            )}
            <div className="flex justify-between items-center mt-3">
              <span className="font-mono">Total {fourn ? 'décaissé' : 'encaissé'} : <strong>{fmt(totalSaisie)}</strong></span>
              <span className="flex gap-2">
                <button onClick={() => setSaisie(null)} className="px-3 py-1.5 bg-bg3 rounded">Fermer</button>
                <button onClick={() => void valider()} disabled={busy} className="px-3 py-1.5 bg-primary text-primary-foreground rounded font-bold disabled:opacity-50">{busy ? 'Comptabilisation…' : 'Comptabiliser'}</button>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Imputation d'un acompte */}
      {imput && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !busy && setImput(null)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-1">Imputer l’acompte {imput.reglement.numero}</div>
            <p className="text-fg3 text-[10px] mb-3">Écriture OD : {fourn ? 'débit 401, crédit 4091' : 'débit 4191, crédit 411'} ; {fmt(disponibles[imput.reglement.id] ?? 0)} disponible.</p>
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-3 text-fg3 text-[10px] uppercase">Facture
                <select value={imput.factureId} onChange={e => { const f = factures.find(x => x.id === e.target.value); setImput({ ...imput, factureId: e.target.value, montant: f ? Math.min(disponibles[imput.reglement.id] ?? 0, resteDu(f)) : imput.montant }); }} className={`block w-full normal-case ${champ}`}>
                  <option value="">— Choisir —</option>{facturesTiers(tiersDe(imput.reglement)).map(f => <option key={f.id} value={f.id}>{f.numero} — reste {fmt(resteDu(f))}</option>)}
                </select></label>
              <label className="text-fg3 text-[10px] uppercase col-span-2">Montant<input type="number" min="0" value={imput.montant} onChange={e => setImput({ ...imput, montant: Number(e.target.value) || 0 })} className={`block w-full text-right font-mono ${champ}`} /></label>
              <label className="text-fg3 text-[10px] uppercase">Date<input type="date" value={imput.date} onChange={e => setImput({ ...imput, date: e.target.value })} className={`block w-full ${champ}`} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setImput(null)} className="px-3 py-1.5 bg-bg3 rounded">Fermer</button>
              <button onClick={() => void imputer()} disabled={busy || !imput.factureId} className="px-3 py-1.5 bg-primary text-primary-foreground rounded font-bold disabled:opacity-50">Imputer</button>
            </div>
          </div>
        </div>
      )}

      {/* Annulation */}
      {annul && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !busy && setAnnul(null)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-1">{annul.imputation ? `Annuler l’imputation de l’acompte ${annul.reglement.numero}` : `Annuler le règlement ${annul.reglement.numero}`}</div>
            <p className="text-fg3 text-[10px] mb-3">Une contre-passation est passée au journal ; les factures retrouvent leur reste dû et les lettrages concernés sont défaits.</p>
            <input autoFocus value={annul.motif} onChange={e => setAnnul({ ...annul, motif: e.target.value })} placeholder="Motif (chèque rejeté, erreur de montant…)" className={`w-full ${champ}`} />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setAnnul(null)} className="px-3 py-1.5 bg-bg3 rounded">Fermer</button>
              <button onClick={() => void annuler()} disabled={busy} className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded font-bold disabled:opacity-50">Confirmer l’annulation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
