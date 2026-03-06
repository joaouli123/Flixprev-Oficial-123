const MAIN_URL = 'https://portalin.inss.gov.br/main.0ed01dbd79118b050c9d.js';
const BASE = 'https://portalin.inss.gov.br/';

const res = await fetch(MAIN_URL, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
const text = await res.text();

const quoted = [...text.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g)]
  .map((m) => (m[1] ?? m[2] ?? '').replace(/\\\//g, '/'));

const maybeFiles = quoted
  .filter((s) => /\.(pdf|doc|docx|xls|xlsx|zip|htm|html)(\?|$)/i.test(s) || /anexo/i.test(s))
  .map((s) => {
    try {
      return new URL(s, BASE).toString();
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const uniq = [...new Set(maybeFiles)].slice(0, 1200);

const valid = [];
for (const u of uniq) {
  try {
    const r = await fetch(u, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
    const ct = String(r.headers.get('content-type') || '');
    if (r.status >= 200 && r.status < 400 && /(pdf|msword|officedocument|excel|zip|text\/html)/i.test(ct)) {
      valid.push({ url: u, status: r.status, contentType: ct });
    }
  } catch {
  }
}

console.log(JSON.stringify({
  status: res.status,
  bundleLen: text.length,
  quoted: quoted.length,
  candidates: uniq.length,
  valid: valid.length,
  sample: valid.slice(0, 250),
}, null, 2));
