export function getApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

  if (typeof window === 'undefined') {
    return configured;
  }

  const currentOrigin = window.location.origin.replace(/\/$/, '');
  const currentHost = window.location.hostname.toLowerCase();
  const isLocalHost = currentHost === 'localhost' || currentHost === '127.0.0.1';

  if (isLocalHost) {
    return configured || currentOrigin;
  }

  if (!configured) {
    return currentOrigin;
  }

  try {
    const configuredUrl = new URL(configured);
    const configuredHost = configuredUrl.hostname.toLowerCase();
    if (configuredHost.endsWith('.up.railway.app') && configuredHost !== currentHost) {
      return currentOrigin;
    }
  } catch {
    return currentOrigin;
  }

  return configured;
}

export function buildApiUrl(path: string) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}