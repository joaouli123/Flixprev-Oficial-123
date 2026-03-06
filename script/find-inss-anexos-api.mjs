const MAIN_URL = 'https://portalin.inss.gov.br/main.0ed01dbd79118b050c9d.js';

const res = await fetch(MAIN_URL, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
const text = await res.text();

const apiMatches = [...text.matchAll(/\/api\/[A-Za-z0-9_\-/.]+/g)].map((m) => m[0]);
const uniqApis = [...new Set(apiMatches)];

const contexts = [];
for (const api of uniqApis) {
  if (!/anexo|portaria|inss|download|arquivo|anexos/i.test(api)) continue;
  const idx = text.indexOf(api);
  if (idx < 0) continue;
  const snippet = text.slice(Math.max(0, idx - 140), Math.min(text.length, idx + 220));
  contexts.push({ api, snippet });
}

console.log(JSON.stringify({
  mainStatus: res.status,
  apiCount: uniqApis.length,
  firstApis: uniqApis.slice(0, 200),
  contexts,
}, null, 2));
