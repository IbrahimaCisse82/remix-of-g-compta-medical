import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { toastErreurSante } from '@/lib/sante-acces';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Tables, TablesUpdate } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fcfa } from '@/domain/sante/tiers-payant';

const db = supabase;

/** Indicateur « écritures en attente » + recomptabilisation idempotente. */
export function OutboxCard({ structureId }: { structureId: string }) {
  const [r, setR] = useState<{ en_attente: number; en_erreur: number; comptabilise: number } | null>(null);
  const [erreurs, setErreurs] = useState<{ id: string; source_type: string; libelle: string; derniere_erreur: string | null; tentatives: number }[]>([]);
  const load = async () => {
    const [a, b] = await Promise.all([
      db.rpc('sante_outbox_resume', { _structure_id: structureId }),
      db.from('sante_compta_evenements').select('id, source_type, libelle, derniere_erreur, tentatives').eq('structure_id', structureId).neq('statut', 'comptabilise').order('created_at').limit(20),
    ]);
    if (!a.error) setR(a.data as unknown as { en_attente: number; en_erreur: number; comptabilise: number }); setErreurs(b.data ?? []);
  };
  useEffect(() => { void load(); }, [structureId]);
  if (!r) return null;
  const rejouer = async () => {
    const { data, error } = await db.rpc('sante_rejouer_outbox', { _structure_id: structureId });
    if (error) void toastErreurSante(error, structureId); else { toast.success(`${data} écriture(s) comptabilisée(s)`); void load(); }
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
    .eq('structure_id', structureId).in('statut', ['demande', 'approuve']).order('created_at', { ascending: false }).then(({ data }) => setList(data ?? []));
  useEffect(() => { load(); }, [structureId]);
  if (!list.length) return null;
  const decider = async (id: string, ok: boolean) => {
    const m = prompt(ok ? 'Motif de l’approbation :' : 'Motif du refus :'); if (!m) return;
    const { error } = await db.rpc('sante_decider_remboursement', { _id: id, _approuver: ok, _motif: m });
    if (error) void toastErreurSante(error, structureId); else load();
  };
  const payer = async (id: string) => {
    const mode = prompt('Mode (especes, wave, orange_money, cheque, virement) :', 'especes'); if (!mode) return;
    const { error } = await db.rpc('sante_payer_remboursement', { _id: id, _mode: mode.trim() });
    if (error) void toastErreurSante(error, structureId); else { toast.success('Remboursement payé'); load(); }
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
    db.from('sante_organismes').select('nom').eq('structure_id', structureId).eq('actif', true).order('nom').then(({ data }) => setOrganismes((data ?? []).map((o) => o.nom)));
  }, [structureId]);
  const charger = async (o: string) => {
    setOrg(o); setImput({});
    const { data } = await db.from('sante_factures').select('id, numero, part_organisme, organisme').eq('structure_id', structureId).eq('organisme', o)
      .eq('type', 'facture').eq('annulee', false).neq('statut_tiers', 'paye').gt('part_organisme', 0).order('created_at').limit(100);
    const avecReste = await Promise.all((data ?? []).map(async (f) => ({ ...f, reste: Number((await db.rpc('sante_reste_organisme', { _facture_id: f.id })).data ?? 0) })));
    setFactures(avecReste.filter(f => f.reste > 0));
  };
  const total = Object.values(imput).reduce((s, v) => s + (Number(v) || 0), 0);
  const valider = async () => {
    const lignes = Object.entries(imput).filter(([, v]) => Number(v) > 0).map(([facture_id, v]) => ({ facture_id, montant: Number(v) }));
    const { error } = await db.rpc('sante_imputer_reglement', { _structure_id: structureId, _organisme: org, _montant: total, _mode: mode, _reference: ref || null, _imputations: lignes });
    if (error) void toastErreurSante(error, structureId); else { toast.success('Règlement imputé et comptabilisé'); setRef(''); void charger(org); }
  };
  const rejeter = async (f: FactOrg) => {
    const type = prompt('Type de rejet : administratif (à corriger et renvoyer), non_prise_en_charge (bascule au patient si la convention l’autorise), perte (passée en charge)', 'administratif'); if (!type) return;
    const motif = prompt('Motif (obligatoire) :'); if (!motif) return;
    const montant = type.trim() === 'administratif' ? null : Number(prompt('Montant concerné :', String(f.reste)));
    const { error } = await db.rpc('sante_rejet_tiers', { _facture_id: f.id, _type: type.trim(), _motif: motif, _montant: montant });
    if (error) void toastErreurSante(error, structureId); else { toast.success('Rejet enregistré'); void charger(org); }
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
    setComptes(Object.fromEntries((p.data ?? []).map(x => [x.cle, x.compte])));
    setOrgs(o.data ?? []); setMoment(s.data?.facturation_labo_moment ?? 'enregistrement');
    setDefauts(Object.fromEntries(d));
  };
  useEffect(() => { void load(); }, [structureId]);

  const definir = async (cle: string, compte: string) => {
    if (!compte.trim() || compte === defauts[cle]) return;
    const { error } = await db.rpc('sante_definir_compte', { _structure_id: structureId, _cle: cle, _compte: compte.trim() });
    if (error) void toastErreurSante(error, structureId); else { toast.success('Compte enregistré'); void load(); }
  };
  const majOrg = async (id: string, patch: TablesUpdate<'sante_organismes'>) => {
    const { error } = await db.from('sante_organismes').update(patch).eq('id', id);
    if (error) void toastErreurSante(error, structureId); else void load();
  };
  const ajouter = async () => {
    if (!nouvel.trim()) return;
    const { error } = await db.from('sante_organismes').insert({ structure_id: structureId, nom: nouvel.trim() });
    if (error) void toastErreurSante(error, structureId); else { setNouvel(''); void load(); }
  };
  const changerMoment = async (v: string) => {
    const { error } = await db.rpc('sante_config_labo_moment', { _structure_id: structureId, _moment: v });
    if (error) void toastErreurSante(error, structureId); else { setMoment(v); toast.success('Réglage enregistré'); }
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
  const [conv, setConv] = useState<Tables<'sante_conventions'>[]>([]);
  const [tarifs, setTarifs] = useState<Tables<'sante_tarifs_convention'>[]>([]);
  const [excl, setExcl] = useState<Tables<'sante_convention_exclusions'>[]>([]);
  const [f, setF] = useState({ categorie: 'consultation', taux: '80', plafond: '', franchise: '0', code: '', tarif: '', exclu: '' });
  useEffect(() => { db.from('sante_organismes').select('nom').eq('structure_id', structureId).order('nom').then(({ data }) => setOrgs((data ?? []).map((o) => o.nom))); }, [structureId]);
  const charger = async (o: string) => {
    setOrg(o); if (!o) return;
    const [a, b, c] = await Promise.all([
      db.from('sante_conventions').select('*').eq('structure_id', structureId).eq('organisme', o),
      db.from('sante_tarifs_convention').select('*').eq('structure_id', structureId).eq('organisme', o),
      db.from('sante_convention_exclusions').select('*').eq('structure_id', structureId).eq('organisme', o),
    ]);
    setConv(a.data ?? []); setTarifs(b.data ?? []); setExcl(c.data ?? []);
  };
  const ok = (r: { error: { message: string } | null }) => { if (r.error) toast.error(r.error.message); else void charger(org); };
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
  const [bons, setBons] = useState<Tables<'sante_bons_pec'>[]>([]);
  const [f, setF] = useState({ organisme: '', numero: '', date_fin: '', plafond: '', accord: false });
  const load = () => db.from('sante_bons_pec').select('*').eq('patient_id', patientId).order('date_fin', { ascending: false }).then(({ data }) => setBons(data ?? []));
  useEffect(() => { load(); }, [patientId]);
  const ajouter = async () => {
    const { error } = await db.from('sante_bons_pec').insert({ structure_id: structureId, patient_id: patientId, organisme: f.organisme, numero: f.numero.trim(), date_fin: f.date_fin, plafond: f.plafond ? Number(f.plafond) : null, accord_prealable: f.accord });
    if (error) void toastErreurSante(error, structureId); else { setF({ organisme: '', numero: '', date_fin: '', plafond: '', accord: false }); load(); }
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
export function CreancesOrganismesCard({ structureId }: { structureId: string }) {
  const [rows, setRows] = useState<Database['public']['Functions']['sante_creances_organismes']['Returns']>([]);
  const load = () => db.rpc('sante_creances_organismes', { _structure_id: structureId }).then(({ data, error }) => { if (!error) setRows(data ?? []); });
  useEffect(() => { load(); }, [structureId]);
  if (!rows.length) return null;
  const relancer = async (o: string) => {
    const { data, error } = await db.rpc('sante_relancer', { _structure_id: structureId, _organisme: o });
    if (error) { void toastErreurSante(error, structureId); return; }
    const { data: r } = await db.from('sante_relances').select('niveau, montant, factures').eq('id', data).single();
    const { data: fs } = await db.from('sante_factures').select('numero, created_at, part_organisme').in('id', r.factures);
    const w = window.open('', '_blank'); if (w) w.document.write(`<html><head><title>Relance ${o}</title><style>@page{size:A4;margin:20mm}body{font-family:sans-serif;font-size:12px}td,th{border:1px solid #999;padding:5px}table{border-collapse:collapse;width:100%}</style></head><body><p>${new Date().toLocaleDateString('fr-FR')}</p><h2>À l'attention de ${o}</h2><p>Objet : relance n° ${r.niveau} — factures de tiers-payant impayées</p><p>Sauf erreur de notre part, les factures suivantes restent à régler :</p><table><tr><th>Facture</th><th>Date</th><th>Part organisme</th></tr>${(fs ?? []).map(f => `<tr><td>${f.numero}</td><td>${new Date(f.created_at).toLocaleDateString('fr-FR')}</td><td style="text-align:right">${fcfa(f.part_organisme)}</td></tr>`).join('')}</table><p><b>Reste dû : ${fcfa(r.montant)}</b></p><p>Nous vous remercions de bien vouloir procéder au règlement.</p><script>print()</script></body></html>`);
    load();
  };
  const provisionner = async (o: string, total: number) => {
    const m = Number(prompt('Montant à provisionner :', String(total))); if (!m) return;
    const motif = prompt('Motif (créance douteuse) :'); if (!motif) return;
    const { error } = await db.rpc('sante_provisionner_creance', { _structure_id: structureId, _organisme: o, _montant: m, _motif: motif });
    if (error) void toastErreurSante(error, structureId); else toast.success('Provision enregistrée (module Provisions + écriture)');
  };
  return (
    <section className="border border-border bg-bg2 rounded-md p-4 overflow-x-auto">
      <h3 className="font-semibold mb-2">Créances par organisme</h3>
      <table className="w-full text-sm"><thead className="text-xs text-fg3 text-left"><tr><th>Organisme</th><th>0-30 j</th><th>31-60 j</th><th>61-90 j</th><th>&gt; 90 j</th><th>Total</th><th>Relance</th><th /></tr></thead>
        <tbody>{rows.map(r => <tr key={r.organisme} className="border-t border-border">
          <td className="py-1">{r.organisme}</td>{[r.j0_30, r.j31_60, r.j61_90, r.plus_90, r.total].map((v, i) => <td key={i}>{v ? fcfa(Number(v)) : '—'}</td>)}
          <td className="text-xs">{r.niveau ? `n° ${r.niveau} le ${new Date(r.derniere_relance).toLocaleDateString('fr-FR')}` : '—'}</td>
          <td className="space-x-1 whitespace-nowrap"><Button size="sm" variant="outline" onClick={() => relancer(r.organisme)}>Relancer</Button><Button size="sm" variant="ghost" onClick={() => provisionner(r.organisme, Number(r.total))}>Provisionner</Button></td>
        </tr>)}</tbody></table>
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
    db.rpc('sante_ca_analytique', { _structure_id: structureId, _debut: `${mois}-01`, _fin: fin, _axe: axe }).then(({ data, error }) => setRows(error ? [] : data ?? []));
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
  const [blocs, setBlocs] = useState<Tables<'sante_blocs_secours'>[]>([]);
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
    if (error) void toastErreurSante(error, structureId); else toast.success('Réglages enregistrés');
  };
  const reserver = async () => {
    const poste = prompt('Nom du poste (ex. Accueil) :'); if (!poste) return;
    const taille = Number(prompt('Nombre de numéros à réserver (10 à 500) :', '50'));
    const { error } = await db.rpc('sante_reserver_bloc', { _structure_id: structureId, _poste: poste, _taille: taille });
    if (error) void toastErreurSante(error, structureId); else void load();
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
  const [blocs, setBlocs] = useState<Tables<'sante_blocs_secours'>[]>([]);
  const [f, setF] = useState({ bloc: '', rang: '', dossier: '', libelle: '', montant: '' });
  useEffect(() => { db.from('sante_blocs_secours').select('*').eq('structure_id', structureId).then(({ data }) => setBlocs(data ?? [])); }, [structureId]);
  if (!blocs.length) return null;
  const saisir = async () => {
    const { data: p } = await db.rpc('sante_rechercher_patients', { _structure_id: structureId, _q: f.dossier, _limit: 1, _offset: 0 });
    if (!p?.[0]) { toast.error('Patient introuvable'); return; }
    const { error } = await db.rpc('sante_saisir_facture_secours', { _bloc_id: f.bloc, _rang: Number(f.rang), _patient_id: p[0].id, _lignes: [{ libelle: f.libelle, prix_unitaire: Number(f.montant) }], _assurance_id: null });
    if (error) void toastErreurSante(error, structureId); else { toast.success('Facture secours saisie'); setF({ ...f, rang: '', libelle: '', montant: '' }); }
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
