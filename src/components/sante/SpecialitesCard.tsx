import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SPECIALITES } from '@/domain/sante/specialites';
import { couvertureCim10, definirSpecialites, lireSpecialitesStructure, type Couverture } from './specialites-client';

/** Choix des spécialités (création de la structure ou Structure & équipe). */
export function ChoixSpecialites({ valeur, onChange, disabled }: { valeur: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {SPECIALITES.map(s => {
        const coche = valeur.includes(s.id);
        return (
          <label key={s.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${coche ? 'border-primary bg-primary/10' : 'border-border'}`}>
            <input type="checkbox" disabled={disabled} checked={coche} onChange={() => onChange(coche ? valeur.filter(v => v !== s.id) : [...valeur, s.id])} />
            {s.libelle}
          </label>
        );
      })}
    </div>
  );
}

/** Carte « Spécialités et CIM-10 » de Structure & équipe (administrateur). */
export default function SpecialitesCard({ structureId }: { structureId: string }) {
  const [choix, setChoix] = useState<string[] | null>(null);
  const [initial, setInitial] = useState<string[]>([]);
  const [couverture, setCouverture] = useState<Couverture[]>([]);
  const [busy, setBusy] = useState(false);
  const charger = useCallback(async () => {
    const s = await lireSpecialitesStructure(structureId);
    setChoix(s); setInitial(s ?? []);
    const c = await couvertureCim10(structureId);
    setCouverture(c.error ? [] : c.data ?? []);
  }, [structureId]);
  useEffect(() => { void charger(); }, [charger]);
  if (choix === null) return null;

  const modifie = choix.length !== initial.length || choix.some(c => !initial.includes(c));
  const enregistrer = async () => {
    setBusy(true);
    const { error } = await definirSpecialites(structureId, choix);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Spécialités enregistrées'); await charger();
  };
  const total = couverture.reduce((t, c) => Math.max(t, Number(c.codes)), 0);
  return (
    <section className="border border-border bg-bg2 rounded-md p-5 mt-8" aria-labelledby="titre-specialites">
      <h2 id="titre-specialites" className="font-semibold mb-1">Spécialités et codes CIM-10</h2>
      <p className="text-xs text-fg3 mb-3">Les spécialités choisies déterminent les codes CIM-10 proposés en consultation. Chaque praticien peut avoir sa propre spécialité (Catalogue → Praticiens) ; à défaut, ce sont celles de la structure. Médecine générale, pédiatrie et urgences donnent accès à toute la classification.</p>
      <ChoixSpecialites valeur={choix} onChange={setChoix} disabled={busy} />
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <p className="text-xs text-fg2">{couverture.length === 0 ? 'Aucune spécialité enregistrée : toute la CIM-10 est proposée.'
          : total === 0 ? 'Le référentiel CIM-10 n’est pas encore chargé : les codes apparaîtront dès son chargement.'
          : couverture.map(c => `${c.libelle} : ${Number(c.codes).toLocaleString('fr-FR')} codes`).join(' · ')}</p>
        <Button disabled={busy || !modifie} onClick={enregistrer}>Enregistrer</Button>
      </div>
    </section>
  );
}
