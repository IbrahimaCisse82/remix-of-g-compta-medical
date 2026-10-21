import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Messages « Accès refusé » explicites pour les modules Santé.
 *
 * Les fonctions serveur récentes lèvent déjà des messages clairs
 * (« Accès refusé : … », « MFA requise : … », « Module … inactif … »).
 * Les refus RLS bruts (« new row violates row-level security policy »,
 * « permission denied », code 42501) ne disent pas pourquoi : on les
 * requalifie ici en rôle manquant, module inactif ou MFA requise.
 */

export type CauseRefus = 'auth' | 'mfa' | 'module' | 'role' | 'rls';

export const LIBELLES_ROLES: Record<string, string> = {
  admin_structure: 'Administrateur',
  medecin: 'Médecin',
  biologiste: 'Biologiste',
  technicien: 'Technicien',
  preleveur: 'Préleveur',
  secretaire: 'Secrétaire',
  caissier: 'Caissier',
  comptable: 'Comptable',
  lecteur: 'Lecteur',
  tiers_payant: 'Tiers payant',
};

type ErreurLike = { message?: string | null; code?: string | null } | null | undefined;

/** Classe une erreur Supabase/PostgREST. Retourne null si ce n'est pas un refus d'accès. */
export function classerRefus(error: ErreurLike): CauseRefus | null {
  const msg = (error?.message ?? '').toLowerCase();
  const code = error?.code ?? '';
  if (msg.startsWith('authentification requise') || code === 'PGRST301' || msg.includes('jwt expired')) return 'auth';
  if (msg.startsWith('mfa requise') || msg.includes('aal2')) return 'mfa';
  if (/^module .* inactif/.test(msg) || msg.includes('module inactif')) return 'module';
  // « Accès refusé » nu (sans explication) : aussi ambigu qu'un refus RLS, on le complète.
  if (/^acc[eè]s refus[eé]\s*\.?$/.test(msg.trim())) return 'rls';
  if (msg.startsWith('accès refusé') || msg.startsWith('acces refuse')) return 'role';
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) return 'rls';
  return null;
}

/** Le message serveur est-il déjà explicite (à afficher tel quel) ? */
export function estMessageExplicite(cause: CauseRefus | null): boolean {
  return cause === 'auth' || cause === 'mfa' || cause === 'module' || cause === 'role';
}

export const MESSAGE_MFA =
  'MFA requise : validez la vérification en deux étapes (Paramètres › Sécurité) puis réessayez.';
export const MESSAGE_SESSION = 'Session expirée : reconnectez-vous puis réessayez.';

/** Ajoute la marche à suivre quand le serveur signale un module inactif sans la donner. */
export function completerMessageModule(message: string): string {
  if (/contactez|administrat/i.test(message)) return message;
  return `${message.replace(/\s*\.?\s*$/, '')} : demandez à l’administrateur de la structure de l’activer (Structure & paramètres).`;
}

export function messageRefusGenerique(roles: string[] | null): string {
  const base = 'Accès refusé : cette action n’est pas autorisée';
  const detail = roles === null
    ? '. Causes possibles : rôle insuffisant dans la structure ou module non activé.'
    : roles.length === 0
      ? ' : vous n’avez aucun rôle actif dans cette structure.'
      : ` pour vos rôles (${roles.map(r => LIBELLES_ROLES[r] ?? r).join(', ')}), ou le module concerné n’est pas activé.`;
  return `${base}${detail} Contactez l’administrateur de la structure.`;
}

async function mfaManquante(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  } catch {
    return false;
  }
}

async function mesRoles(structureId: string): Promise<string[] | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await supabase
      .from('structure_memberships')
      .select('statut, medical_user_roles(role)')
      .eq('structure_id', structureId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (error) return null;
    if (!data || data.statut !== 'actif') return [];
    const rows = (data as unknown as { medical_user_roles: { role: string }[] | null }).medical_user_roles ?? [];
    return rows.map(r => r.role);
  } catch {
    return null;
  }
}

/** Construit le message à afficher pour une erreur, en précisant la cause d'un refus. */
export async function messageErreurSante(error: ErreurLike, structureId?: string): Promise<string> {
  const cause = classerRefus(error);
  if (cause === null || estMessageExplicite(cause)) {
    if (cause === 'auth' && !(error?.message ?? '').toLowerCase().startsWith('authentification')) return MESSAGE_SESSION;
    if (cause === 'module' && error?.message) return completerMessageModule(error.message);
    return error?.message || 'Opération impossible.';
  }
  if (await mfaManquante()) return MESSAGE_MFA;
  return messageRefusGenerique(structureId ? await mesRoles(structureId) : null);
}

/** Affiche une erreur Santé dans un toast, avec un message d'accès explicite si besoin. */
export async function toastErreurSante(error: ErreurLike, structureId?: string): Promise<void> {
  toast.error(await messageErreurSante(error, structureId));
}
