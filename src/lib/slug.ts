export function toSlug(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function extractUuidFromRouteKey(routeKey: string): string | null {
  const match = String(routeKey || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match?.[1] || null;
}

export function makeAgentRouteKey(title: string, id: string): string {
  const slug = toSlug(title);
  return slug || id;
}
