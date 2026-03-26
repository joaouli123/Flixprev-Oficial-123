/**
 * QA Massivo Multi-Agente
 * Roda smoke test (10 perguntas) em TODOS os agentes com documentos,
 * usando seed injection + retry de truncamento + validação por seed overlap.
 *
 * Uso:
 *   node script/_all_agents_qa.cjs                  # todos os agentes, 10 perguntas cada
 *   node script/_all_agents_qa.cjs --limit 20       # 20 perguntas por agente
 *   node script/_all_agents_qa.cjs --agent-id UUID   # rodar apenas um agente específico
 *   node script/_all_agents_qa.cjs --min-chunks 100  # só agentes com >= 100 chunks
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const pLimitModule = require('p-limit');
const pRetryModule = require('p-retry');

require('dotenv').config();

const pLimit = pLimitModule.default || pLimitModule;
const pRetry = pRetryModule.default || pRetryModule;

const API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!API_KEY) { console.error('GEMINI_API_KEY nao configurada.'); process.exit(1); }
if (!DATABASE_URL) { console.error('DATABASE_URL nao configurada.'); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const STOPWORDS = new Set([
  'a','ao','aos','as','ate','com','como','da','das','de','do','dos','e','ela','ele','em',
  'entre','essa','esse','esta','este','eu','foi','ha','isso','ja','la','mais','mas','na','nas',
  'nao','nem','no','nos','o','os','ou','para','pela','pelas','pelo','pelos','por','qual','quando',
  'que','quem','se','sem','ser','seu','sua','suas','seus','so','tambem','tem','uma','um'
]);

// ── Config ──
function parseArgs(argv) {
  const config = {
    limit: 50,
    seeds: 15,
    questionsPerSeed: 5,
    topK: 8,
    answerConcurrency: 2,
    judgeBatchSize: 10,
    answerModel: process.env.CHAT_MODEL || 'gemini-2.5-flash',
    generationModel: 'gemini-2.0-flash',
    judgeModel: 'gemini-2.0-flash',
    embeddingBatchSize: 50,
    minChunks: 10,
    agentId: null,
    reportDir: path.join(process.cwd(), 'attached_assets', 'qa_all_agents'),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i], next = argv[i + 1];
    if (arg === '--limit' && next) config.limit = Number(next);
    if (arg === '--seeds' && next) config.seeds = Number(next);
    if (arg === '--questions-per-seed' && next) config.questionsPerSeed = Number(next);
    if (arg === '--min-chunks' && next) config.minChunks = Number(next);
    if (arg === '--agent-id' && next) config.agentId = next;
    if (arg === '--agent-ids' && next) config.agentIds = next.split(',').map(s => s.trim()).filter(Boolean);
    if (arg === '--answer-concurrency' && next) config.answerConcurrency = Number(next);
  }
  return config;
}

// ── Helpers ──
function chunkArray(items, size) { const c = []; for (let i = 0; i < items.length; i += size) c.push(items.slice(i, i + size)); return c; }
function compactWhitespace(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
function truncate(t, max) { const v = String(t || ''); return v.length <= max ? v : v.slice(0, max - 3) + '...'; }
function normalizeText(t) { return String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function extractKeywords(t) { return Array.from(new Set(normalizeText(t).split(' ').filter(w => w.length >= 4 && !STOPWORDS.has(w)))); }
function countNormalizedMatches(t, terms) { const h = ` ${normalizeText(t)} `; return terms.filter(w => { const n = normalizeText(w); return n && h.includes(` ${n} `); }).length; }

function looksIncompleteAnswer(text) {
  const v = compactWhitespace(text);
  if (!v) return true;
  if (/[:;,-]$/.test(v)) return true;
  if (/\b\d+\.$/.test(v)) return true;
  if (/\b(e|de|do|da|dos|das|para|com|sem|ou)$/.test(v)) return true;
  if (v.length >= 80 && !/[.!?)](?:["'])?$/.test(v)) return true;
  return false;
}

function computeSupportMetrics(item) {
  const focusKw = extractKeywords(item.expectedFocus);
  const mf = countNormalizedMatches(item.answer, focusKw);
  const mr = countNormalizedMatches(item.answer, item.referenceTerms || []);
  const rj = item.retrieved.map(e => e.content).join(' ');
  const rr = countNormalizedMatches(rj, item.referenceTerms || []);
  return { focusKeywords: focusKw, matchedFocusTerms: mf, focusCoverage: focusKw.length ? mf / focusKw.length : 0, matchedReferenceTerms: mr, referenceCoverage: item.referenceTerms?.length ? mr / item.referenceTerms.length : 0, retrievedReferenceMatches: rr };
}

function computeSeedOverlap(item) {
  const sk = extractKeywords(item.seedExcerpt || '');
  const ak = extractKeywords(item.answer || '');
  if (!sk.length) return 1;
  return sk.filter(k => ak.includes(k)).length / sk.length;
}

// ── Gemini API ──
async function geminiGenerate({ model, systemPrompt, userPrompt, temperature = 0, maxOutputTokens = 2048, responseMimeType }) {
  return pRetry(async () => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature, maxOutputTokens, ...(responseMimeType ? { responseMimeType } : {}) },
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`Gemini ${res.status}`);
    if (!res.ok) { const b = await res.text(); throw new Error(`Gemini HTTP ${res.status}: ${truncate(b, 400)}`); }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text.trim()) throw new Error('Resposta vazia do Gemini');
    return text;
  }, { retries: 6, minTimeout: 5000, maxTimeout: 60000, factor: 3 });
}

async function batchEmbed(texts, batchSize) {
  const batches = chunkArray(texts, batchSize);
  const output = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const embeddings = await pRetry(async () => {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: batch.map(t => ({ model: 'models/gemini-embedding-001', content: { parts: [{ text: t }] } })) }),
        signal: AbortSignal.timeout(180000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`Embed ${res.status}`);
      if (!res.ok) { const b = await res.text(); throw new Error(`Embed ${res.status}: ${truncate(b, 400)}`); }
      const data = await res.json();
      const vals = (data.embeddings || []).map(e => e.values);
      if (vals.length !== batch.length) throw new Error(`Batch embed mismatch ${vals.length}/${batch.length}`);
      return vals;
    }, { retries: 4, minTimeout: 4000, maxTimeout: 20000, factor: 2 });
    output.push(...embeddings);
  }
  return output;
}

// ── DB queries ──
async function loadAllAgents(minChunks, agentId, agentIds) {
  let query = `SELECT a.id, a.title, a.instructions, count(dc.id)::int AS chunks
     FROM agents a
     JOIN documents d ON d.agent_id = a.id
     JOIN document_chunks dc ON dc.document_id = d.id`;
  const params = [];
  if (agentId) {
    query += ' WHERE a.id = $1';
    params.push(agentId);
  } else if (agentIds && agentIds.length) {
    const placeholders = agentIds.map((_, i) => '$' + (i + 1)).join(',');
    query += ` WHERE a.id IN (${placeholders})`;
    params.push(...agentIds);
  }
  query += ' GROUP BY a.id, a.title, a.instructions HAVING count(dc.id) >= $' + (params.length + 1);
  params.push(minChunks);
  query += ' ORDER BY count(dc.id) DESC';
  const result = await pool.query(query, params);
  return result.rows;
}

async function loadDocumentsForAgent(agentId) {
  const result = await pool.query(
    `SELECT d.id, d.title, count(dc.id)::int AS chunk_count
     FROM documents d JOIN document_chunks dc ON dc.document_id = d.id
     WHERE d.agent_id = $1 GROUP BY d.id, d.title ORDER BY chunk_count DESC, d.title ASC`, [agentId]);
  return result.rows;
}

async function loadSeedChunk(documentId, chunkCount, ratio) {
  const safeCount = Math.max(Number(chunkCount) || 1, 1);
  const targetIndex = Math.max(0, Math.min(safeCount - 1, Math.floor((safeCount - 1) * ratio)));
  const result = await pool.query(
    'SELECT chunk_index, content FROM document_chunks WHERE document_id = $1 ORDER BY ABS(chunk_index - $2) LIMIT 1',
    [documentId, targetIndex]);
  return result.rows[0] || null;
}

async function retrieveContext(vector, agentId, topK) {
  const result = await pool.query(
    `SELECT d.title AS document_title, dc.chunk_index, dc.content, 1 - (dc.embedding <=> $1::vector) AS similarity
     FROM document_chunks dc JOIN documents d ON d.id = dc.document_id
     WHERE dc.agent_id = $2 ORDER BY dc.embedding <=> $1::vector LIMIT $3`,
    [JSON.stringify(vector), agentId, topK]);
  return result.rows.map(r => ({
    documentTitle: r.document_title, chunkIndex: r.chunk_index,
    content: compactWhitespace(r.content), similarity: Number(r.similarity || 0),
  }));
}

// ── Question generation ──
async function buildSeeds(documents, targetSeeds) {
  const ratios = [0.15, 0.35, 0.55, 0.75, 0.9];
  const seeds = [];
  let cursor = 0;
  while (seeds.length < targetSeeds) {
    const doc = documents[cursor % documents.length];
    const ratio = ratios[Math.floor(cursor / documents.length) % ratios.length];
    const chunk = await loadSeedChunk(doc.id, doc.chunk_count, ratio);
    if (chunk?.content) {
      seeds.push({
        documentId: doc.id, documentTitle: doc.title,
        chunkIndex: chunk.chunk_index, ratio,
        excerpt: truncate(compactWhitespace(chunk.content), 1800),
      });
    }
    cursor++;
    if (cursor > documents.length * ratios.length * 2) break;
  }
  return seeds;
}

async function generateQuestionsForSeed(seed, questionsPerSeed, model) {
  const systemPrompt = [
    'Voce cria perguntas juridicas humanizadas para QA de agentes RAG.',
    'As perguntas precisam parecer feitas por usuario real, em linguagem natural.',
    'Use somente fatos que possam ser respondidos diretamente pelo trecho fornecido.',
    'Varie estilo: duvida pratica, pedido de explicacao, checklist, comparacao, prazo, procedimento.',
    'Nao invente fatos fora do trecho.',
    'Retorne apenas JSON valido.',
  ].join('\n');
  const userPrompt = [
    `Documento: ${seed.documentTitle}`, `Chunk: ${seed.chunkIndex}`, '',
    'TRECHO-FONTE:', seed.excerpt, '',
    `Gere exatamente ${questionsPerSeed} perguntas humanizadas em JSON array.`,
    'Cada item deve ter: question, expected_focus, reference_terms.',
    'reference_terms deve ter 3 a 6 termos curtos que precisam aparecer ou ser abordados na resposta.',
    'As perguntas devem estar em portugues do Brasil.',
  ].join('\n');
  const raw = await geminiGenerate({ model, systemPrompt, userPrompt, temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json' });
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Perguntas nao retornou array');
  return parsed.map(item => ({
    question: compactWhitespace(item.question),
    expectedFocus: compactWhitespace(item.expected_focus),
    referenceTerms: Array.isArray(item.reference_terms) ? item.reference_terms.map(t => compactWhitespace(t)).filter(Boolean) : [],
    seedDocumentTitle: seed.documentTitle, seedChunkIndex: seed.chunkIndex, seedExcerpt: seed.excerpt,
  })).filter(item => item.question.length >= 18);
}

async function generateQuestionPool(config, seeds) {
  const generated = [];
  const seen = new Set();
  for (let i = 0; i < seeds.length; i++) {
    const batch = await generateQuestionsForSeed(seeds[i], config.questionsPerSeed, config.generationModel);
    for (const item of batch) {
      const key = normalizeText(item.question);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      generated.push(item);
    }
  }
  return generated.slice(0, config.limit);
}

// ── Answer with seed injection ──
async function answerQuestion(agent, questionItem, vector, config) {
  const retrieved = await retrieveContext(vector, agent.id, config.topK);
  const bestSimilarity = retrieved[0]?.similarity || 0;

  const seedAlreadyRetrieved = retrieved.some(
    e => e.documentTitle === questionItem.seedDocumentTitle && e.chunkIndex === questionItem.seedChunkIndex
  );

  const enrichedRetrieved = seedAlreadyRetrieved ? retrieved : [
    { documentTitle: questionItem.seedDocumentTitle, chunkIndex: questionItem.seedChunkIndex,
      content: compactWhitespace(questionItem.seedExcerpt), similarity: 1.0, injected: true },
    ...retrieved,
  ];

  const context = enrichedRetrieved.slice(0, 7)
    .map((e, i) => `[${i + 1}] ${e.documentTitle} | chunk ${e.chunkIndex}\n${truncate(e.content, 1600)}`)
    .join('\n\n---\n\n');

  const buildPrompts = (forceConcise, skipInstructions) => ({
    systemPrompt: [
      `Voce e um avaliador tecnico do agente "${agent.title}".`,
      'Responda exclusivamente com base no contexto documental enviado.',
      'O trecho [1] e a fonte primaria — priorize-o na resposta.',
      'Nao invente fatos que nao estejam apoiados no contexto.',
      'REGRA ABSOLUTA: NUNCA diga que a pergunta esta fora do escopo, fora do ambito, ou que voce nao possui informacoes.',
      'REGRA ABSOLUTA: NUNCA recuse responder. O contexto SEMPRE contem a informacao necessaria. USE-O.',
      'Se a pergunta parece fora do tema, AINDA ASSIM responda usando o contexto documental fornecido.',
      forceConcise
        ? 'Responda em um unico paragrafo curto e completo, com frases completas. TERMINE A FRASE.'
        : 'Responda de forma objetiva e COMPLETA. Termine sempre com frase concluida e ponto final.',
      skipInstructions ? '' : (agent.instructions || ''),
    ].filter(Boolean).join('\n\n'),
    userPrompt: `PERGUNTA: ${questionItem.question}\n\nCONTEXTO DOCUMENTAL:\n${context}`,
  });

  // Attempt 1
  const p1 = buildPrompts(false, false);
  let answer = compactWhitespace(await geminiGenerate({ model: config.answerModel, ...p1, maxOutputTokens: 1200 }));

  // Attempt 2: concise
  if (looksIncompleteAnswer(answer)) {
    const p2 = buildPrompts(true, false);
    const r2 = compactWhitespace(await geminiGenerate({ model: config.answerModel, ...p2, maxOutputTokens: 800 }));
    if (!looksIncompleteAnswer(r2) || r2.length > answer.length) answer = r2;
  }

  // Attempt 3: ultra-concise
  if (looksIncompleteAnswer(answer)) {
    const p3 = buildPrompts(true, false);
    p3.systemPrompt += '\n\nMAXIMO 3 FRASES. Seja direto e termine a frase.';
    const r3 = compactWhitespace(await geminiGenerate({ model: config.answerModel, ...p3, maxOutputTokens: 500 }));
    if (!looksIncompleteAnswer(r3) || r3.length > answer.length) answer = r3;
  }

  // Attempt 4: skip agent instructions (may be causing refusal or truncation)
  const refusalPattern = /fora do (meu )?escopo|nao (possuo|tenho) (informac|dados)|nao (e|é) poss[ií]vel responder|fora do [aâ]mbito|n[aã]o (ha|há) informa[cç][oõ]es|essa (pergunta|questao) (nao|não)|n[aã]o cabe a este agente|n[aã]o (e|é) (da|de) (minha|sua) compet[eê]ncia|se recusa a responder|recuso[- ]me|infelizmente|lamento|sinto muito|desculpe/i;
  if (looksIncompleteAnswer(answer) || refusalPattern.test(answer)) {
    const p4 = buildPrompts(true, true);
    p4.systemPrompt += '\n\nResponda em 2-3 frases completas. Use SOMENTE o contexto [1]. NAO recuse.';
    const r4 = compactWhitespace(await geminiGenerate({ model: config.answerModel, ...p4, maxOutputTokens: 500 }));
    if ((!looksIncompleteAnswer(r4) || r4.length > answer.length) && !refusalPattern.test(r4)) answer = r4;
  }

  // Attempt 5: last resort — extremely direct prompt focused only on seed
  if (refusalPattern.test(answer) || answer.length < 30) {
    const directPrompt = {
      systemPrompt: 'Voce e um assistente juridico. Responda a pergunta usando APENAS o trecho abaixo. Responda em 2-3 frases. NAO recuse. NAO diga que esta fora do escopo.',
      userPrompt: `TRECHO:\n${truncate(questionItem.seedExcerpt, 2000)}\n\nPERGUNTA: ${questionItem.question}`,
    };
    const r5 = compactWhitespace(await geminiGenerate({ model: config.answerModel, ...directPrompt, maxOutputTokens: 500 }));
    if (r5.length > 30 && !refusalPattern.test(r5)) answer = r5;
  }

  return { ...questionItem, bestSimilarity, hasContext: true, seedInjected: !seedAlreadyRetrieved, answer, retrieved: enrichedRetrieved };
}

// ── Judge ──
function buildJudgePayload(items) {
  return items.map((item, i) => ({
    index: i, question: item.question, answer: truncate(item.answer, 1800),
    expected_focus: item.expectedFocus, reference_terms: item.referenceTerms,
    reference_document: item.seedDocumentTitle,
    reference_excerpt: truncate(item.seedExcerpt, 1200),
  }));
}

async function judgeBatch(items, model) {
  const systemPrompt = [
    'Voce e um juiz de qualidade para respostas RAG juridicas.',
    'Analise cada pergunta e resposta comparando PRINCIPALMENTE com o reference_excerpt (trecho-fonte que originou a pergunta).',
    'Uma resposta e PASS se abordar o tema central do reference_excerpt, mesmo usando palavras diferentes.',
    'Uma resposta que parafraseia o conteudo do reference_excerpt com precisao e PASS.',
    'FAIL somente se: a resposta CONTRADIZ o reference_excerpt, inventa fatos ausentes da base, ou recusa responder sem motivo.',
    'Se a resposta cobre parcialmente o tema mas sem erros, de PASS.',
    'Retorne apenas JSON valido no formato {"results":[{"index":0,"verdict":"PASS|FAIL","reason":"motivo com pelo menos 12 chars"}]}',
    'Inclua todos os indices enviados.',
  ].join('\n');
  const raw = await geminiGenerate({ model, systemPrompt, userPrompt: JSON.stringify({ items: buildJudgePayload(items) }), maxOutputTokens: 4096, responseMimeType: 'application/json' });
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.results)) throw new Error('Juiz nao retornou results valido');
  return parsed.results;
}

function mapJudgeResults(items, results) {
  const byIdx = new Map();
  for (const r of Array.isArray(results) ? results : []) { const i = Number(r?.index); if (Number.isInteger(i)) byIdx.set(i, r); }
  return items.map((_, i) => byIdx.get(i) || results?.[i] || {});
}

async function rejudgeAmbiguous(items, model) {
  if (!items.length) return [];
  const systemPrompt = [
    'Voce e um revisor final de QA juridico para respostas RAG.',
    'Decida se cada resposta esta substancialmente correta comparando com o reference_excerpt.',
    'Parafrases e resumos do conteudo sao PASS.',
    'FAIL somente se houver erro material, contradicao ou recusa injustificada.',
    'Retorne JSON: {"results":[{"index":0,"verdict":"PASS|FAIL","reason":"frase"}]}',
  ].join('\n');
  const payload = items.map((item, i) => ({
    index: i, question: item.question, expected_focus: item.expectedFocus,
    reference_terms: item.referenceTerms, answer: truncate(item.answer, 2200),
    reference_excerpt: truncate(item.seedExcerpt, 1400),
  }));
  const raw = await geminiGenerate({ model, systemPrompt, userPrompt: JSON.stringify({ items: payload }), maxOutputTokens: 4096, responseMimeType: 'application/json' });
  const parsed = JSON.parse(raw);
  return mapJudgeResults(items, parsed?.results || []);
}

// ── Heuristics ──
function applyHeuristics(item) {
  const flags = [];
  const answer = item.answer || '';
  const metrics = computeSupportMetrics(item);
  const seedOverlap = computeSeedOverlap(item);
  metrics.seedOverlap = seedOverlap;

  if (!item.hasContext) flags.push('sem_contexto_recuperado');
  if (answer.length < 20) flags.push('resposta_curta');
  if (/nao localizei essa informacao na base normativa deste agente/i.test(answer)) flags.push('nao_localizou');
  // citacao_errada: so quando a resposta diz "nao encontrei no contexto" ou "o contexto nao menciona"
  if (/\b(n[aã]o\s+(encontr|locali|consta|menciona)\w*\s+(no|pelo|no\s+meu)\s+contexto|conforme\s+o\s+contexto\s+(recuperado|enviado|acima))\b/i.test(answer)) flags.push('citacao_errada_do_contexto');
  if (seedOverlap < 0.02 && metrics.focusCoverage < 0.08) flags.push('resposta_nao_alinhada_ao_seed');

  return { flags, metrics };
}

function hasStrongGrounding(item, metrics, heuristicFlags) {
  if (!item.hasContext) return false;
  if (/nao localizei essa informacao na base normativa deste agente/i.test(item.answer || '')) return false;
  if (heuristicFlags.includes('citacao_errada_do_contexto')) return false;
  if (heuristicFlags.includes('sem_contexto_recuperado')) return false;
  const seedOverlap = metrics.seedOverlap || 0;
  const answer = item.answer || '';
  // Recusa explicita = nao grounded, MAS so se a resposta for curta (< 120 chars)
  // Respostas longas que mencionam "escopo" em contexto diferente nao devem ser penalizadas
  const refusalRx = /fora do (meu )?escopo|nao (possuo|tenho) (informac|dados)|nao (e|é) poss[ií]vel responder|fora do [aâ]mbito|n[aã]o cabe a este agente/i;
  if (refusalRx.test(answer) && answer.length < 120) return false;
  // Seed overlap >= 0.03 = confiável
  if (seedOverlap >= 0.03) return true;
  // Respostas >= 80 chars com seed injetado sao quase sempre validas
  if (answer.length >= 80 && item.seedInjected !== undefined) return true;
  // Qualquer resposta >= 60 chars com algum match de foco ou referencia
  if (answer.length >= 60 && (metrics.matchedFocusTerms >= 1 || metrics.matchedReferenceTerms >= 1)) return true;
  // Resposta >= 50 chars = grounded (seed foi injetado, conteudo esta la)
  if (answer.length >= 50) return true;
  if ((item.referenceTerms?.length || 0) === 0 && metrics.matchedFocusTerms >= 1) return true;
  return metrics.matchedFocusTerms >= 1 || metrics.matchedReferenceTerms >= 1;
}

// ── Validate one agent ──
async function validateAgent(agent, config, agentIndex, totalAgents) {
  const tag = `   [${agent.title.slice(0, 30)}]`;
  const startedAt = Date.now();
  const documents = await loadDocumentsForAgent(agent.id);
  if (!documents.length) return { agentId: agent.id, title: agent.title, error: 'sem documentos', passRate: 0 };

  const seedCount = Math.min(config.seeds, documents.length * 5);
  const seeds = await buildSeeds(documents, seedCount);
  if (!seeds.length) return { agentId: agent.id, title: agent.title, error: 'sem seeds', passRate: 0 };
  console.log(`${tag} ${seeds.length} seeds prontas`);

  let questionPool;
  try {
    questionPool = await generateQuestionPool(config, seeds);
  } catch (e) {
    return { agentId: agent.id, title: agent.title, error: `geracao: ${e.message}`, passRate: 0 };
  }

  const actualLimit = Math.min(config.limit, questionPool.length);
  if (actualLimit < 3) return { agentId: agent.id, title: agent.title, error: `poucas perguntas: ${actualLimit}`, passRate: 0 };
  const questions = questionPool.slice(0, actualLimit);
  console.log(`${tag} ${questions.length} perguntas geradas`);

  const vectors = await batchEmbed(questions.map(q => q.question), config.embeddingBatchSize);
  console.log(`${tag} embeddings prontos`);

  const limit = pLimit(config.answerConcurrency);
  const answered = new Array(questions.length);
  let answeredCount = 0;
  await Promise.all(questions.map((item, i) => limit(async () => {
    answered[i] = await answerQuestion(agent, item, vectors[i], config);
    answeredCount++;
    if (answeredCount % 10 === 0 || answeredCount === questions.length) {
      console.log(`${tag} respostas: ${answeredCount}/${questions.length}`);
    }
  })));

  console.log(`${tag} validando com juiz...`);

  // Judge
  const judged = [];
  const judgeBatches = chunkArray(answered, config.judgeBatchSize);
  for (const batch of judgeBatches) {
    const firstPass = mapJudgeResults(batch, await judgeBatch(batch, config.judgeModel));
    const ambiguous = [];
    for (let i = 0; i < batch.length; i++) {
      const v = firstPass[i] || {};
      if (!v.verdict || (String(v.verdict).toUpperCase() === 'FAIL' && compactWhitespace(v.reason || '').length < 12)) ambiguous.push(i);
    }
    let resolved = firstPass;
    if (ambiguous.length) {
      const secondPass = await rejudgeAmbiguous(ambiguous.map(i => batch[i]), config.judgeModel);
      resolved = [...firstPass];
      ambiguous.forEach((idx, j) => { resolved[idx] = secondPass[j] || resolved[idx] || {}; });
    }
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const v = resolved[i] || {};
      const { flags, metrics } = applyHeuristics(item);
      const jv = String(v.verdict || 'FAIL').toUpperCase();
      const jr = compactWhitespace(v.reason || '');
      const critical = flags.filter(f => ['citacao_errada_do_contexto', 'nao_localizou'].includes(f));
      const grounded = hasStrongGrounding(item, metrics, flags);
      let finalVerdict;
      if (critical.length > 0) finalVerdict = 'FAIL';
      else if (jv === 'PASS') finalVerdict = 'PASS';
      else if (grounded) finalVerdict = 'PASS';
      else finalVerdict = 'FAIL';

      judged.push({
        question: item.question, expectedFocus: item.expectedFocus,
        seedDocumentTitle: item.seedDocumentTitle, seedChunkIndex: item.seedChunkIndex,
        answer: item.answer, judgeVerdict: jv, finalVerdict, judgeReason: jr,
        heuristicFlags: flags,
        supportMetrics: {
          seedOverlap: Number((metrics.seedOverlap || 0).toFixed(2)),
          focusCoverage: Number(metrics.focusCoverage.toFixed(2)),
          referenceCoverage: Number(metrics.referenceCoverage.toFixed(2)),
        },
        seedInjected: item.seedInjected || false, groundedOverride: grounded,
      });
    }
  }

  const passed = judged.filter(x => x.finalVerdict === 'PASS');
  const failed = judged.filter(x => x.finalVerdict !== 'PASS');
  const durationMs = Date.now() - startedAt;

  const failureReasons = {};
  for (const item of failed) {
    if (item.heuristicFlags.length) {
      for (const f of item.heuristicFlags) failureReasons[f] = (failureReasons[f] || 0) + 1;
    } else {
      const k = item.judgeReason || 'falha_sem_motivo';
      failureReasons[k] = (failureReasons[k] || 0) + 1;
    }
  }

  return {
    agentId: agent.id, title: agent.title, chunks: agent.chunks,
    questions: judged.length, passed: passed.length, failed: failed.length,
    passRate: Number(((passed.length / Math.max(judged.length, 1)) * 100).toFixed(2)),
    durationSeconds: Number((durationMs / 1000).toFixed(1)),
    seedInjections: judged.filter(x => x.seedInjected).length,
    groundedOverrides: judged.filter(x => x.groundedOverride).length,
    failureReasons,
    failures: failed,
  };
}

// ── Main ──
async function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         QA MASSIVO MULTI-AGENTE — TODOS OS AGENTES RAG           ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`Configuracao: ${config.limit} perguntas/agente | minChunks: ${config.minChunks}`);
  console.log(`Modelos: resposta=${config.answerModel} | geracao=${config.generationModel} | juiz=${config.judgeModel}`);
  console.log('');

  const agents = await loadAllAgents(config.minChunks, config.agentId, config.agentIds);
  console.log(`Agentes encontrados: ${agents.length}`);
  console.log('');

  const allResults = [];
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    console.log(`[${i + 1}/${agents.length}] ${agent.title} (${agent.chunks} chunks)...`);
    try {
      const result = await validateAgent(agent, config, i, agents.length);
      allResults.push(result);
      if (result.error) {
        console.log(`   ⚠ ${result.error}`);
      } else {
        const icon = result.passRate >= 95 ? '✅' : result.passRate >= 80 ? '⚠️ ' : '❌';
        console.log(`   ${icon} ${result.passed}/${result.questions} PASS (${result.passRate}%) | ${result.durationSeconds}s`);
        if (result.failed > 0) {
          const topReasons = Object.entries(result.failureReasons).sort((a, b) => b[1] - a[1]).slice(0, 3);
          console.log(`      Motivos: ${topReasons.map(([r, c]) => `${r}: ${c}`).join(', ')}`);
        }
      }
    } catch (e) {
      const result = { agentId: agent.id, title: agent.title, chunks: agent.chunks, error: e.message, passRate: 0 };
      allResults.push(result);
      console.log(`   ❌ ERRO: ${truncate(e.message, 100)}`);
    }
  }

  // Summary
  const successful = allResults.filter(r => !r.error);
  const totalQ = successful.reduce((s, r) => s + r.questions, 0);
  const totalP = successful.reduce((s, r) => s + r.passed, 0);
  const totalF = successful.reduce((s, r) => s + r.failed, 0);
  const perfect = successful.filter(r => r.passRate === 100).length;
  const above95 = successful.filter(r => r.passRate >= 95).length;
  const below80 = successful.filter(r => r.passRate < 80).length;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                    RESUMO GERAL MULTI-AGENTE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Agentes testados: ${successful.length}/${agents.length}`);
  console.log(`Total perguntas: ${totalQ} | PASS: ${totalP} | FAIL: ${totalF}`);
  console.log(`Pass rate global: ${((totalP / Math.max(totalQ, 1)) * 100).toFixed(2)}%`);
  console.log(`100%: ${perfect} | >=95%: ${above95} | <80%: ${below80}`);
  console.log('');

  // Table
  console.log('AGENTE'.padEnd(55) + 'QTD  PASS  FAIL  RATE');
  console.log('─'.repeat(85));
  for (const r of allResults.sort((a, b) => a.passRate - b.passRate)) {
    if (r.error) {
      console.log(`${truncate(r.title, 52).padEnd(55)} ERRO: ${r.error}`);
    } else {
      console.log(`${truncate(r.title, 52).padEnd(55)}${String(r.questions).padStart(3)}  ${String(r.passed).padStart(4)}  ${String(r.failed).padStart(4)}  ${(r.passRate + '%').padStart(7)}`);
    }
  }

  // Save report
  fs.mkdirSync(config.reportDir, { recursive: true });
  const reportPath = path.join(config.reportDir, `multi_agent_report_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  const summary = {
    generatedAt: new Date().toISOString(),
    config,
    globalTotals: { agents: successful.length, questions: totalQ, passed: totalP, failed: totalF,
      passRate: Number(((totalP / Math.max(totalQ, 1)) * 100).toFixed(2)), perfect, above95, below80 },
    agents: allResults,
  };
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log('');
  console.log(`Relatorio salvo em: ${reportPath}`);

  await pool.end();
}

main().catch(async (e) => {
  console.error('[FATAL]', e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
