// Busca na internet em último caso, aceitando só o que fontes oficiais brasileiras sustentam.
// Usa o Gemini com Google Search (grounding). O Google não respeita "site:", então o filtro é feito
// depois: cada trecho da resposta indica em quais páginas se apoiou (groundingSupports) e só
// sobrevive o que tem apoio em domínio oficial (.gov.br, .jus.br, .leg.br, .mp.br).

const OFFICIAL_DOMAIN_RE = /(^|\.)(gov\.br|jus\.br|leg\.br|mp\.br)$/i;
const NO_SOURCE_TOKEN = 'SEM_FONTE_OFICIAL';
export const MIN_OFFICIAL_SUPPORT_RATIO = 0.7;

export function isOfficialDomain(domain = '') {
  const host = String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  return Boolean(host) && OFFICIAL_DOMAIN_RE.test(host);
}

// Resposta curta dizendo que a base não tem a informação, escrita com outras palavras além do
// "não encontrei" padrão (ex.: "Os documentos consultados não informam o valor..."). Respostas
// longas ficam de fora para não trocar uma resposta boa que só ressalva um detalhe.
const MISSING_ANSWER_MAX_CHARS = 700;
const MISSING_PATTERNS = [
  /\bn(ao|enhum)\b[^.\n]{0,40}\b(encontrei|localizei|identifiquei|consta[m]?|ha (informac|dados|men[cç]))/,
  /\b(documentos?|contexto|material|trechos?|base|fontes?)\b[^.\n]{0,60}\bnao (informa[m]?|traze?m?|menciona[m]?|conte[mn]|contem|trata[m]?|aborda[m]?|cita[m]?|especifica[m]?|apresenta[m]?|preve[m]?)\b/,
  /\bnao (ha|existe[m]?) (informac|dados|referenc|men[cç])/,
  /\bnao (e|foi) possivel (responder|informar|confirmar|te ajudar)/,
];

const foldText = (text = '') => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function looksLikeMissingAnswer(text = '') {
  const raw = String(text || '').trim();
  if (!raw || raw.length > MISSING_ANSWER_MAX_CHARS) return false;
  return MISSING_PATTERNS.some((re) => re.test(foldText(raw)));
}

// Resposta longa que ressalva uma lacuna ("os documentos não especificam o prazo"). Devolve as frases
// com a lacuna para a busca oficial completar só aquilo; lista vazia = resposta sem lacuna.
export function findMissingStatements(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const sentences = raw.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length >= 15);
  return sentences.filter((sentence) => MISSING_PATTERNS.some((re) => re.test(foldText(sentence)))).slice(0, 4);
}

const BASE_RULES = [
  'Você é um assistente jurídico brasileiro (previdenciário e trabalhista) consultado em último caso, porque a base de documentos do agente não tinha a resposta.',
  'Responda em português do Brasil, direto e objetivo (no máximo 10 linhas), com números, datas e nº de lei/portaria/súmula/tema exatos.',
  'Use SOMENTE o que fontes oficiais confirmam: planalto.gov.br, gov.br (INSS, Previdência, Receita, MTE), in.gov.br (Diário Oficial), stf.jus.br, stj.jus.br, tst.jus.br, jt.jus.br, cjf.jus.br, trf/trt (.jus.br), camara.leg.br, senado.leg.br.',
  'Não use nem cite blogs, escritórios, portais de notícia ou vídeos. Não invente. Não escreva lista de fontes no final.',
  'OBRIGATÓRIO: pesquise no Google antes de responder, mesmo que já saiba a resposta. Nunca responda de memória. Faça buscas que achem a página oficial (inclua "planalto.gov.br" e o número da lei, "gov.br/inss" ou "in.gov.br" para portarias) e escreva cada informação em uma linha própria.',
  `Se nenhuma fonte oficial confirmar, responda exatamente: ${NO_SOURCE_TOKEN}`,
];

function buildSystemPrompts(agentTitle = '') {
  const scope = agentTitle ? `O usuário está no agente "${agentTitle}".` : '';
  return [
    [...BASE_RULES, scope].filter(Boolean).join('\n'),
    [...BASE_RULES, scope, 'Ao pesquisar, inclua nas buscas termos como "gov.br", "planalto", "DOU", "STF", "TST" ou "portaria" para achar a página oficial.'].filter(Boolean).join('\n'),
    [...BASE_RULES, scope, 'Pesquise primeiro o ato ou a decisão original (lei ou decreto no planalto.gov.br, portaria no Diário Oficial, súmula ou tema no site do tribunal) e depois a página do órgão (gov.br/inss, gov.br/previdencia).'].filter(Boolean).join('\n'),
  ];
}

function buildUserText(question = '', conversationContext = '', gaps = []) {
  const ctx = String(conversationContext || '').trim().slice(-1500);
  const base = ctx ? `Contexto recente da conversa:\n${ctx}\n\nPergunta atual: ${question}` : question;
  const list = (Array.isArray(gaps) ? gaps : []).map((g) => String(g || '').trim()).filter(Boolean);
  if (!list.length) return base;
  return `${base}\n\nA base de documentos já respondeu parte da pergunta, mas ficou sem estes pontos:\n${list.map((g) => `- ${g}`).join('\n')}\n\nResponda SOMENTE o que falta nesses pontos (sem repetir o resto), com o número exato do artigo/lei.`;
}

// Avalia uma resposta do Gemini: quanto do texto se apoia em fonte oficial. Recortar os trechos
// apoiados só em fonte não oficial quebrava frases no meio, então a resposta inteira é aceita ou
// descartada pela proporção de apoio oficial.
export function evaluateGroundedCandidate(payload = {}) {
  const candidate = payload?.candidates?.[0];
  const text = (candidate?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  const gm = candidate?.groundingMetadata || {};
  const chunks = (gm.groundingChunks || []).map((c) => ({
    domain: String(c?.web?.domain || c?.web?.title || '').toLowerCase(),
    title: String(c?.web?.title || ''),
    uri: String(c?.web?.uri || ''),
  }));
  const official = new Set(chunks.map((c, i) => (isOfficialDomain(c.domain) ? i : -1)).filter((i) => i >= 0));
  const segments = (gm.groundingSupports || []).map((s) => {
    const segText = String(s?.segment?.text || '').trim();
    const off = (s?.groundingChunkIndices || []).filter((i) => official.has(i));
    return { text: segText, off };
  }).filter((s) => s.text);
  const noSource = !text || text.includes(NO_SOURCE_TOKEN);
  const withoutSourceList = text
    .replace(/(^|\n)[ \t]*\**Fontes?( consultadas| oficiais)?:?\**:?[^\n]*(\n[ \t]*[-*][^\n]*)*\s*$/i, '');
  // O Google traz muitos blogs junto com o gov.br. Em vez de descartar a resposta inteira, cada
  // linha precisa se sustentar sozinha: sai a linha apoiada só em site não oficial e a linha com
  // número/data sem apoio nenhum (pode ser memória do modelo). Fica o que a fonte oficial confirma.
  let keptLines = [];
  let keptSupported = 0;
  let keptOfficial = 0;
  let firstAnswerDropped = null;
  const usedOfficial = new Set();
  for (const line of withoutSourceList.split('\n')) {
    const segs = segments.filter((s) => line.includes(s.text) || (s.text.length > 20 && s.text.includes(line.trim()) && line.trim().length > 20));
    const offSegs = segs.filter((s) => s.off.length);
    const drop = (segs.length && !offSegs.length) || (!segs.length && /\d/.test(line) && !/^\s*#/.test(line));
    // A primeira frase de verdade costuma ser a resposta direta; se ela cai, o resto fica sem sentido.
    if (firstAnswerDropped === null && line.trim().length >= 20 && !/^\s*#/.test(line)) firstAnswerDropped = Boolean(drop);
    if (drop) continue;
    for (const s of segs) {
      keptSupported += s.text.length;
      if (s.off.length) { keptOfficial += s.text.length; s.off.forEach((i) => usedOfficial.add(i)); }
    }
    keptLines.push(line);
  }
  // Tira introduções de lista ("nos seguintes casos:") que ficaram sem os itens.
  const isItem = (l) => /^\s*([-*•]|\d+[.)])\s/.test(l);
  keptLines = keptLines.filter((line, i) => {
    if (!/:\**\s*$/.test(line)) return true;
    const next = keptLines.slice(i + 1).find((l) => l.trim());
    return Boolean(next && isItem(next));
  });
  const cleaned = keptLines.join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const ratio = keptSupported > 0 ? keptOfficial / keptSupported : 0;
  const sources = [...usedOfficial].map((i) => chunks[i]);
  // Linhas que só citam a base legal ou a fonte não respondem nada; precisa sobrar uma frase de conteúdo.
  const substantiveChars = keptLines
    .filter((line) => line.trim() && !/^\s*#/.test(line))
    .filter((line) => !/^\s*([-*•]\s*)?\**\s*(base legal|fundamenta[çc][ãa]o( legal)?|fontes?( oficiais| consultadas)?|refer[êe]ncias?( legais)?|legisla[çc][ãa]o)\s*\**\s*:/i.test(line))
    .join(' ').replace(/[*_#>`-]/g, ' ').replace(/\s+/g, ' ').trim().length;
  // Precisa sobrar conteúdo de verdade apoiado em fonte oficial, não só a frase de abertura.
  const accepted = !noSource && !firstAnswerDropped && sources.length > 0 && ratio >= MIN_OFFICIAL_SUPPORT_RATIO
    && keptOfficial >= 60 && cleaned.length >= 40 && substantiveChars >= 40;
  return { accepted, text: cleaned, ratio, sources, noSource };
}

async function resolveSourceUrl(source, timeoutMs = 2500) {
  const fallback = `https://${source.domain}`;
  if (!/^https?:\/\//i.test(source.uri)) return fallback;
  if (!/vertexaisearch\.cloud\.google\.com/i.test(source.uri)) {
    try { return isOfficialDomain(new URL(source.uri).hostname) ? source.uri : fallback; } catch { return fallback; }
  }
  try {
    const r = await fetch(source.uri, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const loc = r.headers.get('location');
    if (loc && /^https?:\/\//i.test(loc)) {
      const host = new URL(loc).hostname;
      if (isOfficialDomain(host)) return loc;
    }
  } catch { /* usa o domínio */ }
  return fallback;
}

function generateContentUrl(baseURL = '', model = '') {
  const base = String(baseURL || '').replace(/\/+$/, '');
  if (/aiplatform\.googleapis\.com/i.test(base)) return `${base}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

// Retorna { text, sources:[{title,url}], ratio, model, ms, usage } ou null se nada oficial confirmou.
export async function searchOfficialWeb({
  question,
  conversationContext = '',
  agentTitle = '',
  baseURL,
  apiKey,
  model = 'gemini-3-flash-preview',
  timeoutMs = 40000,
  thinkingLevel = 'high',
  gaps = [],
  fetchImpl = fetch,
} = {}) {
  if (!apiKey || !String(question || '').trim()) return null;
  const startedAt = Date.now();
  const url = generateContentUrl(baseURL, model);
  const userText = buildUserText(question, conversationContext, gaps);
  // Todas as variantes correm em paralelo; a primeira aceita encerra a busca e cancela as outras.
  const controller = new AbortController();
  const signal = AbortSignal.any ? AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const calls = buildSystemPrompts(agentTitle).map(async (sys) => {
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
          ...(/^gemini-3/i.test(model) ? { thinkingConfig: { thinkingLevel } } : {}),
        },
      }),
      signal,
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(payload?.error?.message || `HTTP ${r.status}`);
    return { ...evaluateGroundedCandidate(payload), usage: payload?.usageMetadata || {} };
  });
  const ok = [];
  const errors = [];
  await new Promise((resolve) => {
    let pending = calls.length;
    for (const p of calls) {
      p.then((c) => {
        ok.push(c);
        if (c.accepted) resolve();
      }, (e) => {
        if (e?.name !== 'AbortError') errors.push(e?.message || String(e));
      }).finally(() => { if (--pending === 0) resolve(); });
    }
  });
  controller.abort();
  const best = ok.filter((c) => c.accepted).sort((a, b) => b.ratio - a.ratio || b.sources.length - a.sources.length)[0];
  const usage = ok.reduce((acc, c) => ({
    prompt: acc.prompt + Number(c.usage?.promptTokenCount || 0),
    completion: acc.completion + Number(c.usage?.candidatesTokenCount || 0) + Number(c.usage?.thoughtsTokenCount || 0),
  }), { prompt: 0, completion: 0 });
  if (!best) return { found: false, errors, usage, ms: Date.now() - startedAt, model };

  const unique = [];
  for (const s of best.sources) if (!unique.some((u) => u.domain === s.domain && u.title === s.title)) unique.push(s);
  const urls = await Promise.all(unique.slice(0, 4).map((s) => resolveSourceUrl(s)));
  const seen = new Set();
  const sources = unique.slice(0, 4).map((s, i) => ({ title: s.title || s.domain, url: urls[i] }))
    .filter((s) => (seen.has(s.url) ? false : seen.add(s.url)));
  return { found: true, text: best.text, sources, ratio: best.ratio, errors, usage, ms: Date.now() - startedAt, model };
}

export function buildOfficialWebAnswer(result, now = new Date()) {
  const date = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const links = result.sources.map((s) => `- [${s.title}](${s.url})`).join('\n');
  return [
    'Não encontrei essa informação nos documentos deste agente, então pesquisei em **fontes oficiais na internet**:',
    result.text,
    `**Fontes oficiais:**\n${links}`,
    `_Pesquisa feita em ${date}. Por vir da internet e não da base do agente, confira no link oficial antes de usar._`,
  ].join('\n\n');
}

// Acrescenta ao fim de uma resposta da base o que a fonte oficial confirmou sobre os pontos que faltaram.
export function buildOfficialWebComplement(baseAnswer = '', result, now = new Date()) {
  const date = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const links = result.sources.map((s) => `- [${s.title}](${s.url})`).join('\n');
  return [
    String(baseAnswer || '').trim(),
    '---',
    '**Complemento em fontes oficiais** (o que os documentos do agente não traziam):',
    result.text,
    `**Fontes oficiais:**\n${links}`,
    `_Complemento pesquisado na internet em ${date}. Confira no link oficial antes de usar._`,
  ].join('\n\n');
}
