import { useCallback, useEffect, useState } from 'react';
import { Archive, BookCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { empreinteCourte, libelleType, TYPES_CONSENTEMENT, verifierModele, versionSuivante, type ModeleConsentement } from '@/domain/sante/consentements-modeles';

/**
 * Bibliothèque des textes de consentement validés (administrateur de la structure, MFA).
 * Un texte enregistré ne se modifie plus : on l'archive et on crée une nouvelle version.
 */
export default function BibliothequeConsentements({ structureId }: { structureId: string }) {
  const [modeles, setModeles] = useState<ModeleConsentement[]>([]);
  const [erreurChargement, setErreurChargement] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ type: 'traitement_donnees', version: 'v1.0', titre: '', texte: '', valide_par: '' });
  const [aArchiver, setAArchiver] = useState<ModeleConsentement | null>(null);
  const [voir, setVoir] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('sante_consentement_modeles')
      .select('id, type, version, titre, texte, texte_sha256, valide_par, actif, created_at, archive_le')
      .eq('structure_id', structureId).order('type').order('created_at', { ascending: false });
    if (error) { setErreurChargement('Impossible de charger la bibliothèque. Vérifiez votre accès puis réessayez.'); return; }
    setErreurChargement(''); setModeles(data ?? []);
  }, [structureId]);
  useEffect(() => { void load(); }, [load]);

  const changerType = (type: string) => setF(x => ({ ...x, type, version: versionSuivante(modeles, type) }));
  const erreurs = verifierModele(f, modeles);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (erreurs.length) return void toast.error(erreurs[0]);
    setBusy(true);
    const { error } = await supabase.rpc('sante_modele_consentement_creer', {
      _structure_id: structureId, _type: f.type, _version: f.version.trim(), _titre: f.titre.trim(), _texte: f.texte, _valide_par: f.valide_par.trim() || undefined,
    });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success('Texte enregistré dans la bibliothèque. Il est maintenant proposé lors de la signature.');
    setOuvert(false); setF({ type: f.type, version: '', titre: '', texte: '', valide_par: '' });
    await load();
  };

  const archiver = async () => {
    if (!aArchiver) return;
    const { error } = await supabase.rpc('sante_modele_consentement_archiver', { _modele_id: aArchiver.id });
    setAArchiver(null);
    if (error) return void toast.error(error.message);
    toast.success('Texte archivé. Les signatures déjà recueillies restent rattachées à cette version.');
    await load();
  };

  const actifs = modeles.filter(m => m.actif);
  const archives = modeles.filter(m => !m.actif);

  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2"><BookCheck className="text-primary" />Bibliothèque des textes de consentement</h3>
        {!ouvert && <Button size="sm" onClick={() => { setOuvert(true); changerType(f.type); }}><Plus />Ajouter un texte validé</Button>}
      </div>
      <p className="text-xs text-fg3">Enregistrez ici une seule fois chaque texte validé par votre juriste ou le responsable de la structure. Le soignant le choisit dans une liste au moment de la signature. Un texte enregistré ne peut plus être modifié : pour le changer, archivez-le et créez une nouvelle version.</p>
      {erreurChargement && <div role="alert" className="text-sm text-destructive flex items-center gap-2">{erreurChargement}<Button size="sm" variant="outline" onClick={() => void load()}>Réessayer</Button></div>}

      {ouvert && (
        <form onSubmit={enregistrer} className="border border-border rounded-md p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div><Label htmlFor="modele-type">Type</Label>
              <Select value={f.type} onValueChange={changerType}><SelectTrigger id="modele-type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES_CONSENTEMENT.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="modele-version">Version</Label><Input id="modele-version" value={f.version} onChange={e => setF({ ...f, version: e.target.value })} placeholder="v1.0" /></div>
            <div><Label htmlFor="modele-valide">Validé par (facultatif)</Label><Input id="modele-valide" value={f.valide_par} onChange={e => setF({ ...f, valide_par: e.target.value })} placeholder="Ex. Me Diop, juriste" /></div>
          </div>
          <div><Label htmlFor="modele-titre">Titre</Label><Input id="modele-titre" value={f.titre} onChange={e => setF({ ...f, titre: e.target.value })} placeholder="Ex. Consentement au traitement des données de santé" /></div>
          <div><Label htmlFor="modele-texte">Texte intégral validé</Label><Textarea id="modele-texte" rows={8} value={f.texte} onChange={e => setF({ ...f, texte: e.target.value })} />
            <p className="text-xs text-fg3 mt-1">{f.texte.trim().length} caractère(s) — 50 minimum. Vérifiez le texte avant d'enregistrer : il ne pourra plus être modifié.</p></div>
          {erreurs.length > 0 && (f.titre || f.texte) && <p className="text-xs text-destructive">{erreurs[0]}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || erreurs.length > 0}>{busy ? 'Enregistrement…' : 'Enregistrer le texte'}</Button>
            <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>Annuler</Button>
          </div>
        </form>
      )}

      {actifs.length === 0 && !erreurChargement
        ? <p className="text-sm text-fg3">Aucun texte enregistré. Tant que la bibliothèque est vide, le soignant doit saisir le texte complet à chaque signature.</p>
        : <div className="space-y-2">{actifs.map(m => (
          <div key={m.id} className="border border-border rounded-md p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{m.titre} <span className="text-xs text-primary font-mono">{m.version}</span></p>
                <p className="text-xs text-fg3">{libelleType(m.type)} · enregistré le {new Date(m.created_at).toLocaleDateString('fr-FR')}{m.valide_par ? ` · validé par ${m.valide_par}` : ''} · empreinte {empreinteCourte(m.texte_sha256)}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setVoir(voir === m.id ? null : m.id)}>{voir === m.id ? 'Masquer' : 'Lire'}</Button>
                <Button size="sm" variant="outline" onClick={() => setAArchiver(m)}><Archive />Archiver</Button>
              </div>
            </div>
            {voir === m.id && <p className="mt-2 whitespace-pre-wrap text-fg2 border-t border-border pt-2">{m.texte}</p>}
          </div>
        ))}</div>}

      {archives.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-fg3">Versions archivées ({archives.length})</summary>
          <div className="space-y-1 mt-2">{archives.map(m => (
            <p key={m.id} className="text-xs text-fg3">{libelleType(m.type)} · {m.titre} <span className="font-mono">{m.version}</span> · archivé le {m.archive_le ? new Date(m.archive_le).toLocaleDateString('fr-FR') : '—'} · empreinte {empreinteCourte(m.texte_sha256)}</p>
          ))}</div>
        </details>
      )}

      <AlertDialog open={!!aArchiver} onOpenChange={o => { if (!o) setAArchiver(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver « {aArchiver?.titre} » ({aArchiver?.version}) ?</AlertDialogTitle>
            <AlertDialogDescription>Ce texte ne sera plus proposé à la signature et ne pourra pas être réactivé. Les consentements déjà signés restent valables et rattachés à cette version. Pour le remplacer, créez ensuite une nouvelle version.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void archiver()}>Archiver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
