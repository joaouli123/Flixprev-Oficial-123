const pageUrl = 'https://portalin.inss.gov.br/anexos';

const pageRes = await fetch(pageUrl, {
  headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,*/*' },
});

const html = await pageRes.text();
const scripts = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]);

console.log('PAGE', JSON.stringify({ status: pageRes.status, len: html.length, scripts }, null, 2));

for (const src of scripts) {
  const abs = new URL(src, pageUrl).toString();
  const res = await fetch(abs, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
  const text = await res.text();

  const low = text.toLowerCase();
  const hasAnexo = low.includes('anexo');
  const hasPdf = low.includes('.pdf');
  const hasApi = low.includes('/api') || low.includes('http');

  const rx = new RegExp("https?:\\\\/\\\\/[^\"'\\s)]+|\\/api\\/[A-Za-z0-9_\\/-]+|anexos?[^\"'\\s)]*", 'gi');
  const candidates = [...text.matchAll(rx)]
    .map((m) => m[0])
    .slice(0, 120);

  console.log('\nSCRIPT', abs);
  console.log(
    JSON.stringify(
      {
        status: res.status,
        len: text.length,
        hasAnexo,
        hasPdf,
        hasApi,
        candidates: [...new Set(candidates)].slice(0, 40),
      },
      null,
      2
    )
  );
}
