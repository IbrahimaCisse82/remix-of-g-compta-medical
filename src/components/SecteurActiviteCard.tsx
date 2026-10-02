import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SECTEURS = [
  { v: 'general', l: 'Général (comptabilité seule)' },
  { v: 'sante_clinique', l: 'Santé — Clinique / cabinet médical' },
  { v: 'sante_laboratoire', l: 'Santé — Laboratoire' },
  { v: 'sante_mixte', l: 'Santé — Mixte' },
];

const LIBELLES: Record<string, string> = {
  sante_patients: 'Dossier patient', sante_clinique: 'Clinique', sante_laboratoire: 'Laboratoire',
  sante_tiers_payant: 'Tiers-payant', sante_portail_resultats: 'Portail résultats',
};

export default function SecteurActiviteCard({ entrepriseId, disabled }: { entrepriseId: string; disabled?: boolean }) {
  const [secteur, setSecteur] = useState('general');
  const [modules, setModules] = useState<{ module: string; actif: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: e } = await supabase.from('entreprises').select('secteur_activite').eq('id', entrepriseId).maybeSingle();
    if (e) setSecteur(e.secteur_activite);
    const { data: m } = await supabase.from('entreprise_modules').select('module, actif').eq('entreprise_id', entrepriseId);
    setModules(m ?? []);
  };
  useEffect(() => { load(); }, [entrepriseId]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('set_secteur_activite', { _entreprise_id: entrepriseId, _secteur: secteur });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Secteur d'activité enregistré");
    load();
  };

  return (
    <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
      <div className="text-xs font-bold text-primary mb-3">Secteur d'activité</div>
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="Secteur d'activité" value={secteur} disabled={disabled} onChange={e => setSecteur(e.target.value)}
          className="bg-bg3 border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground">
          {SECTEURS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        {!disabled && <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50">Enregistrer</button>}
      </div>
      {modules.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {modules.map(m => (
            <span key={m.module} className={`text-[10px] px-2 py-0.5 rounded border ${m.actif ? 'border-primary text-primary' : 'border-border text-fg3'}`}>
              {LIBELLES[m.module] ?? m.module} — {m.actif ? 'actif' : 'en attente d\'activation'}
            </span>
          ))}
        </div>
      )}
      <p className="text-[10px] text-fg3 mt-2">Les modules santé s'activent après souscription à l'option Clinique ou Laboratoire.</p>
    </div>
  );
}
