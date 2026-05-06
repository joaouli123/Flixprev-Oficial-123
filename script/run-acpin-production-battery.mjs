import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const DEFAULT_AGENT_TITLE = 'Ações Civis Públicas INSS';
const DEFAULT_BASE_URL = 'https://flixprev-oficial-123-production.up.railway.app';
const DEFAULT_PYTHON_BASE_URL = 'https://flixprev-python-agent-production.up.railway.app';
const DEFAULT_REPORT_DIR = path.join(process.cwd(), 'attached_assets');
const DEFAULT_WAIT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TEST_USER_ID = crypto.randomUUID();

const QUESTION_CASES = [
  {
    id: 'q01',
    question: 'Liste em formato de tabela os documentos ou atos normativos principais citados na base, com colunas: documento, tipo e tema.',
    expectsTable: true,
  },
  {
    id: 'q02',
    question: 'Monte uma tabela com as ACPs ou temas processuais identificados no material, com colunas: tema, efeito prático e documento de referência.',
    expectsTable: true,
  },
  {
    id: 'q03',
    question: 'Se houver regras procedimentais distribuídas em itens ou quadros, reorganize em tabela com colunas: situação, providência do INSS e base documental.',
    expectsTable: true,
  },
  {
    id: 'q04',
    question: 'Quais portarias ou normas procedimentais a coleção reúne? Responda em tabela com colunas: norma, finalidade e página citada.',
    expectsTable: true,
  },
  {
    id: 'q05',
    question: 'Resuma em tabela o objetivo geral das normas centrais da coleção, com colunas: norma, objetivo prático e impacto no benefício ou procedimento.',
    expectsTable: true,
  },
  {
    id: 'q06',
    question: 'Se a base trouxer hipóteses de cumprimento de decisão judicial, organize em tabela com colunas: hipótese, obrigação e observação.',
    expectsTable: true,
  },
  {
    id: 'q07',
    question: 'Monte uma tabela com os critérios objetivos que aparecem na ACP sobre período de graça, com colunas: critério, regra aplicada e base legal ou documental.',
    expectsTable: true,
  },
  {
    id: 'q08',
    question: 'Aponte, em formato de tabela, atos revogados, substituídos ou atualizados, com colunas: ato anterior, ato atual e efeito da mudança.',
    expectsTable: true,
  },
  {
    id: 'q09',
    question: 'Resuma em tabela quaisquer prazos, condições ou critérios objetivos mencionados, com colunas: item, regra e referência.',
    expectsTable: true,
  },
  {
    id: 'q10',
    question: 'Traga a melhor resposta possível com foco em tabelas: quais linhas ou quadros do documento parecem mais úteis para um advogado previdenciário? Monte uma tabela com colunas: assunto, por que importa e fonte.',
    expectsTable: true,
  },
];

function preferProductionUrl(value, fallback) {
  const normalized = String(value || '').trim().replace(/\/$/, '');
  if (!normalized) {
    return fallback;
  }

  if (/localhost|127\.0\.0\.1/i.test(normalized)) {
    return fallback;
  }

  return normalized;
}

function parseArgs(argv = []) {
  const options = {
    agentTitle: DEFAULT_AGENT_TITLE,
    baseUrl: preferProductionUrl(process.env.APP_BASE_URL || process.env.VITE_API_BASE_URL, DEFAULT_BASE_URL),
    pythonBaseUrl: preferProductionUrl(process.env.PYTHON_AGENT_BASE_URL, DEFAULT_PYTHON_BASE_URL),
    reportDir: DEFAULT_REPORT_DIR,
    timeoutMs: DEFAULT_WAIT_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    userId: String(process.env.RAG_TEST_USER_ID || DEFAULT_TEST_USER_ID).trim(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if ((token === '--agent-title' || token === '--title') && next) {
      options.agentTitle = next;
      index += 1;
      continue;
    }
    if (token === '--base-url' && next) {
      options.baseUrl = preferProductionUrl(next, DEFAULT_BASE_URL);
      index += 1;
      continue;
    }
    if (token === '--python-base-url' && next) {
      options.pythonBaseUrl = preferProductionUrl(next, DEFAULT_PYTHON_BASE_URL);
      index += 1;
      continue;
    }
    if (token === '--report-dir' && next) {
      options.reportDir = path.resolve(next);
      index += 1;
      continue;
    }
    if (token === '--timeout-ms' && next) {
      options.timeoutMs = Math.max(10000, Number(next) || DEFAULT_WAIT_TIMEOUT_MS);
      index += 1;
      continue;
    }
    if (token === '--poll-ms' && next) {
      options.pollIntervalMs = Math.max(1000, Number(next) || DEFAULT_POLL_INTERVAL_MS);
      index += 1;
    }
  }

  return options;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function looksLikeTable(answer = '') {
  const text = String(answer || '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const markdownRows = lines.filter((line) => /^\|.+\|$/.test(line));
  const markdownSeparator = lines.some((line) => /^\|?\s*:?-{3,}/.test(line));
  if (markdownRows.length >= 2 && markdownSeparator) {
    return true;
  }

  const multiPipeRows = lines.filter((line) => (line.match(/\|/g) || []).length >= 2);
  if (multiPipeRows.length >= 3) {
    return true;
  }

  return false;
}

function truncate(value = '', maxLength = 500) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function shouldRetryRequest(error) {
  const message = String(error?.message || error || '');
  return /fetch failed|econnrefused|econnreset|etimedout|enotfound|eai_again|socket hang up|network error|503|502|504|429/i.test(message);
}

async function withRequestRetry(callback, { attempts = 3, baseDelayMs = 1500 } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetryRequest(error)) {
        throw error;
      }

      await delay(baseDelayMs * attempt);
    }
  }

  throw lastError || new Error('Falha inesperada na requisicao.');
}

async function apiJson(url, options = {}) {
  return withRequestRetry(async () => {
    const response = await fetch(url, options);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = payload?.error || payload?.message || payload?.detail || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    return payload;
  });
}

async function apiSse(url, options = {}) {
  return withRequestRetry(async () => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Stream SSE não disponível.');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let doneEvent = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.startsWith('data: ')) {
          continue;
        }

        const payload = part.slice(6).trim();
        if (!payload || payload === '[DONE]') {
          continue;
        }

        const json = JSON.parse(payload);
        if (json.content) {
          answer += json.content;
        }
        if (json.done) {
          doneEvent = json;
        }
      }
    }

    return {
      answer: answer.trim(),
      doneEvent,
    };
  });
}

async function resolveAgent(pool, agentTitle) {
  const result = await pool.query(
    `
      SELECT id::text, title, attachments, extra_links, python_collection_id
      FROM agents
      WHERE lower(title) = lower($1)
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    `,
    [agentTitle]
  );

  if (result.rowCount === 0) {
    throw new Error(`Agente não encontrado: ${agentTitle}`);
  }

  return result.rows[0];
}

async function reprocessAgent(baseUrl, agentId) {
  return apiJson(`${baseUrl}/api/admin/reprocess-agent-attachments/${agentId}`, {
    method: 'POST',
  });
}

async function readPythonJob(pythonBaseUrl, jobId) {
  return apiJson(`${pythonBaseUrl}/ingest/status/${jobId}`);
}

async function readCollectionOverview(pythonBaseUrl, collectionId) {
  return apiJson(`${pythonBaseUrl}/collections/${collectionId}/overview`);
}

async function waitForPythonJobs({ pythonBaseUrl, jobIds = [], timeoutMs, pollIntervalMs }) {
  const ids = Array.from(new Set((Array.isArray(jobIds) ? jobIds : []).filter(Boolean)));
  if (ids.length === 0) {
    return [];
  }

  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    const states = await Promise.all(ids.map((jobId) => readPythonJob(pythonBaseUrl, jobId)));
    const pending = states.filter((item) => !['completed', 'failed'].includes(String(item?.status || '').toLowerCase()));
    if (pending.length === 0) {
      return states;
    }
    await delay(pollIntervalMs);
  }

  throw new Error(`Timeout aguardando ${ids.length} job(s) de ingestão Python.`);
}

async function waitForCollectionStable({ pythonBaseUrl, collectionId, timeoutMs, pollIntervalMs }) {
  const startedAt = Date.now();
  let lastOverview = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    lastOverview = await readCollectionOverview(pythonBaseUrl, collectionId);
    const processing = Number(lastOverview?.processing_documents || 0);
    const completed = Number(lastOverview?.completed_documents || 0);
    const chunks = Number(lastOverview?.chunk_count || 0);
    if (processing === 0 && completed > 0 && chunks > 0) {
      return lastOverview;
    }
    await delay(pollIntervalMs);
  }

  if (lastOverview) {
    return lastOverview;
  }

  throw new Error(`Timeout aguardando estabilização da collection ${collectionId}.`);
}

async function createConversation(baseUrl, userId, agentId, title) {
  return apiJson(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({ title, agentId }),
  });
}

async function askConversation(baseUrl, userId, conversationId, agentId, question) {
  return apiSse(`${baseUrl}/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({ content: question, agentId }),
  });
}

async function cleanupConversation(pool, conversationId) {
  if (!conversationId) {
    return;
  }

  await pool.query('DELETE FROM messages WHERE conversation_id = $1', [conversationId]).catch(() => undefined);
  await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]).catch(() => undefined);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL é obrigatório para localizar o agente e limpar conversas de teste.');
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const runId = `acpin-battery-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const report = {
    run_id: runId,
    agent_title: options.agentTitle,
    base_url: options.baseUrl,
    python_base_url: options.pythonBaseUrl,
    started_at: new Date().toISOString(),
    questions: QUESTION_CASES,
    reprocess: null,
    overview: null,
    results: [],
  };

  try {
    console.log(`[BATTERY] Iniciando bateria ${runId} para o agente "${options.agentTitle}".`);
    const agent = await resolveAgent(pool, options.agentTitle);
    report.agent = {
      id: agent.id,
      title: agent.title,
      attachment_count: Array.isArray(agent.attachments) ? agent.attachments.length : 0,
      extra_link_count: Array.isArray(agent.extra_links) ? agent.extra_links.length : 0,
      python_collection_id: agent.python_collection_id || null,
    };
    console.log(`[BATTERY] Agente resolvido: ${agent.id} | anexos=${report.agent.attachment_count} | collection_atual=${report.agent.python_collection_id || 'n/d'}`);

    console.log('[BATTERY] Disparando reprocessamento dos anexos e sincronização Python...');
    const reprocess = await reprocessAgent(options.baseUrl, agent.id);
    report.reprocess = reprocess;

    const pythonCollectionId = reprocess?.python?.collectionId || agent.python_collection_id;
    const pythonJobs = (Array.isArray(reprocess?.python?.jobs) ? reprocess.python.jobs : [])
      .map((job) => job?.id)
      .filter(Boolean);

    if (pythonJobs.length > 0) {
      console.log(`[BATTERY] Aguardando ${pythonJobs.length} job(s) Python: ${pythonJobs.join(', ')}`);
      report.python_jobs = await waitForPythonJobs({
        pythonBaseUrl: options.pythonBaseUrl,
        jobIds: pythonJobs,
        timeoutMs: options.timeoutMs,
        pollIntervalMs: options.pollIntervalMs,
      });
    } else {
      report.python_jobs = [];
    }

    if (pythonCollectionId) {
      console.log(`[BATTERY] Verificando estabilização da collection ${pythonCollectionId}...`);
      report.overview = await waitForCollectionStable({
        pythonBaseUrl: options.pythonBaseUrl,
        collectionId: pythonCollectionId,
        timeoutMs: options.timeoutMs,
        pollIntervalMs: options.pollIntervalMs,
      });
      console.log(`[BATTERY] Collection estável: chunks=${report.overview?.chunk_count ?? 'n/d'} | docs=${report.overview?.document_count ?? 'n/d'}`);
    }

    for (const [index, item] of QUESTION_CASES.entries()) {
      const result = {
        id: item.id,
        question: item.question,
        expects_table: item.expectsTable,
        started_at: new Date().toISOString(),
      };
      let conversationId = null;

      try {
        console.log(`[BATTERY] [${index + 1}/${QUESTION_CASES.length}] Criando conversa para ${item.id}...`);
        const conversation = await createConversation(options.baseUrl, options.userId, agent.id, `[${runId}] ${item.id}`);
        conversationId = conversation?.id;
        result.conversation_id = conversationId;

        console.log(`[BATTERY] [${index + 1}/${QUESTION_CASES.length}] Enviando pergunta ${item.id}...`);
        const reply = await askConversation(options.baseUrl, options.userId, conversationId, agent.id, item.question);
        result.answer = reply.answer;
        result.answer_preview = truncate(reply.answer, 700);
        result.answer_length = String(reply.answer || '').length;
        result.source = reply.doneEvent?.source || null;
        result.verified = Boolean(reply.doneEvent?.verified);
        result.citation_count = Array.isArray(reply.doneEvent?.citations) ? reply.doneEvent.citations.length : 0;
        result.has_markdown_table = looksLikeTable(reply.answer);
        result.passed = item.expectsTable ? result.has_markdown_table : result.answer_length > 0;
        console.log(`[BATTERY] [${index + 1}/${QUESTION_CASES.length}] ${item.id} concluída | passed=${result.passed} | source=${result.source || 'n/d'} | table=${Boolean(result.has_markdown_table)}`);
      } catch (error) {
        result.error = error?.message || String(error);
        result.passed = false;
        console.log(`[BATTERY] [${index + 1}/${QUESTION_CASES.length}] ${item.id} falhou | erro=${result.error}`);
      } finally {
        result.finished_at = new Date().toISOString();
        report.results.push(result);
        await cleanupConversation(pool, conversationId);
      }
    }

    report.finished_at = new Date().toISOString();
    report.total = report.results.length;
    report.passed = report.results.filter((item) => item.passed).length;
    report.failed = report.results.filter((item) => !item.passed).length;

    await fs.mkdir(options.reportDir, { recursive: true });
    const jsonPath = path.join(options.reportDir, `${runId}.json`);
    const mdPath = path.join(options.reportDir, `${runId}.md`);
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

    const markdown = [
      `# Bateria ${runId}`,
      '',
      `- Agente: ${report.agent?.title || options.agentTitle}`,
      `- Agent ID: ${report.agent?.id || 'n/d'}`,
      `- Base URL: ${options.baseUrl}`,
      `- Python URL: ${options.pythonBaseUrl}`,
      `- Anexos: ${report.agent?.attachment_count ?? 'n/d'}`,
      `- Collection Python: ${report.reprocess?.python?.collectionId || report.agent?.python_collection_id || 'n/d'}`,
      `- Chunks Python: ${report.overview?.chunk_count ?? 'n/d'}`,
      `- Passou: ${report.passed}/${report.total}`,
      '',
      ...report.results.map((item) => [
        `## ${item.id}`,
        '',
        `- Pergunta: ${item.question}`,
        `- Status: ${item.passed ? 'PASSOU' : 'FALHOU'}`,
        `- Fonte: ${item.source || 'n/d'}`,
        `- Verificada: ${item.verified ? 'sim' : 'não'}`,
        `- Citações: ${item.citation_count ?? 0}`,
        `- Tabela markdown: ${item.has_markdown_table ? 'sim' : 'não'}`,
        item.error ? `- Erro: ${item.error}` : `- Resposta: ${item.answer_preview || ''}`,
        '',
      ].join('\n')),
    ].join('\n');
    await fs.writeFile(mdPath, markdown, 'utf8');

    console.log(`[BATTERY] Finalizado | passou=${report.passed}/${report.total} | json=${jsonPath}`);

    console.log(JSON.stringify({
      run_id: runId,
      agent_id: report.agent?.id || null,
      python_collection_id: report.reprocess?.python?.collectionId || report.agent?.python_collection_id || null,
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      report_json: jsonPath,
      report_md: mdPath,
      results: report.results.map((item) => ({
        id: item.id,
        passed: item.passed,
        source: item.source,
        has_markdown_table: item.has_markdown_table,
        citation_count: item.citation_count,
        error: item.error || null,
        answer_preview: item.answer_preview,
      })),
    }, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});