import 'dotenv/config';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import pg from 'pg';

const ROOT = process.cwd();
const ATTACHMENTS_ROOT = path.join(ROOT, 'public', 'agent-attachments');
const VALIDATION_REPORT_PATH = path.join(ROOT, 'attached_assets', 'link_content_validation_report.json');
const REPAIR_REPORT_PATH = path.join(ROOT, 'attached_assets', 'link_content_repair_report.json');
const OUTPUT_REPORT_PATH = path.join(ROOT, 'attached_assets', 'rag_rebuild_report.json');
const DEFAULT_EXCLUDE_STATUSES = ['fetch_error', 'mismatch', 'low_content'];
const LOCK_KEY = 90426027;

const { Pool } = pg;

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const dryRun = hasFlag('--dry-run');
const requestedAgentId = getArgValue('--agent-id');
const explicitLimit = Number.parseInt(getArgValue('--limit-agents') || '', 10);
const limitAgents = Number.isFinite(explicitLimit) && explicitLimit > 0 ? explicitLimit : 0;
const requestedStatuses = String(getArgValue('--exclude-status') || DEFAULT_EXCLUDE_STATUSES.join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function getFirstNonEmptyEnv(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function normalizeBaseUrl(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function normalizeAttachmentRelPath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^public\//i, '')
    .replace(/^agent-attachments\//i, '')
    .trim();
}

function toDbAttachmentPath(value = '') {
  const normalized = normalizeAttachmentRelPath(value);
  return normalized ? `/agent-attachments/${normalized}` : '';
}

function getAiRuntimeConfig() {
  const geminiApiKey = getFirstNonEmptyEnv(process.env.GEMINI_API_KEY);
  const openAiApiKey = getFirstNonEmptyEnv(process.env.OPENAI_API_KEY);
  const sharedApiKey = getFirstNonEmptyEnv(process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
  const sharedBaseUrl = normalizeBaseUrl(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
  const sharedBaseLooksAnthropic = Boolean(sharedBaseUrl && /anthropic\.com|claude\.com/i.test(sharedBaseUrl));

  const embeddingModel = getFirstNonEmptyEnv(process.env.EMBEDDING_MODEL)
    || (openAiApiKey ? 'text-embedding-3-large' : (geminiApiKey ? 'gemini-embedding-001' : 'text-embedding-3-large'));
  const embeddingBaseURL = normalizeBaseUrl(getFirstNonEmptyEnv(
    process.env.EMBEDDING_BASE_URL,
    process.env.AI_EMBEDDING_BASE_URL,
    embeddingModel.startsWith('gemini-') ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : (sharedBaseLooksAnthropic ? '' : sharedBaseUrl)
  ));
  const embeddingApiKey = getFirstNonEmptyEnv(
    process.env.EMBEDDING_API_KEY,
    process.env.AI_EMBEDDING_API_KEY,
    openAiApiKey,
    geminiApiKey,
    sharedBaseLooksAnthropic ? '' : sharedApiKey
  );

  return {
    embeddingModel,
    embeddingBaseURL,
    embeddingApiKey,
  };
}

function createEmbeddingClient() {
  const cfg = getAiRuntimeConfig();
  if (!cfg.embeddingApiKey || !cfg.embeddingBaseURL) {
    throw new Error('Configuração de embeddings ausente no ambiente.');
  }

  return {
    model: cfg.embeddingModel,
    client: new OpenAI({
      apiKey: cfg.embeddingApiKey,
      baseURL: cfg.embeddingBaseURL,
    }),
  };
}

async function withRetry429(fn, maxRetries = 4, baseDelayMs = 2000) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status || error?.statusCode || error?.response?.status;
      const is429 = status === 429 || String(error?.message || '').includes('429');
      if (!is429 || attempt >= maxRetries) {
        throw error;
      }

      const delay = baseDelayMs * (2 ** attempt) + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

function chunkText(text, size = 4000, overlap = 1000) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = start + size;
    if (end < clean.length) {
      const period = clean.lastIndexOf('.', end);
      const space = clean.lastIndexOf(' ', end);
      if (period > start + size * 0.8) end = period + 1;
      else if (space > start + size * 0.5) end = space;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    const next = end - overlap;
    start = next > start ? next : end;
  }

  return chunks;
}

function isPdfFile(fileName = '') {
  return String(fileName || '').toLowerCase().endsWith('.pdf');
}

function isDocxFile(fileName = '') {
  const lower = String(fileName || '').toLowerCase();
  return lower.endsWith('.docx') || lower.endsWith('.doc');
}

function isTextLikeFile(fileName = '') {
  const lower = String(fileName || '').toLowerCase();
  return ['.txt', '.md', '.html', '.htm', '.json', '.csv', '.xml'].some((ext) => lower.endsWith(ext));
}

async function extractAttachmentText(fullPath, fileName = '') {
  if (isPdfFile(fileName)) {
    const parsed = await pdfParse(Buffer.from(await fsp.readFile(fullPath)));
    return String(parsed.text || '').trim();
  }

  if (isDocxFile(fileName)) {
    const result = await mammoth.extractRawText({ path: fullPath });
    return String(result.value || '').trim();
  }

  if (isTextLikeFile(fileName)) {
    return await fsp.readFile(fullPath, 'utf8');
  }

  try {
    return await fsp.readFile(fullPath, 'utf8');
  } catch {
    return '';
  }
}

async function generateEmbedding(embeddingClient, model, inputText) {
  const normalized = String(inputText || '').trim();
  if (!normalized) return null;

  try {
    const response = await withRetry429(
      () => embeddingClient.embeddings.create({ model, input: normalized })
    );
    return response?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function execFileAsync(command, args = []) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: ROOT, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message || 'Falha ao executar comando externo').trim()));
        return;
      }

      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function loadChangedRelPathsFromGit() {
  const changedSet = new Set();
  const commands = [
    ['diff', '--name-only', '--', 'public/agent-attachments'],
    ['diff', '--cached', '--name-only', '--', 'public/agent-attachments'],
  ];

  for (const args of commands) {
    try {
      const { stdout } = await execFileAsync('git', args);
      for (const line of stdout.split(/\r?\n/)) {
        const normalized = normalizeAttachmentRelPath(line);
        if (normalized && normalized.toLowerCase().endsWith('.txt')) {
          changedSet.add(normalized);
        }
      }
    } catch {
    }
  }

  return changedSet;
}

async function loadRebuildSets() {
  const severeSet = new Set();
  const changedSet = new Set();

  const validationReport = await readJson(VALIDATION_REPORT_PATH);
  for (const result of Array.isArray(validationReport?.results) ? validationReport.results : []) {
    if (requestedStatuses.includes(String(result?.status || '').trim())) {
      const relPath = normalizeAttachmentRelPath(result?.relPath || '');
      if (relPath) {
        severeSet.add(relPath);
      }
    }
  }

  const repairReport = await readJson(REPAIR_REPORT_PATH);
  for (const result of Array.isArray(repairReport?.results) ? repairReport.results : []) {
    if (result?.changed) {
      const relPath = normalizeAttachmentRelPath(result?.relPath || '');
      if (relPath) {
        changedSet.add(relPath);
      }
    }
  }

  if (changedSet.size <= 1) {
    const gitChangedSet = await loadChangedRelPathsFromGit();
    for (const relPath of gitChangedSet) {
      changedSet.add(relPath);
    }
  }

  return { severeSet, changedSet };
}

async function rebuildAgent(agent, context) {
  const rawAttachments = Array.isArray(agent?.attachments) ? agent.attachments : [];
  const normalizedAttachments = rawAttachments
    .map((value) => normalizeAttachmentRelPath(value))
    .filter(Boolean);

  const filteredRelPaths = normalizedAttachments.filter((relPath) => !context.severeSet.has(relPath));
  const excludedRelPaths = normalizedAttachments.filter((relPath) => context.severeSet.has(relPath));

  const touched = normalizedAttachments.some((relPath) => context.severeSet.has(relPath) || context.changedSet.has(relPath));
  if (!touched) {
    return null;
  }

  const summary = {
    agentId: String(agent.id),
    agentTitle: String(agent.title || ''),
    attachmentCountBefore: normalizedAttachments.length,
    attachmentCountAfter: filteredRelPaths.length,
    excludedRelPaths,
    rebuiltDocuments: 0,
    rebuiltChunks: 0,
    skippedAttachments: [],
  };

  if (dryRun) {
    return summary;
  }

  const nextAttachments = filteredRelPaths.map((relPath) => toDbAttachmentPath(relPath)).filter(Boolean);
  await pool.query('UPDATE agents SET attachments = $1 WHERE id = $2', [nextAttachments, agent.id]);
  await pool.query('DELETE FROM documents WHERE agent_id = $1', [agent.id]);

  for (const relPath of filteredRelPaths) {
    const fullPath = path.join(ATTACHMENTS_ROOT, relPath);
    const fileName = path.basename(relPath);

    if (!fs.existsSync(fullPath)) {
      summary.skippedAttachments.push({ relPath, reason: 'missing_file' });
      continue;
    }

    const text = await extractAttachmentText(fullPath, fileName);
    if (!String(text || '').trim() || String(text || '').trim().length < 50) {
      summary.skippedAttachments.push({ relPath, reason: 'insufficient_text' });
      continue;
    }

    const documentResult = await pool.query(
      'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
      [agent.id, fileName]
    );

    const documentId = documentResult.rows[0].id;
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      summary.skippedAttachments.push({ relPath, reason: 'no_chunks' });
      continue;
    }

    summary.rebuiltDocuments += 1;

    for (let index = 0; index < chunks.length; index += 1) {
      const embedding = await generateEmbedding(context.embeddingClient, context.embeddingModel, chunks[index]);

      if (embedding) {
        await pool.query(
          `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
           VALUES ($1, $2, $3, $4::vector, $5)`,
          [agent.id, documentId, chunks[index], `[${embedding.join(',')}]`, index]
        );
      } else {
        await pool.query(
          `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
           VALUES ($1, $2, $3, NULL, $4)`,
          [agent.id, documentId, chunks[index], index]
        );
      }

      summary.rebuiltChunks += 1;
    }
  }

  return summary;
}

async function main() {
  const { severeSet, changedSet } = await loadRebuildSets();
  const embeddingRuntime = dryRun ? { client: null, model: '' } : createEmbeddingClient();

  const lockResult = await pool.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
  if (!lockResult.rows?.[0]?.locked) {
    throw new Error('Já existe um rebuild RAG em execução.');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    requestedAgentId: requestedAgentId || null,
    limitAgents: limitAgents || null,
    excludedStatuses: requestedStatuses,
    severeRelPathCount: severeSet.size,
    changedRelPathCount: changedSet.size,
    summary: {
      selectedAgents: 0,
      rebuiltAgents: 0,
      excludedAttachments: 0,
      rebuiltDocuments: 0,
      rebuiltChunks: 0,
      skippedAttachments: 0,
    },
    agents: [],
  };

  try {
    const result = await pool.query(
      `SELECT id::text, title, attachments
       FROM agents
       WHERE attachments IS NOT NULL
         AND cardinality(attachments) > 0
       ORDER BY title ASC`
    );

    const candidates = result.rows.filter((row) => !requestedAgentId || String(row.id) === requestedAgentId);
    const selected = limitAgents > 0 ? candidates.slice(0, limitAgents) : candidates;

    for (const agent of selected) {
      const agentSummary = await rebuildAgent(agent, {
        severeSet,
        changedSet,
        embeddingClient: embeddingRuntime.client,
        embeddingModel: embeddingRuntime.model,
      });
      if (!agentSummary) {
        continue;
      }

      report.agents.push(agentSummary);
      report.summary.selectedAgents += 1;
      report.summary.excludedAttachments += agentSummary.excludedRelPaths.length;
      report.summary.rebuiltDocuments += agentSummary.rebuiltDocuments;
      report.summary.rebuiltChunks += agentSummary.rebuiltChunks;
      report.summary.skippedAttachments += agentSummary.skippedAttachments.length;
      if (!dryRun) {
        report.summary.rebuiltAgents += 1;
      }
    }
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => null);
    await pool.end().catch(() => null);
  }

  await fsp.writeFile(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT_REPORT_PATH), summary: report.summary }, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  try {
    await pool.end();
  } catch {
  }
  process.exitCode = 1;
});