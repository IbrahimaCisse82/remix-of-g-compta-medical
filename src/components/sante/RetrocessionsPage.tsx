import { useCallback, useEffect, useState } from 'react';
import { Calculator, CheckCircle2, HandCoins, Printer, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { toastErreurSante } from '@/lib/sante-acces';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fcfa } from '@/domain/sante/tiers-payant';
import {
  CATEGORIES_RETRO, MODES_PAIEMENT, libellePeriode, moisPrecedent, verifierPaiement, verifierTaux,
  type CategorieRetro, type ModePaiement,
} from '@/domain/sante/retrocessions';

type Praticien = { id: string; nom: string; specialite: string | null; numero_ordre: string | null; taux_retenue_source: number; actif: boolean };
type Regle = { id: string; praticien_id: string; categorie: CategorieRetro; taux: number; actif: boolean };
type Releve = { id: string; numero: string; praticien_id: string; periode_debut: string; periode_fin: string; base: number; montant_brut: number; retenue: number; montant_net: number; statut: 'validee' | 'payee' | 'annulee'; details: Calcul; mode_paiement: string | null; reference_paiement: string | null; paye_le: string | null; motif_annulation: string | null; valide_le: string };
type Calcul = { praticien: string; debut: string; fin: string; base: number; montant_brut: number; taux_retenue: number; retenue: number; montant_net: number; nb_factures: number; nb_avoirs: number; categories: Record<string, { base: number; taux: number; montant: number }> };

const LIB_CAT: Record<string, string> = Object.fromEntries(CATEGORIES_RETRO.map(c => [c.id, c.label]));
const STATUT: Record<Releve['statut'], string> = { validee: 'À payer', payee: 'Payé', annulee: 'Annulé' };

function imprimerReleve(r: Releve, structure: string) {
  const w = window.open('', '_blank'); if (!w) return;
  const d = r.details;
  const lignes = Object.entries(d.categories ?? {}).map(([k, v]) => `<tr><td>${LIB_CAT[k] ?? k}</td><td class="r">${fcfa(v.base)}</td><td class="r">${v.taux} %</td><td class="r">${fcfa(v.montant)}</td></tr>`).join('');
  w.document.write(`<html><head><title>${r.numero}</title><style>@page{size:A4;margin:15mm}body{font-family:sans-serif;font-size:12px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #999;padding:6px}.r{text-align:right}h2{margin:0}</style></head><body>
    <h2>Relevé de rétrocession d’honoraires ${r.numero}</h2><p>${structure}</p>
    <p><b>Praticien :</b> ${d.praticien}<br/><b>Période :</b> ${libellePeriode(r.periode_debut, r.periode_fin)}<br/><b>Factures prises en compte :</b> ${d.nb_factures} · <b>avoirs déduits :</b> ${d.nb_avoirs}</p>
    <table><tr><th>Catégorie</th><th>Base nette HT</th><th>Taux</th><th>Montant</th></tr>${lignes}
    <tr><td colspan="3"><b>Montant brut</b></td><td class="r"><b>${fcfa(r.montant_brut)}</b></td></tr>
    <tr><td colspan="3">Retenue à la source (${d.taux_retenue} %)</td><td class="r">− ${fcfa(r.retenue)}</td></tr>
    <tr><td colspan="3"><b>Net à payer</b></td><td class="r"><b>${fcfa(r.montant_net)}</b></td></tr></table>
    <p>Statut : ${STATUT[r.statut]}${r.paye_le ? ` le ${new Date(r.paye_le).toLocaleDateString('fr-FR')} (${r.mode_paiement}${r.reference_paiement ? ` — ${r.reference_paiement}` : ''})` : ''}</p>
    <p style="font-size:10px;color:#555">Base : prestations facturées au nom du praticien, nettes de remise et de TVA, hors factures annulées, diminuées des avoirs de la période. Aucune commission sur prescription.</p>
    <p style="margin-top:40px">Visa de la direction : ____________ &nbsp;&nbsp; Signature du praticien : ____________</p><script>print()</script></body></html>`);
}

export default function RetrocessionsPage({ structureId, structureNom }: { structureId: string; structureNom: string }) {
  const [praticiens, setPraticiens] = useState<Praticien[]>([]);
  const [regles, setRegles] = useState<Regle[]>([]);
  const [releves, setReleves] = useState<Releve[]>([]);
  const [periode, setPeriode] = useState(moisPrecedent());
  const [apercus, setApercus] = useState<Record<string, Calcul>>({});
  const [nouvelle, setNouvelle] = useState<Record<string, { categorie: CategorieRetro; taux: string }>>({});
  const [paiement, setPaiement] = useState<Record<string, { mode: ModePaiement; ref: string }>>({});
  const [refuse, setRefuse] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, r, v] = await Promise.all([
      supabase.from('sante_praticiens').select('id, nom, specialite, numero_ordre, taux_retenue_source, actif').eq('structure_id', structureId).order('nom'),
      supabase.from('sante_retrocession_regles').select('id, praticien_id, categorie, taux, actif').eq('structure_id', structureId),
      supabase.from('sante_retrocessions').select('*').eq('structure_id', structureId).order('valide_le', { ascending: false }).limit(100),
    ]);
    if (v.error) { setRefuse(v.error.message); return; }
    setRefuse(null);
    setPraticiens((p.data ?? []) as Praticien[]); setRegles((r.data ?? []) as Regle[]); setReleves((v.data ?? []) as unknown as Releve[]);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);

  const nomPr = (id: string) => praticiens.find(p => p.id === id)?.nom ?? '—';

  const ajouterRegle = async (praticienId: string) => {
    const n = nouvelle[praticienId] ?? { categorie: 'toutes' as CategorieRetro, taux: '' };
    const e = verifierTaux(n.taux); if (e) return toast.error(e);
    const { error } = await supabase.from('sante_retrocession_regles').upsert({ structure_id: structureId, praticien_id: praticienId, categorie: n.categorie, taux: Number(n.taux.replace(',', '.')), actif: true }, { onConflict: 'praticien_id,categorie' });
    if (error) return void toastErreurSante(error, structureId);
    setNouvelle(s => ({ ...s, [praticienId]: { categorie: 'toutes', taux: '' } })); void load();
  };
  const retirerRegle = async (id: string) => {
    const { error } = await supabase.from('sante_retrocession_regles').delete().eq('id', id);
    if (error) return void toastErreurSante(error, structureId);
    void load();
  };
  const majRetenue = async (p: Praticien, v: string) => {
    const t = Number(v.replace(',', '.'));
    if (Number.isNaN(t) || t < 0 || t > 50) return toast.error('Retenue à la source : entre 0 et 50 %');
    const { error } = await supabase.from('sante_praticiens').update({ taux_retenue_source: t }).eq('id', p.id);
    if (error) return void toastErreurSante(error, structureId);
    toast.success('Taux de retenue enregistré'); void load();
  };
  const calculer = async (praticienId: string) => {
    const { data, error } = await supabase.rpc('sante_calcul_retrocession', { _praticien_id: praticienId, _debut: periode.debut, _fin: periode.fin });
    if (error) return void toastErreurSante(error, structureId);
    setApercus(s => ({ ...s, [praticienId]: data as unknown as Calcul }));
  };
  const valider = async (praticienId: string) => {
    const a = apercus[praticienId];
    if (!confirm(`Valider le relevé de ${a?.praticien} (${libellePeriode(periode.debut, periode.fin)}) pour ${fcfa(a?.montant_net ?? 0)} net ? L'écriture comptable sera générée.`)) return;
    const { error } = await supabase.rpc('sante_valider_retrocession', { _praticien_id: praticienId, _debut: periode.debut, _fin: periode.fin });
    if (error) return void toastErreurSante(error, structureId);
    toast.success('Relevé validé et comptabilisé'); setApercus(s => { const x = { ...s }; delete x[praticienId]; return x; }); void load();
  };
  const payer = async (r: Releve) => {
    const p = paiement[r.id] ?? { mode: 'virement' as ModePaiement, ref: '' };
    const e = verifierPaiement(p.mode, p.ref); if (e) return toast.error(e);
    const { error } = await supabase.rpc('sante_payer_retrocession', { _id: r.id, _mode: p.mode, _reference: p.ref || undefined });
    if (error) return void toastErreurSante(error, structureId);
    toast.success(`${r.numero} payé`); void load();
  };
  const annuler = async (r: Releve) => {
    const motif = prompt(`Motif d'annulation du relevé ${r.numero} (10 caractères minimum) :`);
    if (!motif) return;
    const { error } = await supabase.rpc('sante_annuler_retrocession', { _id: r.id, _motif: motif });
    if (error) return void toastErreurSante(error, structureId);
    toast.success(`${r.numero} annulé (écriture contre-passée)`); void load();
  };

  if (refuse) return <div className="max-w-3xl border border-border bg-bg2 rounded-md p-5 text-sm">Les rétrocessions sont réservées à l’administrateur, au comptable et à chaque praticien pour ses propres relevés.</div>;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-mono uppercase text-primary mb-1">Honoraires</p><h1 className="font-serif text-3xl flex items-center gap-2"><HandCoins className="text-primary" />Rétrocessions aux praticiens</h1>
          <p className="text-sm text-fg2 max-w-2xl">Calculées sur les prestations facturées au nom du praticien qui les a réalisées, nettes de remise et de TVA, avoirs déduits. Aucune commission sur les examens ou médicaments prescrits.</p></div>
        <div className="flex gap-2 items-center text-sm"><Input type="date" aria-label="Début de période" value={periode.debut} onChange={e => { setPeriode(p => ({ ...p, debut: e.target.value })); setApercus({}); }} /><span>→</span><Input type="date" aria-label="Fin de période" value={periode.fin} onChange={e => { setPeriode(p => ({ ...p, fin: e.target.value })); setApercus({}); }} /></div>
      </div>

      <section className="space-y-3">
        {praticiens.filter(p => p.actif).length === 0 && <p className="text-sm text-fg3">Aucun praticien actif. Ajoutez-les dans Catalogue & tarifs.</p>}
        {praticiens.filter(p => p.actif).map(p => {
          const rs = regles.filter(r => r.praticien_id === p.id);
          const n = nouvelle[p.id] ?? { categorie: 'toutes' as CategorieRetro, taux: '' };
          const a = apercus[p.id];
          return (
            <div key={p.id} className="border border-border bg-bg2 rounded-md p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p><strong>{p.nom}</strong> <span className="text-sm text-fg3">{p.specialite ?? ''}{p.numero_ordre ? ` · ordre ${p.numero_ordre}` : ''}</span></p>
                <label className="text-xs text-fg2 flex items-center gap-2">Retenue à la source %<Input className="w-20 h-8" inputMode="decimal" defaultValue={p.taux_retenue_source} onBlur={e => Number(e.target.value) !== Number(p.taux_retenue_source) && majRetenue(p, e.target.value)} /></label>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {rs.length === 0 && <span className="text-fg3 text-xs">Aucun taux : rien ne sera rétrocédé.</span>}
                {rs.map(r => <span key={r.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">{LIB_CAT[r.categorie]} : <strong>{Number(r.taux)} %</strong><button aria-label="Retirer ce taux" className="text-fg3 hover:text-destructive" onClick={() => retirerRegle(r.id)}><Trash2 className="h-3 w-3" /></button></span>)}
              </div>
              <div className="grid grid-cols-[2fr_1fr_auto_auto] gap-2">
                <select aria-label="Catégorie" className="h-9 bg-bg3 border border-border rounded-md px-2 text-sm" value={n.categorie} onChange={e => setNouvelle(s => ({ ...s, [p.id]: { ...n, categorie: e.target.value as CategorieRetro } }))}>{CATEGORIES_RETRO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                <Input aria-label="Taux en %" inputMode="decimal" placeholder="Taux %" value={n.taux} onChange={e => setNouvelle(s => ({ ...s, [p.id]: { ...n, taux: e.target.value } }))} />
                <Button size="sm" variant="outline" onClick={() => ajouterRegle(p.id)}>Enregistrer le taux</Button>
                <Button size="sm" onClick={() => calculer(p.id)}><Calculator />Calculer</Button>
              </div>
              {a && (
                <div className="border-t border-border pt-3 text-sm">
                  <p className="text-xs text-fg3 mb-2">{libellePeriode(a.debut, a.fin)} · {a.nb_factures} facture(s), {a.nb_avoirs} avoir(s)</p>
                  <table className="w-full text-sm"><thead className="text-xs text-fg3"><tr><th className="text-left">Catégorie</th><th className="text-right">Base nette HT</th><th className="text-right">Taux</th><th className="text-right">Montant</th></tr></thead>
                    <tbody>{Object.entries(a.categories).map(([k, v]) => <tr key={k} className="border-t border-border"><td>{LIB_CAT[k] ?? k}</td><td className="text-right">{fcfa(v.base)}</td><td className="text-right">{v.taux} %</td><td className="text-right">{fcfa(v.montant)}</td></tr>)}
                      <tr className="border-t border-border"><td colSpan={3}>Brut</td><td className="text-right font-semibold">{fcfa(a.montant_brut)}</td></tr>
                      <tr><td colSpan={3}>Retenue à la source ({a.taux_retenue} %)</td><td className="text-right">− {fcfa(a.retenue)}</td></tr>
                      <tr><td colSpan={3} className="font-semibold">Net à payer</td><td className="text-right font-semibold">{fcfa(a.montant_net)}</td></tr></tbody></table>
                  <div className="flex justify-end mt-2"><Button size="sm" disabled={a.montant_brut <= 0} onClick={() => valider(p.id)}><CheckCircle2 />Valider le relevé</Button></div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="border border-border bg-bg2 rounded-md overflow-x-auto">
        <h2 className="px-4 py-3 font-semibold border-b border-border">Relevés</h2>
        {releves.length === 0 ? <p className="p-4 text-sm text-fg3">Aucun relevé.</p> : (
          <table className="w-full text-sm"><thead className="text-xs text-fg3 text-left"><tr><th className="p-3">N°</th><th>Praticien</th><th>Période</th><th className="text-right">Brut</th><th className="text-right">Net</th><th>Statut</th><th className="p-3">Actions</th></tr></thead>
            <tbody>{releves.map(r => {
              const p = paiement[r.id] ?? { mode: 'virement' as ModePaiement, ref: '' };
              return (
                <tr key={r.id} className={`border-t border-border ${r.statut === 'annulee' ? 'opacity-60' : ''}`}>
                  <td className="p-3 font-mono text-xs text-primary">{r.numero}</td><td>{nomPr(r.praticien_id)}</td><td>{libellePeriode(r.periode_debut, r.periode_fin)}</td>
                  <td className="text-right">{fcfa(Number(r.montant_brut))}</td><td className="text-right font-semibold">{fcfa(Number(r.montant_net))}</td>
                  <td>{STATUT[r.statut]}{r.statut === 'annulee' && r.motif_annulation ? <span className="block text-xs text-fg3">{r.motif_annulation}</span> : null}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-1 items-center">
                    <Button size="sm" variant="ghost" onClick={() => imprimerReleve(r, structureNom)}><Printer />Imprimer</Button>
                    {r.statut === 'validee' && <>
                      <select aria-label="Mode de paiement" className="h-8 bg-bg3 border border-border rounded-md px-1 text-xs" value={p.mode} onChange={e => setPaiement(s => ({ ...s, [r.id]: { ...p, mode: e.target.value as ModePaiement } }))}>{MODES_PAIEMENT.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                      <Input aria-label="Référence du paiement" className="h-8 w-28 text-xs" placeholder="Référence" value={p.ref} onChange={e => setPaiement(s => ({ ...s, [r.id]: { ...p, ref: e.target.value } }))} />
                      <Button size="sm" variant="outline" onClick={() => payer(r)}>Payer</Button>
                      <Button size="sm" variant="ghost" onClick={() => annuler(r)} aria-label={`Annuler ${r.numero}`}><XCircle /></Button>
                    </>}
                  </div></td>
                </tr>
              );
            })}</tbody></table>
        )}
      </section>
    </div>
  );
}
