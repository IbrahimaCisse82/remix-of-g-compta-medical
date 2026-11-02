import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { confirmer } from '@/components/Confirmation';
import { fmt } from '@/lib/accounting';
import { escapeHtml as h } from '@/lib/impression';

/**
 * Bons de commande fournisseurs : brouillon → envoyée → réceptions (entrée en stock au prix commandé, lots et
 * péremptions) → facture rapprochée (quantités reçues non facturées) → soldée. Les réceptions et les statuts
 * passent par les fonctions serveur fn_receptionner_commande et fn_comptabiliser_facture_achat.
 */
type Nature = 'charge' | 'stock' | 'immobilisation';
interface Fournisseur { id: string; code: string; raison_sociale: string; ninea?: string | null; adresse?: string | null; telephone?: string | null; email?: string | null }
interface Article { id: string; code: string; designation: string; compte_achat: string; unite: string }
interface Commande { id: string; numero: string; fournisseur_id: string; date_commande: string; date_livraison_prevue: string | null; objet: string | null; notes: string | null; statut: string }
interface LigneCmd { id?: string; ordre: number; designation: string; nature: Nature; article_id: string | null; compte_charge: string; quantite: number; prix_unitaire: number; taux_tva: number; duree_annees: number | null }
interface Suivi { recue: number; facturee: number }
interface Reception { id: string; commande_id: string; numero: string; date_reception: string; bon_livraison: string | null }

const STATUTS: Record<string, string> = { brouillon: 'Brouillon', envoyee: 'Envoyée', partielle: 'Reçue en partie', recue: 'Reçue', soldee: 'Soldée', annulee: 'Annulée' };
const ligneVide = (ordre: number): LigneCmd => ({ ordre, designation: '', nature: 'charge', article_id: null, compte_charge: '605', quantite: 1, prix_unitaire: 0, taux_tva: 18, duree_annees: null });
const ttc = (ls: LigneCmd[]) => ls.reduce((s, l) => s + l.quantite * l.prix_unitaire * (1 + l.taux_tva / 100), 0);

export default function CommandesAchat({ entreprise, exercice, fournisseurs, articles, canWrite, onFactureCreee }: {
  entreprise: { id: string; nom: string; ninea?: string | null; adresse?: string | null; telephone?: string | null } | null;
  exercice: { id: string; date_debut: string; date_fin: string; statut: string } | null;
  fournisseurs: Fournisseur[]; articles: Article[]; canWrite: boolean;
  onFactureCreee: (factureId: string) => void;
}) {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [lignesParCmd, setLignesParCmd] = useState<Record<string, LigneCmd[]>>({});
  const [suivi, setSuivi] = useState<Record<string, Suivi>>({});
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [form, setForm] = useState<Partial<Commande> | null>(null);
  const [lignes, setLignes] = useState<LigneCmd[]>([]);
  const [recep, setRecep] = useState<{ cmd: Commande; date: string; bl: string; q: Record<string, { quantite: number; lot: string; peremption: string }> } | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    if (!entreprise) return;
    const { data: cmds, error } = await supabase.from('commandes_achat' as any).select('*').eq('entreprise_id', entreprise.id).order('date_commande', { ascending: false });
    if (error) { toast.error(error.message); return; }
    const liste = (cmds ?? []) as unknown as Commande[];
    setCommandes(liste);
    const ids = liste.map(c => c.id);
    if (!ids.length) { setLignesParCmd({}); setSuivi({}); setReceptions([]); return; }
    const [{ data: ls }, { data: recs }] = await Promise.all([
      supabase.from('commandes_achat_lignes' as any).select('*').in('commande_id', ids).order('ordre'),
      supabase.from('receptions_achat' as any).select('*').in('commande_id', ids).order('date_reception'),
    ]);
    const parCmd: Record<string, LigneCmd[]> = {};
    for (const l of (ls ?? []) as any[]) (parCmd[l.commande_id] ??= []).push({ ...l, quantite: Number(l.quantite), prix_unitaire: Number(l.prix_unitaire), taux_tva: Number(l.taux_tva) });
    setLignesParCmd(parCmd);
    setReceptions((recs ?? []) as unknown as Reception[]);
    const ligneIds = ((ls ?? []) as any[]).map(l => l.id);
    const s: Record<string, Suivi> = {};
    await Promise.all(ligneIds.map(async id => {
      const { data } = await supabase.rpc('commande_ligne_quantites' as any, { _ligne_id: id });
      const q = ((data ?? []) as any[])[0];
      s[id] = { recue: Number(q?.recue ?? 0), facturee: Number(q?.facturee ?? 0) };
    }));
    setSuivi(s);
  }, [entreprise]);
  useEffect(() => { void charger(); }, [charger]);

  const nomFrn = (id: string) => fournisseurs.find(f => f.id === id)?.raison_sociale ?? '—';

  const nouvelle = () => {
    const an = new Date().getFullYear();
    const n = commandes.filter(c => c.numero.startsWith(`BC-${an}-`)).length + 1;
    setForm({ numero: `BC-${an}-${String(n).padStart(4, '0')}`, date_commande: new Date().toISOString().slice(0, 10), statut: 'brouillon' });
    setLignes([ligneVide(0)]);
  };
  const modifier = (c: Commande) => { setForm(c); setLignes((lignesParCmd[c.id] ?? []).map(l => ({ ...l }))); };

  const enregistrer = async () => {
    if (!entreprise || !form) return;
    if (!form.fournisseur_id) { toast.error('Choisissez le fournisseur'); return; }
    const bad = lignes.find(l => !l.designation.trim() || !(l.quantite > 0) || (l.nature === 'stock' && !l.article_id)
      || (l.nature === 'immobilisation' && !/^2[1-7]/.test(l.compte_charge)) || (l.nature === 'charge' && /^[23]/.test(l.compte_charge)));
    if (bad) { toast.error(`Ligne « ${bad.designation || '…'} » incomplète : désignation, quantité, article (stock) ou compte (immobilisation 21-27, charge hors 2/3)`); return; }
    setBusy(true);
    try {
      const entete = { entreprise_id: entreprise.id, fournisseur_id: form.fournisseur_id, numero: form.numero, date_commande: form.date_commande,
        date_livraison_prevue: form.date_livraison_prevue || null, objet: form.objet || null, notes: form.notes || null };
      let id = form.id;
      if (id) {
        const r = await supabase.from('commandes_achat' as any).update(entete).eq('id', id);
        if (r.error) throw new Error(r.error.message);
        const d = await supabase.from('commandes_achat_lignes' as any).delete().eq('commande_id', id);
        if (d.error) throw new Error(d.error.message);
      } else {
        const r = await supabase.from('commandes_achat' as any).insert(entete).select('id').single();
        if (r.error) throw new Error(r.error.message);
        id = (r.data as any).id;
      }
      const ins = await supabase.from('commandes_achat_lignes' as any).insert(lignes.map((l, i) => ({
        commande_id: id, ordre: i, designation: l.designation.trim(), nature: l.nature,
        article_id: l.nature === 'stock' ? l.article_id : null,
        compte_charge: l.nature === 'stock' ? (articles.find(a => a.id === l.article_id)?.compte_achat || '601') : l.compte_charge,
        quantite: l.quantite, prix_unitaire: l.prix_unitaire, taux_tva: l.taux_tva,
        duree_annees: l.nature === 'immobilisation' ? (l.duree_annees || 5) : null,
      })));
      if (ins.error) throw new Error(ins.error.message);
      toast.success('Commande enregistrée'); setForm(null); await charger();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible'); } finally { setBusy(false); }
  };

  const changerStatut = async (c: Commande, statut: 'envoyee' | 'annulee') => {
    if (statut === 'annulee' && !(await confirmer(`Annuler la commande ${c.numero} ?`))) return;
    const { error } = await supabase.from('commandes_achat' as any).update({ statut }).eq('id', c.id);
    if (error) toast.error(error.message); else { toast.success(statut === 'envoyee' ? 'Commande envoyée' : 'Commande annulée'); await charger(); }
  };
  const supprimer = async (c: Commande) => {
    if (!(await confirmer(`Supprimer le brouillon ${c.numero} ?`))) return;
    const { error } = await supabase.from('commandes_achat' as any).delete().eq('id', c.id);
    if (error) toast.error(error.message); else await charger();
  };

  const ouvrirReception = (c: Commande) => {
    const q: Record<string, { quantite: number; lot: string; peremption: string }> = {};
    for (const l of lignesParCmd[c.id] ?? []) q[l.id!] = { quantite: Math.max(0, l.quantite - (suivi[l.id!]?.recue ?? 0)), lot: '', peremption: '' };
    setRecep({ cmd: c, date: new Date().toISOString().slice(0, 10), bl: '', q });
  };
  const receptionner = async () => {
    if (!recep || !exercice) return;
    if (recep.date < exercice.date_debut || recep.date > exercice.date_fin) { toast.error('Date de réception hors de l’exercice ouvert'); return; }
    const lignesRec = Object.entries(recep.q).filter(([, v]) => v.quantite > 0)
      .map(([id, v]) => ({ commande_ligne_id: id, quantite: v.quantite, lot: v.lot || null, peremption: v.peremption || null }));
    if (!lignesRec.length) { toast.error('Aucune quantité reçue'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_receptionner_commande' as any, { _commande_id: recep.cmd.id, _date: recep.date, _bon_livraison: recep.bl, _exercice_id: exercice.id, _lignes: lignesRec, _notes: null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { numero: string; entrees_stock: number; statut: string };
    toast.success(`Réception ${r.numero} enregistrée${r.entrees_stock ? ` — ${r.entrees_stock} entrée(s) en stock` : ''} (${STATUTS[r.statut] ?? r.statut})`);
    setRecep(null); await charger();
  };

  /** Crée la facture brouillon des quantités reçues non facturées, au prix commandé (à ajuster sur la facture reçue). */
  const facturer = async (c: Commande) => {
    if (!entreprise || !exercice) return;
    const aFacturer = (lignesParCmd[c.id] ?? []).map(l => ({ l, q: (suivi[l.id!]?.recue ?? 0) - (suivi[l.id!]?.facturee ?? 0) })).filter(x => x.q > 0);
    if (!aFacturer.length) { toast.error('Rien de reçu à facturer'); return; }
    const { data: enCours } = await (supabase.from('factures_achat') as any).select('numero_interne').eq('commande_id', c.id).eq('comptabilisee', false).neq('statut', 'annulee');
    if (enCours?.length) { toast.error(`Facture ${(enCours[0] as any).numero_interne} déjà préparée pour cette commande : complétez-la et comptabilisez-la`); return; }
    const an = new Date().getFullYear();
    const { count } = await supabase.from('factures_achat').select('id', { count: 'exact', head: true }).eq('entreprise_id', entreprise.id).like('numero_interne', `FA-${an}-%`);
    const numero = `FA-${an}-${String((count ?? 0) + 1).padStart(4, '0')}`;
    const date = new Date().toISOString().slice(0, 10);
    const f = await supabase.from('factures_achat').insert({ entreprise_id: entreprise.id, exercice_id: exercice.id, fournisseur_id: c.fournisseur_id,
      commande_id: c.id, numero_interne: numero, date_facture: date >= exercice.date_debut && date <= exercice.date_fin ? date : exercice.date_fin,
      objet: `Commande ${c.numero}${c.objet ? ' — ' + c.objet : ''}`, statut: 'brouillon' } as any).select('id').single();
    if (f.error) { toast.error(f.error.message); return; }
    const fid = (f.data as any).id as string;
    const ins = await supabase.from('factures_achat_lignes').insert(aFacturer.map(({ l, q }, i) => ({
      facture_id: fid, ordre: i, designation: l.designation, nature: l.nature, article_id: l.article_id, compte_charge: l.compte_charge,
      quantite: q, prix_unitaire: l.prix_unitaire, taux_tva: l.taux_tva, montant_ht: Math.round(q * l.prix_unitaire * 100) / 100,
      duree_annees: l.duree_annees, date_mise_service: null, commande_ligne_id: l.id,
    })) as any);
    if (ins.error) { toast.error(ins.error.message); return; }
    toast.success(`Facture ${numero} préparée depuis la commande : saisissez le n° et les prix de la facture du fournisseur, puis comptabilisez.`);
    onFactureCreee(fid);
  };

  const imprimer = (c: Commande) => {
    const frn = fournisseurs.find(f => f.id === c.fournisseur_id);
    const ls = lignesParCmd[c.id] ?? [];
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { toast.error('Autorisez les fenêtres surgissantes pour imprimer'); return; }
    const lignesHtml = ls.map(l => `<tr><td>${h(l.designation)}</td><td class="n">${h(l.quantite)}</td><td class="n">${h(fmt(l.prix_unitaire))}</td><td class="n">${h(l.taux_tva)} %</td><td class="n">${h(fmt(l.quantite * l.prix_unitaire))}</td></tr>`).join('');
    const ht = ls.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${h(c.numero)}</title><style>
      @page{size:A4;margin:15mm} body{font-family:Arial,sans-serif;font-size:11pt;color:#000} h1{font-size:18pt;margin:0 0 4mm}
      .ent{display:flex;justify-content:space-between;margin-bottom:8mm} table{width:100%;border-collapse:collapse;margin-top:6mm}
      th,td{border:1px solid #444;padding:2mm} th{background:#eee;text-align:left} .n{text-align:right} .tot td{font-weight:bold}
      .sig{margin-top:20mm;display:flex;justify-content:space-between}</style></head><body>
      <div class="ent"><div><strong>${h(entreprise?.nom)}</strong><br>${h(entreprise?.adresse ?? '')}<br>${entreprise?.ninea ? 'NINEA ' + h(entreprise.ninea) : ''}</div>
      <div><strong>${h(frn?.raison_sociale)}</strong><br>${h(frn?.adresse ?? '')}<br>${h(frn?.telephone ?? '')} ${h(frn?.email ?? '')}<br>${frn?.ninea ? 'NINEA ' + h(frn.ninea) : ''}</div></div>
      <h1>BON DE COMMANDE ${h(c.numero)}</h1>
      <div>Date : ${h(c.date_commande.split('-').reverse().join('/'))}${c.date_livraison_prevue ? ' — Livraison souhaitée : ' + h(c.date_livraison_prevue.split('-').reverse().join('/')) : ''}</div>
      ${c.objet ? `<div>Objet : ${h(c.objet)}</div>` : ''}
      <table><thead><tr><th>Désignation</th><th class="n">Quantité</th><th class="n">Prix unitaire HT</th><th class="n">TVA</th><th class="n">Montant HT</th></tr></thead>
      <tbody>${lignesHtml}</tbody><tfoot><tr class="tot"><td colspan="4" class="n">Total HT</td><td class="n">${h(fmt(ht))}</td></tr>
      <tr class="tot"><td colspan="4" class="n">Total TTC</td><td class="n">${h(fmt(ttc(ls)))}</td></tr></tfoot></table>
      ${c.notes ? `<p>${h(c.notes)}</p>` : ''}
      <div class="sig"><div>Le fournisseur (bon pour accord)</div><div>Pour ${h(entreprise?.nom)}, signature et cachet</div></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const totalForm = useMemo(() => ttc(lignes), [lignes]);
  const set = (i: number, p: Partial<LigneCmd>) => setLignes(ls => ls.map((l, j) => j === i ? { ...l, ...p } : l));

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-[11px] text-fg3">{commandes.length} commande(s) · réception = entrée en stock au prix commandé · facture rapprochée des quantités reçues</div>
        {canWrite && <button onClick={nouvelle} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[11px] font-bold">+ Nouvelle commande</button>}
      </div>
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-bg3 text-fg3 text-[10px] uppercase"><tr>
            <th className="text-left p-2">N°</th><th className="text-left p-2">Date</th><th className="text-left p-2">Fournisseur</th><th className="text-left p-2">Objet</th>
            <th className="text-right p-2">TTC</th><th className="text-left p-2">Reçu / facturé</th><th className="text-center p-2">Statut</th><th className="text-right p-2">Actions</th>
          </tr></thead>
          <tbody>
            {commandes.map(c => {
              const ls = lignesParCmd[c.id] ?? [];
              const recs = receptions.filter(r => r.commande_id === c.id);
              return (
                <tr key={c.id} className="border-t border-border align-top">
                  <td className="p-2 font-mono">{c.numero}</td>
                  <td className="p-2">{c.date_commande}</td>
                  <td className="p-2">{nomFrn(c.fournisseur_id)}</td>
                  <td className="p-2">{c.objet ?? '—'}</td>
                  <td className="p-2 text-right font-mono">{fmt(ttc(ls))}</td>
                  <td className="p-2 text-[10px]">
                    {ls.map(l => <div key={l.id}>{l.designation} : {suivi[l.id!]?.recue ?? 0} / {l.quantite} reçu · {suivi[l.id!]?.facturee ?? 0} facturé</div>)}
                    {recs.length > 0 && <div className="text-fg3">{recs.map(r => `${r.numero} du ${r.date_reception}${r.bon_livraison ? ` (BL ${r.bon_livraison})` : ''}`).join(' ; ')}</div>}
                  </td>
                  <td className="p-2 text-center"><span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-bg3">{STATUTS[c.statut] ?? c.statut}</span></td>
                  <td className="p-2 text-right whitespace-nowrap space-x-1 text-[10px]">
                    <button onClick={() => imprimer(c)} className="text-primary hover:underline">Imprimer</button>
                    {canWrite && c.statut === 'brouillon' && <>
                      <button onClick={() => modifier(c)} className="text-primary hover:underline">Modifier</button>
                      <button onClick={() => void changerStatut(c, 'envoyee')} className="text-success hover:underline">Envoyer</button>
                      <button onClick={() => void supprimer(c)} className="text-destructive hover:underline">Suppr</button>
                    </>}
                    {canWrite && ['envoyee', 'partielle'].includes(c.statut) && <button onClick={() => ouvrirReception(c)} className="text-success hover:underline">Réceptionner</button>}
                    {canWrite && ['partielle', 'recue'].includes(c.statut) && <button onClick={() => void facturer(c)} className="text-warning hover:underline">Facturer</button>}
                    {canWrite && c.statut === 'envoyee' && <button onClick={() => void changerStatut(c, 'annulee')} className="text-destructive hover:underline">Annuler</button>}
                  </td>
                </tr>
              );
            })}
            {!commandes.length && <tr><td colSpan={8} className="text-center text-fg3 py-6">Aucune commande</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !busy && setForm(null)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-5xl max-h-[90vh] overflow-auto text-[11px]" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-3">{form.id ? 'Modifier' : 'Nouvelle'} commande {form.numero}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <label className="text-fg3 text-[10px] uppercase">Fournisseur *
                <select value={form.fournisseur_id ?? ''} onChange={e => setForm({ ...form, fournisseur_id: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 text-fg normal-case">
                  <option value="">— Choisir —</option>{fournisseurs.map(f => <option key={f.id} value={f.id}>{f.code} — {f.raison_sociale}</option>)}
                </select></label>
              <label className="text-fg3 text-[10px] uppercase">Date<input type="date" value={form.date_commande ?? ''} onChange={e => setForm({ ...form, date_commande: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 text-fg" /></label>
              <label className="text-fg3 text-[10px] uppercase">Livraison souhaitée<input type="date" value={form.date_livraison_prevue ?? ''} onChange={e => setForm({ ...form, date_livraison_prevue: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 text-fg" /></label>
              <label className="text-fg3 text-[10px] uppercase">Objet<input value={form.objet ?? ''} onChange={e => setForm({ ...form, objet: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1 text-fg normal-case" /></label>
            </div>
            <table className="w-full mb-2">
              <thead className="text-fg3 text-[10px] uppercase"><tr><th className="text-left p-1">Désignation</th><th className="p-1 w-28">Nature</th><th className="p-1 w-48">Article / compte</th><th className="p-1 w-16">Qté</th><th className="p-1 w-24">PU HT</th><th className="p-1 w-14">TVA %</th><th className="p-1 w-24 text-right">HT</th><th className="w-6"></th></tr></thead>
              <tbody>{lignes.map((l, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-1"><input value={l.designation} onChange={e => set(i, { designation: e.target.value })} className="w-full bg-transparent px-1" /></td>
                  <td className="p-1"><select value={l.nature} onChange={e => { const n = e.target.value as Nature; set(i, { nature: n, compte_charge: n === 'immobilisation' ? '2441' : n === 'stock' ? '601' : '605', article_id: null, duree_annees: n === 'immobilisation' ? 5 : null }); }} className="w-full bg-bg3 border border-border rounded px-1">
                    <option value="charge">Charge</option><option value="stock">Stock</option><option value="immobilisation">Immobilisation</option></select></td>
                  <td className="p-1">{l.nature === 'stock'
                    ? <select value={l.article_id ?? ''} onChange={e => { const a = articles.find(x => x.id === e.target.value); set(i, { article_id: e.target.value || null, designation: l.designation || a?.designation || '' }); }} className="w-full bg-bg3 border border-border rounded px-1">
                        <option value="">— Article —</option>{articles.map(a => <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>)}</select>
                    : <span className="flex gap-1 items-center"><input value={l.compte_charge} onChange={e => set(i, { compte_charge: e.target.value.trim() })} className="w-16 bg-transparent font-mono px-1" aria-label="Compte" />
                        {l.nature === 'immobilisation' && <><input type="number" min="1" value={l.duree_annees ?? 5} onChange={e => set(i, { duree_annees: Number(e.target.value) || null })} className="w-10 bg-transparent text-right" aria-label="Durée (années)" />ans</>}</span>}</td>
                  <td className="p-1"><input type="number" min="0" step="0.01" value={l.quantite} onChange={e => set(i, { quantite: Number(e.target.value) || 0 })} className="w-full bg-transparent text-right" /></td>
                  <td className="p-1"><input type="number" min="0" step="0.01" value={l.prix_unitaire} onChange={e => set(i, { prix_unitaire: Number(e.target.value) || 0 })} className="w-full bg-transparent text-right" /></td>
                  <td className="p-1"><input type="number" min="0" step="0.01" value={l.taux_tva} onChange={e => set(i, { taux_tva: Number(e.target.value) || 0 })} className="w-full bg-transparent text-right" /></td>
                  <td className="p-1 text-right font-mono">{fmt(l.quantite * l.prix_unitaire)}</td>
                  <td className="p-1">{lignes.length > 1 && <button onClick={() => setLignes(lignes.filter((_, j) => j !== i))} className="text-destructive">×</button>}</td>
                </tr>))}</tbody>
            </table>
            <div className="flex justify-between items-center">
              <button onClick={() => setLignes([...lignes, ligneVide(lignes.length)])} className="text-primary text-[10px] hover:underline">+ Ligne</button>
              <div className="font-mono">Total TTC : <strong>{fmt(totalForm)}</strong></div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setForm(null)} className="px-3 py-1.5 bg-bg3 rounded">Annuler</button>
              <button onClick={() => void enregistrer()} disabled={busy} className="px-3 py-1.5 bg-primary text-primary-foreground rounded font-bold disabled:opacity-50">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {recep && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !busy && setRecep(null)}>
          <div className="bg-bg2 border border-border rounded-lg p-4 w-full max-w-4xl max-h-[90vh] overflow-auto text-[11px]" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-1">Réception — commande {recep.cmd.numero} ({nomFrn(recep.cmd.fournisseur_id)})</div>
            <p className="text-fg3 text-[10px] mb-3">Les articles en stock entrent au prix commandé (TVA non récupérable comprise) dès l’enregistrement ; saisissez lot et péremption pour les produits de santé.</p>
            <div className="flex gap-3 mb-3">
              <label className="text-fg3 text-[10px] uppercase">Date de réception<input type="date" value={recep.date} onChange={e => setRecep({ ...recep, date: e.target.value })} className="block bg-bg3 border border-border rounded px-2 py-1 text-fg" /></label>
              <label className="text-fg3 text-[10px] uppercase">N° du bon de livraison<input value={recep.bl} onChange={e => setRecep({ ...recep, bl: e.target.value })} className="block bg-bg3 border border-border rounded px-2 py-1 text-fg normal-case" /></label>
            </div>
            <table className="w-full">
              <thead className="text-fg3 text-[10px] uppercase"><tr><th className="text-left p-1">Désignation</th><th className="p-1">Commandé</th><th className="p-1">Déjà reçu</th><th className="p-1 w-20">Reçu ce jour</th><th className="p-1">Lot</th><th className="p-1">Péremption</th></tr></thead>
              <tbody>{(lignesParCmd[recep.cmd.id] ?? []).map(l => {
                const v = recep.q[l.id!]; const reste = l.quantite - (suivi[l.id!]?.recue ?? 0);
                const maj = (p: Partial<typeof v>) => setRecep({ ...recep, q: { ...recep.q, [l.id!]: { ...v, ...p } } });
                return (
                  <tr key={l.id} className="border-t border-border">
                    <td className="p-1">{l.designation} <span className="text-fg3">({l.nature})</span></td>
                    <td className="p-1 text-center">{l.quantite}</td>
                    <td className="p-1 text-center">{suivi[l.id!]?.recue ?? 0}</td>
                    <td className="p-1"><input type="number" min="0" max={reste} step="0.01" value={v?.quantite ?? 0} disabled={reste <= 0} onChange={e => maj({ quantite: Number(e.target.value) || 0 })} className="w-full bg-bg3 border border-border rounded px-1 text-right" /></td>
                    <td className="p-1">{l.nature === 'stock' && <input value={v?.lot ?? ''} onChange={e => maj({ lot: e.target.value })} className="w-full bg-bg3 border border-border rounded px-1" aria-label="Lot" />}</td>
                    <td className="p-1">{l.nature === 'stock' && <input type="date" value={v?.peremption ?? ''} onChange={e => maj({ peremption: e.target.value })} className="bg-bg3 border border-border rounded px-1" aria-label="Péremption" />}</td>
                  </tr>);
              })}</tbody>
            </table>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRecep(null)} className="px-3 py-1.5 bg-bg3 rounded">Annuler</button>
              <button onClick={() => void receptionner()} disabled={busy} className="px-3 py-1.5 bg-success text-success-foreground rounded font-bold disabled:opacity-50">{busy ? 'Enregistrement…' : 'Enregistrer la réception'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
