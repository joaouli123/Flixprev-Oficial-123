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

export function looksLikeMissingAnswer(text = '') {
  const raw = String(text || '').trim();
  if (!raw || raw.length > MISSING_ANSWER_MAX_CHARS) return false;
  const norm = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return MISSING_PATTERNS.some((re) => re.test(norm));
}

const BASE_RULES = [
  'Você é um assistente jurídico brasileiro (previdenciário e trabalhista) consultado em último caso, porque a base de documentos do agente não tinha a resposta.',
  'Responda em português do Brasil, direto e objetivo (no máximo 10 linhas), com números, datas e nº de lei/portaria/súmula/tema exatos.',
  'Use SOMENTE o que fontes oficiais confirmam: planalto.gov.br, gov.br (INSS, Previdência, Receita, MTE), in.gov.br (Diário Oficial), stf.jus.br, stj.jus.br, tst.jus.br, jt.jus.br, cjf.jus.br, trf/trt (.jus.br), camara.leg.br, senado.leg.br.',
  'Não use nem cite blogs, escritórios, portais de notícia ou vídeos. Não invente. Não escreva lista de fontes no final.',
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

function buildUserText(question = '', conversationContext = '') {
  const ctx = String(conversationContext || '').trim().slice(-1500);
  return ctx ? `Contexto recente da conversa:\n${ctx}\n\nPergunta atual: ${question}` : question;
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
  let supported = 0;
  let officialSupported = 0;
  const usedOfficial = new Set();
  for (const s of gm.groundingSupports || []) {
    const segText = String(s?.segment?.text || '');
    const len = segText.length || Math.max(0, (s?.segment?.endIndex || 0) - (s?.segment?.startIndex || 0));
    const idx = s?.groundingChunkIndices || [];
    supported += len;
    const off = idx.filter((i) => official.has(i));
    if (off.length) {
      officialSupported += len;
      off.forEach((i) => usedOfficial.add(i));
    }
  }
  const cleaned = text
    .replace(/(^|\n)[ \t]*\**Fontes?( consultadas| oficiais)?:?\**:?[^\n]*(\n[ \t]*[-*][^\n]*)*\s*$/i, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const ratio = supported > 0 ? officialSupported / supported : 0;
  const noSource = !text || text.includes(NO_SOURCE_TOKEN);
  const sources = [...usedOfficial].map((i) => chunks[i]);
  const accepted = !noSource && sources.length > 0 && ratio >= MIN_OFFICIAL_SUPPORT_RATIO && cleaned.length >= 40;
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
  timeoutMs = 12000,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey || !String(question || '').trim()) return null;
  const startedAt = Date.now();
  const url = generateContentUrl(baseURL, model);
  const userText = buildUserText(question, conversationContext);
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
          ...(/^gemini-3/i.test(model) ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
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
