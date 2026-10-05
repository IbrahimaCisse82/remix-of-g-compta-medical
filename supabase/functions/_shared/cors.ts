// CORS en liste blanche stricte : seules les origines de CE projet sont autorisées.
// Aucune réflexion d'une origine inconnue (réponse « null »).
// Ajouter le domaine publié / personnalisé via le secret APP_ALLOWED_ORIGINS (séparé par des virgules).
const PROJET = '5f0ce04a-cf66-48eb-b5c2-ddbb8f8c2a2a';
const FIXES = [
  `https://id-preview--${PROJET}.lovable.app`,
  `https://${PROJET}.lovableproject.com`,
];
const EXTRA = (Deno.env.get('APP_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
const LOCAL = Deno.env.get('APP_ALLOW_LOCALHOST') === 'true';

export function origineAutorisee(origin: string): boolean {
  if (!origin) return false;
  if (FIXES.includes(origin) || EXTRA.includes(origin)) return true;
  return LOCAL && /^http:\/\/localhost(:\d+)?$/.test(origin);
}

export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origineAutorisee(origin) ? origin : 'null',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
