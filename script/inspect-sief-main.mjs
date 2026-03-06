const base = 'https://siefreceitas.receita.economia.gov.br/';
const files = [
  'main.d32fd2c8ae6b7767c1c8.js',
  'scripts.dac052ecc2ede91dc7bd.js',
];

for (const file of files) {
  const res = await fetch(base + file, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
  const text = await res.text();
  console.log('\n===', file, 'status', res.status, 'len', text.length, '===');

  const rx = new RegExp("https?:\\\\/\\\\/[^\"'\\s)]+|\\/api\\/[A-Za-z0-9_\\/-]+|consulta[^\"'\\s)]*", 'gi');

  const matches = [...text.matchAll(rx)]
    .map((m) => m[0])
    .filter(Boolean);

  const uniq = [...new Set(matches)].slice(0, 120);
  console.log('CANDIDATES', JSON.stringify(uniq, null, 2));

  const hasCodigos = text.toLowerCase().includes('codigo') || text.toLowerCase().includes('receita');
  console.log('HAS_CODIGOS_KEYWORDS', hasCodigos);
}
