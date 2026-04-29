import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const ROOT = process.cwd();
const DEFAULT_BASE_URL = 'http://localhost:5000';
const DEFAULT_AGENT_ID = '9d40bbfe-c3d4-4f5d-8a7c-ce73c0d60dca';
const DEFAULT_CASES_PATH = path.join(ROOT, 'attached_assets', 'cnis_fixed_50q_cases.json');

const BASE_URL = String(process.env.CNIS_FIXED_BATTERY_BASE_URL || process.env.APP_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const AGENT_ID = String(process.env.CNIS_FIXED_BATTERY_AGENT_ID || DEFAULT_AGENT_ID).trim();
const USER_ID = String(process.env.RAG_TEST_USER_ID || '4a2e1967-12ce-4850-9e93-c2a761f2b779').trim();
const CASES_PATH = path.resolve(ROOT, process.env.CNIS_FIXED_CASES_PATH || DEFAULT_CASES_PATH);
const REPORT_TAG = String(process.env.CNIS_FIXED_BATTERY_REPORT_TAG || 'local').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'local';
const REQUEST_TIMEOUT_MS = Math.max(10000, Number.parseInt(String(process.env.CNIS_FIXED_BATTERY_REQUEST_TIMEOUT_MS || 120000), 10) || 120000);
const CONCURRENCY = Math.max(1, Math.min(Number.parseInt(String(process.env.CNIS_FIXED_BATTERY_CONCURRENCY || 3), 10) || 3, 6));
const MAX_RETRIES = Math.max(0, Math.min(Number.parseInt(String(process.env.CNIS_FIXED_BATTERY_MAX_RETRIES || 1), 10) || 1, 3));
const RETRY_BASE_DELAY_MS = Math.max(500, Number.parseInt(String(process.env.CNIS_FIXED_BATTERY_RETRY_BASE_DELAY_MS || 2000), 10) || 2000);
const REPORT_JSON = path.join(ROOT, 'attached_assets', `cnis_fixed_50q_${REPORT_TAG}_report.json`);
const REPORT_MD = path.join(ROOT, 'attached_assets', `cnis_fixed_50q_${REPORT_TAG}_report.md`);
const FALLBACK_REGEX = /nao encontrei essa informacao na base do agente|não encontrei essa informação na base do agente|nao consegui gerar|não consegui gerar|erro interno|agente nao encontrado|agente não encontrado/i;
const SOURCE_REGEX = /\[Fonte\s+\d+\]/i;

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL || process.env.DATABASE_URL });

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRequestError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const message = normalizeText(error?.message || error || '');
  return /timeout|timed out|failed to respond|application failed to respond|socket hang up|econnreset|etimedout|network|temporarily unavailable|gateway|bad gateway/.test(message);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(new Error(`Timeout após ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function apiJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

async function apiSseText(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `${response.status} ${response.statusText}`);
  }

  let content = '';
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    const json = line.slice(6).trim();
    if (!json) {
      continue;
    }

    const payload = JSON.parse(json);
    if (payload.content) {
      content += payload.content;
    }
  }

  return content.trim();
}

async function createConversation(title) {
  return apiJson(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
    body: JSON.stringify({ title, agentId: AGENT_ID }),
  });
}

async function askAgent(conversationId, question) {
  return apiSseText(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
    body: JSON.stringify({ content: question, agentId: AGENT_ID }),
  });
}

async function cleanupConversation(conversationId) {
  if (!conversationId) {
    return;
  }

  await pool.query('DELETE FROM messages WHERE conversation_id = $1', [conversationId]).catch(() => undefined);
  await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]).catch(() => undefined);
}

function gradeAnswer(testCase, answer = '') {
  const text = String(answer || '').trim();
  const normalizedAnswer = normalizeText(text);
  const hits = (Array.isArray(testCase.mustInclude) ? testCase.mustInclude : []).filter((entry) => normalizedAnswer.includes(normalizeText(entry)));
  const misses = (Array.isArray(testCase.mustInclude) ? testCase.mustInclude : []).filter((entry) => !hits.includes(entry));
  const minimumMatches = Math.max(1, Math.min(Number(testCase.minimumMatches || hits.length || 1), (testCase.mustInclude || []).length || 1));
  const hasSourceMarker = SOURCE_REGEX.test(text);

  if (!text) {
    return { status: 'fail', reason: 'empty_answer', hits, misses, hasSourceMarker, minimumMatches };
  }

  if (FALLBACK_REGEX.test(text)) {
    return { status: 'fail', reason: 'fallback_answer', hits, misses, hasSourceMarker, minimumMatches };
  }

  if (hits.length >= minimumMatches) {
    return { status: 'pass', reason: 'minimum_matches_met', hits, misses, hasSourceMarker, minimumMatches };
  }

  if (hits.length > 0) {
    return { status: 'weak', reason: 'partial_match', hits, misses, hasSourceMarker, minimumMatches };
  }

  return { status: 'fail', reason: 'no_required_terms_found', hits, misses, hasSourceMarker, minimumMatches };
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push('# Bateria Fixa CNIS 50Q');
  lines.push('');
  lines.push(`Base URL: ${report.baseUrl}`);
  lines.push(`Agent ID: ${report.agentId}`);
  lines.push(`Cases file: ${report.casesPath}`);
  lines.push(`Executado em: ${report.generatedAt}`);
  lines.push(`Total: ${report.summary.total}`);
  lines.push(`Pass: ${report.summary.pass}`);
  lines.push(`Weak: ${report.summary.weak}`);
  lines.push(`Fail: ${report.summary.fail}`);
  lines.push('');

  for (const item of report.results) {
    lines.push(`## ${item.id} - ${item.question}`);
    lines.push('');
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Reason: ${item.reason}`);
    lines.push(`- Hits: ${item.hits.length}/${item.mustInclude.length} (min ${item.minimumMatches})`);
    lines.push(`- Source marker: ${item.hasSourceMarker ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('### Expected');
    lines.push('');
    lines.push(item.expectedAnswer);
    lines.push('');
    lines.push('### Must Include');
    lines.push('');
    lines.push(item.mustInclude.join(' | '));
    lines.push('');
    lines.push('### Answer');
    lines.push('');
    lines.push(item.answer || '(sem resposta)');
    lines.push('');
  }

  return lines.join('\n');
}

async function runTestCase(testCase) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let conversationId = null;
    console.log(`[CNIS-FIXED] Perguntando ${testCase.id} (tentativa ${attempt + 1}/${MAX_RETRIES + 1}).`);

    try {
      const conversation = await createConversation(`[cnis-fixed] ${testCase.id}`);
      conversationId = conversation?.id || null;
      const answer = await askAgent(conversationId, testCase.question);
      const grade = gradeAnswer(testCase, answer);

      return {
        ...testCase,
        answer,
        status: grade.status,
        reason: grade.reason,
        hits: grade.hits,
        misses: grade.misses,
        hasSourceMarker: grade.hasSourceMarker,
        minimumMatches: grade.minimumMatches,
      };
    } catch (error) {
      lastError = error;
      const retryable = isRetryableRequestError(error);

      if (!retryable || attempt >= MAX_RETRIES) {
        break;
      }

      const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
      console.warn(`[CNIS-FIXED] Erro transitorio em ${testCase.id}: ${String(error?.message || error)}. Retentando em ${delay}ms.`);
      await sleep(delay);
    } finally {
      await cleanupConversation(conversationId);
    }
  }

  return {
    ...testCase,
    answer: '',
    status: 'fail',
    reason: String(lastError?.message || lastError),
    hits: [],
    misses: Array.isArray(testCase.mustInclude) ? testCase.mustInclude : [],
    hasSourceMarker: false,
    minimumMatches: Math.max(1, Math.min(Number(testCase.minimumMatches || 1), (testCase.mustInclude || []).length || 1)),
  };
}

async function main() {
  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  const rawCases = await fs.readFile(CASES_PATH, 'utf8');
  const casesPayload = JSON.parse(rawCases);
  const testCases = Array.isArray(casesPayload?.cases) ? casesPayload.cases : [];

  if (testCases.length === 0) {
    throw new Error(`Nenhum caso encontrado em ${CASES_PATH}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    agentId: AGENT_ID,
    casesPath: CASES_PATH,
    sourceDocumentId: casesPayload.sourceDocumentId || null,
    sourceDocumentTitle: casesPayload.sourceDocumentTitle || null,
    concurrency: CONCURRENCY,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    retry: { maxRetries: MAX_RETRIES, baseDelayMs: RETRY_BASE_DELAY_MS },
    summary: { total: testCases.length, pass: 0, weak: 0, fail: 0 },
    results: [],
  };

  let nextIndex = 0;
  const collectedResults = [];
  const workerCount = Math.min(CONCURRENCY, testCases.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < testCases.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const result = await runTestCase(testCases[currentIndex]);
      collectedResults.push(result);
    }
  });

  await Promise.all(workers);

  report.results = collectedResults.sort((left, right) => {
    const leftOrder = Number.parseInt(String(left.id || '').split('-').pop() || '0', 10);
    const rightOrder = Number.parseInt(String(right.id || '').split('-').pop() || '0', 10);
    return leftOrder - rightOrder;
  });

  for (const item of report.results) {
    report.summary[item.status] += 1;
  }

  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(REPORT_MD, buildMarkdownReport(report), 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`REPORT_JSON=${REPORT_JSON}`);
  console.log(`REPORT_MD=${REPORT_MD}`);
}

try {
  await main();
} finally {
  await pool.end().catch(() => undefined);
}