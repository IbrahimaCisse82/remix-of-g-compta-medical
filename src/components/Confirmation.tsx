import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

// Confirmation et saisie intégrées à l'application (remplacent window.confirm et
// window.prompt, bloquants, hors charte et ignorés par certains navigateurs intégrés).
// Usage : if (!(await confirmer('Supprimer cet article ?'))) return;
//         const motif = await saisir('Motif du refus :'); if (motif === null) return;

interface Demande {
  message: string;
  /** Présent pour une saisie de texte : valeur proposée. */
  saisie?: { defaut: string };
  resoudre: (valeur: string | null) => void;
}
let afficher: ((d: Demande) => void) | null = null;

const ACTIONS: [RegExp, string][] = [
  [/^supprimer/i, 'Supprimer'], [/^désactiver/i, 'Désactiver'], [/^révoquer/i, 'Révoquer'],
  [/^clôturer/i, 'Clôturer'], [/fusion/i, 'Confirmer la fusion'], [/^générer/i, 'Générer'],
];
export const libelleAction = (message: string) => ACTIONS.find(([r]) => r.test(message.trim()))?.[1] ?? 'Confirmer';
export const estDestructive = (message: string) => /^(supprimer|désactiver|révoquer)/i.test(message.trim());

export function confirmer(message: string): Promise<boolean> {
  // Sans hôte monté (tests, rendu isolé), repli sur la confirmation du navigateur.
  if (!afficher) return Promise.resolve(window.confirm(message));
  return new Promise(resoudre => afficher!({ message, resoudre: v => resoudre(v !== null) }));
}

/** Demande un texte. Renvoie null si l'utilisateur annule (comme window.prompt). */
export function saisir(message: string, defaut = ''): Promise<string | null> {
  if (!afficher) return Promise.resolve(window.prompt(message, defaut));
  return new Promise(resoudre => afficher!({ message, saisie: { defaut }, resoudre }));
}

export function ConfirmationHost() {
  const [demande, setDemande] = useState<Demande | null>(null);
  const [texte, setTexte] = useState('');
  useEffect(() => {
    afficher = d => { setTexte(d.saisie?.defaut ?? ''); setDemande(d); };
    return () => { afficher = null; };
  }, []);
  const repondre = (ok: boolean) => {
    demande?.resoudre(ok ? (demande.saisie ? texte : '') : null);
    setDemande(null);
  };
  const action = demande ? (demande.saisie ? 'Valider' : libelleAction(demande.message)) : '';
  return (
    <AlertDialog open={!!demande} onOpenChange={o => { if (!o) repondre(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{demande?.saisie ? 'Saisie' : 'Confirmation'}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{demande?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        {demande?.saisie && (
          <Input aria-label={demande.message} autoFocus value={texte} onChange={e => setTexte(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); repondre(true); } }} />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => repondre(false)}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className={demande && !demande.saisie && estDestructive(demande.message) ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            onClick={() => repondre(true)}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
