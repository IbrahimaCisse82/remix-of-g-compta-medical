import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { calc, calculateActif, CR, PASSIF, fmt } from '@/lib/accounting';
import { enregistrerLignesJournal } from '@/lib/ecritures';
import {
  analyserCsv, analyserLignesPositionnees, decoderTexte, controlerBalance, ecarterSousTotaux, ecrituresDeReprise, lignesPdf,
  versBalanceApplication, type ControleImport, type LigneBalanceImport,
} from '@/lib/import-balance';

interface Analyse { lignes: LigneBalanceImport[]; ecartes: LigneBalanceImport[]; controles: ControleImport[]; dejaSaisies: number }

/** Reprise d'une balance (PDF Sage « Balance des comptes » ou CSV) dans l'exercice ouvert. */
export default function ImportBalance() {
  const { entreprise, exercice, rafraichirComptabilite } = useApp();
  const fichier = useRef<HTMLInputElement>(null);
  const [nom, setNom] = useState('');
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [enCours, setEnCours] = useState(false);

  const lire = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !exercice) return;
    setNom(f.name); setAnalyse(null); setEnCours(true);
    try {
      const brut = /\.pdf$/i.test(f.name) ? analyserLignesPositionnees(await lignesPdf(await f.arrayBuffer())) : analyserCsv(decoderTexte(await f.arrayBuffer()));
      const { lignes, ecartes } = ecarterSousTotaux(brut);
      const { controles } = controlerBalance(lignes);
      const { count } = await supabase.from('ecritures').select('id', { count: 'exact', head: true })
        .eq('exercice_id', exercice.id).neq('statut', 'annulee');
      const dejaSaisies = count ?? 0;
      controles.push({ ok: dejaSaisies === 0, message: dejaSaisies ? `L'exercice ${exercice.annee} contient déjà ${dejaSaisies} écriture(s) : la reprise se fait dans un exercice vide` : `Exercice ${exercice.annee} vide`, bloquant: true });
      setAnalyse({ lignes, ecartes, controles, dejaSaisies });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fichier illisible');
    } finally { setEnCours(false); }
  };

  const importer = async () => {
    if (!analyse || !entreprise || !exercice) return;
    setEnCours(true);
    try {
      const { aNouveaux, mouvements } = ecrituresDeReprise(analyse.lignes);
      const base = { entreprise_id: entreprise.id, exercice_id: exercice.id };
      // Pièces propres à l'exercice (une reprise par exercice) ; vérifiées avant toute écriture
      // pour ne jamais laisser une reprise à moitié faite.
      const pieces = { an: `REPRISE-AN-${exercice.annee}`, od: `REPRISE-BAL-${exercice.annee}` };
      const { count } = await supabase.from('ecritures').select('id', { count: 'exact', head: true })
        .eq('exercice_id', exercice.id).neq('statut', 'annulee');
      if (count) throw new Error(`L'exercice ${exercice.annee} contient déjà ${count} écriture(s)`);
      if (aNouveaux.length) await enregistrerLignesJournal(aNouveaux.map(l => ({ ...base, ...l, journal_code: 'AN' as const, date_ecriture: exercice.date_debut, piece: pieces.an })), { origine: 'import' });
      if (mouvements.length) await enregistrerLignesJournal(mouvements.map(l => ({ ...base, ...l, journal_code: 'OD' as const, date_ecriture: exercice.date_fin, piece: pieces.od })), { origine: 'import' });
      toast.success(`Balance reprise : ${analyse.lignes.length} comptes`);
      setAnalyse(null); setNom('');
      await rafraichirComptabilite();
    } catch (err) {
      toast.error(`Reprise refusée : ${err instanceof Error ? err.message : err}`);
    } finally { setEnCours(false); }
  };

  const bloque = !analyse || analyse.controles.some(c => c.bloquant && !c.ok);
  const apercu = analyse ? (() => {
    const b = versBalanceApplication(analyse.lignes);
    return { actif: calculateActif(b).net.BZ ?? 0, passif: calc(b, PASSIF).DZ ?? 0, ca: calc(b, CR).XB ?? 0, resultat: calc(b, CR).XI ?? 0 };
  })() : null;

  return (
    <div className="bg-bg2 border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-bold text-primary">📒 Reprendre une balance des comptes</h3>
      <p className="text-[11px] text-fg2">
        PDF « Balance des comptes » de Sage 100 (colonnes ouverture, mouvements, soldes), export texte Sage (.txt) ou CSV avec les colonnes Compte, Intitulé et 2, 4 ou 6 colonnes Débit / Crédit.
        Les soldes d’ouverture deviennent les à-nouveaux (journal AN au {exercice?.date_debut}) et les mouvements une écriture d’opérations diverses (journal OD au {exercice?.date_fin}).
      </p>
      <div className="flex items-center gap-3">
        <input ref={fichier} type="file" accept=".pdf,.csv,.tsv,.txt" onChange={lire} className="hidden" />
        <button onClick={() => fichier.current?.click()} disabled={enCours} className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {enCours ? '⏳ Lecture…' : '📁 Sélectionner la balance'}
        </button>
        {nom && <span className="text-[11px] text-fg2 font-mono">{nom}</span>}
      </div>

      {analyse && apercu && (
        <div className="space-y-3">
          <ul className="text-[11px] space-y-1">
            {analyse.controles.map((c, i) => <li key={i} className={c.ok ? 'text-success' : 'text-destructive'}>{c.ok ? '✓' : '✗'} {c.message}</li>)}
            {analyse.ecartes.length > 0 && <li className="text-fg3">Sous-totaux du fichier écartés : {analyse.ecartes.map(e => `${e.compte} ${e.intitule}`).join(', ')}</li>}
          </ul>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="bg-bg3 rounded p-2">Total actif<div className="font-mono font-bold">{fmt(apercu.actif)}</div></div>
            <div className="bg-bg3 rounded p-2">Total passif<div className="font-mono font-bold">{fmt(apercu.passif)}</div></div>
            <div className="bg-bg3 rounded p-2">Chiffre d’affaires<div className="font-mono font-bold">{fmt(apercu.ca)}</div></div>
            <div className="bg-bg3 rounded p-2">Résultat net<div className="font-mono font-bold">{fmt(apercu.resultat)}</div></div>
          </div>
          <div className="max-h-[360px] overflow-auto border border-border rounded">
            <table className="w-full border-collapse text-[10px]">
              <thead><tr className="bg-bg3">
                {['Compte', 'Intitulé', 'Ouverture', 'Mvt débit', 'Mvt crédit', 'Solde'].map(h => <th key={h} className="px-2 py-1 text-left border-b border-border">{h}</th>)}
              </tr></thead>
              <tbody>
                {analyse.lignes.map(l => (
                  <tr key={l.compte}>
                    <td className="px-2 py-0.5 font-mono">{l.compte}</td><td className="px-2 py-0.5">{l.intitule}</td>
                    <td className="px-2 py-0.5 text-right font-mono">{fmt(l.ouvD - l.ouvC)}</td>
                    <td className="px-2 py-0.5 text-right font-mono">{fmt(l.mvtD)}</td><td className="px-2 py-0.5 text-right font-mono">{fmt(l.mvtC)}</td>
                    <td className="px-2 py-0.5 text-right font-mono">{fmt(l.solD - l.solC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={importer} disabled={bloque || enCours} className="px-4 py-2 rounded-lg text-sm font-bold bg-success text-success-foreground hover:bg-success/90 disabled:opacity-50">
            {enCours ? '⏳ Reprise en cours…' : `✅ Reprendre la balance (${analyse.lignes.length} comptes)`}
          </button>
        </div>
      )}
    </div>
  );
}
