import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { libelleStatutRetour, libelleTypeRetour, PRIORITES_RETOUR, STATUTS_RETOUR, type PrioriteRetour, type StatutRetour } from '@/lib/backoffice';

type Retour = { id: string; created_at: string; auteur_email: string | null; structure_nom: string | null; structure_type: string | null;
  type: string; message: string; page: string | null; roles: string[]; contexte: Record<string, string>; statut: StatutRetour; priorite: PrioriteRetour; reponse: string | null };

/** Tri des retours des structures pilotes : statut, priorité, réponse visible par l'auteur. */
export default function RetoursPanel() {
  const [filtre, setFiltre] = useState<StatutRetour | ''>('nouveau');
  const [liste, setListe] = useState<Retour[] | null>(null);
  const [choisi, setChoisi] = useState<Retour | null>(null);

  async function charger() {
    setListe(null);
    const { data, error } = await rpcPlateforme<Retour[]>('plateforme_retours_lister', { _statut: filtre || null });
    if (error) { toast.error(error.message); setListe([]); } else setListe(data ?? []);
  }
  useEffect(() => { charger(); }, [filtre]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Retours pilotes</h1>
        <p className="text-sm text-muted-foreground">Messages envoyés depuis le bouton « Signaler / Suggérer ». Les plus urgents d'abord ; la réponse est visible par l'auteur.</p>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrer par statut">
        {[{ id: '', libelle: 'Tous' }, ...STATUTS_RETOUR].map(s => (
          <button key={s.id} type="button" onClick={() => setFiltre(s.id as StatutRetour | '')} aria-pressed={filtre === s.id}
            className={`rounded-full border px-3 py-1 text-xs ${filtre === s.id ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>{s.libelle}</button>
        ))}
      </div>
      {liste === null && <p role="status" className="text-sm text-muted-foreground">Chargement…</p>}
      {liste?.length === 0 && <p className="text-sm text-muted-foreground">Aucun retour dans cette catégorie.</p>}
      {!!liste?.length && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Date</th><th>Structure</th><th>Type</th><th>Message</th><th>Priorité</th><th>Statut</th></tr></thead>
          <tbody>
            {liste.map(r => (
              <tr key={r.id} onClick={() => setChoisi(r)} className="cursor-pointer border-t border-border align-top hover:bg-muted/50">
                <td className="py-1.5 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
                <td>{r.structure_nom ?? '—'}</td>
                <td>{libelleTypeRetour(r.type)}</td>
                <td className="max-w-md truncate">{r.message}</td>
                <td>{PRIORITES_RETOUR.find(p => p.id === r.priorite)?.libelle}</td>
                <td>{libelleStatutRetour(r.statut)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {choisi && <Traitement retour={choisi} onFerme={() => setChoisi(null)} onEnregistre={() => { setChoisi(null); charger(); }} />}
    </section>
  );
}

function Traitement({ retour, onFerme, onEnregistre }: { retour: Retour; onFerme: () => void; onEnregistre: () => void }) {
  const [statut, setStatut] = useState<StatutRetour>(retour.statut === 'nouveau' ? 'en_cours' : retour.statut);
  const [priorite, setPriorite] = useState<PrioriteRetour>(retour.priorite);
  const [reponse, setReponse] = useState(retour.reponse ?? '');
  const [busy, setBusy] = useState(false);
  async function enregistrer() {
    setBusy(true);
    const { error } = await rpcPlateforme<null>('plateforme_retour_traiter', { _id: retour.id, _statut: statut, _priorite: priorite, _reponse: reponse });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success('Retour mis à jour'); onEnregistre(); }
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3" aria-label="Traitement du retour">
      <div className="text-xs text-muted-foreground">
        {new Date(retour.created_at).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar' })} · {retour.auteur_email ?? 'compte supprimé'} · {retour.structure_nom ?? 'sans structure'}
        {retour.roles.length ? ` · ${retour.roles.join(', ')}` : ''} · page {retour.page ?? '—'}
      </div>
      <p className="whitespace-pre-wrap text-sm">{retour.message}</p>
      <div className="text-[11px] text-muted-foreground">{Object.entries(retour.contexte ?? {}).map(([k, v]) => `${k} : ${v}`).join(' · ')}</div>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs">Statut
          <select value={statut} onChange={e => setStatut(e.target.value as StatutRetour)} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">
            {STATUTS_RETOUR.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </select>
        </label>
        <label className="text-xs">Priorité
          <select value={priorite} onChange={e => setPriorite(e.target.value as PrioriteRetour)} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">
            {PRIORITES_RETOUR.map(p => <option key={p.id} value={p.id}>{p.libelle}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-xs">Réponse visible par l'auteur
        <Textarea rows={3} maxLength={4000} value={reponse} onChange={e => setReponse(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button onClick={enregistrer} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button>
        <Button variant="outline" onClick={onFerme}>Fermer</Button>
      </div>
    </div>
  );
}
