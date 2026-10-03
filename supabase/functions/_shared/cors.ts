// CORS restreint aux domaines de l'application (aperçu, publié, local).
const ALLOWED = [
  /^https:\/\/[a-z0-9-]+(--[a-z0-9-]+)*\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
];
const EXTRA = (Deno.env.get('APP_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);

export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const ok = EXTRA.includes(origin) || ALLOWED.some(r => r.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
