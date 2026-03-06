const url = 'https://siefreceitas.receita.economia.gov.br/main.d32fd2c8ae6b7767c1c8.js';
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
const text = await res.text();

const quoted = [...text.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g)]
  .map((m) => (m[1] ?? m[2] ?? '').replace(/\\\//g, '/'));

const wanted = quoted.filter((s) => {
  const v = s.toLowerCase();
  return (
    v.includes('http') ||
    v.includes('consulta') ||
    v.includes('receita') ||
    v.includes('/api') ||
    v.includes('page') ||
    v.includes('size') ||
    v.includes('recnm') ||
    v.includes('reccd')
  );
});

const uniq = [...new Set(wanted)]
  .filter((s) => s.length >= 4 && s.length <= 220)
  .slice(0, 500);

console.log('status', res.status, 'len', text.length, 'quoted', quoted.length, 'matches', uniq.length);
for (const line of uniq) {
  console.log(line);
}
