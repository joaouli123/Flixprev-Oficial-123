import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const DEFAULT_BASE_URL = 'https://flixprev.uxcodedev.com.br';
const outputDir = path.join(process.cwd(), 'attached_assets');
const baseUrl = String(process.env.APP_BASE_URL || process.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const userId = crypto.randomUUID();
const runId = `rag-smoke-rebuilt-agents-${new Date().toISOString().replace(/[:.]/g, '-')}`;

const tests = [
  {
    title: 'Agente DirTrab',
    agentId: 'ca732308-78ab-48e3-bd1d-3d3cc7d8d87f',
    question: 'Pela CLT, como o art. 3º define empregado? Responda citando os elementos centrais da definição.',
    expectedIncludes: ['pessoa física', 'não eventual', 'dependência', 'salário'],
    minimumMatches: 3,
  },
  {
    title: 'DTrib',
    agentId: 'a52473d6-0152-49f9-b4b1-5bec4eee058c',
    question: 'Segundo o CTN, qual é o conceito de tributo do art. 3º?',
    expectedIncludes: [
      'prestação pecuniária compulsória',
      'em moeda',
      'não constitua sanção',
      'instituída em lei',
      'atividade administrativa plenamente vinculada',
    ],
    minimumMatches: 3,
  },
  {
    title: 'FedTax',
    agentId: 'f66b73e0-bde0-4505-8ea6-223b9ad716db',
    question: 'Segundo o Decreto 7.212/2010, sobre quais produtos o IPI incide e o que o parágrafo único do art. 2º diz sobre o campo de incidência?',
    expectedIncludes: ['produtos industrializados', 'nacionais e estrangeiros', 'TIPI', 'NT'],
    minimumMatches: 3,
  },
];

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function hasFallback(answer = '') {
  const normalized = normalize(answer);
  return [
    'nao encontrei essa informacao na base do agente',
    'nao localizei essa informacao na base normativa deste agente',
    'nao encontrei essa informacao nos documentos deste agente',
  ].some((pattern) => normalized.includes(pattern));
}

function evaluateAnswer(test, answer = '') {
  const normalizedAnswer = normalize(answer);
  const matched = test.expectedIncludes.filter((item) => normalizedAnswer.includes(normalize(item)));
  const missing = test.expectedIncludes.filter((item) => !matched.includes(item));
  const fallbackDetected = hasFallback(answer);

  return {
    passed: !fallbackDetected && matched.length >= test.minimumMatches,
    fallbackDetected,
    matched,
    missing,
    matchedCount: matched.length,
    hasSourceMarkers: /\[Fonte\s+\d+\]/i.test(answer),
  };
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

async function apiSseText(url, options = {}) {
  const response = await fetch(url, options);
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

async function createConversation(test) {
  return apiJson(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({
      title: `Smoke ${test.title}`,
      agentId: test.agentId,
      userId,
    }),
  });
}

async function askConversation(conversationId, test) {
  return apiSseText(`${baseUrl}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({
      content: test.question,
      agentId: test.agentId,
    }),
  });
}

async function readAiLogs(conversationIds = []) {
  if (!process.env.DATABASE_URL || conversationIds.length === 0) {
    return [];
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const result = await pool.query(`
      SELECT conversation_id, request_type, model, status, prompt_tokens, completion_tokens, total_tokens, error_message
      FROM ai_request_logs
      WHERE conversation_id = ANY($1::int[])
      ORDER BY id ASC
    `, [conversationIds]);
    return result.rows;
  } finally {
    await pool.end();
  }
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const results = [];
  for (const test of tests) {
    const result = {
      title: test.title,
      agentId: test.agentId,
      question: test.question,
      startedAt: new Date().toISOString(),
      passed: false,
    };

    try {
      const conversation = await createConversation(test);
      result.conversationId = conversation.id;

      const answer = await askConversation(conversation.id, test);
      result.answer = answer;

      const evaluation = evaluateAnswer(test, answer);
      result.passed = evaluation.passed;
      result.fallbackDetected = evaluation.fallbackDetected;
      result.matched = evaluation.matched;
      result.missing = evaluation.missing;
      result.matchedCount = evaluation.matchedCount;
      result.hasSourceMarkers = evaluation.hasSourceMarkers;
    } catch (error) {
      result.error = error?.message || String(error);
      result.passed = false;
    } finally {
      result.finishedAt = new Date().toISOString();
      results.push(result);
    }
  }

  const aiLogs = await readAiLogs(results.map((item) => item.conversationId).filter((value) => Number.isInteger(value)));
  const logsByConversation = new Map();
  for (const row of aiLogs) {
    const key = Number(row.conversation_id);
    const existing = logsByConversation.get(key) || [];
    existing.push(row);
    logsByConversation.set(key, existing);
  }

  for (const result of results) {
    result.aiLogs = logsByConversation.get(Number(result.conversationId)) || [];
  }

  const summary = {
    runId,
    baseUrl,
    userId,
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    results,
  };

  const latestPath = path.join(outputDir, 'rag_smoke_rebuilt_agents_latest.json');
  const timestampedPath = path.join(outputDir, `${runId}.json`);
  await fs.writeFile(latestPath, JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(timestampedPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

await main();