import pdfParse from 'pdf-parse';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (FlixPrev Link Ingestion/2.0)',
  Accept: 'text/html,application/pdf,text/plain,application/xhtml+xml,*/*;q=0.8',
};

const HTML_ENTITY_MAP = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  middot: '·',
  bull: '•',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  deg: '°',
  ordm: 'º',
  ordf: 'ª',
  para: '¶',
  sect: '§',
  plusmn: '±',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  frac14: '¼',
  frac12: '½',
  frac34: '¾',
  Agrave: 'À',
  Aacute: 'Á',
  Acirc: 'Â',
  Atilde: 'Ã',
  Auml: 'Ä',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Egrave: 'È',
  Eacute: 'É',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Igrave: 'Ì',
  Iacute: 'Í',
  Icirc: 'Î',
  Iuml: 'Ï',
  Ntilde: 'Ñ',
  Ograve: 'Ò',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  Oslash: 'Ø',
  Ugrave: 'Ù',
  Uacute: 'Ú',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
});

function normalizeWhitespace(value = '') {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripAdjacentDuplicateLines(value = '') {
  const lines = String(value || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const deduped = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  return deduped.join('\n');
}

function normalizeCharsetLabel(value = '') {
  const label = String(value || '').trim().toLowerCase();
  if (!label) return 'utf-8';

  const aliasMap = {
    utf8: 'utf-8',
    'utf-8': 'utf-8',
    latin1: 'windows-1252',
    'iso-8859-1': 'windows-1252',
    iso88591: 'windows-1252',
    'windows-1252': 'windows-1252',
    cp1252: 'windows-1252',
    'us-ascii': 'windows-1252',
  };

  return aliasMap[label] || label;
}

function decodeBuffer(buffer, label) {
  try {
    return new TextDecoder(label, { fatal: false }).decode(buffer);
  } catch {
    return '';
  }
}

function scoreDecodedText(value = '') {
  const text = String(value || '');
  const replacementCount = (text.match(/�/g) || []).length;
  const mojibakeCount = (text.match(/(?:Ã.|Â.|â€|â€œ|â€\x9d|â€\x99|â€“|â€”)/g) || []).length;
  return (replacementCount * 4) + (mojibakeCount * 2);
}

function detectCharset(contentType = '', bytes = Buffer.alloc(0)) {
  const headerMatch = String(contentType || '').match(/charset\s*=\s*([\w-]+)/i);
  if (headerMatch?.[1]) {
    return normalizeCharsetLabel(headerMatch[1]);
  }

  const headSample = decodeBuffer(bytes.subarray(0, 4096), 'ascii');
  const metaMatch = headSample.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)
    || headSample.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i);
  if (metaMatch?.[1]) {
    return normalizeCharsetLabel(metaMatch[1]);
  }

  const utf8Text = decodeBuffer(bytes.subarray(0, 8192), 'utf-8');
  if ((utf8Text.match(/�/g) || []).length > 5) {
    return 'windows-1252';
  }

  return 'utf-8';
}

function decodeResponseText(bytes, contentType = '') {
  const preferredLabel = detectCharset(contentType, bytes);
  const candidateLabels = [preferredLabel, 'utf-8', 'windows-1252'];
  const uniqueLabels = [...new Set(candidateLabels.map(normalizeCharsetLabel))];

  let bestText = '';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const label of uniqueLabels) {
    const decoded = decodeBuffer(bytes, label);
    if (!decoded) continue;
    const score = scoreDecodedText(decoded);
    if (score < bestScore) {
      bestText = decoded;
      bestScore = score;
    }
  }

  return bestText || decodeBuffer(bytes, 'utf-8');
}

export function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, entityName) => HTML_ENTITY_MAP[entityName] ?? match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function extractTagContent(source = '', tagName = '') {
  if (!source || !tagName) return '';

  const openMatch = source.match(new RegExp(`<${tagName}\\b[^>]*>`, 'i'));
  if (!openMatch?.[0]) return '';

  const startIndex = source.indexOf(openMatch[0]) + openMatch[0].length;
  if (String(tagName).toLowerCase() === 'body') {
    return source.slice(startIndex).trim();
  }

  const closingPattern = new RegExp(`</${tagName}>`, 'ig');
  let endIndex = -1;
  let closingMatch = closingPattern.exec(source);

  while (closingMatch) {
    if (closingMatch.index >= startIndex) {
      endIndex = closingMatch.index;
    }
    closingMatch = closingPattern.exec(source);
  }

  return endIndex === -1
    ? source.slice(startIndex).trim()
    : source.slice(startIndex, endIndex).trim();
}

export function extractPrimaryHtmlContent(html = '') {
  const source = String(html || '');
  const mainCandidates = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<section[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/section>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of mainCandidates) {
    const match = source.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length > 800) {
      return candidate;
    }
  }

  const bodyCandidate = extractTagContent(source, 'body');
  if (bodyCandidate.length > 800) {
    return bodyCandidate;
  }

  return source;
}

function cleanDomainSpecificText(value = '', sourceUrl = '') {
  let cleaned = String(value || '');
  let host = '';

  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    host = '';
  }

  cleaned = cleaned
    .replace(/PortalVisitorsCounterWeb/gi, ' ')
    .replace(/Voltar ao topo da p[aá]gina/gi, ' ')
    .replace(/Reportar Erro/gi, ' ')
    .replace(/Todo o conte[úu]do deste site est[aá] publicado[\s\S]*$/i, ' ')
    .replace(/REDES SOCIAIS[\s\S]*$/i, ' ')
    .replace(/Facebook|Instagram|YouTube|Twitter|LinkedIn/gi, ' ')
    .replace(/Termo de Uso e Pol[ií]tica de Privacidade/gi, ' ')
    .replace(/Texto ou tabela desconfigurados|Omiss[aã]o de anexo ou figura|Mat[eé]ria n[aã]o localizada|Problema de acesso ao conte[uú]do/gi, ' ');

  if (host.endsWith('juslaboris.tst.jus.br')) {
    cleaned = cleaned
      .replace(/^.*?(Mostrando os itens\s+\d+\s+a\s+\d+\s+de\s+\d+)/is, '$1')
      .replace(/^.*?(Mostrando os itens)/is, '$1')
      .replace(/Refinar Esp[eé]cie normativa[\s\S]*$/i, ' ')
      .replace(/In[ií]cio\s+[·.]\s+P[aá]gina do TST[\s\S]*$/i, ' ')
      .replace(/JavaScript is disabled for your browser\. Some features of this site may not work without it\./gi, ' ')
      .replace(/Alternar navega[cç][aã]o/gi, ' ')
      .replace(/Mostrar filtros avan[cç]ados|Ocultar filtros avan[cç]ados/gi, ' ')
      .replace(/Utilize filtros para refinar os resultados\./gi, ' ')
      .replace(/Minha conta Entrar/gi, ' ')
      .replace(/Pesquisa JusLaboris 2\. Atos normativos/gi, ' ')
      .replace(/Pesquisa Pesquisa Pesquisar/gi, ' ')
      .replace(/Dicas de pesquisa/gi, ' ')
      .replace(/Toda a JusLaboris/gi, ' ')
      .replace(/Cole[cç][õo]es Autores T[ií]tulos Categorias Assuntos Marcadores \( Tags \)/gi, ' ');
  }

  return normalizeWhitespace(stripAdjacentDuplicateLines(cleaned));
}

export function htmlToPlainText(html = '', options = {}) {
  const sourceUrl = String(options?.sourceUrl || '');
  const stripped = decodeHtmlEntities(
    extractPrimaryHtmlContent(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
      .replace(/<form[\s\S]*?<\/form>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|table|tr)>/gi, '\n')
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, ' $2 ($1) ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
  );

  return cleanDomainSpecificText(stripped, sourceUrl);
}

export function extractKnowledgeBody(raw = '') {
  return String(raw || '')
    .replace(/^(?:\s*(?:FONTE|COLETADO_EM|TITULO|DESCRICAO):[^\n]*\n*)+/i, '')
    .trim();
}

export function buildKnowledgeText({
  finalUrl,
  collectedAt = new Date().toISOString(),
  title = '',
  description = '',
  text = '',
}) {
  return [
    `FONTE: ${finalUrl}`,
    `COLETADO_EM: ${collectedAt}`,
    title ? `TITULO: ${title}` : '',
    description ? `DESCRICAO: ${description}` : '',
    normalizeWhitespace(text),
  ].filter(Boolean).join('\n\n').trim();
}

function extractTitle(html = '') {
  return decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '');
}

function extractDescription(html = '') {
  return decodeHtmlEntities(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i)?.[1]?.trim()
      || ''
  );
}

export async function fetchLinkKnowledgeSource(rawUrl, options = {}) {
  const collectedAt = String(options?.collectedAt || new Date().toISOString());
  const headers = {
    ...DEFAULT_HEADERS,
    ...(options?.headers || {}),
  };

  const response = await fetch(rawUrl, {
    headers,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Falha ao acessar ${rawUrl}: ${response.status}`);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const finalUrl = response.url || rawUrl;
  const isPdf = contentType.includes('application/pdf') || /\.pdf([?#].*)?$/i.test(finalUrl);

  if (isPdf) {
    const rawBuffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdfParse(rawBuffer);
    const text = normalizeWhitespace(String(parsed.text || '').replace(/\u0000/g, ' '));
    const savedText = buildKnowledgeText({
      finalUrl,
      collectedAt,
      text,
    });

    return {
      extension: 'pdf',
      buffer: rawBuffer,
      sourceBuffer: rawBuffer,
      title: '',
      description: '',
      finalUrl,
      text,
      savedText,
      contentType,
    };
  }

  const rawBuffer = Buffer.from(await response.arrayBuffer());
  const decodedText = decodeResponseText(rawBuffer, contentType);
  const looksLikeHtml = contentType.includes('text/html') || /<html|<body|<main|<article/i.test(decodedText);
  const title = looksLikeHtml ? extractTitle(decodedText) : '';
  const description = looksLikeHtml ? extractDescription(decodedText) : '';
  const text = looksLikeHtml
    ? htmlToPlainText(decodedText, { sourceUrl: finalUrl })
    : normalizeWhitespace(decodeHtmlEntities(decodedText));
  const savedText = buildKnowledgeText({
    finalUrl,
    collectedAt,
    title,
    description,
    text,
  });

  return {
    extension: 'txt',
    buffer: Buffer.from(savedText, 'utf-8'),
    sourceBuffer: rawBuffer,
    title,
    description,
    finalUrl,
    text,
    savedText,
    contentType,
  };
}