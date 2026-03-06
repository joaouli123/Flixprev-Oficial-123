const u = 'https://portalin.inss.gov.br/anexos';

const r = await fetch(u, {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html,*/*',
  },
});

const html = await r.text();
const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
const abs = hrefs
  .map((href) => {
    try {
      return new URL(href, u).toString();
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const downloads = abs.filter(
  (x) => /(\.pdf|\.docx?|\.xlsx?|\.zip)(\?|$)/i.test(x) || /download/i.test(x)
);

console.log(
  JSON.stringify(
    {
      status: r.status,
      htmlLength: html.length,
      hrefs: hrefs.length,
      absoluteLinks: abs.length,
      downloadLinks: downloads.length,
      sampleDownloads: downloads.slice(0, 30),
    },
    null,
    2
  )
);
