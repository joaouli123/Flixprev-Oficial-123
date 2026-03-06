const url = 'https://siefreceitas.receita.economia.gov.br/codigos-de-receita-de-tributos-e-contribuicoes-darf-e-dje';

const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html,*/*',
  },
});

const html = await res.text();
const scripts = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]);

console.log('STATUS', res.status);
console.log('LEN', html.length);
console.log('SCRIPTS', JSON.stringify(scripts, null, 2));
console.log('HAS_KEYWORDS', /fetch\(|axios|XMLHttpRequest|datatable|pagination|pageSize|registros|resultado|consulta/gi.test(html));
console.log('HEAD', html.slice(0, 2000));
