// Signalement automatique des erreurs non gérées vers le back-office (table plateforme_erreurs), sans service tiers.
// Nettoyage côté client (puis côté serveur) : ni adresse e-mail, ni numéro long, ni jeton.

export function nettoyer(texte: string, max: number): string {
  return texte
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]')
    .replace(/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Fa-f0-9]{32,})/g, '[jeton]')
    .replace(/\+?\d[\d ]{6,}\d/g, '[nombre]')
    .slice(0, max);
}

/** Erreurs sans intérêt (bruit des navigateurs et extensions). */
export function aIgnorer(message: string): boolean {
  return /ResizeObserver loop|Script error\.?$|extension:\/\/|^Non-Error promise rejection/i.test(message);
}

type Envoi = (args: Record<string, unknown>) => Promise<unknown>;
let contexte: { structureId: string | null; page: string | null } = { structureId: null, page: null };
export function definirContexteErreurs(c: { structureId: string | null; page: string | null }) { contexte = c; }

/** Installe les écouteurs ; au plus `max` signalements par chargement de page, sans doublon. */
export function installerSignalementErreurs(envoyer: Envoi, max = 20) {
  if (typeof window === 'undefined') return () => {};
  const vus = new Set<string>();
  let n = 0;
  const signaler = (message: string, pile?: string) => {
    const m = nettoyer(message || '', 500);
    if (!m || aIgnorer(m) || vus.has(m) || n >= max) return;
    vus.add(m); n++;
    envoyer({
      _message: m, _pile: pile ? nettoyer(pile, 2000) : null, _page: contexte.page, _structure_id: contexte.structureId,
      _contexte: { navigateur: navigator.userAgent.slice(0, 200), version: import.meta.env.MODE, ecran: `${window.screen.width}x${window.screen.height}` },
    }).catch(() => { /* ne jamais boucler sur une erreur de signalement */ });
  };
  const surErreur = (e: ErrorEvent) => signaler(e.message, e.error?.stack);
  const surRejet = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    signaler(typeof r === 'string' ? r : r?.message ?? String(r), typeof r === 'object' ? r?.stack : undefined);
  };
  window.addEventListener('error', surErreur);
  window.addEventListener('unhandledrejection', surRejet);
  return () => { window.removeEventListener('error', surErreur); window.removeEventListener('unhandledrejection', surRejet); };
}
