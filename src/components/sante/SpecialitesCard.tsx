import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SPECIALITES } from '@/domain/sante/specialites';
import { couvertureCim10, definirSpecialites, lireSpecialitesStructure, type Couverture } from './specialites-client';
import CodesCim10Structure from './CodesCim10Structure';
import { definirModeCim10, modeCim10, statistiquesCim10, type ModeCim10 } from './cim10-client';

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
  const [mode, setMode] = useState<ModeCim10 | null>(null);
  const [stats, setStats] = useState<{ codages: number; hors_specialite: number } | null>(null);
  const charger = useCallback(async () => {
    const s = await lireSpecialitesStructure(structureId);
    setChoix(s); setInitial(s ?? []);
    const c = await couvertureCim10(structureId);
    setCouverture(c.error ? [] : c.data ?? []);
    const [m, st] = await Promise.all([modeCim10(structureId), statistiquesCim10(structureId)]);
    setMode(m.error ? null : m.data); setStats(st.error ? null : st.data?.[0] ?? null);
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
  const changerMode = async (m: ModeCim10) => {
    const { error } = await definirModeCim10(structureId, m);
    if (error) return toast.error(error.message);
    setMode(m); toast.success(m === 'strict' ? 'Mode strict : seuls les codes de la spécialité' : 'Mode recommandé');
  };
  const total = couverture.reduce((t, c) => Math.max(t, Number(c.codes)), 0);
  return (
    <section className="border border-border bg-bg2 rounded-md p-5 mt-8" aria-labelledby="titre-specialites">
      <h2 id="titre-specialites" className="font-semibold mb-1">Spécialités et codes CIM-10</h2>
      <p className="text-xs text-fg3 mb-3">Les spécialités choisies déterminent les codes CIM-10 proposés aux médecins. Un praticien dont la spécialité est renseignée (Catalogue → Praticiens) se voit proposer ceux de sa spécialité. Médecine générale, pédiatrie et urgences donnent accès à toute la classification.</p>
      <ChoixSpecialites valeur={choix} onChange={setChoix} disabled={busy} />
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <p className="text-xs text-fg2">{couverture.length === 0 ? 'Aucune spécialité enregistrée : toute la CIM-10 est proposée.'
          : total === 0 ? 'Le référentiel CIM-10 n’est pas encore chargé : les codes apparaîtront dès son chargement.'
          : couverture.map(c => `${c.libelle} : ${Number(c.codes).toLocaleString('fr-FR')} codes`).join(' · ')}</p>
        <Button disabled={busy || !modifie} onClick={enregistrer}>Enregistrer</Button>
      </div>
      {mode && <fieldset className="mt-4 border-t border-border pt-3 space-y-2 text-sm">
        <legend className="font-semibold text-sm">Codes proposés aux médecins</legend>
        <label className="flex items-start gap-2"><input type="radio" name="mode-cim10" checked={mode === 'recommande'} onChange={() => changerMode('recommande')} className="mt-1" />
          <span><b>Recommandé</b> — codes de la spécialité, plus symptômes, motifs de recours et pathologies fréquentes (paludisme, HTA, diabète, VIH, drépanocytose, anémies, tuberculose). Un autre code reste possible ; il est marqué « hors spécialité ».</span></label>
        <label className="flex items-start gap-2"><input type="radio" name="mode-cim10" checked={mode === 'strict'} onChange={() => changerMode('strict')} className="mt-1" />
          <span><b>Strict</b> — uniquement les codes de la spécialité.</span></label>
        {stats && Number(stats.codages) > 0 && <p className="text-xs text-fg2">Sur 90 jours : {Number(stats.codages).toLocaleString('fr-FR')} diagnostics codés, dont {Number(stats.hors_specialite).toLocaleString('fr-FR')} hors spécialité ({Math.round(100 * Number(stats.hors_specialite) / Number(stats.codages))} %).</p>}
      </fieldset>}
      <CodesCim10Structure structureId={structureId} />
    </section>
  );
}
