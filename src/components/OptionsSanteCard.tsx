import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fmt } from '@/lib/accounting';

const LIMITES: Record<string, string> = {
  praticiens: 'Praticiens', patients_actifs: 'Patients actifs', analyses_mois: 'Analyses / mois', stockage_go: 'Stockage (Go)',
};
const MODULE_OPTION: Record<string, string> = { option_clinique: 'sante_clinique', option_laboratoire: 'sante_laboratoire' };

type Addon = { id: string; code: string; nom: string; prix_fcfa: number; periodicite: string; limites: Record<string, number> };

/** Options santé (add-ons) : visibles seulement pour une entreprise au secteur santé. */
export default function OptionsSanteCard({ entrepriseId }: { entrepriseId: string }) {
  const [secteur, setSecteur] = useState<string | null>(null);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [actifs, setActifs] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: e } = await supabase.from('entreprises').select('secteur_activite').eq('id', entrepriseId).maybeSingle();
      setSecteur(e?.secteur_activite ?? null);
      if (!e?.secteur_activite?.startsWith('sante_')) return;
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('plans_abonnement').select('id, code, nom, prix_fcfa, periodicite, limites').eq('type_plan', 'addon').eq('actif', true).order('ordre'),
        supabase.from('entreprise_modules').select('module, actif').eq('entreprise_id', entrepriseId),
      ]);
      setAddons((p ?? []) as Addon[]);
      setActifs(new Set((m ?? []).filter(x => x.actif).map(x => x.module)));
    })();
  }, [entrepriseId]);

  if (!secteur?.startsWith('sante_') || addons.length === 0) return null;

  return (
    <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
      <div className="text-xs font-bold text-primary mb-3">Options santé</div>
      <div className="grid gap-3 md:grid-cols-2">
        {addons.map(a => {
          const actif = actifs.has(MODULE_OPTION[a.code]);
          return (
            <div key={a.id} className="border border-border rounded-md p-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm">{a.nom}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded border ${actif ? 'border-primary text-primary' : 'border-border text-fg3'}`}>{actif ? 'Active' : 'Non souscrite'}</span>
              </div>
              <div className="text-primary font-serif text-lg mt-1">{fmt(a.prix_fcfa)} <span className="text-xs text-fg3">F/{a.periodicite}</span></div>
              <ul className="mt-2 text-[11px] text-fg2 space-y-0.5">
                {Object.entries(a.limites).map(([k, v]) => <li key={k}>• {LIMITES[k] ?? k} : 0 / {v === -1 ? '∞' : v}</li>)}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-fg3 mt-2">Activation sur demande auprès de GROW HUB (paiement en ligne non disponible).</p>
    </div>
  );
}
