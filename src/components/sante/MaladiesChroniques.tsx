import { useCallback, useEffect, useState } from 'react';
import { HeartPulse, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { confirmer } from '@/components/Confirmation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import RechercheCim10 from './RechercheCim10';
import { changerStatutChronique, chercherCim10Patient, declarerChronique, lireChroniques, type MaladieChronique } from './cim10-client';
import type { Cim10 } from './cim10-client';

/** Maladies chroniques du patient (affections au long cours) : déclarées par le médecin, actives ou résolues. */
export default function MaladiesChroniques({ patientId, medecin }: { patientId: string; medecin: boolean }) {
  const [liste, setListe] = useState<MaladieChronique[] | null>(null);
  const [ajout, setAjout] = useState(false);
  const [choix, setChoix] = useState<Cim10 | null>(null);
  const [libre, setLibre] = useState('');
  const [depuis, setDepuis] = useState('');
  const charger = useCallback(async () => setListe(await lireChroniques(patientId)), [patientId]);
  const rechercherPatient = useCallback((q: string) => chercherCim10Patient(patientId, q), [patientId]);
  useEffect(() => { void charger(); }, [charger]);
  if (liste === null) return null; // fonction absente ou accès refusé : rien à montrer

  const enregistrer = async () => {
    if (!choix && libre.trim().length < 2) return toast.error('Choisissez un code CIM-10 ou saisissez le libellé.');
    const { error } = await declarerChronique({ patientId, code: choix?.code, libelle: choix ? null : libre.trim(), depuis: depuis || null });
    if (error) return toast.error(error.message);
    setAjout(false); setChoix(null); setLibre(''); setDepuis('');
    await charger();
  };
  const basculer = async (m: MaladieChronique) => {
    const cible = m.statut === 'active' ? 'resolue' : 'active';
    if (cible === 'resolue' && !(await confirmer(`Marquer « ${m.libelle} » comme résolue ?`))) return;
    const { error } = await changerStatutChronique(m.id, cible);
    if (error) return toast.error(error.message);
    await charger();
  };
  const actives = liste.filter(m => m.statut === 'active'), resolues = liste.filter(m => m.statut === 'resolue');

  return (
    <section className="border border-border bg-bg2 rounded-md p-4" aria-labelledby="titre-chroniques">
      <div className="flex justify-between items-center gap-2 mb-2">
        <h2 id="titre-chroniques" className="font-semibold flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" />Maladies chroniques</h2>
        {medecin && !ajout && <Button size="sm" variant="outline" onClick={() => setAjout(true)}><Plus />Ajouter</Button>}
      </div>
      {actives.length === 0 && !ajout && <p className="text-sm text-fg3">Aucune maladie chronique déclarée.</p>}
      {actives.length > 0 && <ul className="flex flex-wrap gap-2">{actives.map(m => (
        <li key={m.id} className="border border-primary/40 rounded-md px-2 py-1 text-sm flex items-center gap-2">
          {m.code && <span className="font-mono text-xs text-primary">{m.code}</span>}
          <span>{m.libelle}</span>
          {m.depuis && <span className="text-xs text-fg3">depuis {new Date(`${m.depuis}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'short', year: 'numeric' })}</span>}
          {medecin && <button type="button" className="text-xs text-fg3 underline" onClick={() => basculer(m)}>marquer résolue</button>}
        </li>
      ))}</ul>}
      {ajout && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {choix ? <p className="text-sm"><span className="font-mono text-xs text-primary mr-2">{choix.code}</span>{choix.libelle} <Button size="sm" variant="ghost" onClick={() => setChoix(null)}>Changer</Button></p> : (
            <div className="grid sm:grid-cols-2 gap-2">
              <div><Label className="text-xs">Code CIM-10</Label><RechercheCim10 rechercher={rechercherPatient} onChoisir={setChoix} placeholder="Codes de votre spécialité" /></div>
              <div><Label htmlFor="chron-libre" className="text-xs">ou libellé libre</Label><Input id="chron-libre" maxLength={300} value={libre} onChange={e => setLibre(e.target.value)} /></div>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div><Label htmlFor="chron-depuis" className="text-xs">Depuis (facultatif)</Label><Input id="chron-depuis" type="date" max={new Date().toISOString().slice(0, 10)} value={depuis} onChange={e => setDepuis(e.target.value)} /></div>
            <Button onClick={enregistrer}>Enregistrer</Button>
            <Button variant="ghost" onClick={() => { setAjout(false); setChoix(null); setLibre(''); }}>Annuler</Button>
          </div>
        </div>
      )}
      {resolues.length > 0 && <details className="mt-3 text-sm"><summary className="text-xs text-fg3 cursor-pointer">Résolues ({resolues.length})</summary>
        <ul className="mt-1 space-y-1">{resolues.map(m => <li key={m.id} className="text-fg2">{m.code && <span className="font-mono text-xs mr-2">{m.code}</span>}{m.libelle}{medecin && <button type="button" className="ml-2 text-xs underline" onClick={() => basculer(m)}>réactiver</button>}</li>)}</ul>
      </details>}
    </section>
  );
}
