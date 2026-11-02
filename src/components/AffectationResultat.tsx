import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { lignesAffectation, reserveLegaleMinimum, type Repartition } from '@/lib/affectation';

const solde = (b: { sfc?: number; sfd?: number }) => (b.sfc || 0) - (b.sfd || 0);

/**
 * Affectation du résultat de l'exercice précédent, porté en 130 (« en instance d'affectation ») par la clôture :
 * saisie de la décision de l'assemblée, contrôlée et comptabilisée par fn_affecter_resultat (pièce AFF-<année>).
 */
export default function AffectationResultat() {
  const { exercice, balance, rafraichirComptabilite } = useApp();
  const situation = useMemo(() => {
    const somme = (re: RegExp) => balance.filter(b => re.test(b.compte)).reduce((s, b) => s + solde(b), 0);
    return {
      resultat: Math.round(somme(/^130/)),
      capital: Math.round(somme(/^10[1-4]/)),
      reserveLegale: Math.round(somme(/^111/)),
      pertesAnterieures: Math.round(-somme(/^129/)),
    };
  }, [balance]);
  const minimum = reserveLegaleMinimum(situation);
  const [r, setR] = useState<Repartition>({ reserveLegale: 0, reservesStatutaires: 0, reservesFacultatives: 0, dividendes: 0, reportANouveau: 0 });
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [enCours, setEnCours] = useState(false);
  if (!exercice || exercice.statut === 'cloture' || situation.resultat === 0) return null;

  const { lignes, erreur } = lignesAffectation(situation, r);
  const proposer = () => setR({ reserveLegale: minimum, reservesStatutaires: 0, reservesFacultatives: 0, dividendes: 0, reportANouveau: situation.resultat - minimum });
  const enregistrer = async () => {
    if (erreur) { toast.error(erreur); return; }
    if (!date || reference.trim().length < 3) { toast.error('Date et référence du procès-verbal de l’assemblée obligatoires'); return; }
    setEnCours(true);
    try {
      const { error } = await supabase.rpc('fn_affecter_resultat' as any, { _exercice_id: exercice.id, _date: date, _lignes: lignes, _reference: reference.trim() });
      if (error) throw new Error(error.message);
      toast.success('Affectation du résultat comptabilisée');
      await rafraichirComptabilite();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Affectation refusée'); } finally { setEnCours(false); }
  };
  const champ = (cle: keyof Repartition, label: string) => (
    <label className="text-[10px] text-fg3 space-y-1 block">{label}
      <input type="number" min="0" value={r[cle] || ''} onChange={e => setR(x => ({ ...x, [cle]: Number(e.target.value) || 0 }))}
        className="w-full bg-bg3 border border-border rounded px-2 py-1 text-[11px] font-mono text-fg" />
    </label>
  );

  return (
    <div className="bg-bg2 border border-accent/40 rounded-lg p-4 mb-4 space-y-3">
      <div className="font-bold text-sm text-accent">⚖️ Affectation du résultat de l’exercice précédent</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
        <div>Résultat en instance (130)<div className={`font-mono font-bold ${situation.resultat >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(situation.resultat)}</div></div>
        <div>Capital<div className="font-mono">{fmt(situation.capital)}</div></div>
        <div>Réserve légale actuelle<div className="font-mono">{fmt(situation.reserveLegale)}</div></div>
        <div>Réserve légale minimum<div className="font-mono font-bold">{fmt(minimum)}</div></div>
      </div>
      {situation.resultat > 0 ? (
        <>
          <p className="text-[10px] text-fg3">Décision de l’assemblée : au moins 10 % du bénéfice (diminué des pertes antérieures) en réserve légale tant qu’elle n’atteint pas le cinquième du capital (AUSCGIE art. 346) ; le solde en réserves, dividendes ou report à nouveau.</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {champ('reserveLegale', 'Réserve légale (111)')}
            {champ('reservesStatutaires', 'Réserves statutaires (112)')}
            {champ('reservesFacultatives', 'Réserves facultatives (1181)')}
            {champ('dividendes', 'Dividendes (465)')}
            {champ('reportANouveau', 'Report à nouveau (121)')}
          </div>
          <button onClick={proposer} className="text-[10px] underline text-primary">Proposer : réserve légale minimum, solde en report à nouveau</button>
        </>
      ) : <p className="text-[11px]">Perte de {fmt(-situation.resultat)} reportée à nouveau (débit 129).</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[10px] text-fg3 space-y-1 block">Date de l’assemblée
          <input type="date" value={date} min={exercice.date_debut} max={exercice.date_fin} onChange={e => setDate(e.target.value)}
            className="block bg-bg3 border border-border rounded px-2 py-1 text-[11px] text-fg" />
        </label>
        <label className="text-[10px] text-fg3 space-y-1 block">Référence du procès-verbal
          <input value={reference} onChange={e => setReference(e.target.value)} placeholder="PV AGO du …"
            className="block bg-bg3 border border-border rounded px-2 py-1 text-[11px] text-fg w-56" />
        </label>
        <button onClick={enregistrer} disabled={enCours || !!erreur} className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40">
          {enCours ? 'Enregistrement…' : 'Comptabiliser l’affectation'}
        </button>
      </div>
      {erreur && situation.resultat > 0 && <p className="text-[10px] text-destructive">{erreur}</p>}
    </div>
  );
}
