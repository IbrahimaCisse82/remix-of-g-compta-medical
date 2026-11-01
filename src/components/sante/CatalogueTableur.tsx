import { useRef, useState } from 'react';
import { CheckCheck, Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { construireModele, lireFichier, type Analyse } from '@/domain/sante/catalogue-import';

/**
 * Saisie en masse du catalogue par le biologiste : modèle tableur pré-rempli, import contrôlé (tout ou rien),
 * puis activation des analyses complètes. Le serveur refait tous les contrôles.
 */
export default function CatalogueTableur({ structureId, analyses, completesInactives, onDone }: {
  structureId: string;
  analyses: { id: string; code: string }[];
  completesInactives: { id: string; code: string }[];
  onDone: () => void;
}) {
  const fichier = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<(Analyse & { nom: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [activer, setActiver] = useState(false);

  const telecharger = async () => {
    setBusy(true);
    try {
      const ids = analyses.map(a => a.id);
      const [a, p] = await Promise.all([
        supabase.from('sante_analyses').select('id, code, libelle, section, tube, echantillon, delai_heures, jeune, sensible').eq('structure_id', structureId),
        supabase.from('sante_analyse_parametres').select('id, analyse_id, code, libelle, unite, type, decimales, ordre').eq('structure_id', structureId),
      ]);
      if (a.error || p.error) throw a.error ?? p.error;
      const r = ids.length ? await supabase.from('sante_valeurs_reference').select('parametre_id, sexe, age_min_jours, age_max_jours, bas, haut, critique_bas, critique_haut').eq('structure_id', structureId) : { data: [], error: null };
      if (r.error) throw r.error;
      const csv = construireModele(a.data ?? [], p.data ?? [], (r.data ?? []).map(x => ({ ...x, bas: x.bas == null ? null : Number(x.bas), haut: x.haut == null ? null : Number(x.haut), critique_bas: x.critique_bas == null ? null : Number(x.critique_bas), critique_haut: x.critique_haut == null ? null : Number(x.critique_haut) })));
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const lien = document.createElement('a'); lien.href = url; lien.download = `catalogue-references-${new Date().toISOString().slice(0, 10)}.csv`; lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('Modèle téléchargé : complétez-le dans Excel puis réimportez-le ici.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Téléchargement impossible.'); }
    finally { setBusy(false); }
  };

  const lire = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = lireFichier(await f.text(), analyses.map(a => a.code));
      setApercu({ ...r, nom: f.name });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fichier illisible.'); }
    finally { if (fichier.current) fichier.current.value = ''; }
  };

  const importer = async () => {
    if (!apercu || apercu.erreurs.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('sante_catalogue_importer_references', { _structure_id: structureId, _lignes: apercu.lignes });
    setBusy(false);
    if (error) return void toast.error(error.message);
    const r = data as { analyses: number; parametres: number; references: number };
    toast.success(`Import terminé : ${r.analyses} analyse(s), ${r.parametres} paramètre(s), ${r.references} valeur(s) de référence. Vérifiez puis activez les analyses.`);
    setApercu(null); onDone();
  };

  const activerCompletes = async () => {
    setActiver(false);
    if (!completesInactives.length) return;
    setBusy(true);
    const { error } = await supabase.from('sante_analyses').update({ actif: true }).in('id', completesInactives.map(a => a.id));
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(`${completesInactives.length} analyse(s) activée(s) : elles peuvent maintenant être prescrites.`);
    onDone();
  };

  return (
    <div className="border border-border rounded-md p-3 space-y-2">
      <p className="text-sm font-medium">Saisie en masse (tableur)</p>
      <p className="text-xs text-fg3">Téléchargez le modèle pré-rempli avec vos analyses, complétez dans Excel les paramètres, unités et valeurs de référence (une ligne par valeur), puis importez-le. L'import est entièrement annulé si une seule ligne est refusée, et peut être relancé sans créer de doublons. Il n'active aucune analyse.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void telecharger()}><Download />Télécharger le modèle</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => fichier.current?.click()}><FileUp />Importer le fichier rempli</Button>
        <input ref={fichier} type="file" accept=".csv,text/csv" className="hidden" aria-label="Fichier tableur rempli" onChange={e => void lire(e.target.files?.[0])} />
        <Button size="sm" disabled={busy || !completesInactives.length} onClick={() => setActiver(true)}><CheckCheck />Activer les analyses complètes ({completesInactives.length})</Button>
      </div>
      {apercu && (
        <div className="border-t border-border pt-2 text-sm space-y-2">
          <p><strong>{apercu.nom}</strong> : {apercu.lignes.length} ligne(s) lue(s) — {apercu.analyses} analyse(s), {apercu.parametres} paramètre(s), {apercu.references} valeur(s) de référence.</p>
          {apercu.erreurs.length > 0 ? <>
            <p className="text-destructive">{apercu.erreurs.length} erreur(s) à corriger dans le fichier avant l'import :</p>
            <ul className="text-xs text-destructive list-disc pl-5 max-h-40 overflow-y-auto">{apercu.erreurs.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}</ul>
            {apercu.erreurs.length > 50 && <p className="text-xs text-fg3">… et {apercu.erreurs.length - 50} autre(s).</p>}
          </> : <p className="text-primary">Aucune erreur détectée.</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || apercu.erreurs.length > 0 || !apercu.lignes.length} onClick={() => void importer()}>{busy ? 'Import…' : 'Confirmer l’import'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setApercu(null)}>Annuler</Button>
          </div>
        </div>
      )}
      <AlertDialog open={activer} onOpenChange={setActiver}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activer {completesInactives.length} analyse(s) ?</AlertDialogTitle>
            <AlertDialogDescription>Ces analyses ont au moins un paramètre mesuré. Une fois activées, elles peuvent être prescrites et facturées. Confirmez que leurs paramètres, unités et valeurs de référence ont été vérifiés par le biologiste.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void activerCompletes()}>Oui, vérifiées : activer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
