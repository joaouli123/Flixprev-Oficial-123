// Lista de origens permitidas
const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:5173',
  'https://flixprev.com',
  'https://www.flixprev.com',
  'https://flixprev.com.br',
  'https://www.flixprev.com.br',
  'https://flixprev-oficial.vercel.app',
  'https://flixprev.uxcodedev.com.br'
];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Verifica se a origem está na lista de permitidas
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCorsPreFlight(req: Request): Response {
  const origin = req.headers.get('origin');
  return new Response(null, { 
    status: 204,
    headers: getCorsHeaders(origin)
  });
}
