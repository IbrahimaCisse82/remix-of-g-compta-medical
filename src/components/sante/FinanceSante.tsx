import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fcfa } from '@/domain/sante/tiers-payant';

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
      {erreurs.map(e => <div key={e.id} className="text-xs border border-border rounded p-2">{e.libelle} · {e.tentatives} essai(s) · <span className="text-destructive">{e.derniere_erreur}</span></div>)}
    </section>
  );
}

type Remb = { id: string; montant: number; motif: string; statut: string; created_at: string; facture: { numero: string } | null };

export function RemboursementsCard({ structureId }: { structureId: string }) {
  const [list, setList] = useState<Remb[]>([]);
  const load = () => db.from('sante_remboursements').select('id, montant, motif, statut, created_at, facture:sante_factures!sante_remboursements_facture_id_fkey(numero)')
    .eq('structure_id', structureId).in('statut', ['demande', 'approuve']).order('created_at', { ascending: false }).then(({ data }: any) => setList(data ?? []));
  useEffect(() => { load(); }, [structureId]);
  if (!list.length) return null;
  const decider = async (id: string, ok: boolean) => {
    const m = prompt(ok ? 'Motif de l’approbation :' : 'Motif du refus :'); if (!m) return;
    const { error } = await db.rpc('sante_decider_remboursement', { _id: id, _approuver: ok, _motif: m });
    if (error) toast.error(error.message); else load();
  };
  const payer = async (id: string) => {
    const mode = prompt('Mode (especes, wave, orange_money, cheque, virement) :', 'especes'); if (!mode) return;
    const { error } = await db.rpc('sante_payer_remboursement', { _id: id, _mode: mode.trim() });
    if (error) toast.error(error.message); else { toast.success('Remboursement payé'); load(); }
  };
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-2">
      <h3 className="font-semibold">Remboursements</h3>
      {list.map(r => (
        <div key={r.id} className="flex flex-wrap justify-between gap-2 text-sm border border-border rounded p-2">
          <span>{r.facture?.numero} · {fcfa(Number(r.montant))} · {r.motif} · <b>{r.statut === 'demande' ? 'À approuver' : 'Approuvé'}</b></span>
          <span className="flex gap-1">{r.statut === 'demande'
            ? <><Button size="sm" variant="outline" onClick={() => decider(r.id, true)}>Approuver</Button><Button size="sm" variant="ghost" onClick={() => decider(r.id, false)}>Refuser</Button></>
            : <Button size="sm" onClick={() => payer(r.id)}>Payer</Button>}</span>
        </div>
      ))}
    </section>
  );
}

type FactOrg = { id: string; numero: string; part_organisme: number; organisme: string; reste: number };

/** Règlement d'organisme : un règlement couvre plusieurs factures, partiellement ; ventilation obligatoire. */
export function ReglementOrganismeCard({ structureId }: { structureId: string }) {
  const [organismes, setOrganismes] = useState<string[]>([]);
  const [org, setOrg] = useState('');
  const [factures, setFactures] = useState<FactOrg[]>([]);
  const [imput, setImput] = useState<Record<string, string>>({});
  const [mode, setMode] = useState('virement');
  const [ref, setRef] = useState('');

  useEffect(() => {
    db.from('sante_organismes').select('nom').eq('structure_id', structureId).eq('actif', true).order('nom').then(({ data }: any) => setOrganismes((data ?? []).map((o: any) => o.nom)));
  }, [structureId]);
  const charger = async (o: string) => {
    setOrg(o); setImput({});
    const { data } = await db.from('sante_factures').select('id, numero, part_organisme, organisme').eq('structure_id', structureId).eq('organisme', o)
      .eq('type', 'facture').eq('annulee', false).neq('statut_tiers', 'paye').gt('part_organisme', 0).order('created_at').limit(100);
    const avecReste = await Promise.all((data ?? []).map(async (f: any) => ({ ...f, reste: Number((await db.rpc('sante_reste_organisme', { _facture_id: f.id })).data ?? 0) })));
    setFactures(avecReste.filter(f => f.reste > 0));
  };
  const total = Object.values(imput).reduce((s, v) => s + (Number(v) || 0), 0);
  const valider = async () => {
    const lignes = Object.entries(imput).filter(([, v]) => Number(v) > 0).map(([facture_id, v]) => ({ facture_id, montant: Number(v) }));
    const { error } = await db.rpc('sante_imputer_reglement', { _structure_id: structureId, _organisme: org, _montant: total, _mode: mode, _reference: ref || null, _imputations: lignes });
    if (error) toast.error(error.message); else { toast.success('Règlement imputé et comptabilisé'); setRef(''); void charger(org); }
  };
  const rejeter = async (f: FactOrg) => {
    const type = prompt('Type de rejet : administratif (à corriger et renvoyer), non_prise_en_charge (bascule au patient si la convention l’autorise), perte (passée en charge)', 'administratif'); if (!type) return;
    const motif = prompt('Motif (obligatoire) :'); if (!motif) return;
    const montant = type.trim() === 'administratif' ? null : Number(prompt('Montant concerné :', String(f.reste)));
    const { error } = await db.rpc('sante_rejet_tiers', { _facture_id: f.id, _type: type.trim(), _motif: motif, _montant: montant });
    if (error) toast.error(error.message); else { toast.success('Rejet enregistré'); void charger(org); }
  };

  return (
    <section className="border border-border bg-bg2 rounded-md p-4 space-y-3">
      <h3 className="font-semibold">Règlements des organismes</h3>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Organisme" className="bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={org} onChange={e => charger(e.target.value)}>
          <option value="">— Organisme —</option>{organismes.map(o => <option key={o}>{o}</option>)}
        </select>
        <select aria-label="Mode" className="bg-bg3 border border-border rounded-md px-2 py-1.5 text-sm" value={mode} onChange={e => setMode(e.target.value)}>
          {['virement', 'cheque', 'especes', 'wave', 'orange_money'].map(m => <option key={m}>{m}</option>)}
        </select>
        <Input className="w-48" placeholder="Référence du règlement" value={ref} onChange={e => setRef(e.target.value)} />
      </div>
      {org && (factures.length === 0 ? <p className="text-xs text-fg3">Aucune créance ouverte.</p> : <>
        <table className="w-full text-sm"><thead className="text-xs text-fg3 text-left"><tr><th>Facture</th><th>Part organisme</th><th>Reste dû</th><th>Imputer</th><th /></tr></thead>
          <tbody>{factures.map(f => <tr key={f.id} className="border-t border-border">
            <td className="py-1 font-mono">{f.numero}</td><td>{fcfa(f.part_organisme)}</td><td>{fcfa(f.reste)}</td>
            <td><Input className="h-8 w-28" type="number" min={0} max={f.reste} value={imput[f.id] ?? ''} onChange={e => setImput({ ...imput, [f.id]: e.target.value })} /></td>
            <td><Button size="sm" variant="ghost" onClick={() => rejeter(f)}>Rejet</Button></td>
          </tr>)}</tbody></table>
        <div className="flex items-center justify-between text-sm"><span>Total du règlement : <b>{fcfa(total)}</b></span><Button disabled={total <= 0} onClick={valider}>Imputer le règlement</Button></div>
      </>)}
    </section>
  );
}

const CLES: [string, string][] = [
  ['patients', 'Clients — patients'], ['organismes', 'Clients — organismes (collectif)'], ['produits', 'Produits des prestations'],
  ['especes', 'Caisse espèces'], ['mobile_money', 'Mobile Money'], ['carte', 'Cartes bancaires'], ['cheques_a_encaisser', 'Chèques à encaisser'],
  ['banque', 'Banque (virements, remises)'], ['ecart_caisse_perte', 'Écart de caisse — manquant'], ['ecart_caisse_gain', 'Écart de caisse — excédent'], ['perte_creance', 'Pertes sur créances'],
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
