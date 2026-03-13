const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:5173',
  'https://flixprev.com',
  'https://www.flixprev.com',
  'https://flixprev.com.br',
  'https://www.flixprev.com.br',
  'https://flixprev-oficial.vercel.app',
  'https://flixprev.uxcodedev.com.br',
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/(?:[a-z0-9-]+\.)*flixprev\.com(?:\.br)?$/i,
  /^https:\/\/(?:[a-z0-9-]+\.)*uxcodedev\.com\.br$/i,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i,
];

function resolveAllowedOrigin(origin: string | null): string {
  const normalizedOrigin = String(origin || '').trim().replace(/\/$/, '');

  if (!normalizedOrigin) {
    return ALLOWED_ORIGINS[0];
  }

  if (ALLOWED_ORIGINS.includes(normalizedOrigin)) {
    return normalizedOrigin;
  }

  if (ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(normalizedOrigin))) {
    return normalizedOrigin;
  }

  return ALLOWED_ORIGINS[0];
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = resolveAllowedOrigin(origin);

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function handleCorsPreFlight(req: Request): Response {
  const origin = req.headers.get('origin');
  return new Response(null, { 
    status: 204,
    headers: getCorsHeaders(origin)
  });
}
