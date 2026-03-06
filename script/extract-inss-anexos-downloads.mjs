const MAIN_URL = 'https://portalin.inss.gov.br/main.0ed01dbd79118b050c9d.js';
const BASE = 'https://portalin.inss.gov.br/';

function toAbsolute(raw) {
  const value = String(raw || '').replace(/\\\//g, '/').trim();
  if (!value) return null;
  try {
    return new URL(value, BASE).toString();
  } catch {
    return null;
  }
}

const res = await fetch(MAIN_URL, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
const text = await res.text();

const fileMatches = [
  ...text.matchAll(/[A-Za-z0-9_./\-]+\.(pdf|doc|docx|xls|xlsx|zip|htm|html)/gi),
].map((m) => m[0]);

const urlRx = new RegExp('https?:\\\\/\\\\/[^"\\' + "'" + '\\s)]+', 'gi');
const urlMatches = [...text.matchAll(urlRx)].map((m) => m[0].replace(/\\\//g, '/'));

const candidates = [...new Set([...fileMatches, ...urlMatches])]
  .map((raw) => toAbsolute(raw))
  .filter(Boolean)
  .filter((url) => /\.(pdf|doc|docx|xls|xlsx|zip|htm|html)(\?|$)/i.test(url) || /anexos?|portaria|inss/i.test(url));

const uniqueCandidates = [...new Set(candidates)];

const checks = [];
for (const url of uniqueCandidates.slice(0, 600)) {
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
    });
    checks.push({ url, status: r.status, contentType: r.headers.get('content-type') || '' });
  } catch {
    checks.push({ url, status: 0, contentType: '' });
  }
}

const alive = checks.filter((x) => x.status >= 200 && x.status < 400);

console.log(
  JSON.stringify(
    {
      mainStatus: res.status,
      bundleLength: text.length,
      rawMatches: fileMatches.length + urlMatches.length,
      candidates: uniqueCandidates.length,
      checked: checks.length,
      alive: alive.length,
      sampleAlive: alive.slice(0, 120),
    },
    null,
    2
  )
);
