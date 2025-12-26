// Simple client-side rate limiting
// Para rate limiting real no servidor, use Supabase Edge Functions com Upstash Redis

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 60000 // 1 minuto
): { allowed: boolean; remainingAttempts: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Se não existe ou expirou, criar nova entrada
  if (!entry || now > entry.resetTime) {
    const resetTime = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { allowed: true, remainingAttempts: maxAttempts - 1, resetTime };
  }

  // Se atingiu o limite
  if (entry.count >= maxAttempts) {
    return { 
      allowed: false, 
      remainingAttempts: 0, 
      resetTime: entry.resetTime 
    };
  }

  // Incrementar contador
  entry.count++;
  rateLimitStore.set(key, entry);

  return { 
    allowed: true, 
    remainingAttempts: maxAttempts - entry.count, 
    resetTime: entry.resetTime 
  };
}

export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

// Limpar entradas expiradas periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Limpar a cada minuto
