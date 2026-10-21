import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { toastErreurSante } from '@/lib/sante-acces';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BordereauCompta from './BordereauCompta';
import { OutboxCard, RemboursementsCard, ReglementOrganismeCard, ConventionsCard, BonsPecCard, CreancesOrganismesCard, AnalytiqueSanteCard, SaisieSecoursCard } from './FinanceSante';
import { MODES_PAIEMENT, fcfa, resteDu, totalLignes, ventiler } from '@/domain/sante/tiers-payant';

type Item = { code: string; libelle: string; tarif: number };
type Facture = { id: string; numero: string; type: string; total: number; part_patient: number; part_organisme: number; organisme: string | null; statut_tiers: string; envoye_tiers_le: string | null; annulee: boolean; created_at: string; patient: { nom: string; prenoms: string | null; numero_dossier: string } | null; encaisse: number };
type Session = { id: string; fond_initial: number; ouverte_le: string } | null;

const db = supabase as any;
const TIERS: Record<string, string> = { sans: '—', a_facturer: 'À facturer', envoye: 'Envoyé', paye: 'Payé', rejete: 'Rejeté' };

export default function FacturationPage({ structureId }: { structureId: string }) {
  const [session, setSession] = useState<Session>(null);
  const [fond, setFond] = useState('0');
  const [factures, setFactures] = useState<Facture[]>([]);
  const [catalogue, setCatalogue] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [patients, setPatients] = useState<{ id: string; nom: string; prenoms: string; numero_dossier: string }[]>([]);
  const [patient, setPatient] = useState<{ id: string; label: string } | null>(null);
  const [assurances, setAssurances] = useState<{ id: string; organisme: string; taux_couverture: number; plafond: number | null }[]>([]);
  const [assuranceId, setAssuranceId] = useState('aucune');
  const [panier, setPanier] = useState<Item[]>([]);
  const [remise, setRemise] = useState('0');
  const [motifRemise, setMotifRemise] = useState('');
  const [paiement, setPaiement] = useState<Record<string, { mode: string; montant: string }>>({});

  const load = async () => {
    const [s, f, a, an] = await Promise.all([
      db.from('sante_sessions_caisse').select('id, fond_initial, ouverte_le').eq('structure_id', structureId).is('fermee_le', null).maybeSingle(),
      db.from('sante_factures').select('id, numero, type, total, part_patient, part_organisme, organisme, statut_tiers, envoye_tiers_le, annulee, created_at, patient:sante_patients(nom, prenoms, numero_dossier), enc:sante_encaissements(montant, mode)').eq('structure_id', structureId).order('created_at', { ascending: false }).limit(50),
      db.from('sante_actes').select('code, libelle, tarif').eq('structure_id', structureId).eq('actif', true),
      db.from('sante_analyses').select('code, libelle, tarif').eq('structure_id', structureId).eq('actif', true),
    ]);
    setSession(s.data);
    setFactures((f.data || []).map((x: any) => ({ ...x, encaisse: (x.enc || []).filter((e: any) => e.mode !== 'organisme').reduce((t: number, e: any) => t + Number(e.montant), 0) })));
    setCatalogue([...(a.data || []), ...(an.data || [])].map((i: any) => ({ ...i, tarif: Number(i.tarif) })));
  };
  useEffect(() => { void load(); }, [structureId]);

  const chercher = async () => {
    const { data } = await db.rpc('sante_rechercher_patients', { _structure_id: structureId, _q: q, _limit: 10, _offset: 0 });
    setPatients(data || []);
  };
  const choisir = async (p: { id: string; nom: string; prenoms: string; numero_dossier: string }) => {
    setPatient({ id: p.id, label: `${p.nom} ${p.prenoms ?? ''} · ${p.numero_dossier}` }); setPatients([]);
    const { data } = await db.from('sante_patient_assurances').select('id, organisme, taux_couverture, plafond').eq('patient_id', p.id);
    setAssurances(data || []); setAssuranceId('aucune');
  };

  const run = async (fn: string, args: object, ok: string) => {
    const { error } = await db.rpc(fn, args);
    if (error) { void toastErreurSante(error, structureId); return false; }
    toast.success(ok); await load(); return true;
  };

  const total = totalLignes(panier.map(p => ({ prix_unitaire: p.tarif })));
  const ass = assurances.find(a => a.id === assuranceId);
  let apercu = { net: total, organisme: 0, patient: total };
  try { apercu = ventiler(total, Number(remise) || 0, ass ? { taux: Number(ass.taux_couverture), plafond: ass.plafond } : null); } catch { /* remise invalide */ }

  const creer = async () => {
    if (!patient || panier.length === 0) return;
    const ok = await run('sante_creer_facture', { _patient_id: patient.id, _lignes: panier.map(p => ({ code: p.code, libelle: p.libelle, prix_unitaire: p.tarif, quantite: 1 })), _assurance_id: ass?.id ?? null, _remise: Number(remise) || 0, _motif_remise: motifRemise || null }, 'Facture émise.');
    if (ok) { setPanier([]); setRemise('0'); setMotifRemise(''); setPatient(null); }
  };

  const imprimerRapport = async (id: string) => {
    const { data, error } = await db.rpc('sante_rapport_caisse', { _session_id: id });
    if (error) { void toastErreurSante(error, structureId); return; }
    const s = data.session; const modes = Object.entries(data.par_mode as Record<string, number>).map(([m, v]) => `<tr><td>${m}</td><td style="text-align:right">${fcfa(Number(v))}</td></tr>`).join('');
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<html><head><title>Rapport de caisse</title><style>@page{size:A4;margin:15mm}body{font-family:sans-serif;font-size:12px}td,th{border:1px solid #999;padding:5px}table{border-collapse:collapse;width:100%;margin:10px 0}</style></head><body><h2>Rapport de fin de journée — caisse</h2><p>Ouverte le ${new Date(s.ouverte_le).toLocaleString('fr-FR')} · clôturée le ${new Date(s.fermee_le).toLocaleString('fr-FR')}</p><table><tr><th>Mode</th><th>Encaissé</th></tr>${modes}</table><table><tr><td>Fond initial</td><td style="text-align:right">${fcfa(Number(s.fond_initial))}</td></tr><tr><td>Remboursements espèces</td><td style="text-align:right">${fcfa(Number(data.remboursements_especes))}</td></tr><tr><td>Espèces attendues</td><td style="text-align:right">${fcfa(Number(s.montant_attendu))}</td></tr><tr><td>Espèces comptées</td><td style="text-align:right">${fcfa(Number(s.montant_compte))}</td></tr><tr><td><b>Écart</b></td><td style="text-align:right"><b>${fcfa(Number(s.ecart))}</b></td></tr></table><p>${data.nb_encaissements} encaissement(s). Session verrouillée.</p><p style="margin-top:40px">Signature caissier : ____________ &nbsp; Visa responsable : ____________</p><script>print()</script></body></html>`);
  };

  const imprimer = (f: Facture) => {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<html><head><title>${f.numero}</title><style>body{font-family:sans-serif;padding:40px;max-width:700px}td{padding:6px}</style></head><body><h2>${f.type === 'avoir' ? 'Avoir' : 'Reçu'} ${f.numero}</h2><p>${f.patient?.nom ?? ''} ${f.patient?.prenoms ?? ''} — ${f.patient?.numero_dossier ?? ''}</p><table><tr><td>Total</td><td>${fcfa(f.total)}</td></tr><tr><td>Part organisme ${f.organisme ?? ''}</td><td>${fcfa(f.part_organisme)}</td></tr><tr><td>Part patient</td><td>${fcfa(f.part_patient)}</td></tr><tr><td>Encaissé</td><td>${fcfa(f.encaisse)}</td></tr><tr><td><b>Reste dû</b></td><td><b>${fcfa(resteDu(f.part_patient, f.encaisse))}</b></td></tr></table><p style="font-size:11px;margin-top:40px">Date : ${new Date(f.created_at).toLocaleString('fr-FR')}</p><script>print()</script></body></html>`);
  };

  return (
    <div className="max-w-6xl space-y-8">
      <div><p className="text-xs font-mono uppercase text-primary mb-2">Facturation</p><h1 className="font-serif text-3xl">Factures & caisse</h1></div>

      <section className="border border-border bg-bg2 rounded-md p-5 flex flex-wrap items-end gap-3">
        {session ? (<>
          <p className="text-sm flex-1">Caisse ouverte depuis {new Date(session.ouverte_le).toLocaleTimeString('fr-FR')} · fond {fcfa(Number(session.fond_initial))}</p>
          <div><Label>Espèces comptées</Label><Input type="number" value={fond} onChange={e => setFond(e.target.value)} className="w-40" /></div>
          <Button variant="outline" onClick={async () => { const { data, error } = await db.rpc('sante_fermer_caisse', { _session_id: session.id, _compte: Number(fond) }); if (error) void toastErreurSante(error, structureId); else { toast.success(`Caisse fermée. Écart : ${fcfa(Number(data))}`); await imprimerRapport(session.id); await load(); } }}>Clôturer et imprimer le rapport</Button>
          <Button variant="ghost" onClick={() => run('sante_remettre_cheques', { _structure_id: structureId }, 'Remise de chèques enregistrée.')}>Remise de chèques en banque</Button>
        </>) : (<>
          <p className="text-sm flex-1">Votre caisse est fermée.</p>
          <div><Label>Fond de caisse</Label><Input type="number" value={fond} onChange={e => setFond(e.target.value)} className="w-40" /></div>
          <Button onClick={() => run('sante_ouvrir_caisse', { _structure_id: structureId, _fond: Number(fond) }, 'Caisse ouverte.')}>Ouvrir la caisse</Button>
        </>)}
      </section>

      <section className="border border-border bg-bg2 rounded-md p-5 space-y-4">
        <h2 className="font-semibold">Nouvelle facture</h2>
        {patient ? <p className="text-sm">Patient : <b>{patient.label}</b> <Button size="sm" variant="ghost" onClick={() => setPatient(null)}>Changer</Button></p> : (
          <div><div className="flex gap-2"><Input placeholder="Nom, téléphone ou n° de dossier" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && chercher()} /><Button onClick={chercher}>Chercher</Button></div>
            <div className="mt-2 space-y-1">{patients.map(p => <button key={p.id} className="block w-full text-left text-sm border border-border rounded p-2 hover:bg-muted" onClick={() => choisir(p)}>{p.nom} {p.prenoms} · {p.numero_dossier}</button>)}</div></div>
        )}
        {patient && <BonsPecCard structureId={structureId} patientId={patient.id} organismes={[...new Set(assurances.map(a => a.organisme))]} />}
        <div className="flex flex-wrap gap-2">{catalogue.map(i => <Button key={i.code} size="sm" variant="outline" onClick={() => setPanier([...panier, i])}>{i.libelle} · {fcfa(i.tarif)}</Button>)}</div>
        {panier.length > 0 && <ul className="text-sm space-y-1">{panier.map((p, k) => <li key={k} className="flex justify-between border-b border-border py-1"><span>{p.libelle}</span><span>{fcfa(p.tarif)} <button className="text-destructive ml-2" onClick={() => setPanier(panier.filter((_, j) => j !== k))}>×</button></span></li>)}</ul>}
        <div className="grid sm:grid-cols-3 gap-3">
          <div><Label>Prise en charge</Label><Select value={assuranceId} onValueChange={setAssuranceId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aucune">Aucune</SelectItem>{assurances.map(a => <SelectItem key={a.id} value={a.id}>{a.organisme} ({a.taux_couverture} %)</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Remise (administrateur)</Label><Input type="number" value={remise} onChange={e => setRemise(e.target.value)} /></div>
          <div><Label>Motif de remise</Label><Input value={motifRemise} onChange={e => setMotifRemise(e.target.value)} /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>Total {fcfa(total)} · Organisme {fcfa(apercu.organisme)} · <b>Patient {fcfa(apercu.patient)}</b></span>
          <Button disabled={!patient || panier.length === 0} onClick={creer}>Émettre la facture</Button>
        </div>
      </section>

      <section className="border border-border bg-bg2 rounded-md overflow-x-auto">
        <table className="w-full text-sm"><thead className="text-xs text-fg3 text-left"><tr><th className="p-3">N°</th><th>Patient</th><th>Total</th><th>Patient / reste</th><th>Tiers-payant</th><th className="p-3">Actions</th></tr></thead>
          <tbody>{factures.length === 0 ? <tr><td colSpan={6} className="p-4 text-fg3">Aucune facture.</td></tr> : factures.map(f => {
            const reste = resteDu(f.part_patient, f.encaisse); const p = paiement[f.id] ?? { mode: 'especes', montant: String(reste) };
            return <tr key={f.id} className="border-t border-border align-top">
              <td className="p-3 font-mono">{f.numero}{f.annulee && <span className="block text-xs text-destructive">Annulée</span>}</td>
              <td>{f.patient?.nom} {f.patient?.prenoms}</td>
              <td>{fcfa(f.total)}</td>
              <td>{fcfa(f.part_patient)}<span className="block text-xs text-fg3">reste {fcfa(reste)}</span></td>
              <td>{f.organisme ? <>{f.organisme} · {fcfa(f.part_organisme)}<span className="block text-xs">{TIERS[f.statut_tiers]}{f.envoye_tiers_le ? ` · envoyé le ${new Date(f.envoye_tiers_le).toLocaleDateString("fr-FR")}` : ""}</span>
                {f.statut_tiers === 'a_facturer' || f.statut_tiers === 'rejete' ? <Button size="sm" variant="ghost" onClick={() => run('sante_statut_tiers', { _facture_id: f.id, _statut: 'envoye' }, 'Envoyé.')}>Envoyer</Button> : null}
                {f.statut_tiers === 'envoye' && <><Button size="sm" variant="ghost" onClick={() => run('sante_statut_tiers', { _facture_id: f.id, _statut: 'paye' }, 'Réglé.')}>Payé</Button><Button size="sm" variant="ghost" onClick={() => run('sante_statut_tiers', { _facture_id: f.id, _statut: 'rejete' }, 'Rejet noté.')}>Rejeté</Button></>}
              </> : '—'}</td>
              <td className="p-3 space-y-1">
                {f.type === 'facture' && !f.annulee && reste > 0 && <div className="flex gap-1">
                  <Select value={p.mode} onValueChange={v => setPaiement({ ...paiement, [f.id]: { ...p, mode: v } })}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger><SelectContent>{MODES_PAIEMENT.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
                  <Input className="h-8 w-24" type="number" value={p.montant} onChange={e => setPaiement({ ...paiement, [f.id]: { ...p, montant: e.target.value } })} />
                  <Button size="sm" onClick={() => run('sante_encaisser', { _facture_id: f.id, _mode: p.mode, _montant: Number(p.montant) }, 'Encaissé.')}>Encaisser</Button>
                </div>}
                <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => imprimer(f)}>Reçu</Button>
                  {f.type === 'facture' && !f.annulee && <Button size="sm" variant="ghost" onClick={() => { const m = prompt("Motif d'annulation (un avoir sera émis)"); if (m) void run('sante_annuler_facture', { _facture_id: f.id, _motif: m }, 'Avoir émis.'); }}>Annuler</Button>}</div>
              </td>
            </tr>;
          })}</tbody></table>
      </section>
      <RemboursementsCard structureId={structureId} />
      <ReglementOrganismeCard structureId={structureId} />
      <CreancesOrganismesCard structureId={structureId} />
      <ConventionsCard structureId={structureId} />
      <SaisieSecoursCard structureId={structureId} />
      <AnalytiqueSanteCard structureId={structureId} />
      <OutboxCard structureId={structureId} />
      <BordereauCompta structureId={structureId} />
    </div>
  );
}
