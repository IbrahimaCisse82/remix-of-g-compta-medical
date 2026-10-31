import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Confirmation intégrée à l'application (remplace window.confirm, bloquant et hors charte).
// Usage : if (!(await confirmer('Supprimer cet article ?'))) return;

interface Demande { message: string; resoudre: (ok: boolean) => void }
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
  return new Promise(resoudre => afficher!({ message, resoudre }));
}

export function ConfirmationHost() {
  const [demande, setDemande] = useState<Demande | null>(null);
  useEffect(() => { afficher = setDemande; return () => { afficher = null; }; }, []);
  const repondre = (ok: boolean) => { demande?.resoudre(ok); setDemande(null); };
  const action = demande ? libelleAction(demande.message) : '';
  return (
    <AlertDialog open={!!demande} onOpenChange={o => { if (!o) repondre(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmation</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{demande?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => repondre(false)}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className={demande && estDestructive(demande.message) ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            onClick={() => repondre(true)}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
