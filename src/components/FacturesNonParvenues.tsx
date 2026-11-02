import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { fmt } from '@/lib/accounting';

interface Ligne {
  commande_ligne_id: string; commande: string; fournisseur: string; designation: string; nature: string; compte: string;
  quantite: number; prix_unitaire: number; montant_ht: number; tva_deductible: number; tva_non_deductible: number; derniere_reception: string;
}

/**
 * Réceptions de commandes non couvertes par une facture comptabilisée à la date de clôture : constatation en charges
 * (ou immobilisations) par la pièce FNP-<année> au crédit du 4081, TVA récupérable en 4455, et extourne au premier
 * jour de l'exercice suivant (FNP-<année>-EXT), le tout par fn_constater_fnp / fn_extourner_fnp.
 */
export default function FacturesNonParvenues() {
  const { exercice, exercices, rafraichirComptabilite } = useApp();
  const { canWrite } = useUserRole();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [constatee, setConstatee] = useState(false);

  const charger = useCallback(async () => {
    if (!exercice) return;
    const { data, error } = await supabase.rpc('fn_receptions_non_facturees' as any, { _exercice_id: exercice.id });
    const { data: e } = await (supabase.from('ecritures') as any).select('id').eq('exercice_id', exercice.id)
      .eq('piece', `FNP-${exercice.annee}`).eq('origine', 'fnp').is('contrepasse_par', null).limit(1);
    setConstatee(!!e?.length);
    if (error) { setLignes([]); return; }
    setLignes(((data ?? []) as any[]).map(l => ({ ...l, quantite: Number(l.quantite), prix_unitaire: Number(l.prix_unitaire),
      montant_ht: Number(l.montant_ht), tva_deductible: Number(l.tva_deductible), tva_non_deductible: Number(l.tva_non_deductible) })));
  }, [exercice]);
  useEffect(() => { void charger(); }, [charger]);

  if (!exercice || exercice.statut === 'cloture') return null;
  const piece = `FNP-${exercice.annee}`;
  const suivant = exercices.find(e => e.annee === exercice.annee + 1);
  if (!lignes.length && !constatee) return null;
  const total = lignes.reduce((s, l) => s + l.montant_ht + l.tva_deductible + l.tva_non_deductible, 0);

  const executer = async (fn: 'fn_constater_fnp' | 'fn_extourner_fnp') => {
    setEnCours(true);
    try {
      const { data, error } = await supabase.rpc(fn as any, { _exercice_id: exercice.id });
      if (error) throw new Error(error.message);
      const r = data as { total?: number; extourne?: string | null; motif?: string };
      if (fn === 'fn_constater_fnp') {
        toast.success(r.total ? `Pièce ${piece} passée au journal AC : ${fmt(r.total)} au crédit du 4081${r.extourne ? ', extourne au 1er jour de l’exercice suivant' : ''}` : 'Rien à constater');
      } else toast.success(r.extourne ? `Extourne ${piece}-EXT passée sur l’exercice ${exercice.annee + 1}` : (r.motif ?? 'Rien à extourner'));
      await rafraichirComptabilite(); await charger();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Opération refusée'); } finally { setEnCours(false); }
  };

  return (
    <div className="bg-bg2 border border-warning/40 rounded-lg p-4 mb-4 space-y-3">
      <div className="font-bold text-sm text-warning">📦 Factures non parvenues au {exercice.date_fin.split('-').reverse().join('/')}</div>
      <p className="text-[10px] text-fg3">Marchandises et services reçus sur bon de commande, sans facture comptabilisée à la date de clôture. Valorisés au prix commandé ; à constater avant la clôture (débit des comptes d’achat, TVA récupérable en 4455, crédit 4081), puis extournés au premier jour de l’exercice suivant.</p>
      {lignes.length > 0 && (
        <table className="w-full text-[11px]">
          <thead className="text-fg3 text-[10px] uppercase"><tr><th className="text-left p-1">Commande</th><th className="text-left p-1">Fournisseur</th><th className="text-left p-1">Désignation</th><th className="text-left p-1">Compte</th><th className="text-right p-1">Qté</th><th className="text-right p-1">HT</th><th className="text-right p-1">TVA</th><th className="text-left p-1">Reçu le</th></tr></thead>
          <tbody>{lignes.map(l => (
            <tr key={l.commande_ligne_id} className="border-t border-border">
              <td className="p-1 font-mono">{l.commande}</td><td className="p-1">{l.fournisseur}</td><td className="p-1">{l.designation}</td>
              <td className="p-1 font-mono">{l.compte}</td><td className="p-1 text-right">{l.quantite}</td>
              <td className="p-1 text-right font-mono">{fmt(l.montant_ht)}</td><td className="p-1 text-right font-mono">{fmt(l.tva_deductible + l.tva_non_deductible)}</td>
              <td className="p-1">{l.derniere_reception}</td>
            </tr>))}</tbody>
          <tfoot><tr className="border-t border-border font-bold"><td colSpan={5} className="p-1 text-right">Total TTC à porter au 4081</td><td colSpan={2} className="p-1 text-right font-mono">{fmt(total)}</td><td /></tr></tfoot>
        </table>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2 items-center">
          {!constatee && <button onClick={() => void executer('fn_constater_fnp')} disabled={enCours || !lignes.length} className="px-4 py-1.5 rounded text-[11px] font-bold bg-warning text-warning-foreground disabled:opacity-40">{enCours ? 'Enregistrement…' : `Constater (pièce ${piece})`}</button>}
          {constatee && <span className="text-[11px] text-success">Pièce {piece} passée. Pour recalculer : contre-passez-la depuis le journal.</span>}
          {constatee && suivant && <button onClick={() => void executer('fn_extourner_fnp')} disabled={enCours} className="px-3 py-1.5 rounded text-[11px] border border-border hover:bg-bg3">Extourner sur {suivant.annee} (si pas encore fait)</button>}
          {constatee && !suivant && <span className="text-[10px] text-fg3">L’extourne sera passée depuis ce panneau une fois l’exercice {exercice.annee + 1} créé.</span>}
        </div>
      )}
    </div>
  );
}
