import { useCallback, useEffect, useState } from 'react';
import { Banknote, Calculator, HandCoins, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { messageErreur } from '@/lib/erreurs';

const CATEGORIES = ['toutes', 'consultation', 'acte', 'analyses', 'autres'] as const;
const MODES = ['especes', 'virement', 'cheque', 'mobile_money'] as const;
const STATUTS: Record<string, string> = { validee: 'Validée', payee: 'Payée', annulee: 'Annulée' };

type Praticien = { id: string; nom: string; specialite: string | null };
type Regle = { id: string; praticien_id: string; categorie: string; taux: number; actif: boolean };
type Retro = {
  id: string; praticien_id: string; numero: string; periode_debut: string; periode_fin: string;
  base: number; montant_brut: number; retenue: number; montant_net: number; statut: string;
  mode_paiement: string | null; reference_paiement: string | null; motif_annulation: string | null;
};

const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} FCFA`;
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR');

/** Rétrocessions des praticiens : règles de taux, calcul sur une période, paiement. Lecture : admin, comptable et praticien concerné (RLS). */
export default function RetrocessionsPage({ structureId }: { structureId: string }) {
  const [onglet, setOnglet] = useState<'retros' | 'regles'>('retros');
  const [praticiens, setPraticiens] = useState<Praticien[]>([]);
  const [regles, setRegles] = useState<Regle[]>([]);
  const [retros, setRetros] = useState<Retro[]>([]);
  const [regle, setRegle] = useState({ praticien_id: '', categorie: 'toutes' as string, taux: '' });
  const [calcul, setCalcul] = useState({ praticien_id: '', debut: '', fin: '' });
  const [paiement, setPaiement] = useState<Record<string, { mode: string; reference: string }>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, r, t] = await Promise.all([
      supabase.from('sante_praticiens').select('id, nom, specialite').eq('structure_id', structureId).eq('actif', true).order('nom'),
      supabase.from('sante_retrocession_regles').select('id, praticien_id, categorie, taux, actif').eq('structure_id', structureId).order('created_at'),
      supabase.from('sante_retrocessions').select('id, praticien_id, numero, periode_debut, periode_fin, base, montant_brut, retenue, montant_net, statut, mode_paiement, reference_paiement, motif_annulation').eq('structure_id', structureId).order('valide_le', { ascending: false }).limit(100),
    ]);
    setPraticiens(p.data ?? []);
    setRegles(r.data ?? []);
    setRetros(t.data ?? []);
  }, [structureId]);

  useEffect(() => { void load(); }, [load]);

  const nomPraticien = (id: string) => praticiens.find(p => p.id === id)?.nom ?? '—';

  const ajouterRegle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!regle.praticien_id || regle.taux === '') return;
    const { error } = await supabase.from('sante_retrocession_regles').insert({
      structure_id: structureId, praticien_id: regle.praticien_id, categorie: regle.categorie, taux: Number(regle.taux),
    });
    if (error) toast.error(messageErreur(error));
    else { setRegle({ praticien_id: '', categorie: 'toutes', taux: '' }); toast.success('Règle ajoutée.'); await load(); }
  };

  const basculerRegle = async (r: Regle) => {
    const { error } = await supabase.from('sante_retrocession_regles').update({ actif: !r.actif }).eq('id', r.id);
    if (error) toast.error(messageErreur(error));
    else await load();
  };

  const calculer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!calcul.praticien_id || !calcul.debut || !calcul.fin) return;
    setBusy(true);
    const { error } = await supabase.rpc('sante_calcul_retrocession', { _praticien_id: calcul.praticien_id, _debut: calcul.debut, _fin: calcul.fin });
    setBusy(false);
    if (error) toast.error(messageErreur(error));
    else { toast.success('Rétrocession calculée et validée.'); await load(); }
  };

  const payer = async (id: string) => {
    const p = paiement[id] ?? { mode: 'especes', reference: '' };
    const { error } = await supabase.rpc('sante_payer_retrocession', { _id: id, _mode: p.mode, _reference: p.reference || null });
    if (error) toast.error(messageErreur(error));
    else { toast.success('Paiement enregistré.'); await load(); }
  };

  const annuler = async (id: string) => {
    const motif = window.prompt('Motif d’annulation (obligatoire) :');
    if (!motif || motif.trim().length < 3) { if (motif !== null) toast.error('Le motif est obligatoire.'); return; }
    const { error } = await supabase.rpc('sante_annuler_retrocession', { _id: id, _motif: motif.trim() });
    if (error) toast.error(messageErreur(error));
    else { toast.success('Rétrocession annulée.'); await load(); }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div><p className="text-xs font-mono uppercase text-primary mb-1">Équipe</p><h1 className="font-serif text-3xl">Rétrocessions des praticiens</h1></div>
      <div className="flex flex-wrap gap-1">
        {([['retros', 'Rétrocessions'], ['regles', 'Règles de taux']] as const).map(([k, l]) => <Button key={k} size="sm" variant={onglet === k ? 'secondary' : 'ghost'} onClick={() => setOnglet(k)}>{l}</Button>)}
      </div>

      {onglet === 'regles' ? (
        <section className="border border-border bg-bg2 rounded-md p-5 space-y-5">
          <div className="flex items-center gap-2"><Plus className="text-primary" /><h2 className="font-semibold">Ajouter une règle</h2></div>
          <form onSubmit={ajouterRegle} className="grid gap-3 sm:grid-cols-4">
            <Select value={regle.praticien_id} onValueChange={v => setRegle({ ...regle, praticien_id: v })}>
              <SelectTrigger aria-label="Praticien"><SelectValue placeholder="Praticien" /></SelectTrigger>
              <SelectContent>{praticiens.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={regle.categorie} onValueChange={v => setRegle({ ...regle, categorie: v })}>
              <SelectTrigger aria-label="Catégorie"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
            </Select>
            <div><Label htmlFor="taux" className="sr-only">Taux (%)</Label><Input id="taux" type="number" min={0} max={100} step="0.01" required placeholder="Taux (%)" value={regle.taux} onChange={e => setRegle({ ...regle, taux: e.target.value })} /></div>
            <Button type="submit">Ajouter</Button>
          </form>
          {regles.length === 0 ? <p className="text-xs text-fg3">Aucune règle. Sans règle, le calcul donne un montant nul.</p> : (
            <div className="space-y-2">
              {regles.map(r => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border border-border rounded-md p-3 text-sm">
                  <span className="font-medium">{nomPraticien(r.praticien_id)}</span>
                  <span className="capitalize text-fg2">{r.categorie}</span>
                  <span className="text-fg3">{r.taux} %</span>
                  <Button size="sm" variant={r.actif ? 'outline' : 'ghost'} className="ml-auto" onClick={() => void basculerRegle(r)}>{r.actif ? 'Active — désactiver' : 'Inactive — activer'}</Button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="border border-border bg-bg2 rounded-md p-5 space-y-4">
            <div className="flex items-center gap-2"><Calculator className="text-primary" /><h2 className="font-semibold">Calculer une rétrocession</h2></div>
            <form onSubmit={calculer} className="grid gap-3 sm:grid-cols-4">
              <Select value={calcul.praticien_id} onValueChange={v => setCalcul({ ...calcul, praticien_id: v })}>
                <SelectTrigger aria-label="Praticien"><SelectValue placeholder="Praticien" /></SelectTrigger>
                <SelectContent>{praticiens.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
              </Select>
              <div><Label htmlFor="r-debut" className="sr-only">Début</Label><Input id="r-debut" type="date" required value={calcul.debut} onChange={e => setCalcul({ ...calcul, debut: e.target.value })} /></div>
              <div><Label htmlFor="r-fin" className="sr-only">Fin</Label><Input id="r-fin" type="date" required value={calcul.fin} onChange={e => setCalcul({ ...calcul, fin: e.target.value })} /></div>
              <Button type="submit" disabled={busy}>{busy ? '…' : 'Calculer'}</Button>
            </form>
            <p className="text-xs text-fg3">Le calcul se base sur les actes facturés et encaissés du praticien sur la période, selon les règles de taux actives.</p>
          </section>

          <section className="border border-border bg-bg2 rounded-md p-5">
            <div className="flex items-center gap-2 mb-4"><HandCoins className="text-primary" /><h2 className="font-semibold">Rétrocessions</h2></div>
            {retros.length === 0 ? <p className="text-xs text-fg3">Aucune rétrocession calculée.</p> : (
              <div className="space-y-2">
                {retros.map(r => (
                  <div key={r.id} className="border border-border rounded-md p-3 text-sm space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs text-fg3">{r.numero}</span>
                      <span className="font-medium">{nomPraticien(r.praticien_id)}</span>
                      <span className="text-fg3 text-xs">{fmtDate(r.periode_debut)} → {fmtDate(r.periode_fin)}</span>
                      <span className={`ml-auto text-xs ${r.statut === 'payee' ? 'text-primary' : r.statut === 'annulee' ? 'text-destructive' : 'text-fg3'}`}>{STATUTS[r.statut] ?? r.statut}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-fg2">
                      <span>Base : {fcfa(r.base)}</span><span>Brut : {fcfa(r.montant_brut)}</span><span>Retenue : {fcfa(r.retenue)}</span><span className="font-semibold text-foreground">Net : {fcfa(r.montant_net)}</span>
                      {r.mode_paiement && <span>Payé par {r.mode_paiement}{r.reference_paiement ? ` (${r.reference_paiement})` : ''}</span>}
                      {r.motif_annulation && <span className="text-destructive">Motif : {r.motif_annulation}</span>}
                    </div>
                    {r.statut === 'validee' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={(paiement[r.id]?.mode) ?? 'especes'} onValueChange={v => setPaiement({ ...paiement, [r.id]: { mode: v, reference: paiement[r.id]?.reference ?? '' } })}>
                          <SelectTrigger className="w-40" aria-label="Mode de paiement"><SelectValue /></SelectTrigger>
                          <SelectContent>{MODES.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input className="w-48" placeholder="Référence (optionnel)" value={paiement[r.id]?.reference ?? ''} onChange={e => setPaiement({ ...paiement, [r.id]: { mode: paiement[r.id]?.mode ?? 'especes', reference: e.target.value } })} />
                        <Button size="sm" onClick={() => void payer(r.id)}><Banknote />Marquer payée</Button>
                        <Button size="sm" variant="ghost" onClick={() => void annuler(r.id)}><X />Annuler</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
