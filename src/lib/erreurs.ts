import { toast } from 'sonner';

const AIDE = 'Contactez l’administrateur de votre structure pour obtenir le rôle nécessaire.';

/** Traduit les refus techniques du serveur en messages compréhensibles. */
export function messageErreur(brut: unknown): string {
  const m = typeof brut === 'string' ? brut : (brut as { message?: string })?.message ?? String(brut ?? '');
  const t = m.trim();
  if (/^acc[eè]s refus[eé]\.?$/i.test(t)) return `Accès refusé : votre rôle ne permet pas cette action. ${AIDE}`;
  if (/row-level security|violates row level/i.test(t)) return `Accès refusé : vous n’avez pas le droit d’enregistrer cette information dans cette structure. ${AIDE}`;
  if (/permission denied/i.test(t)) return `Accès refusé : cette action n’est pas autorisée pour votre compte. ${AIDE}`;
  if (/aal2|mfa/i.test(t) && !/MFA requise/.test(t)) return 'Vérification en deux étapes requise : validez votre code à 6 chiffres puis réessayez.';
  if (/JWT expired|jwt/i.test(t)) return 'Votre session a expiré : reconnectez-vous.';
  if (/Failed to fetch|NetworkError/i.test(t)) return 'Connexion impossible : vérifiez votre accès Internet puis réessayez.';
  if (/Structure non reliée à une entreprise comptable/i.test(t)) return 'Structure non reliée à une entreprise comptable : un administrateur doit la relier dans Paramètres de la structure.';
  return t;
}

let installe = false;
/** Applique la traduction à tous les messages d'erreur affichés. */
export function installerMessagesErreur() {
  if (installe) return; installe = true;
  const orig = toast.error;
  (toast as { error: typeof toast.error }).error = ((msg: unknown, data?: Parameters<typeof toast.error>[1]) =>
    orig(typeof msg === 'string' ? messageErreur(msg) : (msg as never), data)) as typeof toast.error;
}
