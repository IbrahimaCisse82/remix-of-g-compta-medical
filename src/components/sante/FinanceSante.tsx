import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fcfa } from '@/domain/sante/tiers-payant';

import { messageErreur } from '@/lib/erreurs';
import { escapeHtml } from '@/lib/impression';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MODES_PAIEMENT } from '@/domain/sante/tiers-payant';
import { imputationsValides } from '@/lib/tiers-payant-saisie';
import ImportReglements from './ImportReglements';
import { classerDebiteurs, totauxBalance } from '@/lib/reglements-import';
const db = supabase as any;

/** Indicateur « écritures en attente » + recomptabilisation idempotente. */
export function OutboxCard({ structureId }: { structureId: string }) {
  const [r, setR] = useState<{ en_attente: number; en_erreur: number; comptabilise: number } | null>(null);
  const [erreurs, setErreurs] = useState<{ id: string; source_type: string; libelle: string; derniere_erreur: string | null; tentatives: number }[]>([]);
  const load = async () => {
    const [a, b] = await Promise.all([
      db.rpc('sante_outbox_resume', { _structure_id: structureId }),
      db.from('sante_compta_evenements').select('id, source_type, libelle, derniere_erreur, tentatives').eq('structure_id', structureId).neq('statut', 'comptabilise').order('created_at').limit(20),
    ]);
    if (!a.error) setR(a.data); setErreurs(b.data ?? []);
  };
  useEffect(() => { void load(); }, [structureId]);
  if (!r) return null;
  const rejouer = async () => {
    const { data, error } = await db.rpc('sante_rejouer_outbox', { _structure_id: structureId });
    if (error) toast.error(error.message); else { toast.success(`${data} écriture(s) comptabilisée(s)`); void load(); }
  };
  const attente = r.en_attente + r.en_erreur;
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Comptabilisation</h3>
        <span className={`text-sm ${attente ? 'text-destructive font-semibold' : 'text-fg3'}`}>{attente ? `${attente} écriture(s) en attente` : 'Tout est comptabilisé'} · {r.comptabilise} comptabilisée(s)</span>
        {attente > 0 && <Button size="sm" variant="outline" onClick={rejouer}>Recomptabiliser</Button>}
      </div>
      <p className="text-xs text-fg3">Les soins et factures ne sont jamais bloqués par la comptabilité. Nouvel essai automatique toutes les heures ; la clôture d'exercice est bloquée tant qu'il reste des écritures en attente.</p>
      {erreurs.map(e => <div key={e.id} className="text-xs border border-border rounded p-2">{e.libelle} · {e.tentatives} essai(s) · <span className="text-destructive">{e.derniere_erreur ? messageErreur(e.derniere_erreur) : 'en attente'}</span></div>)}
    </section>
  );
}

type Remb = { id: string; montant: number; motif: string; statut: string; created_at: string; facture: { numero: string } | null };

export function RemboursementsCard({ structureId, refresh = 0, onChanged }: { structureId: string; refresh?: number; onChanged?: () => void }) {
  const [list, setList] = useState<Remb[]>([]);
  const [action, setAction] = useState<{ id: string; type: 'approuver' | 'refuser' | 'payer' } | null>(null);
  const [motif, setMotif] = useState('');
  const [mode, setMode] = useState('especes');
  const [busy, setBusy] = useState(false);
  const load = () => db.from('sante_remboursements').select('id, montant, motif, statut, created_at, facture:sante_factures!sante_remboursements_facture_id_fkey(numero)')
    .eq('structure_id', structureId).in('statut', ['demande', 'approuve']).order('created_at', { ascending: false }).then(({ data, error }: any) => { if (error) toast.error(error.message); else setList(data ?? []); });
  useEffect(() => { load(); }, [structureId, refresh]);
  if (!list.length) return null;
  const confirmer = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      const { error } = action.type === 'payer'
        ? await db.rpc('sante_payer_remboursement', { _id: action.id, _mode: mode })
        : await db.rpc('sante_decider_remboursement', { _id: action.id, _approuver: action.type === 'approuver', _motif: motif.trim() });
      if (error) return toast.error(error.message);
      toast.success(action.type === 'payer' ? 'Remboursement payé' : 'Décision enregistrée');
      setAction(null); setMotif(''); await load(); onChanged?.();
    } finally { setBusy(false); }
  };
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
      <h3 className="font-semibold">Remboursements</h3>
      {list.map(r => (
        <div key={r.id} className="flex flex-wrap justify-between gap-2 text-sm border border-border rounded p-2">
          <span>{r.facture?.numero} · {fcfa(Number(r.montant))} · {r.motif} · <b>{r.statut === 'demande' ? 'À approuver' : 'Approuvé'}</b></span>
          <span className="flex gap-1">{r.statut === 'demande'
            ? <><Button size="sm" variant="outline" onClick={() => { setMotif(''); setAction({ id: r.id, type: 'approuver' }); }}>Approuver</Button><Button size="sm" variant="ghost" onClick={() => { setMotif(''); setAction({ id: r.id, type: 'refuser' }); }}>Refuser</Button></>
            : <Button size="sm" onClick={() => { setMode('especes'); setAction({ id: r.id, type: 'payer' }); }}>Payer</Button>}</span>
        </div>
      ))}
      <Dialog open={!!action} onOpenChange={v => { if (!v && !busy) setAction(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{action?.type === 'payer' ? 'Payer le remboursement' : action?.type === 'approuver' ? 'Approuver le remboursement' : 'Refuser le remboursement'}</DialogTitle><DialogDescription>{fcfa(Number(list.find(r => r.id === action?.id)?.montant ?? 0))}</DialogDescription></DialogHeader>
          {action?.type === 'payer' ? <div><Label htmlFor="remb-mode">Mode de remboursement</Label><select id="remb-mode" className="h-10 w-full border border-input rounded-md bg-background px-3" value={mode} disabled={busy} onChange={e => setMode(e.target.value)}>{MODES_PAIEMENT.filter(([v]) => v !== 'carte').map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div> : <div><Label htmlFor="remb-motif">Motif de la décision</Label><Input id="remb-motif" value={motif} disabled={busy} onChange={e => setMotif(e.target.value)} /></div>}
          <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setAction(null)}>Annuler</Button><Button disabled={busy || (action?.type !== 'payer' && motif.trim().length < 5)} onClick={confirmer}>Confirmer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type FactOrg = { id: string; numero: string; part_organisme: number; organisme: string; reste: number };

/** Règlement d'organisme : un règlement couvre plusieurs factures, partiellement ; ventilation obligatoire. */
export function ReglementOrganismeCard({ structureId, refresh = 0, onChanged }: { structureId: string; refresh?: number; onChanged?: () => void }) {
  const [organismes, setOrganismes] = useState<string[]>([]);
  const [org, setOrg] = useState('');
  const [factures, setFactures] = useState<FactOrg[]>([]);
  const [imput, setImput] = useState<Record<string, string>>({});
  const [mode, setMode] = useState('virement');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const request = useRef(0);
  const [rejet, setRejet] = useState<FactOrg | null>(null);
  const [rejetType, setRejetType] = useState('administratif'), [rejetMotif, setRejetMotif] = useState(''), [rejetMontant, setRejetMontant] = useState('');

  useEffect(() => {
    db.from('sante_organismes').select('nom').eq('structure_id', structureId).order('nom').then(({ data, error }: any) => { if (error) setError(error.message); setOrganismes((data ?? []).map((o: any) => o.nom)); });
    if (org) void charger(org);
  }, [structureId, refresh]);
  useEffect(() => { request.current++; setOrg(''); setFactures([]); setHistory([]); setImput({}); setError(''); }, [structureId]);
  const charger = async (o: string) => {
    const ticket = ++request.current;
    setOrg(o); setImput({}); setFactures([]); setHistory([]); setError('');
    if (!o) return;
    setLoading(true);
    try {
      const [f, h] = await Promise.all([
        db.from('sante_factures').select('id, numero, part_organisme, organisme, statut_tiers, created_at').eq('structure_id', structureId).eq('organisme', o).eq('type', 'facture').eq('annulee', false).gt('part_organisme', 0).order('created_at').limit(1000),
        db.from('sante_reglements_organisme').select('id,montant,mode,reference,created_at').eq('structure_id', structureId).eq('organisme', o).order('created_at', { ascending: false }).limit(20),
      ]);
      if (f.error || h.error) throw f.error ?? h.error;
      const ids = (f.data ?? []).map((x: any) => x.id);
      const [im, re] = ids.length ? await Promise.all([
        db.from('sante_reglement_imputations').select('facture_id,montant').eq('structure_id', structureId).in('facture_id', ids),
        db.from('sante_tiers_rejets').select('facture_id,montant,type').eq('structure_id', structureId).in('facture_id', ids),
      ]) : [{ data: [], error: null }, { data: [], error: null }];
      if (im.error || re.error) throw im.error ?? re.error;
      if (ticket !== request.current) return;
      const avecReste = (f.data ?? []).map((x: any) => ({ ...x, reste: Number(x.part_organisme) - (im.data ?? []).filter((i: any) => i.facture_id === x.id).reduce((s: number, i: any) => s + Number(i.montant), 0) - (re.data ?? []).filter((i: any) => i.facture_id === x.id && ['perte','non_prise_en_charge'].includes(i.type)).reduce((s: number, i: any) => s + Number(i.montant), 0) }));
      setFactures(avecReste.filter((x: any) => x.reste > 0)); setHistory(h.data ?? []);
      if ((f.data ?? []).length === 1000) setError('Affichage limité aux 1 000 premières factures.');
    } catch (e) { if (ticket === request.current) setError((e as Error).message); }
    finally { if (ticket === request.current) setLoading(false); }
  };
  const total = Object.values(imput).reduce((s, v) => s + (Number(v) || 0), 0);
  const valider = async () => {
    if (busy) return;
    let lignes;
    try { lignes = imputationsValides(imput, factures); } catch (e) { return toast.error((e as Error).message); }
    if (!lignes.length) return;
    setBusy(true);
    try {
      const { error } = await db.rpc('sante_imputer_reglement', { _structure_id: structureId, _organisme: org, _montant: lignes.reduce((s, l) => s + l.montant, 0), _mode: mode, _reference: ref.trim() || null, _imputations: lignes });
      if (error) toast.error(error.message); else { toast.success('Règlement enregistré'); setRef(''); await charger(org); onChanged?.(); }
    } finally { setBusy(false); }
  };
  const rejeter = async () => {
    if (!rejet || busy) return;
    const montant = rejetType === 'administratif' ? null : Number(rejetMontant);
    if (rejetMotif.trim().length < 5 || (montant !== null && (!Number.isSafeInteger(montant) || montant <= 0 || montant > rejet.reste))) return toast.error('Motif requis et montant entier limité au reste dû.');
    setBusy(true);
    try {
      const { error } = await db.rpc('sante_rejet_tiers', { _facture_id: rejet.id, _type: rejetType, _motif: rejetMotif.trim(), _montant: montant });
      if (error) toast.error(error.message); else { toast.success('Rejet enregistré'); setRejet(null); await charger(org); onChanged?.(); }
    } finally { setBusy(false); }
  };

  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-3">
      <h3 className="font-semibold">Règlements des organismes</h3>
      <ImportReglements key={structureId} structureId={structureId} onSaved={() => { if (org) void charger(org); onChanged?.(); }} />
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <select aria-label="Organisme à régler" disabled={busy} className="bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={org} onChange={e => charger(e.target.value)}>
          <option value="">— Organisme —</option>{organismes.map(o => <option key={o}>{o}</option>)}
        </select>
        <select aria-label="Mode" className="bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={mode} onChange={e => setMode(e.target.value)}>
          {['virement', 'cheque', 'especes', 'wave', 'orange_money'].map(m => <option key={m}>{m}</option>)}
        </select>
        <Input aria-label="Référence du règlement" className="w-48" placeholder="Référence du règlement" value={ref} onChange={e => setRef(e.target.value)} />
      </div>
      {loading && <p role="status" className="text-sm text-fg3">Chargement des règlements…</p>}
      {org && !loading && !error && (factures.length === 0 ? <p className="text-xs text-fg3">Aucune créance ouverte.</p> : <>
        <p className="text-sm">{factures.length} facture(s) en attente · <b>Reste dû : {fcfa(factures.reduce((s,f) => s + f.reste,0))}</b></p>
        <table className="w-full text-sm"><thead className="text-xs text-fg3 text-left"><tr><th>Facture</th><th>Part organisme</th><th>Reste dû</th><th>Imputer</th><th /></tr></thead>
          <tbody>{factures.map(f => <tr key={f.id} className="border-t border-border">
            <td className="py-1 font-mono">{f.numero}</td><td>{fcfa(f.part_organisme)}</td><td>{fcfa(f.reste)}</td>
            <td><Input aria-label={`Imputer ${f.numero}`} disabled={busy} className="h-8 w-28" type="number" step={1} min={0} max={f.reste} value={imput[f.id] ?? ''} onChange={e => setImput({ ...imput, [f.id]: e.target.value })} /></td>
            <td><Button size="sm" variant="ghost" disabled={busy} onClick={() => { setRejet(f); setRejetType('administratif'); setRejetMotif(''); setRejetMontant(String(f.reste)); }}>Rejet</Button></td>
          </tr>)}</tbody></table>
        <div className="flex items-center justify-between text-sm"><span>Total du règlement : <b>{fcfa(total)}</b></span><Button disabled={busy || total <= 0 || !!error} onClick={valider}>Imputer le règlement</Button></div>
      </>)}
      {history.length > 0 && <div className="border-t border-border pt-3"><h4 className="text-sm font-semibold mb-2">Derniers règlements reçus</h4>{history.map(h => <div key={h.id} className="flex flex-wrap justify-between gap-2 text-sm py-2 border-t border-border"><span>{new Date(h.created_at).toLocaleDateString('fr-FR')} · {h.mode} · {h.reference || 'Sans référence'}</span><b>{fcfa(Number(h.montant))}</b></div>)}</div>}
      <Dialog open={!!rejet} onOpenChange={open => { if (!open && !busy) setRejet(null); }}><DialogContent><DialogHeader><DialogTitle>Rejet tiers payant</DialogTitle><DialogDescription>{rejet?.numero} · Reste dû {fcfa(rejet?.reste ?? 0)}</DialogDescription></DialogHeader><Label htmlFor="rejet-type">Type de rejet</Label><select id="rejet-type" className="h-10 rounded-md border border-input bg-background px-3" value={rejetType} disabled={busy} onChange={e => setRejetType(e.target.value)}><option value="administratif">Administratif</option><option value="non_prise_en_charge">Non-prise en charge</option><option value="perte">Perte sur créance</option></select><Label htmlFor="rejet-motif">Motif du rejet</Label><Input id="rejet-motif" disabled={busy} value={rejetMotif} onChange={e => setRejetMotif(e.target.value)} />{rejetType !== 'administratif' && <><Label htmlFor="rejet-montant">Montant du rejet (FCFA)</Label><Input id="rejet-montant" type="number" step={1} min={1} max={rejet?.reste} value={rejetMontant} disabled={busy} onChange={e => setRejetMontant(e.target.value)} /></>}<DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setRejet(null)}>Annuler</Button><Button disabled={busy || rejetMotif.trim().length < 5} onClick={() => void rejeter()}>Enregistrer le rejet</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}

const CLES: [string, string][] = [
  ['patients', 'Clients — patients'], ['organismes', 'Clients — organismes (collectif)'], ['produits', 'Produits des prestations'],
  ['especes', 'Caisse espèces'], ['mobile_money', 'Mobile Money'], ['carte', 'Cartes bancaires'], ['cheques_a_encaisser', 'Chèques à encaisser'],
  ['produits_consultation', 'Produits — consultations'], ['produits_acte', 'Produits — actes'], ['produits_analyses', 'Produits — analyses'],
  ['produits_medicaments', 'Produits — médicaments'], ['produits_autres', 'Produits — autres'], ['tva_collectee', 'TVA collectée'],
  ['banque', 'Banque (virements, remises)'], ['ecart_caisse_perte', 'Écart de caisse — manquant'], ['ecart_caisse_gain', 'Écart de caisse — excédent'], ['perte_creance', 'Pertes sur créances'], ['dotation_provision', 'Dotation provisions créances'], ['provision_creance', 'Provision créances douteuses'],
];

/** Correspondance des comptes, organismes payeurs et réglages de facturation (administrateur / comptable). */
export function ParametresFinanceCard({ structureId }: { structureId: string }) {
  const [comptes, setComptes] = useState<Record<string, string>>({});
  const [defauts, setDefauts] = useState<Record<string, string>>({});
  const [orgs, setOrgs] = useState<{ id: string; nom: string; type: string; compte_auxiliaire: string | null; bascule_patient_autorisee: boolean }[]>([]);
  const [moment, setMoment] = useState('enregistrement');
  const [nouvel, setNouvel] = useState('');

  const load = async () => {
    const [p, o, s, d] = await Promise.all([
      db.from('sante_comptes_parametres').select('cle, compte').eq('structure_id', structureId),
      db.from('sante_organismes').select('id, nom, type, compte_auxiliaire, bascule_patient_autorisee').eq('structure_id', structureId).order('nom'),
      db.from('structures').select('facturation_labo_moment').eq('id', structureId).maybeSingle(),
      Promise.all(CLES.map(async ([k]) => [k, (await db.rpc('sante_compte', { _structure_id: structureId, _cle: k })).data] as const)),
    ]);
    setComptes(Object.fromEntries((p.data ?? []).map((x: any) => [x.cle, x.compte])));
    setOrgs(o.data ?? []); setMoment(s.data?.facturation_labo_moment ?? 'enregistrement');
    setDefauts(Object.fromEntries(d));
  };
  useEffect(() => { void load(); }, [structureId]);

  const definir = async (cle: string, compte: string) => {
    if (!compte.trim() || compte === defauts[cle]) return;
    const { error } = await db.rpc('sante_definir_compte', { _structure_id: structureId, _cle: cle, _compte: compte.trim() });
    if (error) toast.error(error.message); else { toast.success('Compte enregistré'); void load(); }
  };
  const majOrg = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await db.from('sante_organismes').update(patch).eq('id', id);
    if (error) toast.error(error.message); else void load();
  };
  const ajouter = async () => {
    if (!nouvel.trim()) return;
    const { error } = await db.from('sante_organismes').insert({ structure_id: structureId, nom: nouvel.trim() });
    if (error) toast.error(error.message); else { setNouvel(''); void load(); }
  };
  const changerMoment = async (v: string) => {
    const { error } = await db.rpc('sante_config_labo_moment', { _structure_id: structureId, _moment: v });
    if (error) toast.error(error.message); else { setMoment(v); toast.success('Réglage enregistré'); }
  };

  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-4 space-y-4">
      <h3 className="font-semibold">Comptabilité santé : correspondance des comptes</h3>
      <p className="text-xs text-fg3">Valeurs par défaut <b>à confirmer par votre expert-comptable</b>. Toute modification est tracée.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CLES.map(([k, l]) => (
          <label key={k} className="flex items-center justify-between gap-2 text-sm border border-border rounded p-2">
            <span>{l}{!comptes[k] && <span className="ml-1 text-xs text-destructive">(à confirmer)</span>}</span>
            <Input className="h-8 w-28 font-mono" defaultValue={defauts[k] ?? ''} key={`${k}-${defauts[k]}`} onBlur={e => definir(k, e.target.value)} />
          </label>
        ))}
      </div>
      <div className="border-t border-border pt-3 space-y-2">
        <h4 className="text-sm font-semibold">Facturation laboratoire</h4>
        <select aria-label="Moment de facturation labo" className="bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={moment} onChange={e => changerMoment(e.target.value)}>
          <option value="enregistrement">À l'enregistrement de la demande (paiement avant prélèvement)</option>
          <option value="validation">À la validation biologique (ancien fonctionnement)</option>
        </select>
      </div>
      <div className="border-t border-border pt-3 space-y-2">
        <h4 className="text-sm font-semibold">Organismes payeurs (tiers auxiliaires)</h4>
        {orgs.map(o => (
          <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm border border-border rounded p-2">
            <span className="flex-1">{o.nom}</span>
            <select aria-label="Type" className="bg-bg3 border border-border rounded px-2 py-1 text-xs" value={o.type} onChange={e => majOrg(o.id, { type: e.target.value })}>
              {['ipm', 'assurance', 'mutuelle', 'entreprise', 'autre'].map(t => <option key={t}>{t}</option>)}
            </select>
            <Input className="h-8 w-32 font-mono" placeholder="Compte auxiliaire" defaultValue={o.compte_auxiliaire ?? ''} onBlur={e => e.target.value !== (o.compte_auxiliaire ?? '') && majOrg(o.id, { compte_auxiliaire: e.target.value || null })} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={o.bascule_patient_autorisee} onChange={e => majOrg(o.id, { bascule_patient_autorisee: e.target.checked })} />Bascule au patient autorisée</label>
          </div>
        ))}
        <div className="flex gap-2"><Input placeholder="Nouvel organisme" value={nouvel} onChange={e => setNouvel(e.target.value)} /><Button size="sm" onClick={ajouter}>Ajouter</Button></div>
      </div>
    </section>
  );
}

const CATS = ['consultation', 'acte', 'analyses', 'medicaments', 'autres'];

/** Conventions par organisme : taux par catégorie, plafond, franchise, exclusions, tarifs conventionnés. */
export function ConventionsCard({ structureId }: { structureId: string }) {
  const [orgs, setOrgs] = useState<string[]>([]);
  const [org, setOrg] = useState('');
  const [conv, setConv] = useState<any[]>([]);
  const [tarifs, setTarifs] = useState<any[]>([]);
  const [excl, setExcl] = useState<any[]>([]);
  const [f, setF] = useState({ categorie: 'consultation', taux: '80', plafond: '', franchise: '0', code: '', tarif: '', exclu: '' });
  useEffect(() => { db.from('sante_organismes').select('nom').eq('structure_id', structureId).order('nom').then(({ data }: any) => setOrgs((data ?? []).map((o: any) => o.nom))); }, [structureId]);
  const charger = async (o: string) => {
    setOrg(o); if (!o) return;
    const [a, b, c] = await Promise.all([
      db.from('sante_conventions').select('*').eq('structure_id', structureId).eq('organisme', o),
      db.from('sante_tarifs_convention').select('*').eq('structure_id', structureId).eq('organisme', o),
      db.from('sante_convention_exclusions').select('*').eq('structure_id', structureId).eq('organisme', o),
    ]);
    setConv(a.data ?? []); setTarifs(b.data ?? []); setExcl(c.data ?? []);
  };
  const ok = (r: any) => { if (r.error) toast.error(r.error.message); else void charger(org); };
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-3">
      <h3 className="font-semibold">Conventions tiers-payant</h3>
      <select aria-label="Organisme" className="bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={org} onChange={e => charger(e.target.value)}>
        <option value="">— Organisme —</option>{orgs.map(o => <option key={o}>{o}</option>)}
      </select>
      {org && <>
        <div className="text-sm space-y-1">{conv.map(c => <div key={c.id} className="flex justify-between border border-border rounded p-2"><span>{c.categorie} · {c.taux} %{c.plafond ? ` · plafond ${fcfa(c.plafond)}` : ''}{Number(c.franchise) ? ` · franchise ${fcfa(c.franchise)}` : ''}</span><Button size="sm" variant="ghost" onClick={async () => ok(await db.from('sante_conventions').delete().eq('id', c.id))}>×</Button></div>)}</div>
        <div className="flex flex-wrap gap-2 items-end">
          <select aria-label="Catégorie" className="bg-bg3 border border-border rounded px-2 py-1.5 text-sm" value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
          <Input className="w-20" type="number" placeholder="Taux %" value={f.taux} onChange={e => setF({ ...f, taux: e.target.value })} />
          <Input className="w-28" type="number" placeholder="Plafond" value={f.plafond} onChange={e => setF({ ...f, plafond: e.target.value })} />
          <Input className="w-28" type="number" placeholder="Franchise" value={f.franchise} onChange={e => setF({ ...f, franchise: e.target.value })} />
          <Button size="sm" onClick={async () => ok(await db.from('sante_conventions').upsert({ structure_id: structureId, organisme: org, categorie: f.categorie, taux: Number(f.taux), plafond: f.plafond ? Number(f.plafond) : null, franchise: Number(f.franchise) || 0 }, { onConflict: 'structure_id,organisme,categorie' }))}>Enregistrer le taux</Button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1"><b>Tarifs conventionnés</b>
            {tarifs.map(t => <div key={t.id} className="flex justify-between"><span>{t.code} · {fcfa(t.tarif)}</span><button className="text-destructive" onClick={async () => ok(await db.from('sante_tarifs_convention').delete().eq('id', t.id))}>×</button></div>)}
            <div className="flex gap-1"><Input placeholder="Code acte/analyse" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /><Input type="number" placeholder="Tarif" value={f.tarif} onChange={e => setF({ ...f, tarif: e.target.value })} />
              <Button size="sm" onClick={async () => ok(await db.from('sante_tarifs_convention').upsert({ structure_id: structureId, organisme: org, code: f.code.trim(), tarif: Number(f.tarif) }, { onConflict: 'structure_id,organisme,code' }))}>+</Button></div>
          </div>
          <div className="space-y-1"><b>Exclusions</b>
            {excl.map(x => <div key={x.id} className="flex justify-between"><span>{x.code}</span><button className="text-destructive" onClick={async () => ok(await db.from('sante_convention_exclusions').delete().eq('id', x.id))}>×</button></div>)}
            <div className="flex gap-1"><Input placeholder="Code exclu" value={f.exclu} onChange={e => setF({ ...f, exclu: e.target.value })} />
              <Button size="sm" onClick={async () => ok(await db.from('sante_convention_exclusions').insert({ structure_id: structureId, organisme: org, code: f.exclu.trim() }))}>+</Button></div>
          </div>
        </div>
        <p className="text-xs text-fg3">Sans taux pour une catégorie, le taux de la prise en charge du patient s'applique. Les actes « accord préalable » exigent un bon avec accord.</p>
      </>}
    </section>
  );
}

/** Bons de prise en charge (numéro, validité, plafond, consommation, accord préalable). */
export function BonsPecCard({ structureId, patientId, organismes }: { structureId: string; patientId: string; organismes: string[] }) {
  const [bons, setBons] = useState<any[]>([]);
  const [f, setF] = useState({ organisme: '', numero: '', date_fin: '', plafond: '', accord: false });
  const load = () => db.from('sante_bons_pec').select('*').eq('patient_id', patientId).order('date_fin', { ascending: false }).then(({ data }: any) => setBons(data ?? []));
  useEffect(() => { load(); }, [patientId]);
  const ajouter = async () => {
    const { error } = await db.from('sante_bons_pec').insert({ structure_id: structureId, patient_id: patientId, organisme: f.organisme, numero: f.numero.trim(), date_fin: f.date_fin, plafond: f.plafond ? Number(f.plafond) : null, accord_prealable: f.accord });
    if (error) toast.error(error.message); else { setF({ organisme: '', numero: '', date_fin: '', plafond: '', accord: false }); load(); }
  };
  return (
    <div className="space-y-2 text-sm">
      <b>Bons de prise en charge</b>
      {bons.map(b => <div key={b.id} className="border border-border rounded p-2">{b.organisme} · n° {b.numero} · jusqu'au {new Date(b.date_fin).toLocaleDateString('fr-FR')}{b.plafond ? ` · ${fcfa(b.consomme)} / ${fcfa(b.plafond)}` : ''}{b.accord_prealable ? ' · accord préalable' : ''}</div>)}
      {organismes.length > 0 && <div className="flex flex-wrap gap-1 items-center">
        <select aria-label="Organisme du bon" className="bg-bg3 border border-border rounded px-2 py-1 text-sm" value={f.organisme} onChange={e => setF({ ...f, organisme: e.target.value })}><option value="">Organisme</option>{organismes.map(o => <option key={o}>{o}</option>)}</select>
        <Input className="w-28 h-8" placeholder="N° du bon" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} />
        <Input className="w-36 h-8" type="date" value={f.date_fin} onChange={e => setF({ ...f, date_fin: e.target.value })} />
        <Input className="w-24 h-8" type="number" placeholder="Plafond" value={f.plafond} onChange={e => setF({ ...f, plafond: e.target.value })} />
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={f.accord} onChange={e => setF({ ...f, accord: e.target.checked })} />Accord préalable</label>
        <Button size="sm" disabled={!f.organisme || !f.numero || !f.date_fin} onClick={ajouter}>Ajouter</Button>
      </div>}
    </div>
  );
}

/** Créances par organisme (âge), relances imprimables, provision des créances douteuses. */
export function CreancesOrganismesCard({ structureId, refresh = 0 }: { structureId: string; refresh?: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [recherche, setRecherche] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const load = () => { setLoading(true); return db.rpc('sante_creances_organismes', { _structure_id: structureId }).then(({ data, error }: any) => { setRows(error ? [] : data ?? []); setError(error?.message ?? ''); }).finally(() => setLoading(false)); };
  useEffect(() => { setRows([]); setError(''); void load(); }, [structureId, refresh]);
  const classes = classerDebiteurs(rows);
  const visibles = classes.filter(r => String(r.organisme).toLocaleLowerCase('fr-FR').includes(recherche.toLocaleLowerCase('fr-FR')));
  const totaux = totauxBalance(visibles);
  const relancer = async (o: string) => {
    const { data, error } = await db.rpc('sante_relancer', { _structure_id: structureId, _organisme: o });
    if (error) { toast.error(error.message); return; }
    const { data: r } = await db.from('sante_relances').select('niveau, montant, factures').eq('id', data).single();
    const { data: fs } = await db.from('sante_factures').select('numero, created_at, part_organisme').in('id', r.factures);
    // Données issues de la base échappées avant insertion dans le HTML d'impression.
    const w = window.open('', '_blank'); if (w) w.document.write(`<html><head><title>Relance ${escapeHtml(o)}</title><style>@page{size:A4;margin:20mm}body{font-family:sans-serif;font-size:12px}td,th{border:1px solid #999;padding:5px}table{border-collapse:collapse;width:100%}</style></head><body><p>${new Date().toLocaleDateString('fr-FR')}</p><h2>À l'attention de ${escapeHtml(o)}</h2><p>Objet : relance n° ${r.niveau} — factures de tiers-payant impayées</p><p>Sauf erreur de notre part, les factures suivantes restent à régler :</p><table><tr><th>Facture</th><th>Date</th><th>Part organisme</th></tr>${(fs ?? []).map((f: any) => `<tr><td>${escapeHtml(f.numero)}</td><td>${new Date(f.created_at).toLocaleDateString('fr-FR')}</td><td style="text-align:right">${fcfa(f.part_organisme)}</td></tr>`).join('')}</table><p><b>Reste dû : ${fcfa(r.montant)}</b></p><p>Nous vous remercions de bien vouloir procéder au règlement.</p><script>print()</script></body></html>`);
    load();
  };
  const provisionner = async (o: string, total: number) => {
    const m = Number(prompt('Montant à provisionner :', String(total))); if (!m) return;
    const motif = prompt('Motif (créance douteuse) :'); if (!motif) return;
    const { error } = await db.rpc('sante_provisionner_creance', { _structure_id: structureId, _organisme: o, _montant: m, _motif: motif });
    if (error) toast.error(error.message); else toast.success('Provision enregistrée (module Provisions + écriture)');
  };
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 overflow-x-auto">
      <h3 className="font-semibold mb-2">Balance âgée du tiers payant</h3>
      <p className="text-xs text-fg3 mb-4">Au {new Date().toLocaleDateString('fr-FR')} · Ancienneté depuis l’envoi à l’organisme, ou l’émission si non envoyée.</p>
      {!loading && !error && classes.length > 0 && <div className="border-b border-border pb-4 mb-4"><h4 className="text-sm font-semibold mb-2">Principaux organismes débiteurs</h4><ol className="space-y-2">{classes.slice(0,5).map((r,i)=><li key={r.organisme} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><span className="font-mono text-fg3 mr-2">{i+1}.</span>{r.organisme}</span><span><strong>{fcfa(Number(r.total))}</strong><span className="text-fg3 ml-2">{(Number(r.total)/Math.max(1,totauxBalance(classes).total)*100).toFixed(1)} %</span></span></li>)}</ol></div>}
      <Input aria-label="Rechercher un organisme débiteur" placeholder="Rechercher un organisme" className="mb-3" value={recherche} onChange={e => setRecherche(e.target.value)} />
      {loading && <p role="status" className="text-sm text-fg3">Chargement des créances…</p>}
      {error && <div role="alert" className="text-destructive text-sm">{error}<Button variant="outline" size="sm" onClick={() => void load()}>Réessayer</Button></div>}
      {!loading && !error && !visibles.length && <p className="text-sm text-fg3">Aucune créance trouvée.</p>}
      <table aria-label="Balance âgée des créances" className="w-full min-w-[760px] text-sm"><thead className="text-xs text-fg3 text-left"><tr><th>Organisme</th><th>0–30 j</th><th>31–60 j</th><th>61–90 j</th><th>Plus de 90 j</th><th>Total</th><th>Relance</th><th /></tr></thead>
        <tbody>{visibles.map(r => <tr key={r.organisme} className="border-t border-border">
          <td className="py-1">{r.organisme}</td>{[r.j0_30, r.j31_60, r.j61_90, r.plus_90, r.total].map((v, i) => <td key={i}>{v ? fcfa(Number(v)) : '—'}</td>)}
          <td className="text-xs">{r.niveau ? `n° ${r.niveau} le ${new Date(r.derniere_relance).toLocaleDateString('fr-FR')}` : '—'}</td>
          <td className="space-x-1 whitespace-nowrap"><Button size="sm" variant="outline" onClick={() => relancer(r.organisme)}>Relancer</Button><Button size="sm" variant="ghost" onClick={() => provisionner(r.organisme, Number(r.total))}>Provisionner</Button></td>
        </tr>)}</tbody><tfoot><tr className="border-t-2 border-border font-semibold"><td className="py-3">Total affiché</td>{[totaux.j0_30,totaux.j31_60,totaux.j61_90,totaux.plus_90,totaux.total].map((v,i)=><td key={i}>{fcfa(v)}</td>)}<td colSpan={2} /></tr></tfoot></table>
    </section>
  );
}

/** Chiffre d'affaires par axe analytique (catégorie, section, praticien, site). */
export function AnalytiqueSanteCard({ structureId }: { structureId: string }) {
  const [axe, setAxe] = useState('categorie');
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<{ axe: string; montant: number; nb: number }[]>([]);
  useEffect(() => {
    const d = new Date(`${mois}-01`); const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    db.rpc('sante_ca_analytique', { _structure_id: structureId, _debut: `${mois}-01`, _fin: fin, _axe: axe }).then(({ data, error }: any) => setRows(error ? [] : data ?? []));
  }, [structureId, axe, mois]);
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold flex-1">Analyse du chiffre d'affaires</h3>
        <select aria-label="Axe" className="bg-bg3 border border-border rounded px-2 py-1 text-sm" value={axe} onChange={e => setAxe(e.target.value)}>
          <option value="categorie">Par catégorie</option><option value="section">Par section labo</option><option value="praticien">Par praticien</option><option value="site">Par site</option>
        </select>
        <Input type="month" className="w-40" value={mois} onChange={e => setMois(e.target.value)} />
      </div>
      {rows.length === 0 ? <p className="text-xs text-fg3">Aucune donnée.</p> : rows.map(r => <div key={r.axe} className="flex justify-between text-sm"><span>{r.axe} · {r.nb} ligne(s)</span><span>{fcfa(Number(r.montant))}</span></div>)}
    </section>
  );
}

/** Régime de TVA, prorata, compte rendu conditionné, blocs de numéros secours. */
export function FiscalSecoursCard({ structureId }: { structureId: string }) {
  const [regime, setRegime] = useState('exonere');
  const [prorata, setProrata] = useState('0');
  const [cr, setCr] = useState(false);
  const [blocs, setBlocs] = useState<any[]>([]);
  const load = async () => {
    const [s, b] = await Promise.all([
      db.from('structures').select('regime_tva, prorata_tva, cr_conditionne_reglement').eq('id', structureId).maybeSingle(),
      db.from('sante_blocs_secours').select('*').eq('structure_id', structureId).order('created_at', { ascending: false }),
    ]);
    if (s.data) { setRegime(s.data.regime_tva); setProrata(String(s.data.prorata_tva)); setCr(s.data.cr_conditionne_reglement); }
    setBlocs(b.data ?? []);
  };
  useEffect(() => { void load(); }, [structureId]);
  const enregistrer = async () => {
    const { error } = await db.rpc('sante_config_fiscal', { _structure_id: structureId, _regime: regime, _prorata: Number(prorata) || 0, _cr_conditionne: cr });
    if (error) toast.error(error.message); else toast.success('Réglages enregistrés');
  };
  const reserver = async () => {
    const poste = prompt('Nom du poste (ex. Accueil) :'); if (!poste) return;
    const taille = Number(prompt('Nombre de numéros à réserver (10 à 500) :', '50'));
    const { error } = await db.rpc('sante_reserver_bloc', { _structure_id: structureId, _poste: poste, _taille: taille });
    if (error) toast.error(error.message); else void load();
  };
  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-4 space-y-3">
      <h3 className="font-semibold">Fiscalité et continuité</h3>
      <div className="flex flex-wrap gap-3 items-end text-sm">
        <label className="flex flex-col gap-1">Régime de TVA
          <select className="bg-bg3 border border-border rounded px-2 py-1.5" value={regime} onChange={e => setRegime(e.target.value)}>
            <option value="exonere">Exonéré (TVA sur achats non récupérable)</option><option value="assujetti">Assujetti</option><option value="mixte">Mixte (prorata)</option>
          </select></label>
        {regime === 'mixte' && <label className="flex flex-col gap-1">Prorata de déduction (%)<Input className="w-24" type="number" value={prorata} onChange={e => setProrata(e.target.value)} /></label>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={cr} onChange={e => setCr(e.target.checked)} />Compte rendu remis seulement après règlement de la part patient</label>
        <Button size="sm" onClick={enregistrer}>Enregistrer</Button>
      </div>
      <p className="text-xs text-destructive">Régime, taux et taxabilité des actes : à valider avec votre fiscaliste.</p>
      <div className="border-t border-border pt-3 space-y-1 text-sm">
        <div className="flex items-center justify-between"><b>Mode secours papier — numéros réservés</b><Button size="sm" variant="outline" onClick={reserver}>Réserver un bloc</Button></div>
        {blocs.map(b => <div key={b.id} className="text-xs">{b.poste} · FAC{b.annee}-{String(b.debut).padStart(6, '0')} à FAC{b.annee}-{String(b.fin).padStart(6, '0')}</div>)}
        <p className="text-xs text-fg3">En cas de panne, le poste utilise ces numéros sur papier ; les factures sont ressaisies ensuite avec le même numéro (sans trou dans la numérotation).</p>
      </div>
    </section>
  );
}

/** Saisie a posteriori d'une facture papier du mode secours. */
export function SaisieSecoursCard({ structureId }: { structureId: string }) {
  const [blocs, setBlocs] = useState<any[]>([]);
  const [f, setF] = useState({ bloc: '', rang: '', dossier: '', libelle: '', montant: '' });
  useEffect(() => { db.from('sante_blocs_secours').select('*').eq('structure_id', structureId).then(({ data }: any) => setBlocs(data ?? [])); }, [structureId]);
  if (!blocs.length) return null;
  const saisir = async () => {
    const { data: p } = await db.rpc('sante_rechercher_patients', { _structure_id: structureId, _q: f.dossier, _limit: 1, _offset: 0 });
    if (!p?.[0]) { toast.error('Patient introuvable'); return; }
    const { error } = await db.rpc('sante_saisir_facture_secours', { _bloc_id: f.bloc, _rang: Number(f.rang), _patient_id: p[0].id, _lignes: [{ libelle: f.libelle, prix_unitaire: Number(f.montant) }], _assurance_id: null });
    if (error) toast.error(error.message); else { toast.success('Facture secours saisie'); setF({ ...f, rang: '', libelle: '', montant: '' }); }
  };
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
      <h3 className="font-semibold">Ressaisie des factures papier (mode secours)</h3>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Bloc" className="bg-bg3 border border-border rounded px-2 py-1.5 text-sm" value={f.bloc} onChange={e => setF({ ...f, bloc: e.target.value })}><option value="">Bloc</option>{blocs.map(b => <option key={b.id} value={b.id}>{b.poste} ({b.debut}–{b.fin})</option>)}</select>
        <Input className="w-24" type="number" placeholder="N°" value={f.rang} onChange={e => setF({ ...f, rang: e.target.value })} />
        <Input className="w-40" placeholder="N° de dossier" value={f.dossier} onChange={e => setF({ ...f, dossier: e.target.value })} />
        <Input className="w-48" placeholder="Prestation" value={f.libelle} onChange={e => setF({ ...f, libelle: e.target.value })} />
        <Input className="w-28" type="number" placeholder="Montant" value={f.montant} onChange={e => setF({ ...f, montant: e.target.value })} />
        <Button size="sm" disabled={!f.bloc || !f.rang || !f.libelle || !f.montant} onClick={saisir}>Saisir</Button>
      </div>
    </section>
  );
}
