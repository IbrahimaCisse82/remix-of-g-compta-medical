import { useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { lireActes, lireEquipe, MODELE_ACTES, MODELE_EQUIPE, type Acte, type Invitation, type TypeStructure } from '@/domain/sante/imports-structure';

const telechargerTexte = (nom: string, texte: string) => {
  const url = URL.createObjectURL(new Blob([texte], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const LIBELLE_ROLE: Record<string, string> = {
  admin_structure: 'administrateur', medecin: 'médecin', biologiste: 'biologiste', technicien: 'technicien', preleveur: 'préleveur',
  secretaire: 'secrétaire', caissier: 'caissier', comptable: 'comptable', lecteur: 'lecteur', tiers_payant: 'tiers payant',
};

/** Invitations de toute l'équipe depuis un tableur (administrateur + MFA, contrôlé par la base). */
export function ImportEquipe({ structureId, type, enAttente, onDone }: { structureId: string; type: TypeStructure; enAttente: { email: string; role: string; statut: string }[]; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<{ invitations: Invitation[]; erreurs: string[]; ignorees: number; personnes: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const lire = async (f?: File) => {
    if (!f) return;
    try { setApercu(lireEquipe(await f.text(), type, enAttente.filter(x => x.statut === 'en_attente'))); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Fichier illisible.'); }
    finally { if (input.current) input.current.value = ''; }
  };
  const envoyer = async () => {
    if (!apercu) return;
    setBusy(true);
    const echecs: string[] = [];
    for (const inv of apercu.invitations) {
      const { error } = await supabase.rpc('create_medical_invitation', { _structure_id: structureId, _email: inv.email, _role: inv.role as Database['public']['Enums']['medical_role'] });
      if (error) echecs.push(`${inv.email} (${LIBELLE_ROLE[inv.role]}) : ${error.message}`);
    }
    setBusy(false);
    const ok = apercu.invitations.length - echecs.length;
    if (echecs.length) toast.error(`${ok} invitation(s) créée(s), ${echecs.length} refusée(s) : ${echecs.slice(0, 3).join(' ; ')}`);
    else toast.success(`${ok} invitation(s) créée(s). Copiez chaque lien ci-dessous et envoyez-le à la personne concernée.`);
    setApercu(null); onDone();
  };

  return (
    <section className="mt-8 border border-border bg-bg2 rounded-md p-5 space-y-3">
      <h2 className="font-semibold">Inviter toute l'équipe depuis un tableur</h2>
      <p className="text-xs text-fg3">Une ligne par personne : nom, e-mail et rôle(s) séparés par « + » (ex. « médecin + administrateur »). Une invitation est créée par rôle ; la personne accepte chaque lien avec la même adresse. Les invitations déjà en attente ne sont pas recréées.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => telechargerTexte('modele-equipe.csv', MODELE_EQUIPE)}><Download />Modèle</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><FileUp />Importer la liste</Button>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" aria-label="Liste de l'équipe" onChange={e => void lire(e.target.files?.[0])} />
      </div>
      {apercu && <div className="border-t border-border pt-3 text-sm space-y-2">
        <p>{apercu.personnes} personne(s), {apercu.invitations.length} invitation(s) à créer{apercu.ignorees ? `, ${apercu.ignorees} déjà en attente` : ''}.</p>
        {apercu.erreurs.length > 0 && <ul className="text-xs text-destructive list-disc pl-5 max-h-32 overflow-y-auto">{apercu.erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {apercu.invitations.length > 0 && <ul className="text-xs max-h-40 overflow-y-auto">{apercu.invitations.map((x, i) => <li key={i}>{x.nom || x.email} · {x.email} · {LIBELLE_ROLE[x.role]}</li>)}</ul>}
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || apercu.erreurs.length > 0 || !apercu.invitations.length} onClick={() => void envoyer()}>{busy ? 'Création…' : 'Créer les invitations'}</Button>
          <Button size="sm" variant="ghost" onClick={() => setApercu(null)}>Annuler</Button>
        </div>
        {apercu.erreurs.length > 0 && <p className="text-xs text-fg3">Corrigez les lignes en erreur dans le fichier puis réimportez-le.</p>}
      </div>}
    </section>
  );
}

/** Actes et tarifs depuis un tableur : ajout ou mise à jour par code, en une seule opération (tout ou rien). */
export function ImportActes({ structureId, onDone }: { structureId: string; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<{ actes: Acte[]; erreurs: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const lire = async (f?: File) => {
    if (!f) return;
    try { setApercu(lireActes(await f.text())); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Fichier illisible.'); }
    finally { if (input.current) input.current.value = ''; }
  };
  const envoyer = async () => {
    if (!apercu?.actes.length) return;
    setBusy(true);
    const { error } = await supabase.from('sante_actes').upsert(apercu.actes.map(a => ({ structure_id: structureId, ...a })), { onConflict: 'structure_id,code' });
    setBusy(false);
    if (error) return void toast.error(error.message.includes('row-level') ? 'Réservé à l’administrateur de la structure' : error.message);
    toast.success(`${apercu.actes.length} acte(s) ajouté(s) ou mis à jour.`);
    setApercu(null); onDone();
  };

  return (
    <div className="border border-border rounded-md p-3 space-y-2 text-sm">
      <p className="text-xs text-fg3">Saisie en masse : code, libellé, tarif en FCFA, catégorie (facultative). Un code déjà présent est mis à jour.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => telechargerTexte('modele-actes.csv', MODELE_ACTES)}><Download />Modèle</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><FileUp />Importer</Button>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" aria-label="Fichier des actes" onChange={e => void lire(e.target.files?.[0])} />
      </div>
      {apercu && <div className="space-y-2">
        <p>{apercu.actes.length} acte(s) prêt(s).</p>
        {apercu.erreurs.length > 0 && <ul className="text-xs text-destructive list-disc pl-5 max-h-32 overflow-y-auto">{apercu.erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || apercu.erreurs.length > 0 || !apercu.actes.length} onClick={() => void envoyer()}>{busy ? 'Import…' : 'Confirmer l’import'}</Button>
          <Button size="sm" variant="ghost" onClick={() => setApercu(null)}>Annuler</Button>
        </div>
      </div>}
    </div>
  );
}
