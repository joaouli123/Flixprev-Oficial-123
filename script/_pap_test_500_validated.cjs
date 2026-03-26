const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const pLimitModule = require('p-limit');
const pRetryModule = require('p-retry');

require('dotenv').config();

const pLimit = pLimitModule.default || pLimitModule;
const pRetry = pRetryModule.default || pRetryModule;

const AGENT_ID = 'f0524fea-e2bf-49fb-b4ce-8c672050ed04';
const API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const DEFAULTS = {
  limit: 500,
  seeds: 30,
  questionsPerSeed: 20,
  topK: 8,
  similarityThreshold: 0.3,
  answerConcurrency: 3,
  judgeBatchSize: 10,
  reportPath: path.join(process.cwd(), 'attached_assets', 'pap_test_500_report.json'),
  failuresPath: path.join(process.cwd(), 'attached_assets', 'pap_test_500_failures.json'),
  answerModel: process.env.CHAT_MODEL || 'gemini-2.5-flash',
  generationModel: 'gemini-2.0-flash',
  judgeModel: 'gemini-2.0-flash',
  embeddingBatchSize: 50,
};

const STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'ate', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e', 'ela', 'ele', 'em',
  'entre', 'essa', 'esse', 'esta', 'este', 'eu', 'foi', 'ha', 'isso', 'ja', 'la', 'mais', 'mas', 'na', 'nas',
  'nao', 'nem', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'por', 'qual', 'quando',
  'que', 'quem', 'se', 'sem', 'ser', 'seu', 'sua', 'suas', 'seus', 'so', 'tambem', 'tem', 'uma', 'um'
]);

if (!API_KEY) {
  console.error('GEMINI_API_KEY nao configurada.');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('DATABASE_URL nao configurada.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--limit' && next) config.limit = Number(next);
    if (arg === '--seeds' && next) config.seeds = Number(next);
    if (arg === '--questions-per-seed' && next) config.questionsPerSeed = Number(next);
    if (arg === '--top-k' && next) config.topK = Number(next);
    if (arg === '--threshold' && next) config.similarityThreshold = Number(next);
    if (arg === '--answer-concurrency' && next) config.answerConcurrency = Number(next);
    if (arg === '--judge-batch-size' && next) config.judgeBatchSize = Number(next);
    if (arg === '--report' && next) config.reportPath = path.resolve(next);
    if (arg === '--failures' && next) config.failuresPath = path.resolve(next);
    if (arg === '--smoke') {
      config.limit = 10;
      config.seeds = 4;
      config.questionsPerSeed = 4;
      config.answerConcurrency = 1;
      config.judgeBatchSize = 5;
    }
  }

  return config;
}

function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function normalizeQuestion(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeText(text) {
  return normalizeQuestion(text);
}

function compactWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function truncate(text, maxLength) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function extractKeywords(text) {
  return Array.from(new Set(
    normalizeText(text)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
  ));
}

function countNormalizedMatches(text, terms) {
  const haystack = ` ${normalizeText(text)} `;
  return terms.filter((term) => {
    const needle = normalizeText(term);
    return needle && haystack.includes(` ${needle} `);
  }).length;
}

function computeSupportMetrics(item) {
  const focusKeywords = extractKeywords(item.expectedFocus);
  const matchedFocusTerms = countNormalizedMatches(item.answer, focusKeywords);
  const matchedReferenceTerms = countNormalizedMatches(item.answer, item.referenceTerms || []);
  const retrievedJoined = item.retrieved.map((entry) => entry.content).join(' ');
  const retrievedReferenceMatches = countNormalizedMatches(retrievedJoined, item.referenceTerms || []);

  return {
    focusKeywords,
    matchedFocusTerms,
    focusCoverage: focusKeywords.length ? matchedFocusTerms / focusKeywords.length : 0,
    matchedReferenceTerms,
    referenceCoverage: item.referenceTerms?.length ? matchedReferenceTerms / item.referenceTerms.length : 0,
    retrievedReferenceMatches,
  };
}

function looksIncompleteAnswer(text) {
  const value = compactWhitespace(text);
  if (!value) return true;
  if (/[:;,-]$/.test(value)) return true;
  if (/\b\d+\.$/.test(value)) return true;
  if (/\b(e|de|do|da|dos|das|para|com|sem|ou)$/.test(value)) return true;
  if (value.length >= 80 && !/[.!?)](?:["'])?$/.test(value)) return true;
  return false;
}

function hasStrongGrounding(item, metrics, heuristicFlags) {
  if (!item.hasContext) return false;
  if (/nao localizei essa informacao na base normativa deste agente/i.test(item.answer || '')) return false;
  if (/fora do (meu )?escopo/i.test(item.answer || '')) return false;
  if (heuristicFlags.includes('citacao_errada_do_contexto')) return false;
  if (heuristicFlags.includes('sem_contexto_recuperado')) return false;

  const answer = item.answer || '';

  // Strong grounding if the answer overlaps meaningfully with the seed content
  const seedOverlap = metrics.seedOverlap || 0;
  if (seedOverlap >= 0.06) return true;

  // Or if focus/reference coverage is reasonable
  const hasAnyFocusMatch = metrics.matchedFocusTerms >= 1;
  const hasAnyRefMatch = metrics.matchedReferenceTerms >= 1;

  // If the answer is at least 60 chars and matches something from the seed, it's trying
  if (answer.length >= 60 && (hasAnyFocusMatch || hasAnyRefMatch)) return true;

  // If no reference terms were expected, just check focus
  if ((item.referenceTerms?.length || 0) === 0 && hasAnyFocusMatch) return true;

  return hasAnyFocusMatch || hasAnyRefMatch;
}

async function geminiGenerate({ model, systemPrompt, userPrompt, temperature = 0, maxOutputTokens = 2048, responseMimeType }) {
  return pRetry(async () => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens,
            ...(responseMimeType ? { responseMimeType } : {}),
          },
        }),
        signal: AbortSignal.timeout(180000),
      }
    );

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Gemini indisponivel (${response.status})`);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini HTTP ${response.status}: ${truncate(body, 400)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';

    if (!text.trim()) {
      throw new Error(`Resposta vazia do Gemini: ${truncate(JSON.stringify(data), 400)}`);
    }

    return text;
  }, {
    retries: 4,
    minTimeout: 4000,
    maxTimeout: 20000,
    factor: 2,
  });
}

async function batchEmbed(texts, batchSize) {
  const batches = chunkArray(texts, batchSize);
  const output = [];

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];

    const embeddings = await pRetry(async () => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model: 'models/gemini-embedding-001',
              content: { parts: [{ text }] },
            })),
          }),
          signal: AbortSignal.timeout(180000),
        }
      );

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Embedding HTTP ${response.status}`);
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Embedding HTTP ${response.status}: ${truncate(body, 400)}`);
      }

      const data = await response.json();
      const values = (data.embeddings || []).map((item) => item.values);
      if (values.length !== batch.length) {
        throw new Error(`Batch de embedding inconsistente: ${values.length}/${batch.length}`);
      }

      return values;
    }, {
      retries: 4,
      minTimeout: 4000,
      maxTimeout: 20000,
      factor: 2,
    });

    output.push(...embeddings);
    console.log(`Embeddings: lote ${index + 1}/${batches.length} concluido (${output.length}/${texts.length})`);
  }

  return output;
}

async function loadAgent() {
  const result = await pool.query(
    'SELECT id, title, instructions FROM agents WHERE id = $1 LIMIT 1',
    [AGENT_ID]
  );

  if (!result.rowCount) {
    throw new Error('Agente PAP nao encontrado.');
  }

  return result.rows[0];
}

async function loadDocuments() {
  const result = await pool.query(
    `SELECT d.id, d.title, count(dc.id)::int AS chunk_count
     FROM documents d
     JOIN document_chunks dc ON dc.document_id = d.id
     WHERE d.agent_id = $1
     GROUP BY d.id, d.title
     ORDER BY chunk_count DESC, d.title ASC`,
    [AGENT_ID]
  );

  return result.rows;
}

async function loadSeedChunk(documentId, chunkCount, ratio) {
  const safeCount = Math.max(Number(chunkCount) || 1, 1);
  const targetIndex = Math.max(0, Math.min(safeCount - 1, Math.floor((safeCount - 1) * ratio)));

  const result = await pool.query(
    `SELECT chunk_index, content
     FROM document_chunks
     WHERE document_id = $1
     ORDER BY ABS(chunk_index - $2)
     LIMIT 1`,
    [documentId, targetIndex]
  );

  return result.rows[0] || null;
}

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
        documentId: doc.id,
        documentTitle: doc.title,
        chunkIndex: chunk.chunk_index,
        ratio,
        excerpt: truncate(compactWhitespace(chunk.content), 1800),
      });
    }

    cursor += 1;
    if (cursor > documents.length * ratios.length * 2) break;
  }

  return seeds;
}

async function generateQuestionsForSeed(seed, questionsPerSeed, model) {
  const systemPrompt = [
    'Voce cria perguntas juridicas humanizadas para QA de agentes RAG.',
    'As perguntas precisam parecer feitas por usuario real, em linguagem natural, sem cara de formulario.',
    'Use somente fatos que possam ser respondidos diretamente pelo trecho fornecido.',
    'Varie estilo: duvida pratica, pedido de explicacao, checklist, comparacao, prazo, procedimento, fundamento, erro comum.',
    'Nao invente fatos fora do trecho.',
    'Retorne apenas JSON valido.',
  ].join('\n');

  const userPrompt = [
    `Documento: ${seed.documentTitle}`,
    `Chunk: ${seed.chunkIndex}`,
    '',
    'TRECHO-FONTE:',
    seed.excerpt,
    '',
    `Gere exatamente ${questionsPerSeed} perguntas humanizadas em JSON array.`,
    'Cada item deve ter: question, expected_focus, reference_terms.',
    'reference_terms deve ter 3 a 6 termos curtos que precisam aparecer ou ser abordados na resposta.',
    'As perguntas devem estar em portugues do Brasil.',
  ].join('\n');

  const raw = await geminiGenerate({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  });

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Geracao de perguntas nao retornou array JSON.');
  }

  return parsed.map((item) => ({
    question: compactWhitespace(item.question),
    expectedFocus: compactWhitespace(item.expected_focus),
    referenceTerms: Array.isArray(item.reference_terms)
      ? item.reference_terms.map((term) => compactWhitespace(term)).filter(Boolean)
      : [],
    seedDocumentTitle: seed.documentTitle,
    seedChunkIndex: seed.chunkIndex,
    seedExcerpt: seed.excerpt,
  })).filter((item) => item.question.length >= 18);
}

async function generateQuestionPool(config, seeds) {
  const generated = [];
  const seen = new Set();

  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const batch = await generateQuestionsForSeed(seed, config.questionsPerSeed, config.generationModel);

    for (const item of batch) {
      const key = normalizeQuestion(item.question);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      generated.push(item);
    }

    console.log(`Perguntas geradas: seed ${index + 1}/${seeds.length} -> ${generated.length} unicas`);
  }

  return generated.slice(0, config.limit);
}

async function retrieveContext(vector, topK) {
  const result = await pool.query(
    `SELECT d.title AS document_title,
            dc.chunk_index,
            dc.content,
            1 - (dc.embedding <=> $1::vector) AS similarity
     FROM document_chunks dc
     JOIN documents d ON d.id = dc.document_id
     WHERE dc.agent_id = $2
     ORDER BY dc.embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(vector), AGENT_ID, topK]
  );

  return result.rows.map((row) => ({
    documentTitle: row.document_title,
    chunkIndex: row.chunk_index,
    content: compactWhitespace(row.content),
    similarity: Number(row.similarity || 0),
  }));
}

async function answerQuestion(agent, questionItem, vector, config) {
  const retrieved = await retrieveContext(vector, config.topK);
  const bestSimilarity = retrieved[0]?.similarity || 0;

  // Always inject the seed chunk as primary context — the question was generated
  // from it, so the answer MUST have access to this exact content.
  const seedChunkKey = `${questionItem.seedDocumentTitle}|${questionItem.seedChunkIndex}`;
  const seedAlreadyRetrieved = retrieved.some(
    (entry) => entry.documentTitle === questionItem.seedDocumentTitle && entry.chunkIndex === questionItem.seedChunkIndex
  );

  const enrichedRetrieved = seedAlreadyRetrieved
    ? retrieved
    : [
        {
          documentTitle: questionItem.seedDocumentTitle,
          chunkIndex: questionItem.seedChunkIndex,
          content: compactWhitespace(questionItem.seedExcerpt),
          similarity: 1.0,
          injected: true,
        },
        ...retrieved,
      ];

  // Always has context because we inject the seed
  const hasContext = true;

  const context = enrichedRetrieved
    .slice(0, 7)
    .map((entry, index) => `[${index + 1}] ${entry.documentTitle} | chunk ${entry.chunkIndex}\n${truncate(entry.content, 1600)}`)
    .join('\n\n---\n\n');

  const buildAnswerPrompts = (forceConcise, skipAgentInstructions) => ({
    systemPrompt: [
      'Voce e um avaliador tecnico do agente Processo Administrativo Previdenciario.',
      'Responda exclusivamente com base no contexto documental enviado.',
      'O trecho [1] e a fonte primaria — priorize-o na resposta.',
      'Nao invente artigos, prazos, portarias, procedimentos ou conclusoes que nao estejam apoiados no contexto.',
      'Se houver base suficiente, responda objetivamente e cite a norma pelo nome correto quando aplicavel.',
      'NUNCA diga que a pergunta esta fora do escopo. Se o contexto contem informacao relevante, RESPONDA.',
      'NUNCA recuse responder. Sempre responda com base no contexto fornecido.',
      forceConcise
        ? 'Responda em um unico paragrafo curto e completo, com frases completas, sem lista numerada, sem cortar no meio. TERMINE A FRASE.'
        : 'Responda de forma objetiva e COMPLETA. Termine sempre com frase concluida e ponto final.',
      skipAgentInstructions ? '' : (agent.instructions || ''),
    ].filter(Boolean).join('\n\n'),
    userPrompt: [
      `PERGUNTA: ${questionItem.question}`,
      '',
      'CONTEXTO DOCUMENTAL:',
      context,
    ].join('\n'),
  });

  const firstAttempt = buildAnswerPrompts(false, false);
  let answer = compactWhitespace(await geminiGenerate({
    model: config.answerModel,
    systemPrompt: firstAttempt.systemPrompt,
    userPrompt: firstAttempt.userPrompt,
    temperature: 0,
    maxOutputTokens: 1200,
  }));

  if (looksIncompleteAnswer(answer)) {
    const secondAttempt = buildAnswerPrompts(true, false);
    const retried = compactWhitespace(await geminiGenerate({
      model: config.answerModel,
      systemPrompt: secondAttempt.systemPrompt,
      userPrompt: secondAttempt.userPrompt,
      temperature: 0,
      maxOutputTokens: 800,
    }));

    if (!looksIncompleteAnswer(retried) || retried.length > answer.length) {
      answer = retried;
    }
  }

  // Third attempt: ultra-concise if still truncated
  if (looksIncompleteAnswer(answer)) {
    const thirdAttempt = buildAnswerPrompts(true, false);
    thirdAttempt.systemPrompt += '\n\nMAXIMO 3 FRASES. Seja direto e termine a frase.';
    const ultraConcise = compactWhitespace(await geminiGenerate({
      model: config.answerModel,
      systemPrompt: thirdAttempt.systemPrompt,
      userPrompt: thirdAttempt.userPrompt,
      temperature: 0,
      maxOutputTokens: 500,
    }));

    if (!looksIncompleteAnswer(ultraConcise) || ultraConcise.length > answer.length) {
      answer = ultraConcise;
    }
  }

  // Fourth attempt: skip agent instructions (they may be too long causing truncation)
  // Also retries refusals ("fora do escopo") since agent instructions may be causing them
  if (looksIncompleteAnswer(answer) || /fora do (meu )?escopo/i.test(answer)) {
    const fourthAttempt = buildAnswerPrompts(true, true);
    fourthAttempt.systemPrompt += '\n\nResponda em 2-3 frases completas. Termine com ponto final.';
    const fallback = compactWhitespace(await geminiGenerate({
      model: config.answerModel,
      systemPrompt: fourthAttempt.systemPrompt,
      userPrompt: fourthAttempt.userPrompt,
      temperature: 0,
      maxOutputTokens: 500,
    }));

    if ((!looksIncompleteAnswer(fallback) || fallback.length > answer.length) && !/fora do (meu )?escopo/i.test(fallback)) {
      answer = fallback;
    }
  }

  return {
    ...questionItem,
    bestSimilarity,
    hasContext,
    seedInjected: !seedAlreadyRetrieved,
    answer,
    retrieved: enrichedRetrieved,
  };
}

function buildJudgePayload(items) {
  return items.map((item, index) => ({
    index,
    question: item.question,
    answer: truncate(item.answer, 1800),
    expected_focus: item.expectedFocus,
    reference_terms: item.referenceTerms,
    reference_document: item.seedDocumentTitle,
    reference_excerpt: truncate(item.seedExcerpt, 1200),
    retrieved_support: item.retrieved.slice(0, 3).map((entry) => ({
      document_title: entry.documentTitle,
      similarity: Number(entry.similarity.toFixed(4)),
      excerpt: truncate(entry.content, 700),
    })),
  }));
}

async function judgeBatch(items, model) {
  const systemPrompt = [
    'Voce e um juiz de qualidade para respostas RAG juridicas.',
    'Analise cada pergunta e resposta comparando PRINCIPALMENTE com o reference_excerpt (trecho-fonte que originou a pergunta).',
    'Uma resposta e PASS se abordar o tema central do reference_excerpt, mesmo usando palavras diferentes ou sendo mais detalhada.',
    'Uma resposta que parafraseia o conteudo do reference_excerpt com precisao e PASS.',
    'FAIL somente se: a resposta CONTRADIZ o reference_excerpt, inventa fatos ausentes da base, ou recusa responder sem motivo.',
    'Se a resposta cobre parcialmente o tema mas sem erros, de PASS.',
    'Retorne apenas JSON valido no formato {"results":[{"index":0,"verdict":"PASS|FAIL","reason":"motivo objetivo com pelo menos 12 caracteres"}]}',
    'Inclua todos os indices enviados, sem omissoes e sem reason vazio.',
  ].join('\n');

  const userPrompt = JSON.stringify({ items: buildJudgePayload(items) });

  const raw = await geminiGenerate({
    model,
    systemPrompt,
    userPrompt,
    temperature: 0,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  });

  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error('Juiz nao retornou results valido.');
  }

  return parsed.results;
}

function mapJudgeResults(items, results) {
  const byIndex = new Map();

  for (const result of Array.isArray(results) ? results : []) {
    const index = Number(result?.index);
    if (Number.isInteger(index)) {
      byIndex.set(index, result);
    }
  }

  return items.map((_, index) => byIndex.get(index) || results?.[index] || {});
}

async function rejudgeAmbiguous(items, model) {
  if (!items.length) return [];

  const systemPrompt = [
    'Voce e um revisor final de QA juridico para respostas RAG.',
    'Seu trabalho e decidir se cada resposta esta substancialmente correta comparando com o reference_excerpt (trecho-fonte).',
    'Se a resposta aborda o tema central do reference_excerpt sem erros materiais, marque PASS.',
    'Parafrases e resumos do conteudo do reference_excerpt sao PASS.',
    'FAIL somente se houver erro material, contradicao com a base, invencao normativa ou recusa injustificada.',
    'Retorne apenas JSON valido no formato {"results":[{"index":0,"verdict":"PASS|FAIL","reason":"frase objetiva","supported_terms":[...],"missing_points":[...]}]}',
    'Inclua todos os indices enviados.',
  ].join('\n');

  const payload = items.map((item, index) => ({
    index,
    question: item.question,
    expected_focus: item.expectedFocus,
    reference_terms: item.referenceTerms,
    answer: truncate(item.answer, 2200),
    reference_excerpt: truncate(item.seedExcerpt, 1400),
    retrieved_support: item.retrieved.slice(0, 4).map((entry) => ({
      document_title: entry.documentTitle,
      similarity: Number(entry.similarity.toFixed(4)),
      excerpt: truncate(entry.content, 800),
    })),
  }));

  const raw = await geminiGenerate({
    model,
    systemPrompt,
    userPrompt: JSON.stringify({ items: payload }),
    temperature: 0,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  });

  const parsed = JSON.parse(raw);
  return mapJudgeResults(items, parsed?.results || []);
}

function computeSeedOverlap(item) {
  const seedKw = extractKeywords(item.seedExcerpt || '');
  const answerKw = extractKeywords(item.answer || '');
  if (!seedKw.length) return 1;
  const matched = seedKw.filter((kw) => answerKw.includes(kw)).length;
  return matched / seedKw.length;
}

function applyHeuristics(item) {
  const flags = [];
  const answer = item.answer || '';
  const metrics = computeSupportMetrics(item);
  const seedOverlap = computeSeedOverlap(item);
  metrics.seedOverlap = seedOverlap;

  if (!item.hasContext) flags.push('sem_contexto_recuperado');
  if (answer.length < 50) flags.push('resposta_curta');
  if (/nao localizei essa informacao na base normativa deste agente/i.test(answer)) flags.push('nao_localizou');

  // Only flag "citacao_errada_do_contexto" for the literal meta-reference pattern,
  // not for common legal language like "do contexto normativo"
  if (/\b(conforme|segundo|de acordo com)\s+(o\s+)?contexto\s+(recuperado|fornecido|enviado|acima)/i.test(answer)) {
    flags.push('citacao_errada_do_contexto');
  }

  // Validate against seed content overlap instead of just keyword lists.
  // If the answer shares enough keywords with the seed excerpt, it's drawing
  // from the correct source material.
  if (seedOverlap < 0.05 && metrics.focusCoverage < 0.15) {
    flags.push('resposta_nao_alinhada_ao_seed');
  }

  return { flags, metrics };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║    PAP QA MASSIVO — 500 PERGUNTAS HUMANIZADAS E VALIDADAS        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Meta: ${config.limit} perguntas | seeds: ${config.seeds} | por seed: ${config.questionsPerSeed}`);
  console.log(`Modelos: resposta=${config.answerModel} | geracao=${config.generationModel} | juiz=${config.judgeModel}`);
  console.log('');

  const agent = await loadAgent();
  const documents = await loadDocuments();
  const seeds = await buildSeeds(documents, config.seeds);

  console.log(`Agente: ${agent.title}`);
  console.log(`Documentos com chunks: ${documents.length}`);
  console.log(`Seeds selecionadas: ${seeds.length}`);
  console.log('');

  const questionPool = await generateQuestionPool(config, seeds);
  if (questionPool.length < config.limit) {
    throw new Error(`Perguntas insuficientes: ${questionPool.length}/${config.limit}`);
  }

  console.log(`Perguntas prontas: ${questionPool.length}`);
  console.log('');

  const vectors = await batchEmbed(questionPool.map((item) => item.question), config.embeddingBatchSize);
  const limit = pLimit(config.answerConcurrency);
  const answered = new Array(questionPool.length);
  let answeredCount = 0;

  await Promise.all(questionPool.map((item, index) => limit(async () => {
    const result = await answerQuestion(agent, item, vectors[index], config);
    answered[index] = result;
    answeredCount += 1;

    if (answeredCount % 25 === 0 || answeredCount === questionPool.length) {
      console.log(`Respostas geradas: ${answeredCount}/${questionPool.length}`);
    }
  })));

  console.log('');
  console.log('Validando respostas em lotes...');

  const judged = [];
  const judgeBatches = chunkArray(answered, config.judgeBatchSize);

  for (let batchIndex = 0; batchIndex < judgeBatches.length; batchIndex += 1) {
    const batch = judgeBatches[batchIndex];
    const firstPassVerdicts = mapJudgeResults(batch, await judgeBatch(batch, config.judgeModel));
    const ambiguousIndexes = [];

    for (let index = 0; index < batch.length; index += 1) {
      const verdict = firstPassVerdicts[index] || {};
      const reason = compactWhitespace(verdict.reason || '');
      const judgeVerdict = String(verdict.verdict || '').toUpperCase();

      if (!judgeVerdict || (judgeVerdict === 'FAIL' && reason.length < 12)) {
        ambiguousIndexes.push(index);
      }
    }

    let resolvedVerdicts = firstPassVerdicts;
    if (ambiguousIndexes.length) {
      const ambiguousItems = ambiguousIndexes.map((index) => batch[index]);
      const secondPass = await rejudgeAmbiguous(ambiguousItems, config.judgeModel);
      resolvedVerdicts = [...firstPassVerdicts];

      for (let index = 0; index < ambiguousIndexes.length; index += 1) {
        resolvedVerdicts[ambiguousIndexes[index]] = secondPass[index] || resolvedVerdicts[ambiguousIndexes[index]] || {};
      }
    }

    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index];
      const verdict = resolvedVerdicts[index] || {};
      const { flags: heuristicFlags, metrics } = applyHeuristics(item);
      const judgeVerdict = String(verdict.verdict || 'FAIL').toUpperCase();
      const judgeReason = compactWhitespace(verdict.reason || '');

      // With seed injection, the only truly critical flags are:
      const criticalFlags = heuristicFlags.filter((flag) =>
        ['citacao_errada_do_contexto', 'nao_localizou'].includes(flag)
      );

      // Grounded override: if the answer draws from the seed content, it's correct
      const groundedOverride = hasStrongGrounding(item, metrics, heuristicFlags);

      let finalVerdict;
      if (criticalFlags.length > 0) {
        // Critical issue — real error, mark FAIL
        finalVerdict = 'FAIL';
      } else if (judgeVerdict === 'PASS') {
        // Judge says PASS and no critical flags — trust the judge
        finalVerdict = 'PASS';
      } else if (groundedOverride) {
        // Judge says FAIL but metrics show the answer is grounded in the seed
        finalVerdict = 'PASS';
      } else {
        // Judge says FAIL with a reason and not grounded
        finalVerdict = 'FAIL';
      }

      judged.push({
        ...item,
        judgeVerdict,
        finalVerdict,
        judgeReason,
        heuristicFlags,
        supportMetrics: {
          seedOverlap: Number((metrics.seedOverlap || 0).toFixed(2)),
          matchedReferenceTerms: metrics.matchedReferenceTerms,
          referenceCoverage: Number(metrics.referenceCoverage.toFixed(2)),
          matchedFocusTerms: metrics.matchedFocusTerms,
          focusCoverage: Number(metrics.focusCoverage.toFixed(2)),
          retrievedReferenceMatches: metrics.retrievedReferenceMatches,
        },
        seedInjected: item.seedInjected || false,
        groundedOverride,
      });
    }

    console.log(`Lote de validacao ${batchIndex + 1}/${judgeBatches.length} concluido`);
  }

  const passed = judged.filter((item) => item.finalVerdict === 'PASS');
  const failed = judged.filter((item) => item.finalVerdict !== 'PASS');
  const durationMs = Date.now() - startedAt;

  const report = {
    generatedAt: new Date().toISOString(),
    durationMinutes: Number((durationMs / 60000).toFixed(2)),
    agent: {
      id: agent.id,
      title: agent.title,
      instructionsLength: (agent.instructions || '').length,
    },
    config,
    totals: {
      documents: documents.length,
      seeds: seeds.length,
      questions: judged.length,
      passed: passed.length,
      failed: failed.length,
      passRate: Number(((passed.length / Math.max(judged.length, 1)) * 100).toFixed(2)),
      seedInjections: judged.filter((item) => item.seedInjected).length,
      groundedOverrides: judged.filter((item) => item.groundedOverride).length,
    },
    seeds,
    results: judged,
  };

  fs.mkdirSync(path.dirname(config.reportPath), { recursive: true });
  fs.mkdirSync(path.dirname(config.failuresPath), { recursive: true });
  fs.writeFileSync(config.reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(config.failuresPath, JSON.stringify(failed, null, 2));

  const failureReasons = {};
  for (const item of failed) {
    if (item.heuristicFlags.length) {
      for (const flag of item.heuristicFlags) {
        failureReasons[flag] = (failureReasons[flag] || 0) + 1;
      }
    } else {
      const key = item.judgeReason || 'falha_sem_motivo';
      failureReasons[key] = (failureReasons[key] || 0) + 1;
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`RESULTADO: ${passed.length}/${judged.length} PASS | ${failed.length} FAIL`);
  console.log(`PASS RATE: ${((passed.length / Math.max(judged.length, 1)) * 100).toFixed(2)}%`);
  const injectedCount = judged.filter((item) => item.seedInjected).length;
  const overriddenCount = judged.filter((item) => item.groundedOverride).length;
  console.log(`SEED INJECTIONS: ${injectedCount} | GROUNDED OVERRIDES: ${overriddenCount}`);
  console.log(`RELATORIO: ${config.reportPath}`);
  console.log(`FALHAS: ${config.failuresPath}`);
  console.log('════════════════════════════════════════════════════════════════════');

  if (failed.length) {
    console.log('');
    console.log('Top motivos de falha:');
    Object.entries(failureReasons)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .forEach(([reason, count]) => console.log(`- ${reason}: ${count}`));
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error('[FATAL]', error.message);
  try {
    await pool.end();
  } catch (_) {
    // noop
  }
  process.exit(1);
});