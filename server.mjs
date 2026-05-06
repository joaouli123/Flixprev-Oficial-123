import { setDefaultResultOrder } from 'dns';
// Forçar IPv4 globalmente antes de qualquer conexão de rede (corrige ENETUNREACH IPv6 no Railway)
setDefaultResultOrder('ipv4first');

import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dns from 'dns/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pkg from 'pg';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  decodeHtmlEntities as sharedDecodeHtmlEntities,
  extractPrimaryHtmlContent as sharedExtractPrimaryHtmlContent,
  htmlToPlainText as sharedHtmlToPlainText,
  fetchLinkKnowledgeSource as sharedFetchLinkKnowledgeSource,
} from './script/lib/link-content-utils.mjs';
const require = createRequire(import.meta.url);
const { Pool } = pkg;
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const allowDevAdminLogin = !isProduction && String(process.env.ALLOW_DEV_ADMIN_LOGIN || '').trim().toLowerCase() === 'true';
const app = express();

const runtimeMonitor = {
  startedAt: Date.now(),
  activeRequests: 0,
  totalRequests: 0,
  totalApiRequests: 0,
  lastRequestAt: null,
  lastErrorAt: null,
  lastFallbackAt: null,
  recentEvents: [],
  routeStats: new Map(),
};

const RUNTIME_MONITOR_MAX_EVENTS = 200;
const RUNTIME_MONITOR_SLOW_REQUEST_MS = 4000;

function pushRuntimeEvent(type, details = {}) {
  const event = {
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    ...details,
  };

  runtimeMonitor.recentEvents.unshift(event);
  if (runtimeMonitor.recentEvents.length > RUNTIME_MONITOR_MAX_EVENTS) {
    runtimeMonitor.recentEvents.length = RUNTIME_MONITOR_MAX_EVENTS;
  }

  if (type === 'api_error' || type === 'process_error') {
    runtimeMonitor.lastErrorAt = event.timestamp;
  }

  if (type === 'db_fallback') {
    runtimeMonitor.lastFallbackAt = event.timestamp;
  }

  return event;
}

function getRecentRuntimeEvents(type, windowMs) {
  const threshold = Date.now() - Math.max(0, Number(windowMs || 0));
  return runtimeMonitor.recentEvents.filter((event) => {
    if (type && event.type !== type) {
      return false;
    }

    const eventTime = new Date(event.timestamp).getTime();
    return Number.isFinite(eventTime) && eventTime >= threshold;
  });
}

function getRuntimeStatusSnapshot() {
  const errorEvents5m = getRecentRuntimeEvents('api_error', 5 * 60 * 1000);
  const fallbackEvents15m = getRecentRuntimeEvents('db_fallback', 15 * 60 * 1000);
  const slowEvents15m = getRecentRuntimeEvents('slow_request', 15 * 60 * 1000);
  const processErrors15m = getRecentRuntimeEvents('process_error', 15 * 60 * 1000);
  const requestEvents5m = getRecentRuntimeEvents('api_request', 5 * 60 * 1000);

  let status = 'healthy';
  if (runtimeMonitor.activeRequests >= 25 || errorEvents5m.length >= 5 || processErrors15m.length > 0) {
    status = 'critical';
  } else if (runtimeMonitor.activeRequests >= 10 || errorEvents5m.length > 0 || fallbackEvents15m.length > 0 || slowEvents15m.length > 0) {
    status = 'degraded';
  }

  const routeStats = [...runtimeMonitor.routeStats.entries()]
    .map(([route, stats]) => ({ route, ...stats }))
    .sort((left, right) => {
      const errorDiff = Number(right.errors || 0) - Number(left.errors || 0);
      if (errorDiff !== 0) return errorDiff;
      return Number(right.count || 0) - Number(left.count || 0);
    })
    .slice(0, 20);

  return {
    status,
    uptime_seconds: Math.floor((Date.now() - runtimeMonitor.startedAt) / 1000),
    active_requests: runtimeMonitor.activeRequests,
    total_requests: runtimeMonitor.totalRequests,
    total_api_requests: runtimeMonitor.totalApiRequests,
    last_request_at: runtimeMonitor.lastRequestAt,
    last_error_at: runtimeMonitor.lastErrorAt,
    last_fallback_at: runtimeMonitor.lastFallbackAt,
    requests_last_5m: requestEvents5m.length,
    errors_last_5m: errorEvents5m.length,
    process_errors_last_15m: processErrors15m.length,
    fallbacks_last_15m: fallbackEvents15m.length,
    slow_requests_last_15m: slowEvents15m.length,
    routes: routeStats,
    recent_events: runtimeMonitor.recentEvents.slice(0, 30),
  };
}

process.on('uncaughtException', (error) => {
  pushRuntimeEvent('process_error', {
    scope: 'uncaughtException',
    message: String(error?.message || error || 'Erro não tratado').trim(),
  });
});

process.on('unhandledRejection', (reason) => {
  pushRuntimeEvent('process_error', {
    scope: 'unhandledRejection',
    message: String(reason?.message || reason || 'Promise rejeitada sem tratamento').trim(),
  });
});

// CORS — permite frontend acessar API de outro domínio
app.use((req, res, next) => {
  const allowedOrigins = (process.env.VITE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || allowedOrigins.length === 0)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ✅ CORREÇÃO 1: Aumentar limite de payload para PDFs longos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'agent-attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    try {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const safeName = originalName.replace(/[<>:"|?*]/g, '_');
      console.log(`[UPLOAD] Salvando arquivo como: ${safeName}`);
      cb(null, safeName);
    } catch (e) {
      console.error('[UPLOAD] Erro ao processar nome:', e);
      cb(null, file.originalname);
    }
  }
});

const upload = multer({ storage });

app.use('/agent-attachments', express.static(path.join(__dirname, 'public', 'agent-attachments')));
app.use('/agent-attachments', serveStoredAgentAttachment);
app.use('/chat-attachments', express.static(path.join(__dirname, 'public', 'chat-attachments')));
app.use('/chat-attachments', (_req, res) => res.status(404).type('text/plain').send('Attachment not found'));

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'chat-attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safeName = originalName.replace(/[<>:"|?*]/g, '_');
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    cb(null, `${unique}-${safeName}`);
  }
});

const chatUpload = multer({ storage: chatStorage });
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const RAG_EXTREME_MODE = !/^(0|false|no)$/i.test(String(process.env.RAG_EXTREME_MODE || 'true').trim());
const DEFAULT_RAG_VECTOR_LIMIT = Math.max(8, Math.min(Number(process.env.RAG_VECTOR_LIMIT || (RAG_EXTREME_MODE ? 56 : 28)) || (RAG_EXTREME_MODE ? 56 : 28), 160));
const DEFAULT_RAG_RETURN_LIMIT = Math.max(6, Math.min(Number(process.env.RAG_RETURN_LIMIT || (RAG_EXTREME_MODE ? 32 : 14)) || (RAG_EXTREME_MODE ? 32 : 14), 120));
const DEFAULT_RAG_MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY || 0.08) || 0.08;
const DEFAULT_RAG_KEYWORD_LIMIT = Math.max(8, Math.min(Number(process.env.RAG_KEYWORD_LIMIT || (RAG_EXTREME_MODE ? 44 : 18)) || (RAG_EXTREME_MODE ? 44 : 18), 160));
const DEFAULT_RAG_CANDIDATE_LIMIT = Math.max(300, Number(process.env.RAG_CANDIDATE_LIMIT || (RAG_EXTREME_MODE ? 3000 : 900)) || (RAG_EXTREME_MODE ? 3000 : 900));
const DEFAULT_RAG_DEEP_RETURN_LIMIT = Math.max(DEFAULT_RAG_RETURN_LIMIT, Math.min(Number(process.env.RAG_DEEP_RETURN_LIMIT || (RAG_EXTREME_MODE ? 72 : 24)) || (RAG_EXTREME_MODE ? 72 : 24), 180));
const DEFAULT_RAG_DEEP_SCAN_LIMIT = Math.max(DEFAULT_RAG_CANDIDATE_LIMIT, Number(process.env.RAG_DEEP_SCAN_LIMIT || (RAG_EXTREME_MODE ? 90000 : 20000)) || (RAG_EXTREME_MODE ? 90000 : 20000));
const DEFAULT_RAG_DEEP_SEED_LIMIT = Math.max(10, Number(process.env.RAG_DEEP_SEED_LIMIT || (RAG_EXTREME_MODE ? 56 : 24)) || (RAG_EXTREME_MODE ? 56 : 24));
const DEFAULT_RAG_NEIGHBOR_WINDOW = Math.max(1, Math.min(Number(process.env.RAG_NEIGHBOR_WINDOW || (RAG_EXTREME_MODE ? 3 : 2)) || (RAG_EXTREME_MODE ? 3 : 2), 6));
const DEFAULT_RAG_CONTEXT_MAX_CHARS = Math.max(16000, Number(process.env.RAG_CONTEXT_MAX_CHARS || (RAG_EXTREME_MODE ? 100000 : 42000)) || (RAG_EXTREME_MODE ? 100000 : 42000));
const DEFAULT_CHAT_MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS || (RAG_EXTREME_MODE ? 6400 : 3200));
const DEFAULT_FAST_CHAT_MAX_TOKENS = Number(process.env.FAST_CHAT_MAX_TOKENS || (RAG_EXTREME_MODE ? 3600 : 2200));
const ENABLE_RAG_TYPO_TOLERANCE = !/^(0|false|no)$/i.test(String(process.env.RAG_TYPO_TOLERANCE || 'true').trim());
const RAG_TYPO_MIN_TOKEN_LENGTH = Math.max(3, Number(process.env.RAG_TYPO_MIN_TOKEN_LENGTH || 4) || 4);
const ENABLE_DIRECT_PDF_ANALYSIS = /^(1|true|yes)$/i.test(String(process.env.ENABLE_DIRECT_PDF_ANALYSIS || '').trim());
const AGENT_ATTACHMENTS_STORAGE_BUCKET = String(process.env.AGENT_ATTACHMENTS_STORAGE_BUCKET || process.env.SUPABASE_AGENT_ATTACHMENTS_BUCKET || 'agent-attachments').trim();
const agentAttachmentChunkCache = new Map();

const RETRIEVAL_STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'ate', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e', 'ela', 'ele',
  'em', 'entre', 'era', 'essa', 'esse', 'esta', 'este', 'eu', 'foi', 'ha', 'isso', 'ja', 'la',
  'mais', 'mas', 'na', 'nas', 'nao', 'nem', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas',
  'pelo', 'pelos', 'por', 'qual', 'quando', 'que', 'quem', 'se', 'sem', 'ser', 'seu', 'sua', 'suas',
  'seus', 'sob', 'so', 'tambem', 'tem', 'uma', 'um'
]);

const RETRIEVAL_QUERY_META_TOKENS = new Set([
  'art', 'artigo', 'responda', 'citando', 'elementos', 'centrais', 'conceito', 'define', 'definicao',
  'segundo', 'diz', 'campo', 'incidencia', 'incide', 'quais', 'qual', 'sobre', 'como'
]);

const RETRIEVAL_TOKEN_EXPANSIONS = new Map([
  ['art', ['artigo']],
  ['arts', ['artigo', 'artigos']],
  ['instr', ['instrucao', 'normativa']],
  ['norm', ['norma', 'normativa']],
  ['prev', ['previdencia', 'previdenciario']],
  ['aux', ['auxilio']],
  ['apos', ['aposentadoria']],
  ['incap', ['incapacidade']],
  ['cnis', ['cadastro', 'nacional', 'informacoes', 'sociais']],
  ['rgps', ['regime', 'geral', 'previdencia', 'social']],
]);

function getFirstNonEmptyEnv(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function normalizeBaseUrl(baseURL = '') {
  const normalized = String(baseURL || '').trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function isTruthyEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function parseJsonObjectEnv(name) {
  const rawValue = String(process.env[name] || '').trim();
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn(`[PYTHON_AGENT_CORE] Variavel ${name} contem JSON invalido; mapa ignorado.`);
  }

  return {};
}

function getPythonAgentCoreBaseUrl() {
  const baseUrl = getFirstNonEmptyEnv(
    process.env.PYTHON_AGENT_BASE_URL,
    process.env.RAG_AGENT_BASE_URL,
    process.env.PYTHON_RAG_BASE_URL,
    process.env.API_BASE_URL,
  );

  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return '';
  }

  return baseUrl.replace(/\/+$/, '');
}

const PYTHON_AGENT_CORE_ENABLED = isTruthyEnv(getFirstNonEmptyEnv(
  process.env.ENABLE_PYTHON_AGENT_CORE,
  process.env.PYTHON_AGENT_CORE_ENABLED,
  process.env.PYTHON_AGENT_ENABLED,
));
const PYTHON_AGENT_BASE_URL = getPythonAgentCoreBaseUrl();
const PYTHON_AGENT_COLLECTION_MAP = parseJsonObjectEnv('PYTHON_AGENT_COLLECTION_MAP');
const PYTHON_AGENT_DEFAULT_COLLECTION_ID = getFirstNonEmptyEnv(
  process.env.PYTHON_AGENT_COLLECTION_ID,
  process.env.DEFAULT_PYTHON_AGENT_COLLECTION_ID,
);
const PYTHON_AGENT_TOP_K = Math.max(1, Math.min(Number(process.env.PYTHON_AGENT_TOP_K || process.env.RETRIEVAL_TOP_K || 10) || 10, 50));
const PYTHON_AGENT_FAST_MODE = isTruthyEnv(process.env.PYTHON_AGENT_FAST_MODE);
const PYTHON_AGENT_TIMEOUT_MS = Math.max(10000, Math.min(Number(process.env.PYTHON_AGENT_TIMEOUT_MS || 120000) || 120000, 300000));
const PYTHON_AGENT_INGEST_TIMEOUT_MS = Math.max(30000, Math.min(Number(process.env.PYTHON_AGENT_INGEST_TIMEOUT_MS || 300000) || 300000, 900000));
const PYTHON_AGENT_AUTO_SYNC_ENABLED = !/^(0|false|no)$/i.test(String(process.env.PYTHON_AGENT_AUTO_SYNC || 'true').trim());
const PYTHON_AGENT_USE_AGENT_ID_AS_COLLECTION_ID = isTruthyEnv(process.env.PYTHON_AGENT_USE_AGENT_ID_AS_COLLECTION_ID);

function shouldSyncPythonAgentCore() {
  return PYTHON_AGENT_CORE_ENABLED && PYTHON_AGENT_AUTO_SYNC_ENABLED && Boolean(PYTHON_AGENT_BASE_URL);
}

function coerceMetadataObject(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  return {};
}

function getAgentPythonMetadata(agentData = {}) {
  return {
    ...coerceMetadataObject(agentData.metadata),
    ...coerceMetadataObject(agentData.meta),
    ...coerceMetadataObject(agentData.settings),
  };
}

function resolvePythonAgentCollectionId({ effectiveAgentId, agentData } = {}) {
  const metadata = getAgentPythonMetadata(agentData || {});
  const explicitCollectionId = getFirstNonEmptyEnv(
    agentData?.python_collection_id,
    agentData?.pythonCollectionId,
    agentData?.collection_id,
    metadata.python_collection_id,
    metadata.pythonCollectionId,
    metadata.collection_id,
  );

  if (explicitCollectionId) {
    return explicitCollectionId;
  }

  const agentId = String(effectiveAgentId || agentData?.id || '').trim();
  if (agentId && PYTHON_AGENT_COLLECTION_MAP[agentId]) {
    return String(PYTHON_AGENT_COLLECTION_MAP[agentId]).trim();
  }

  const agentTitle = String(agentData?.title || agentData?.name || '').trim();
  if (agentTitle && PYTHON_AGENT_COLLECTION_MAP[agentTitle]) {
    return String(PYTHON_AGENT_COLLECTION_MAP[agentTitle]).trim();
  }

  if (PYTHON_AGENT_DEFAULT_COLLECTION_ID) {
    return PYTHON_AGENT_DEFAULT_COLLECTION_ID;
  }

  return PYTHON_AGENT_USE_AGENT_ID_AS_COLLECTION_ID && agentId ? agentId : '';
}

function truncateForLog(value = '', maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function callPythonAgentCoreApi(pathname, options = {}, { timeoutMs = PYTHON_AGENT_TIMEOUT_MS, allowNotFound = false } = {}) {
  if (!PYTHON_AGENT_BASE_URL) {
    throw new Error('PYTHON_AGENT_BASE_URL nao configurada.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${PYTHON_AGENT_BASE_URL}${pathname}`, {
      ...options,
      signal: controller.signal,
    });
    const rawText = await response.text();
    let payload = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch (error) {
        payload = { raw: rawText };
      }
    }

    if (!response.ok) {
      if (allowNotFound && response.status === 404) {
        return null;
      }

      const detail = payload?.detail || payload?.error || rawText || response.statusText;
      throw new Error(`HTTP ${response.status}: ${truncateForLog(detail)}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function callPythonAgentCoreQuery({ collectionId, question, agentInstructions = '' }) {
  const payload = await callPythonAgentCoreApi('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collection_id: collectionId,
      question,
      agent_instructions: String(agentInstructions || '').trim() || undefined,
      top_k: PYTHON_AGENT_TOP_K,
      fast_mode: PYTHON_AGENT_FAST_MODE,
    }),
  });
  return payload || {};
}

function buildPythonAgentCollectionName(agentData = {}, agentId = '') {
  const title = String(agentData?.title || agentData?.name || 'Agente').trim() || 'Agente';
  const shortId = String(agentId || agentData?.id || '').trim().slice(0, 8);
  return shortId ? `${title} [${shortId}]` : title;
}

async function listPythonAgentCollections() {
  const collections = await callPythonAgentCoreApi('/collections', {}, { timeoutMs: PYTHON_AGENT_TIMEOUT_MS });
  return Array.isArray(collections) ? collections : [];
}

async function deletePythonAgentCollection(collectionId) {
  if (!collectionId) {
    return false;
  }

  await callPythonAgentCoreApi(`/collections/${encodeURIComponent(collectionId)}`, {
    method: 'DELETE',
  }, { timeoutMs: PYTHON_AGENT_TIMEOUT_MS, allowNotFound: true });
  return true;
}

async function ensureAgentsPythonCoreColumns() {
  if (!hasDatabaseUrl) {
    return;
  }

  await pool.query('ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS python_collection_id TEXT');
  await pool.query('CREATE INDEX IF NOT EXISTS agents_python_collection_id_idx ON "agents" (python_collection_id)');
}

async function updateAgentPythonCollectionIdViaSupabase(agentId, collectionId) {
  const client = ensureSupabaseAdminAvailable();
  const payload = {
    python_collection_id: collectionId || null,
    updated_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await client
      .from('agents')
      .update(payload)
      .eq('id', agentId)
      .select('*')
      .maybeSingle();

    if (!response.error) {
      return response.data || null;
    }

    const missingColumn = extractMissingColumnFromSchemaCacheError(response.error);
    if (!missingColumn || !(missingColumn in payload)) {
      throw createSupabaseFallbackError(response.error, 'Erro ao salvar collection Python do agente');
    }

    delete payload[missingColumn];
  }

  return null;
}

async function updateAgentPythonCollectionId(agentId, collectionId) {
  if (!agentId) {
    return null;
  }

  return withDatabaseFallback(
    'updateAgentPythonCollectionId',
    async () => {
      await ensureAgentsPythonCoreColumns();
      const result = await pool.query(
        'UPDATE "agents" SET python_collection_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [collectionId || null, agentId]
      );
      return result.rows?.[0] || null;
    },
    () => updateAgentPythonCollectionIdViaSupabase(agentId, collectionId)
  );
}

async function getAgentForPythonSync(agentId) {
  if (!agentId) {
    return null;
  }

  return withDatabaseFallback(
    'getAgentForPythonSync',
    async () => {
      await ensureAgentsPythonCoreColumns().catch(() => undefined);
      const result = await pool.query('SELECT * FROM "agents" WHERE id = $1 LIMIT 1', [agentId]);
      return result.rows?.[0] || null;
    },
    () => getAgentViaSupabase(agentId)
  );
}

async function ensurePythonAgentCollection({ agentId, agentData = null, recreate = false } = {}) {
  if (!shouldSyncPythonAgentCore()) {
    return null;
  }

  const resolvedAgentData = agentData || await getAgentForPythonSync(agentId) || { id: agentId };
  const existingCollectionId = resolvePythonAgentCollectionId({ effectiveAgentId: agentId, agentData: resolvedAgentData });
  if (existingCollectionId && !recreate) {
    await updateAgentPythonCollectionId(agentId, existingCollectionId).catch(() => undefined);
    return { id: existingCollectionId, reused: true };
  }

  if (existingCollectionId && recreate) {
    await deletePythonAgentCollection(existingCollectionId).catch((error) => {
      console.warn('[PYTHON_AGENT_CORE] Falha ao apagar collection antiga antes de recriar:', error?.message || error);
    });
  }

  const name = buildPythonAgentCollectionName(resolvedAgentData, agentId);
  let collection = null;
  try {
    collection = await callPythonAgentCoreApi('/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: resolvedAgentData?.description || `Collection sincronizada do agente ${agentId}`,
      }),
    }, { timeoutMs: PYTHON_AGENT_TIMEOUT_MS });
  } catch (error) {
    if (!String(error?.message || '').includes('HTTP 409')) {
      throw error;
    }

    const existing = (await listPythonAgentCollections()).find((item) => item.name === name);
    if (!existing) {
      throw error;
    }

    if (recreate) {
      await deletePythonAgentCollection(existing.id).catch(() => undefined);
      collection = await callPythonAgentCoreApi('/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: resolvedAgentData?.description || `Collection sincronizada do agente ${agentId}`,
        }),
      }, { timeoutMs: PYTHON_AGENT_TIMEOUT_MS });
    } else {
      collection = { ...existing, reused: true };
    }
  }

  if (!collection?.id) {
    throw new Error('Core Python nao retornou collection_id.');
  }

  await updateAgentPythonCollectionId(agentId, collection.id).catch((error) => {
    console.warn('[PYTHON_AGENT_CORE] Collection criada, mas nao foi possivel salvar python_collection_id:', error?.message || error);
  });

  return collection;
}

async function waitPythonAgentIngestionJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < PYTHON_AGENT_INGEST_TIMEOUT_MS) {
    const job = await callPythonAgentCoreApi(`/ingest/status/${encodeURIComponent(jobId)}`, {}, { timeoutMs: PYTHON_AGENT_TIMEOUT_MS });
    if (job?.status === 'completed' || job?.status === 'failed') {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  return { id: jobId, status: 'timeout', error: `Tempo esgotado apos ${PYTHON_AGENT_INGEST_TIMEOUT_MS}ms` };
}

async function ingestPythonAgentDocument({ collectionId, fullPath, fileName }) {
  const buffer = await fs.promises.readFile(fullPath);
  const formData = new FormData();
  formData.append('collection_id', collectionId);
  formData.append('file', new Blob([buffer]), fileName || path.basename(fullPath));

  const job = await callPythonAgentCoreApi('/ingest/document', {
    method: 'POST',
    body: formData,
  }, { timeoutMs: PYTHON_AGENT_INGEST_TIMEOUT_MS });

  if (!job?.id) {
    throw new Error('Core Python nao retornou job_id de ingestao.');
  }

  const finalJob = await waitPythonAgentIngestionJob(job.id);
  if (finalJob.status !== 'completed') {
    throw new Error(finalJob.error || finalJob.message || `Ingestao Python terminou com status ${finalJob.status}`);
  }

  return finalJob;
}

function safeDecodePath(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function normalizeAgentAttachmentPath(attachment) {
  const raw = safeDecodePath(String(attachment || '').trim()).replace(/\\/g, '/').split('?')[0].split('#')[0];
  if (!raw || raw.includes('\0')) {
    return null;
  }

  const prefixed = raw.startsWith('/agent-attachments/')
    ? raw
    : raw.startsWith('agent-attachments/')
      ? `/${raw}`
      : `/agent-attachments/${raw.replace(/^\/+/, '')}`;
  const filePath = path.posix.normalize(prefixed);
  if (!filePath.startsWith('/agent-attachments/')) {
    return null;
  }

  return filePath;
}

function getAgentAttachmentStoragePath(attachment) {
  const filePath = normalizeAgentAttachmentPath(attachment);
  if (!filePath) {
    return null;
  }

  // Supabase Storage rejects keys with spaces, accents, and many other chars.
  // Build a deterministic safe key from a SHA-256 of the normalized path
  // (so persist/restore agree) plus a sanitized extension for readability.
  const relative = filePath.replace(/^\/agent-attachments\//, '');
  const hash = crypto.createHash('sha256').update(relative).digest('hex');

  const extMatch = /\.([A-Za-z0-9]{1,8})$/.exec(relative);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';

  return `${hash}.${ext}`;
}

function resolvePublicAttachmentPath(attachment) {
  const filePath = normalizeAgentAttachmentPath(attachment);
  if (!filePath) {
    return null;
  }

  return {
    filePath,
    fileName: filePath.split('/').pop() || filePath,
    fullPath: path.join(process.cwd(), 'public', filePath.replace(/^\/+/, '')),
  };
}

let agentAttachmentsStorageBucketReady = false;

async function ensureAgentAttachmentsStorageBucket() {
  if (agentAttachmentsStorageBucketReady) {
    return;
  }

  const storageClient = getAgentAttachmentsStorageClient();
  if (!storageClient || !AGENT_ATTACHMENTS_STORAGE_BUCKET) {
    throw new Error('Supabase Storage nao esta configurado para persistir anexos de agentes.');
  }

  const existing = await storageClient.storage.getBucket(AGENT_ATTACHMENTS_STORAGE_BUCKET);
  if (!existing.error) {
    agentAttachmentsStorageBucketReady = true;
    return;
  }

  const created = await storageClient.storage.createBucket(AGENT_ATTACHMENTS_STORAGE_BUCKET, { public: false });
  if (created.error && !/already exists|already owned|exists/i.test(String(created.error.message || created.error))) {
    throw new Error(`Nao foi possivel preparar o bucket de anexos (${AGENT_ATTACHMENTS_STORAGE_BUCKET}): ${created.error.message || created.error}`);
  }

  agentAttachmentsStorageBucketReady = true;
}

async function persistAgentAttachmentToStorage(attachment, fullPath, contentType = 'application/octet-stream') {
  const storagePath = getAgentAttachmentStoragePath(attachment);
  if (!storagePath || !fullPath || !fs.existsSync(fullPath)) {
    throw new Error('Arquivo de anexo indisponivel para persistencia.');
  }

  await ensureAgentAttachmentsStorageBucket();
  const storageClient = getAgentAttachmentsStorageClient();
  const buffer = await fs.promises.readFile(fullPath);
  const uploaded = await storageClient.storage
    .from(AGENT_ATTACHMENTS_STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });

  if (uploaded.error) {
    throw new Error(`Falha ao persistir anexo no Supabase Storage: ${uploaded.error.message || uploaded.error}`);
  }

  return true;
}

async function restoreAgentAttachmentFromStorage(attachment) {
  const resolved = resolvePublicAttachmentPath(attachment);
  const storagePath = getAgentAttachmentStoragePath(attachment);
  const storageClient = getAgentAttachmentsStorageClient();
  if (!resolved || !storagePath || fs.existsSync(resolved.fullPath) || !storageClient || !AGENT_ATTACHMENTS_STORAGE_BUCKET) {
    return resolved;
  }

  const downloaded = await storageClient.storage
    .from(AGENT_ATTACHMENTS_STORAGE_BUCKET)
    .download(storagePath);

  if (downloaded.error || !downloaded.data) {
    return null;
  }

  const arrayBuffer = await downloaded.data.arrayBuffer();
  await fs.promises.mkdir(path.dirname(resolved.fullPath), { recursive: true });
  await fs.promises.writeFile(resolved.fullPath, Buffer.from(arrayBuffer));
  return resolved;
}

async function ensureAgentAttachmentFileAvailable(attachment) {
  const resolved = resolvePublicAttachmentPath(attachment);
  if (!resolved || fs.existsSync(resolved.fullPath)) {
    return resolved;
  }

  return restoreAgentAttachmentFromStorage(attachment);
}

async function serveStoredAgentAttachment(req, res) {
  try {
    const attachmentPath = `/agent-attachments${req.path || ''}`;
    const resolved = await ensureAgentAttachmentFileAvailable(attachmentPath);
    if (resolved && fs.existsSync(resolved.fullPath)) {
      return res.sendFile(resolved.fullPath);
    }

    return res.status(404).type('text/plain').send('Attachment not found');
  } catch (error) {
    console.error('[ATTACHMENTS] Erro ao servir anexo persistido:', error?.message || error);
    return res.status(500).type('text/plain').send('Attachment unavailable');
  }
}

async function syncPythonAgentAttachments({ agentId, attachments = [], agentData = null, recreate = false } = {}) {
  const summary = {
    enabled: shouldSyncPythonAgentCore(),
    collectionId: null,
    processedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    jobs: [],
  };

  if (!summary.enabled || !agentId) {
    return summary;
  }

  const collection = await ensurePythonAgentCollection({ agentId, agentData, recreate });
  summary.collectionId = collection?.id || null;
  if (!summary.collectionId) {
    return summary;
  }

  const validAttachments = Array.from(new Set((Array.isArray(attachments) ? attachments : []).filter(Boolean)));
  for (const attachment of validAttachments) {
    const resolved = await ensureAgentAttachmentFileAvailable(attachment);
    if (!resolved || !fs.existsSync(resolved.fullPath)) {
      summary.skippedCount += 1;
      continue;
    }

    try {
      const job = await ingestPythonAgentDocument({
        collectionId: summary.collectionId,
        fullPath: resolved.fullPath,
        fileName: resolved.fileName,
      });
      summary.processedCount += 1;
      summary.jobs.push({ id: job.id, status: job.status, source: resolved.filePath });
    } catch (error) {
      summary.failedCount += 1;
      summary.jobs.push({ status: 'failed', source: resolved.filePath, error: error?.message || 'Falha na ingestao Python' });
      console.error('[PYTHON_AGENT_CORE] Falha ao ingerir anexo no core Python:', resolved.filePath, error?.message || error);
    }
  }

  if (summary.failedCount > 0 || summary.skippedCount > 0) {
    throw new Error(`Falha ao ingerir todos os anexos no core Python. Processados: ${summary.processedCount}; ignorados: ${summary.skippedCount}; falhas: ${summary.failedCount}.`);
  }

  return summary;
}

function writeChatSseText(res, text, metadata = {}) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  const chunkSize = 50;
  for (let index = 0; index < text.length; index += chunkSize) {
    const chunk = text.substring(index, index + chunkSize);
    res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ done: true, ...metadata })}\n\n`);
  res.end();
}

async function tryHandlePythonAgentCoreMessage({
  res,
  cid,
  userText,
  effectiveAgentId,
  agentData = null,
  attachmentContext = '',
  loadAgentData,
  saveAssistantMessage,
} = {}) {
  const question = String(userText || '').trim();
  if (!PYTHON_AGENT_CORE_ENABLED || !PYTHON_AGENT_BASE_URL || !question) {
    return { handled: false };
  }

  if (String(attachmentContext || '').trim()) {
    return { handled: false, reason: 'attachment_context' };
  }

  let resolvedAgentData = agentData;
  if (!resolvedAgentData && typeof loadAgentData === 'function') {
    try {
      resolvedAgentData = await loadAgentData();
    } catch (error) {
      console.warn('[PYTHON_AGENT_CORE] Nao foi possivel carregar dados do agente para mapear collection:', error?.message || error);
    }
  }

  let collectionId = resolvePythonAgentCollectionId({ effectiveAgentId, agentData: resolvedAgentData });
  if (!collectionId && shouldSyncPythonAgentCore() && Array.isArray(resolvedAgentData?.attachments) && resolvedAgentData.attachments.length > 0) {
    try {
      const syncSummary = await syncPythonAgentAttachments({
        agentId: effectiveAgentId,
        attachments: resolvedAgentData.attachments,
        agentData: resolvedAgentData,
        recreate: false,
      });
      collectionId = syncSummary.collectionId || '';
    } catch (error) {
      console.warn('[PYTHON_AGENT_CORE] Falha ao sincronizar collection ausente antes do chat:', error?.message || error);
    }
  }

  if (!collectionId) {
    console.info('[PYTHON_AGENT_CORE] Ativo, mas sem collection_id mapeada; usando RAG Node atual.');
    return { handled: false, reason: 'missing_collection_id' };
  }

  const agentInstructions = String(resolvedAgentData?.instructions || resolvedAgentData?.description || '').trim();

  try {
    const result = await callPythonAgentCoreQuery({ collectionId, question, agentInstructions });
    const answer = String(result?.answer || '').trim();
    if (!answer) {
      return { handled: false, reason: 'empty_answer' };
    }

    const citations = Array.isArray(result?.citations) ? result.citations : [];
    if (citations.length === 0 && isGroundedFallbackResponse(answer)) {
      console.info('[PYTHON_AGENT_CORE] Core Python nao encontrou evidencias; usando RAG Node atual.');
      return { handled: false, reason: 'python_no_evidence' };
    }

    if (typeof saveAssistantMessage === 'function') {
      await saveAssistantMessage(answer);
    }

    console.log(`[PYTHON_AGENT_CORE] Resposta gerada via Python core. conversation=${cid} collection=${collectionId} verified=${Boolean(result?.verified)}`);
    writeChatSseText(res, answer, {
      source: 'python_agent_core',
      verified: Boolean(result?.verified),
      citations,
    });
    return { handled: true };
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `timeout apos ${PYTHON_AGENT_TIMEOUT_MS}ms`
      : (error?.message || error);
    console.warn(`[PYTHON_AGENT_CORE] Falha no core Python; usando RAG Node atual: ${message}`);
    return { handled: false, reason: 'python_agent_error' };
  }
}

function normalizeRetrievalText(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractRetrievalTokens(value = '', { minLength = 3, limit = 24 } = {}) {
  const tokens = normalizeRetrievalText(value)
    .match(/[\p{L}\p{N}_-]{3,}/gu) || [];

  return Array.from(new Set(tokens))
    .filter((token) => token.length >= minLength && !RETRIEVAL_STOPWORDS.has(token))
    .slice(0, limit);
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLawNumber(value = '') {
  const digitsOnly = String(value || '').replace(/\D/g, '');
  return digitsOnly.replace(/^0+/, '') || digitsOnly;
}

function extractLegalReferenceSignals(value = '') {
  const normalizedText = normalizeRetrievalText(value);
  const articleNumbers = Array.from(new Set(
    Array.from(normalizedText.matchAll(/\bart(?:igo)?\s*\.?\s*(\d+[a-z]?)/g)).map((match) => match[1])
  ));
  const statuteAliases = new Set();
  const keywordHints = new Set();
  const lawReferences = [];
  const requiresParagraphUnique = /\bparagrafo\s+unico\b/.test(normalizedText);

  const aliasRules = [
    {
      pattern: /\bclt\b/,
      aliases: ['consolidacao das leis do trabalho', 'del5452'],
      keywords: ['consolidacao', 'trabalho', 'del5452', '5452'],
    },
    {
      pattern: /\bctn\b/,
      aliases: ['codigo tributario nacional', '5172'],
      keywords: ['codigo', 'tributario', 'nacional', '5172'],
    },
    {
      pattern: /\bcpc\b/,
      aliases: ['codigo de processo civil', '13105'],
      keywords: ['codigo', 'processo', 'civil', '13105'],
    },
    {
      pattern: /\bfgts\b/,
      aliases: ['fundo de garantia do tempo de servico', '8036'],
      keywords: ['fundo', 'garantia', 'servico', '8036'],
    },
    {
      pattern: /\bipi\b/,
      aliases: ['imposto sobre produtos industrializados', 'produtos industrializados'],
      keywords: ['produtos', 'industrializados'],
    },
  ];

  for (const rule of aliasRules) {
    if (!rule.pattern.test(normalizedText)) {
      continue;
    }

    for (const alias of rule.aliases) {
      statuteAliases.add(alias);
    }

    for (const keyword of rule.keywords) {
      keywordHints.add(keyword);
    }
  }

  const lawMatches = Array.from(normalizedText.matchAll(/\b(lei complementar|lei|decreto-lei|decreto|emenda constitucional|constituicao)\s*n?[oº.]?\s*([\d./-]+)/g));
  for (const match of lawMatches) {
    const kind = String(match[1] || '').replace(/\s+/g, ' ').trim();
    const number = normalizeLawNumber(match[2]);
    if (!kind || !number) {
      continue;
    }

    lawReferences.push({ kind, number });
    if (number.length >= 3) {
      keywordHints.add(number);
    }
  }

  if (requiresParagraphUnique) {
    keywordHints.add('paragrafo');
    keywordHints.add('unico');
  }

  return {
    articleNumbers,
    lawReferences,
    requiresParagraphUnique,
    statuteAliases: Array.from(statuteAliases),
    keywordHints: Array.from(keywordHints),
  };
}

function buildRetrievalKeywords(value = '', { minLength = 3, limit = 24 } = {}) {
  const keywords = new Set(
    extractRetrievalTokens(value, { minLength, limit: Math.max(limit, 24) })
      .filter((token) => !RETRIEVAL_QUERY_META_TOKENS.has(token))
  );
  const legalSignals = extractLegalReferenceSignals(value);

  // Expand common shorthand/legal abbreviations used in noisy user inputs.
  for (const token of Array.from(keywords)) {
    const expansions = RETRIEVAL_TOKEN_EXPANSIONS.get(token);
    if (!Array.isArray(expansions) || expansions.length === 0) {
      continue;
    }

    for (const expansion of expansions) {
      for (const expandedToken of extractRetrievalTokens(expansion, { minLength, limit: 8 })) {
        keywords.add(expandedToken);
      }
    }
  }

  for (const alias of legalSignals.statuteAliases) {
    for (const token of extractRetrievalTokens(alias, { minLength, limit: 8 })) {
      keywords.add(token);
    }
  }

  for (const hint of legalSignals.keywordHints) {
    if (hint.length >= minLength && !RETRIEVAL_STOPWORDS.has(hint)) {
      keywords.add(hint);
    }
  }

  return Array.from(keywords).slice(0, limit);
}

function hasSingleAdjacentTransposition(source = '', target = '') {
  const left = String(source || '');
  const right = String(target || '');
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  const diffIndexes = [];
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      diffIndexes.push(index);
      if (diffIndexes.length > 2) {
        return false;
      }
    }
  }

  if (diffIndexes.length !== 2 || diffIndexes[1] !== diffIndexes[0] + 1) {
    return false;
  }

  const [first, second] = diffIndexes;
  return left[first] === right[second] && left[second] === right[first];
}

function levenshteinDistanceWithinLimit(source = '', target = '', maxDistance = 1) {
  const left = String(source || '');
  const right = String(target || '');
  const limit = Math.max(0, Number(maxDistance || 0));

  if (left === right) {
    return 0;
  }

  if (!left.length || !right.length) {
    return Math.max(left.length, right.length);
  }

  if (Math.abs(left.length - right.length) > limit) {
    return limit + 1;
  }

  let previous = new Array(right.length + 1);
  let current = new Array(right.length + 1);
  for (let column = 0; column <= right.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    let rowMin = current[0];

    const startColumn = Math.max(1, row - limit);
    const endColumn = Math.min(right.length, row + limit);

    for (let column = 1; column < startColumn; column += 1) {
      current[column] = limit + 1;
    }

    for (let column = startColumn; column <= endColumn; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      const insertion = current[column - 1] + 1;
      const deletion = previous[column] + 1;
      const substitution = previous[column - 1] + substitutionCost;
      const value = Math.min(insertion, deletion, substitution);
      current[column] = value;

      if (value < rowMin) {
        rowMin = value;
      }
    }

    for (let column = endColumn + 1; column <= right.length; column += 1) {
      current[column] = limit + 1;
    }

    if (rowMin > limit) {
      return limit + 1;
    }

    [previous, current] = [current, previous];
  }

  return previous[right.length];
}

function getTypoToleranceDistance(token = '') {
  const normalized = String(token || '').trim();
  if (normalized.length < RAG_TYPO_MIN_TOKEN_LENGTH) {
    return 0;
  }

  if (normalized.length <= 6) {
    return 1;
  }

  return 2;
}

function hasApproximateTokenMatch(token = '', contentTokens = []) {
  if (!ENABLE_RAG_TYPO_TOLERANCE) {
    return false;
  }

  const normalizedToken = String(token || '').trim();
  const maxDistance = getTypoToleranceDistance(normalizedToken);
  if (!normalizedToken || maxDistance === 0) {
    return false;
  }

  const tokenPrefix = normalizedToken.slice(0, 1);
  for (const candidate of Array.isArray(contentTokens) ? contentTokens : []) {
    const normalizedCandidate = String(candidate || '').trim();
    if (!normalizedCandidate || normalizedCandidate === normalizedToken) {
      continue;
    }

    if (Math.abs(normalizedCandidate.length - normalizedToken.length) > maxDistance) {
      continue;
    }

    if (tokenPrefix && normalizedCandidate[0] !== tokenPrefix) {
      continue;
    }

    if (hasSingleAdjacentTransposition(normalizedToken, normalizedCandidate)) {
      return true;
    }

    const distance = levenshteinDistanceWithinLimit(normalizedToken, normalizedCandidate, maxDistance);
    if (distance <= maxDistance) {
      return true;
    }
  }

  return false;
}

function contentHasRetrievalToken(normalizedContent = '', contentTokens = [], token = '') {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return false;
  }

  if (String(normalizedContent || '').includes(normalizedToken)) {
    return true;
  }

  return hasApproximateTokenMatch(normalizedToken, contentTokens);
}

function contentHasRetrievalKeywordMatch(content = '', keywords = []) {
  const normalizedContent = normalizeRetrievalText(content);
  if (!normalizedContent) {
    return false;
  }

  const contentTokens = ENABLE_RAG_TYPO_TOLERANCE
    ? extractRetrievalTokens(content, { minLength: 3, limit: 220 })
    : [];

  return (Array.isArray(keywords) ? keywords : []).some((keyword) => (
    contentHasRetrievalToken(normalizedContent, contentTokens, keyword)
  ));
}

function detectChatProvider({ model = '', baseURL = '' } = {}) {
  const normalizedModel = String(model || '').trim().toLowerCase();
  const normalizedBaseURL = String(baseURL || '').trim().toLowerCase();

  if (normalizedModel.startsWith('claude-') || normalizedBaseURL.includes('anthropic.com') || normalizedBaseURL.includes('claude.com')) {
    return 'anthropic';
  }

  return 'openai-compatible';
}

function detectEmbeddingProvider({ baseURL = '' } = {}) {
  const normalizedBaseURL = String(baseURL || '').trim().toLowerCase();
  if (normalizedBaseURL.includes('anthropic.com') || normalizedBaseURL.includes('claude.com')) {
    return 'unsupported';
  }

  return 'openai-compatible';
}

function getAiRuntimeConfig() {
  const geminiApiKey = getFirstNonEmptyEnv(process.env.GEMINI_API_KEY);
  const openAiApiKey = getFirstNonEmptyEnv(process.env.OPENAI_API_KEY);
  const anthropicApiKey = getFirstNonEmptyEnv(process.env.ANTHROPIC_API_KEY);
  const sharedOpenAiCompatibleApiKey = getFirstNonEmptyEnv(process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
  const sharedOpenAiCompatibleBaseURL = normalizeBaseUrl(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
  const sharedBaseLooksAnthropic = Boolean(sharedOpenAiCompatibleBaseURL && /anthropic\.com|claude\.com/i.test(sharedOpenAiCompatibleBaseURL));

  const defaultChatApiKey = anthropicApiKey || geminiApiKey || openAiApiKey || sharedOpenAiCompatibleApiKey;
  const defaultChatBaseURL = anthropicApiKey
    ? ANTHROPIC_BASE_URL
    : (geminiApiKey ? GEMINI_OPENAI_BASE_URL : sharedOpenAiCompatibleBaseURL);

  const chatApiKey = getFirstNonEmptyEnv(
    process.env.CHAT_API_KEY,
    process.env.AI_CHAT_API_KEY,
    defaultChatApiKey
  );
  const chatModel = getFirstNonEmptyEnv(process.env.CHAT_MODEL) || (anthropicApiKey ? 'claude-sonnet-4-6' : (geminiApiKey ? 'gemini-2.5-flash' : 'gpt-4o'));
  const chatBaseURL = normalizeBaseUrl(getFirstNonEmptyEnv(
    process.env.CHAT_BASE_URL,
    process.env.AI_CHAT_BASE_URL,
    defaultChatBaseURL
  ));
  const chatProvider = detectChatProvider({ model: chatModel, baseURL: chatBaseURL });
  const fastChatModel = getFirstNonEmptyEnv(process.env.FAST_CHAT_MODEL) || chatModel;

  const embeddingModel = getFirstNonEmptyEnv(process.env.EMBEDDING_MODEL) || (openAiApiKey ? 'text-embedding-3-large' : (geminiApiKey ? 'gemini-embedding-001' : 'text-embedding-3-large'));
  const embeddingBaseURL = normalizeBaseUrl(getFirstNonEmptyEnv(
    process.env.EMBEDDING_BASE_URL,
    process.env.AI_EMBEDDING_BASE_URL,
    embeddingModel.startsWith('gemini-') ? GEMINI_OPENAI_BASE_URL : (sharedBaseLooksAnthropic ? '' : sharedOpenAiCompatibleBaseURL)
  ));
  const embeddingApiKey = getFirstNonEmptyEnv(
    process.env.EMBEDDING_API_KEY,
    process.env.AI_EMBEDDING_API_KEY,
    openAiApiKey,
    geminiApiKey,
    sharedBaseLooksAnthropic ? '' : sharedOpenAiCompatibleApiKey
  );
  const embeddingProvider = detectEmbeddingProvider({ baseURL: embeddingBaseURL });

  return {
    apiKey: chatApiKey,
    baseURL: chatBaseURL,
    useGemini: embeddingModel.startsWith('gemini-') || chatModel.startsWith('gemini-'),
    chatApiKey,
    chatBaseURL,
    chatProvider,
    chatModel,
    fastChatModel,
    embeddingApiKey,
    embeddingBaseURL,
    embeddingProvider,
    embeddingModel
  };
}

function createOpenAiCompatibleClient({ apiKey, baseURL } = {}) {
  return new OpenAI({
    apiKey,
    baseURL,
  });
}

function createNativeChatClient() {
  const cfg = getAiRuntimeConfig();
  const anthropicOptions = { apiKey: cfg.chatApiKey };
  if (cfg.chatBaseURL) {
    anthropicOptions.baseURL = cfg.chatBaseURL;
  }

  return new Anthropic(anthropicOptions);
}

function createAiClient() {
  const cfg = getAiRuntimeConfig();
  return createOpenAiCompatibleClient({
    apiKey: cfg.chatApiKey,
    baseURL: cfg.chatBaseURL,
  });
}

function getAuxiliaryTextRuntimeConfig({ requestedModel = '' } = {}) {
  const cfg = getAiRuntimeConfig();
  const explicitModel = getFirstNonEmptyEnv(
    requestedModel,
    process.env.AUX_CHAT_MODEL,
    process.env.RAG_AUX_MODEL,
    process.env.AI_AUX_MODEL
  );
  const explicitApiKey = getFirstNonEmptyEnv(
    process.env.AUX_CHAT_API_KEY,
    process.env.RAG_AUX_API_KEY,
    process.env.AI_AUX_API_KEY
  );
  const explicitBaseURL = normalizeBaseUrl(getFirstNonEmptyEnv(
    process.env.AUX_CHAT_BASE_URL,
    process.env.RAG_AUX_BASE_URL,
    process.env.AI_AUX_BASE_URL
  ));

  const geminiApiKey = getFirstNonEmptyEnv(process.env.GEMINI_API_KEY);
  const sharedOpenAiCompatibleApiKey = getFirstNonEmptyEnv(process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
  const sharedOpenAiCompatibleBaseURL = normalizeBaseUrl(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
  const openAiApiKey = getFirstNonEmptyEnv(process.env.OPENAI_API_KEY);
  const anthropicApiKey = getFirstNonEmptyEnv(process.env.ANTHROPIC_API_KEY);

  const looksGemini = (value = '') => String(value || '').toLowerCase().startsWith('gemini-');
  const looksClaude = (value = '') => String(value || '').toLowerCase().startsWith('claude-');
  const sharedLooksGoogle = Boolean(sharedOpenAiCompatibleBaseURL && /googleapis\.com/i.test(sharedOpenAiCompatibleBaseURL));

  const model = String(
    explicitModel
    || ((geminiApiKey || (sharedOpenAiCompatibleApiKey && sharedLooksGoogle)) ? 'gemini-2.5-flash' : '')
    || (anthropicApiKey ? 'claude-haiku-4-5-20251001' : '')
    || (openAiApiKey ? 'gpt-4o-mini' : '')
    || cfg.fastChatModel
    || cfg.chatModel
  ).trim();

  if (!model) {
    return { enabled: false, provider: 'openai-compatible', apiKey: '', baseURL: '', model: '' };
  }

  if (looksClaude(model)) {
    const apiKey = explicitApiKey || anthropicApiKey;
    const baseURL = explicitBaseURL || ANTHROPIC_BASE_URL;
    return {
      enabled: Boolean(apiKey),
      provider: 'anthropic',
      apiKey,
      baseURL,
      model,
    };
  }

  if (looksGemini(model)) {
    const apiKey = explicitApiKey || geminiApiKey || sharedOpenAiCompatibleApiKey;
    const baseURL = explicitBaseURL || (sharedLooksGoogle ? sharedOpenAiCompatibleBaseURL : GEMINI_OPENAI_BASE_URL);
    return {
      enabled: Boolean(apiKey && baseURL),
      provider: 'openai-compatible',
      apiKey,
      baseURL,
      model,
    };
  }

  if (explicitApiKey || explicitBaseURL) {
    return {
      enabled: Boolean(explicitApiKey),
      provider: detectChatProvider({ model, baseURL: explicitBaseURL }),
      apiKey: explicitApiKey,
      baseURL: explicitBaseURL,
      model,
    };
  }

  if (sharedOpenAiCompatibleApiKey && sharedOpenAiCompatibleBaseURL) {
    return {
      enabled: true,
      provider: 'openai-compatible',
      apiKey: sharedOpenAiCompatibleApiKey,
      baseURL: sharedOpenAiCompatibleBaseURL,
      model,
    };
  }

  if (openAiApiKey) {
    return {
      enabled: true,
      provider: 'openai-compatible',
      apiKey: openAiApiKey,
      baseURL: '',
      model,
    };
  }

  return {
    enabled: Boolean(cfg.chatApiKey),
    provider: cfg.chatProvider,
    apiKey: cfg.chatApiKey,
    baseURL: cfg.chatBaseURL,
    model,
  };
}

function createAuxiliaryTextClient(runtime) {
  if (!runtime?.enabled || !runtime?.apiKey) {
    return null;
  }

  if (runtime.provider === 'anthropic') {
    const options = { apiKey: runtime.apiKey };
    if (runtime.baseURL) {
      options.baseURL = runtime.baseURL;
    }
    return new Anthropic(options);
  }

  return createOpenAiCompatibleClient({
    apiKey: runtime.apiKey,
    baseURL: runtime.baseURL,
  });
}

function createEmbeddingClient() {
  const cfg = getAiRuntimeConfig();
  if (!cfg.embeddingApiKey || cfg.embeddingProvider !== 'openai-compatible') {
    return null;
  }

  return createOpenAiCompatibleClient({
    apiKey: cfg.embeddingApiKey,
    baseURL: cfg.embeddingBaseURL,
  });
}

function isRetryableAiError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const message = String(error?.message || '').toLowerCase();
  return /timeout|timed out|failed to respond|temporarily unavailable|try again|socket hang up|econnreset|etimedout|eai_again|network error|connection reset|gateway|overloaded/.test(message);
}

/**
 * Retry wrapper for AI provider calls that handles transient transport/provider errors.
 * Retries up to maxRetries times with exponential backoff.
 */
async function withRetry429(fn, { maxRetries = 4, baseDelayMs = 2000, label = 'AI call' } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = error?.status || error?.statusCode || error?.response?.status;
      const shouldRetry = isRetryableAiError(error);
      if (!shouldRetry || attempt >= maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`[RETRY] ${label} - erro transitorio (status=${status || 'n/a'}), tentativa ${attempt + 1}/${maxRetries}, aguardando ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

const AI_INPUT_COST_PER_1K = Number(process.env.AI_INPUT_COST_PER_1K || 0.005);
const AI_OUTPUT_COST_PER_1K = Number(process.env.AI_OUTPUT_COST_PER_1K || 0.015);
const AI_EMBEDDING_COST_PER_1K = Number(process.env.AI_EMBEDDING_COST_PER_1K || 0.00013);

function estimateTokens(text = '') {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function estimateCompletionCostUsd(promptTokens, completionTokens) {
  const input = (Math.max(0, Number(promptTokens || 0)) / 1000) * AI_INPUT_COST_PER_1K;
  const output = (Math.max(0, Number(completionTokens || 0)) / 1000) * AI_OUTPUT_COST_PER_1K;
  return Number((input + output).toFixed(6));
}

function estimateEmbeddingCostUsd(totalTokens) {
  return Number((((Math.max(0, Number(totalTokens || 0))) / 1000) * AI_EMBEDDING_COST_PER_1K).toFixed(6));
}

function getAnthropicMaxTokens(model = '') {
  return String(model || '').toLowerCase().includes('haiku') ? DEFAULT_FAST_CHAT_MAX_TOKENS : DEFAULT_CHAT_MAX_TOKENS;
}

function formatChatMessagesForAnthropic(messages = []) {
  const history = Array.isArray(messages) ? messages : [];
  const systemParts = [];
  const conversation = [];

  for (const message of history) {
    const role = message?.role === 'assistant' ? 'assistant' : (message?.role === 'system' || message?.role === 'developer' ? 'system' : 'user');
    const content = String(message?.content || '').trim();
    if (!content) {
      continue;
    }

    if (role === 'system') {
      systemParts.push(content);
      continue;
    }

    conversation.push({ role, content });
  }

  return {
    system: systemParts.join('\n\n').trim(),
    messages: conversation.length > 0 ? conversation : [{ role: 'user', content: 'Responda com base no contexto documental recebido.' }],
  };
}

function extractTextFromAnthropicMessage(response) {
  return (response?.content || [])
    .map((block) => {
      if (block?.type === 'text') {
        return block.text || '';
      }

      return '';
    })
    .join('')
    .trim();
}

function getImageMediaType(ext = '') {
  switch (String(ext || '').toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

async function runChatCompletion({
  messages = [],
  model,
  userId = null,
  conversationId = null,
  requestType = 'chat_completion',
  temperature = 0,
  maxTokens,
}) {
  const cfg = getAiRuntimeConfig();
  const effectiveModel = String(model || '').trim() || cfg.chatModel;
  const promptTokens = estimateTokens(JSON.stringify(messages));

  try {
    if (cfg.chatProvider === 'anthropic') {
      const anthropic = createNativeChatClient();
      const anthropicPayload = formatChatMessagesForAnthropic(messages);
      const response = await withRetry429(
        () => anthropic.messages.create({
          model: effectiveModel,
          system: anthropicPayload.system || undefined,
          messages: anthropicPayload.messages,
          temperature,
          max_tokens: Math.max(256, Number(maxTokens || getAnthropicMaxTokens(effectiveModel))),
        }),
        { label: requestType }
      );

      const text = extractTextFromAnthropicMessage(response);
      const completionTokens = Number(response?.usage?.output_tokens || estimateTokens(text));
      logAiUsageSafe({
        userId,
        conversationId,
        requestType,
        model: effectiveModel,
        status: 'success',
        promptTokens: Number(response?.usage?.input_tokens || promptTokens),
        completionTokens,
        totalTokens: Number(response?.usage?.input_tokens || promptTokens) + completionTokens,
        costUsd: estimateCompletionCostUsd(Number(response?.usage?.input_tokens || promptTokens), completionTokens),
      });

      return text;
    }

    const openai = createAiClient();
    const response = await withRetry429(
      () => openai.chat.completions.create({
        model: effectiveModel,
        messages,
        temperature,
        max_tokens: Math.max(256, Number(maxTokens || DEFAULT_CHAT_MAX_TOKENS)),
      }),
      { label: requestType }
    );

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    const completionTokens = Number(response?.usage?.completion_tokens || estimateTokens(text));
    const finalPromptTokens = Number(response?.usage?.prompt_tokens || promptTokens);
    logAiUsageSafe({
      userId,
      conversationId,
      requestType,
      model: effectiveModel,
      status: 'success',
      promptTokens: finalPromptTokens,
      completionTokens,
      totalTokens: finalPromptTokens + completionTokens,
      costUsd: estimateCompletionCostUsd(finalPromptTokens, completionTokens),
    });

    return text;
  } catch (error) {
    logAiUsageSafe({
      userId,
      conversationId,
      requestType,
      model: effectiveModel,
      status: 'error',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      errorMessage: error?.message || 'Falha no provedor de chat',
    });
    throw error;
  }
}

let aiUsageLoggingDisabled = false;

async function ensureAiUsageTable() {
  if (!hasDatabaseUrl) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_request_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,
      conversation_id INTEGER,
      request_type TEXT NOT NULL DEFAULT 'chat_completion',
      model TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created_at
      ON ai_request_logs(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_request_logs_user_id
      ON ai_request_logs(user_id, created_at DESC);
  `);
}

async function logAiUsage(params = {}) {
  if (aiUsageLoggingDisabled) {
    return;
  }

  const payload = {
    user_id: String(params.userId || '').trim() || null,
    conversation_id: Number.isFinite(params.conversationId) ? params.conversationId : null,
    request_type: String(params.requestType || 'chat_completion').trim(),
    model: String(params.model || '').trim() || null,
    status: String(params.status || 'success').trim(),
    prompt_tokens: Math.max(0, Math.floor(Number(params.promptTokens || 0))),
    completion_tokens: Math.max(0, Math.floor(Number(params.completionTokens || 0))),
    total_tokens: Math.max(0, Math.floor(Number(params.totalTokens || 0))),
    cost_usd: Number(params.costUsd || 0),
    error_message: String(params.errorMessage || '').trim() || null,
  };

  await withDatabaseFallback(
    'logAiUsage',
    async () => {
      if (!hasDatabaseUrl) {
        return;
      }

      await ensureAiUsageTable();

      await pool.query(
        `
        INSERT INTO ai_request_logs (
          user_id,
          conversation_id,
          request_type,
          model,
          status,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          cost_usd,
          error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          payload.user_id,
          payload.conversation_id,
          payload.request_type,
          payload.model,
          payload.status,
          payload.prompt_tokens,
          payload.completion_tokens,
          payload.total_tokens,
          payload.cost_usd,
          payload.error_message,
        ]
      );
    },
    async () => {
      if (!supabaseAdminClient) {
        return;
      }

      const response = await supabaseAdminClient.from('ai_request_logs').insert([payload]);
      if (response.error) {
        if (isMissingRelationFromSchemaCacheError(response.error, 'ai_request_logs')) {
          aiUsageLoggingDisabled = true;
          console.warn('[AI USAGE] Tabela ai_request_logs indisponivel no schema cache; seguindo sem persistir log.');
          return;
        }
        throw createSupabaseFallbackError(response.error, 'Falha ao registrar uso de IA via Supabase');
      }
    }
  );
}

function logAiUsageSafe(params = {}) {
  void logAiUsage(params).catch((error) => {
    if (aiUsageLoggingDisabled || isMissingRelationFromSchemaCacheError(error?.cause || error, 'ai_request_logs')) {
      return;
    }
    console.warn('[AI USAGE] Falha ao registrar uso:', error?.message || error);
  });
}

function createEmptyAiUsageResponse(rangeDays) {
  return {
    range_days: rangeDays,
    summary: {
      tokens_today: 0,
      cost_today: 0,
      requests: 0,
      errors: 0,
      error_rate: 0,
      tokens_month: 0,
      cost_month: 0,
      total_tokens_range: 0,
      total_cost_range: 0,
    },
    by_user: [],
    requests: [],
  };
}

async function fetchSupabaseRowsByIds(tableName, columnName, selectClause, ids = []) {
  if (!supabaseAdminClient || !Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const rows = [];
  const chunkSize = 100;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const response = await supabaseAdminClient
      .from(tableName)
      .select(selectClause)
      .in(columnName, chunk);

    if (response.error) {
      console.warn(`[AI USAGE] Falha ao carregar ${tableName} via Supabase:`, response.error.message || response.error);
      return rows;
    }

    rows.push(...(response.data || []));
  }

  return rows;
}

async function getAiUsageViaSupabase(rangeDays) {
  if (!supabaseAdminClient) {
    return createEmptyAiUsageResponse(rangeDays);
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const rangeStart = new Date(now.getTime() - (rangeDays * 24 * 60 * 60 * 1000));
  const fetchStart = new Date(Math.min(rangeStart.getTime(), monthStart.getTime()));

  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const response = await supabaseAdminClient
      .from('ai_request_logs')
      .select('id, user_id, request_type, total_tokens, cost_usd, status, created_at')
      .gte('created_at', fetchStart.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (response.error) {
      if (isMissingRelationFromSchemaCacheError(response.error, 'ai_request_logs')) {
        return createEmptyAiUsageResponse(rangeDays);
      }

      throw createSupabaseFallbackError(response.error, 'Erro ao carregar consumo de IA via Supabase');
    }

    const batch = response.data || [];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }
  }

  const rangeStartTime = rangeStart.getTime();
  const todayStartTime = todayStart.getTime();
  const monthStartTime = monthStart.getTime();

  const rangeRows = [];
  let tokensToday = 0;
  let costToday = 0;
  let tokensMonth = 0;
  let costMonth = 0;

  for (const row of rows) {
    const createdAtTime = new Date(row.created_at).getTime();
    const totalTokens = Math.max(0, Number(row.total_tokens || 0));
    const costUsd = Number(row.cost_usd || 0);

    if (createdAtTime >= monthStartTime) {
      tokensMonth += totalTokens;
      costMonth += costUsd;
    }

    if (createdAtTime >= todayStartTime) {
      tokensToday += totalTokens;
      costToday += costUsd;
    }

    if (createdAtTime >= rangeStartTime) {
      rangeRows.push(row);
    }
  }

  const userIds = [...new Set(rangeRows.map((row) => String(row.user_id || '').trim()).filter(Boolean))];
  const [profileRows, usuarioRows] = await Promise.all([
    fetchSupabaseRowsByIds('profiles', 'id', 'id, first_name, last_name', userIds),
    fetchSupabaseRowsByIds('usuarios', 'user_id', 'user_id, nome_completo, email', userIds),
  ]);

  const profilesById = new Map(profileRows.map((row) => [String(row.id || '').trim(), row]));
  const usuariosById = new Map(usuarioRows.map((row) => [String(row.user_id || '').trim(), row]));

  const byUserMap = new Map();
  const requestRows = [];

  for (const row of rangeRows) {
    const userId = String(row.user_id || '').trim();
    const profile = profilesById.get(userId) || {};
    const usuario = usuariosById.get(userId) || {};
    const profileName = [profile.first_name, profile.last_name]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');

    const requestUserName = profileName || String(usuario.email || '').trim() || userId || 'Sem identificação';
    const summaryUserName = profileName || String(usuario.nome_completo || '').trim() || String(usuario.email || '').trim() || userId || 'Sem identificação';
    const safeUserId = userId || 'desconhecido';
    const totalTokens = Math.max(0, Number(row.total_tokens || 0));
    const costUsd = Number(row.cost_usd || 0);
    const createdAt = row.created_at || null;

    requestRows.push({
      id: Number(row.id || 0),
      created_at: createdAt,
      usuario: requestUserName,
      tipo: String(row.request_type || 'chat_completion').trim() || 'chat_completion',
      tokens: totalTokens,
      cost_usd: costUsd,
      status: String(row.status || 'success').trim() || 'success',
    });

    const current = byUserMap.get(safeUserId) || {
      user_id: safeUserId,
      nome: summaryUserName,
      email: String(usuario.email || '').trim() || '—',
      requests: 0,
      total_tokens: 0,
      total_cost_usd: 0,
      ultima_atividade: createdAt,
    };

    current.requests += 1;
    current.total_tokens += totalTokens;
    current.total_cost_usd = Number((current.total_cost_usd + costUsd).toFixed(6));
    if (!current.ultima_atividade || (createdAt && new Date(createdAt).getTime() > new Date(current.ultima_atividade).getTime())) {
      current.ultima_atividade = createdAt;
    }
    byUserMap.set(safeUserId, current);
  }

  const requests = rangeRows.length;
  const errors = rangeRows.filter((row) => String(row.status || '').trim().toLowerCase() === 'error').length;
  const errorRate = requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0;
  const totalTokensRange = rangeRows.reduce((sum, row) => sum + Math.max(0, Number(row.total_tokens || 0)), 0);
  const totalCostRange = Number(rangeRows.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0).toFixed(6));

  return {
    range_days: rangeDays,
    summary: {
      tokens_today: tokensToday,
      cost_today: Number(costToday.toFixed(6)),
      requests,
      errors,
      error_rate: errorRate,
      tokens_month: tokensMonth,
      cost_month: Number(costMonth.toFixed(6)),
      total_tokens_range: totalTokensRange,
      total_cost_range: totalCostRange,
    },
    by_user: [...byUserMap.values()]
      .sort((left, right) => Number(right.total_tokens || 0) - Number(left.total_tokens || 0))
      .slice(0, 200),
    requests: requestRows.slice(0, 200),
  };
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseAuth = Boolean(supabaseUrl && supabaseAnonKey);
const hasSupabaseAdmin = Boolean(supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey));

// If service_role key is not a valid JWT (e.g. sb_secret_...), fall back to anon key
const effectiveAdminKey = (supabaseServiceRoleKey && supabaseServiceRoleKey.startsWith('eyJ'))
  ? supabaseServiceRoleKey
  : supabaseAnonKey;

const supabaseAuthClient = hasSupabaseAuth
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const supabaseAdminClient = hasSupabaseAdmin
  ? createClient(supabaseUrl, effectiveAdminKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const supabaseStorageKey = supabaseServiceRoleKey || effectiveAdminKey;
const supabaseStorageClient = supabaseUrl && supabaseStorageKey
  ? createClient(supabaseUrl, supabaseStorageKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : supabaseAdminClient;

function getAgentAttachmentsStorageClient() {
  return supabaseStorageClient || supabaseAdminClient;
}

const pgConnectionTimeoutMillis = Number.parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '4000', 10);
const pgQueryTimeoutMillis = Number.parseInt(process.env.PG_QUERY_TIMEOUT_MS || '10000', 10);

function isIpAddress(value) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(String(value || '').trim()) || /^\[[0-9a-f:]+\]$/i.test(String(value || '').trim());
}

function shouldEnableSsl(databaseUrl) {
  const sslMode = String(databaseUrl?.searchParams?.get('sslmode') || '').trim().toLowerCase();
  return ['require', 'verify-ca', 'verify-full', 'prefer'].includes(sslMode) || isProduction;
}

async function buildPgPoolConfig() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  const parsedUrl = new URL(databaseUrl);
  const originalHost = String(parsedUrl.hostname || '').trim();
  let resolvedHost = originalHost;

  if (originalHost && !isIpAddress(originalHost)) {
    try {
      const lookupResult = await dns.lookup(originalHost, { family: 4 });
      if (lookupResult?.address) {
        resolvedHost = lookupResult.address;
        console.log(`[DB] Host PostgreSQL resolvido em IPv4: ${originalHost} -> ${resolvedHost}`);
      }
    } catch (error) {
      console.warn(`[DB] Falha ao resolver IPv4 para ${originalHost}. Mantendo hostname original.`, error?.message || error);
    }
  }

  return {
    host: resolvedHost,
    port: Number.parseInt(parsedUrl.port || '5432', 10),
    database: decodeURIComponent(parsedUrl.pathname.replace(/^\//, '')),
    user: decodeURIComponent(parsedUrl.username || ''),
    password: decodeURIComponent(parsedUrl.password || ''),
    ssl: shouldEnableSsl(parsedUrl) ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: Number.isFinite(pgConnectionTimeoutMillis) ? pgConnectionTimeoutMillis : 4000,
    query_timeout: Number.isFinite(pgQueryTimeoutMillis) ? pgQueryTimeoutMillis : 10000,
    idleTimeoutMillis: 30000,
  };
}

const pool = hasDatabaseUrl
  ? new Pool(await buildPgPoolConfig())
  : {
      query: async () => {
        const err = new Error('DATABASE_URL não configurado. Configure o arquivo .env para habilitar banco e RAG.');
        err.code = 'DB_NOT_CONFIGURED';
        throw err;
      }
    };

if (hasDatabaseUrl && pool.on) {
  pool.on('error', (err) => {
    console.error('[DB POOL] Erro em cliente ocioso:', err?.message || err);
    pushRuntimeEvent('db_pool_error', { message: String(err?.message || err || '').trim() });
  });
}

const memoryChatStore = {
  nextConversationId: 1,
  nextMessageId: 1,
  conversations: [],
  messages: []
};

const ADMIN_QA_PAGE_SIZE = 15;

function normalizeAdminQaRow(row = {}) {
  return {
    id: Number(row.id || 0),
    question: String(row.question || '').trim(),
    answer: String(row.answer || '').trim(),
  };
}

function buildAdminQaResponse(rows = [], total = 0, page = 1, exportAll = false) {
  const normalizedRows = rows.map(normalizeAdminQaRow).filter((row) => row.question && row.answer);
  const safeTotal = Math.max(0, Number(total || normalizedRows.length || 0));
  const totalPages = exportAll ? 1 : Math.max(1, Math.ceil(safeTotal / ADMIN_QA_PAGE_SIZE));

  return {
    page: exportAll ? 1 : Math.min(Math.max(1, Number(page || 1)), totalPages),
    page_size: ADMIN_QA_PAGE_SIZE,
    total: safeTotal,
    total_pages: totalPages,
    rows: normalizedRows,
  };
}

function collectQaRowsFromMessages(messages = []) {
  const groupedByConversation = new Map();

  for (const message of Array.isArray(messages) ? messages : []) {
    const conversationId = Number(message?.conversation_id || 0);
    if (!conversationId) {
      continue;
    }

    if (!groupedByConversation.has(conversationId)) {
      groupedByConversation.set(conversationId, []);
    }

    groupedByConversation.get(conversationId).push(message);
  }

  const rows = [];

  for (const conversationMessages of groupedByConversation.values()) {
    const orderedMessages = conversationMessages
      .slice()
      .sort((left, right) => Number(left.id || 0) - Number(right.id || 0));

    for (let index = 0; index < orderedMessages.length; index += 1) {
      const message = orderedMessages[index];
      if (String(message.role || '').trim() !== 'user') {
        continue;
      }

      const answerMessage = orderedMessages
        .slice(index + 1)
        .find((candidate) => String(candidate.role || '').trim() === 'assistant');

      const question = String(message.content || '').trim();
      const answer = String(answerMessage?.content || '').trim();
      if (!question || !answer) {
        continue;
      }

      rows.push({
        id: Number(message.id || 0),
        question,
        answer,
      });
    }
  }

  return rows.sort((left, right) => Number(right.id || 0) - Number(left.id || 0));
}

async function getAdminQaRowsViaDatabase({ page = 1, exportAll = false } = {}) {
  await ensureChatTables();

  const countResult = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM messages user_msg
    JOIN LATERAL (
      SELECT assistant_msg.id, assistant_msg.content
      FROM messages assistant_msg
      WHERE assistant_msg.conversation_id = user_msg.conversation_id
        AND assistant_msg.role = 'assistant'
        AND assistant_msg.id > user_msg.id
      ORDER BY assistant_msg.id ASC
      LIMIT 1
    ) assistant_msg ON TRUE
    WHERE user_msg.role = 'user'
      AND NULLIF(BTRIM(user_msg.content), '') IS NOT NULL
      AND NULLIF(BTRIM(assistant_msg.content), '') IS NOT NULL
  `);

  const total = Number(countResult.rows?.[0]?.total || 0);
  const offset = (Math.max(1, Number(page || 1)) - 1) * ADMIN_QA_PAGE_SIZE;
  const params = exportAll ? [] : [ADMIN_QA_PAGE_SIZE, offset];
  const limitClause = exportAll ? '' : 'LIMIT $1 OFFSET $2';

  const rowsResult = await pool.query(`
    SELECT
      user_msg.id,
      user_msg.content AS question,
      assistant_msg.content AS answer
    FROM messages user_msg
    JOIN LATERAL (
      SELECT assistant_msg.id, assistant_msg.content
      FROM messages assistant_msg
      WHERE assistant_msg.conversation_id = user_msg.conversation_id
        AND assistant_msg.role = 'assistant'
        AND assistant_msg.id > user_msg.id
      ORDER BY assistant_msg.id ASC
      LIMIT 1
    ) assistant_msg ON TRUE
    WHERE user_msg.role = 'user'
      AND NULLIF(BTRIM(user_msg.content), '') IS NOT NULL
      AND NULLIF(BTRIM(assistant_msg.content), '') IS NOT NULL
    ORDER BY user_msg.id DESC
    ${limitClause}
  `, params);

  return buildAdminQaResponse(rowsResult.rows || [], total, page, exportAll);
}

async function getAdminQaRowsViaSupabase({ page = 1, exportAll = false } = {}) {
  const client = ensureSupabaseAdminAvailable();
  const messages = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const response = await client
      .from('messages')
      .select('id, conversation_id, role, content')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (response.error) {
      throw createSupabaseFallbackError(response.error, 'Erro ao carregar perguntas e respostas dos agentes');
    }

    const batch = response.data || [];
    messages.push(...batch);

    if (batch.length < pageSize) {
      break;
    }
  }

  const allRows = collectQaRowsFromMessages(messages);
  const total = allRows.length;
  const offset = (Math.max(1, Number(page || 1)) - 1) * ADMIN_QA_PAGE_SIZE;
  const rows = exportAll ? allRows : allRows.slice(offset, offset + ADMIN_QA_PAGE_SIZE);

  return buildAdminQaResponse(rows, total, page, exportAll);
}

function getAdminQaRowsFromMemory({ page = 1, exportAll = false } = {}) {
  const allRows = collectQaRowsFromMessages(memoryChatStore.messages);
  const total = allRows.length;
  const offset = (Math.max(1, Number(page || 1)) - 1) * ADMIN_QA_PAGE_SIZE;
  const rows = exportAll ? allRows : allRows.slice(offset, offset + ADMIN_QA_PAGE_SIZE);

  return buildAdminQaResponse(rows, total, page, exportAll);
}

function isPostgresUnavailableError(error) {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toUpperCase();

  return [
    'DB_NOT_CONFIGURED',
    'ENETUNREACH',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'EAI_AGAIN',
    'ECONNRESET',
    'ENOTFOUND'
  ].includes(code) || [
    'ENETUNREACH',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'FAILED TO FETCH',
    'QUERY READ TIMEOUT',
    'READ TIMEOUT',
    'TIMEOUT EXPIRED',
    'CONNECT'
  ].some((token) => message.includes(token));
}

const dbFallbackLogTimestamps = new Map();
const DB_FALLBACK_LOG_WINDOW_MS = 5 * 60 * 1000;

function logDatabaseFallback(label, error) {
  const message = String(error?.message || error || 'Falha desconhecida').trim();
  const key = `${label}::${message}`;
  const now = Date.now();
  const lastLoggedAt = Number(dbFallbackLogTimestamps.get(key) || 0);

  pushRuntimeEvent('db_fallback', {
    label,
    message,
  });

  if ((now - lastLoggedAt) < DB_FALLBACK_LOG_WINDOW_MS) {
    return;
  }

  dbFallbackLogTimestamps.set(key, now);
  console.warn(`[DB-FALLBACK] ${label}: usando Supabase REST devido a falha no Postgres`, message);
}

function createSupabaseFallbackError(error, message) {
  const fallbackError = new Error(message || error?.message || 'Falha ao consultar o Supabase');
  fallbackError.cause = error;
  return fallbackError;
}

function extractMissingColumnFromSchemaCacheError(error) {
  const message = String(error?.message || '');
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] || null;
}

function extractMissingColumnFromDatabaseError(error) {
  const schemaCacheColumn = extractMissingColumnFromSchemaCacheError(error);
  if (schemaCacheColumn) {
    return schemaCacheColumn;
  }

  const message = String(error?.message || '');
  const qualifiedMatch = message.match(/column\s+[\w.]+\.([a-zA-Z_][\w]*)\s+does not exist/i);
  if (qualifiedMatch?.[1]) {
    return qualifiedMatch[1];
  }

  const simpleMatch = message.match(/column\s+([a-zA-Z_][\w]*)\s+does not exist/i);
  return simpleMatch?.[1] || null;
}

function isMissingRelationFromSchemaCacheError(error, relationName) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').trim().toUpperCase();
  const normalizedRelation = String(relationName || '').trim().toLowerCase();
  return code === 'PGRST205'
    || code === 'PGRST204'
    || message.includes(`table 'public.${normalizedRelation}'`)
    || message.includes(`'${normalizedRelation}'`);
}

function resolvePublicAppBaseUrl(req) {
  const origin = String(req?.headers?.origin || '').trim();
  if (/^https?:\/\//i.test(origin) && !/localhost|127\.0\.0\.1/i.test(origin)) {
    return origin.replace(/\/$/, '');
  }

  let appUrl = String(process.env.APP_BASE_URL || '').trim();
  if (!appUrl) {
    appUrl = `${req.protocol}://${req.get('host')}`;
  }
  if (!/^https?:\/\//i.test(appUrl)) {
    appUrl = `https://${appUrl}`;
  }

  return appUrl.replace(/\/$/, '');
}

async function withDatabaseFallback(label, operation, fallback) {
  try {
    return await operation();
  } catch (error) {
    if (!supabaseAdminClient || !isPostgresUnavailableError(error)) {
      throw error;
    }

    logDatabaseFallback(label, error);
    return fallback(error);
  }
}

const TUTORIAL_ADMIN_USER_ID = '07d16581-fca5-4709-b0d3-e09859dbb286';

// ============================================
// 🧠 FUNÇÕES RAG PROFISSIONAL
// ============================================

async function extractPdfTextViaAiFallback(fileBuffer, filePath) {
  if (!fileBuffer || fileBuffer.length === 0) {
    return '';
  }

  const cfg = getAiRuntimeConfig();
  const fileName = path.basename(filePath);
  const maxBytes = 18 * 1024 * 1024;

  if (fileBuffer.length > maxBytes) {
    console.warn('[PDF][AI_FALLBACK] PDF muito grande para fallback inline.');
    return '';
  }

  const base64Pdf = fileBuffer.toString('base64');
  const extractionPrompt = 'Extraia o máximo de texto útil deste PDF em português, preservando títulos, seções, listas e redação normativa. Retorne apenas texto puro.';

  if (cfg.chatProvider === 'anthropic' && cfg.chatApiKey) {
    try {
      const anthropic = createNativeChatClient();
      const anthropicModel = cfg.fastChatModel || cfg.chatModel;
      const response = await withRetry429(
        () => anthropic.messages.create({
          model: anthropicModel,
          temperature: 0,
          max_tokens: Math.max(4096, getAnthropicMaxTokens(anthropicModel)),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64Pdf,
                  },
                  title: fileName,
                },
                {
                  type: 'text',
                  text: extractionPrompt,
                },
              ],
            },
          ],
        }),
        { label: 'pdf_extraction_anthropic' }
      );

      const anthropicText = extractTextFromAnthropicMessage(response);
      if (anthropicText.trim().length > 0) {
        console.log(`[PDF][CLAUDE_FALLBACK] Texto extraído via Anthropic: ${anthropicText.length} chars`);
        return anthropicText.trim();
      }
    } catch (fallbackErr) {
      console.warn('[PDF][CLAUDE_FALLBACK] Erro no fallback:', fallbackErr?.message || fallbackErr);
    }
  }

  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_PDF_MODEL || process.env.GEMINI_DIRECT_MODEL || 'gemini-2.5-flash';

    if (!geminiKey) {
      return '';
    }

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: extractionPrompt },
                { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }
              ]
            }
          ],
          generationConfig: { temperature: 0 }
        })
      }
    );

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text();
      console.warn('[PDF][GEMINI_FALLBACK] Falha na API Gemini:', errBody?.slice(0, 300));
      return '';
    }

    const geminiData = await geminiResp.json();
    const parts = geminiData?.candidates?.[0]?.content?.parts || [];
    const geminiText = parts.map((part) => part?.text || '').join('\n').trim();

    if (geminiText.length > 0) {
      console.log(`[PDF][GEMINI_FALLBACK] Texto extraído via Gemini: ${geminiText.length} chars`);
      return geminiText;
    }
  } catch (fallbackErr) {
    console.warn('[PDF][GEMINI_FALLBACK] Erro no fallback:', fallbackErr?.message || fallbackErr);
  }

  return '';
}

// 1️⃣ Extrair e Limpar PDF (CORRIGIDO COM LIMPEZA DE BUFFER AVANÇADA)
async function extractPdfText(filePath) {
  const fileBuffer = await fs.promises.readFile(filePath);
  let text = '';

  try {
    // ✅ LIMPEZA DE BUFFER: Forçamos pdf-parse ser resiliente
    const data = await pdfParse(fileBuffer, {
      // Esta função de pagerender tenta ignorar erros de cada página
      pagerender: function(pageData) {
        return pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false
        }).then(function(textContent) {
          const lines = [];
          let currentLine = [];
          let currentY = null;

          for (const item of textContent.items || []) {
            const value = String(item?.str || '').trim();
            if (!value) {
              continue;
            }

            const y = Number(item?.transform?.[5] || 0);
            if (currentY !== null && Math.abs(y - currentY) > 2 && currentLine.length > 0) {
              lines.push(currentLine.join(' '));
              currentLine = [];
            }

            currentY = y;
            currentLine.push(value);
          }

          if (currentLine.length > 0) {
            lines.push(currentLine.join(' '));
          }

          return lines.join('\n');
        });
      }
    });

    text = data.text || '';

    // 📊 LOG DE DEBUG ESSENCIAL - Validar leitura completa
    console.log(`[DEBUG PDF] Arquivo: ${path.basename(filePath)}`);
    console.log(`[DEBUG PDF] Páginas lidas: ${data.numpages}`);
    console.log(`[DEBUG PDF] Caracteres totais ANTES da limpeza: ${text.length}`);
    
    // ⚠️ Verificação de segurança - Detectar cortes de extração
    if (text.length < 90000 && data.numpages > 25) {
      console.warn(`⚠️ ALERTA CRÍTICO: A extração parece ter sido cortada pela metade!`);
      console.warn(`   Esperado: ~150k+ caracteres | Obtido: ${text.length} caracteres`);
      console.warn(`   Solução: Abra o PDF no navegador, clique em Imprimir > Salvar como PDF e tente novamente`);
    }

    // 🧹 LIMPEZA DE DADOS (Sanitization) - CONFIGURAÇÃO NUCLEAR

    // 0. Remover caracteres nulos (invalid byte sequence for encoding "UTF8": 0x00)
    text = text.replace(/\0/g, '');

    // 1. Remover marcadores (Esta é a linha que estava quebrada)
    text = text.replace(/\[source\]/gi, ''); 

    // 2. Remover marcadores escapados tipo \[source\] se existirem
    const escapedSource = new RegExp('\\\\\\[source\\\\\\]', 'gi');
    text = text.replace(escapedSource, '');

    // 3. Remover marcadores de rodapé/página
    text = text.replace(/--- PAGE \d+ ---/gi, '');
    text = text.replace(/\n\s*\d+\s*\n/g, '\n'); // Números de página isolados

    // 4. Unir linhas quebradas (CRÍTICO para "cálculo de\nvolume")
    text = text.replace(/([a-z,;0-9])\s*\n\s*(?=[a-z0-9])/gi, '$1 ');

    // 5. Normalizar espaços múltiplos
    text = text.replace(/[ \t]+/g, ' '); 
    text = text.replace(/\n\s*\n/g, '\n\n'); // Preserva parágrafos
    text = normalizeStructuredText(text);

    console.log('--- TESTE DE EXTRAÇÃO E LIMPEZA AVANÇADA ---');
    console.log(`Documento: ${path.basename(filePath)}`);
    console.log(`Caracteres extraídos DEPOIS da limpeza: ${text.length}`);
    if (text.length > 0) {
      console.log(`Primeiras 200 letras limpas:\n"${text.substring(0, 200)}..."`);
    } else {
      console.warn('⚠️ AVISO: NENHUM TEXTO EXTRAÍDO DO PDF!');
    }
    console.log('-------------------------');

    // ✅ Se o número de caracteres é muito pequeno comparado às páginas, algo errou
    if (data.numpages > 5 && text.length < 10000) {
      console.warn(`⚠️ AVISO: PDF com ${data.numpages} páginas mas apenas ${text.length} caracteres. Possível problema de leitura.`);
    }

    if (text.length < 300) {
      const aiFallbackText = await extractPdfTextViaAiFallback(fileBuffer, filePath);
      if (aiFallbackText.length > text.length) {
        text = aiFallbackText;
      }
    }

    return text;
  } catch (e) {
    console.error('[PDF] Erro ao extrair:', e.message);

    const aiFallbackText = await extractPdfTextViaAiFallback(fileBuffer, filePath);
    if (aiFallbackText.trim().length > 0) {
      return aiFallbackText;
    }

    return '';
  }
}

function isImageFile(fileName = '') {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(fileName);
}

function isDocxFile(fileName = '') {
  return /\.docx$/i.test(fileName);
}

function isTextFile(fileName = '') {
  return /\.(txt|md|csv|json|xml|html|htm)$/i.test(fileName);
}

async function extractImageText(filePath, fileName = '', logContext = {}) {
  try {
    const cfg = getAiRuntimeConfig();
    const imageBuffer = await fs.promises.readFile(filePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(fileName || filePath).replace('.', '').toLowerCase() || 'png';
    const ocrInstruction = 'Extraia todo o texto visivel desta imagem em portugues e, ao final, forneca um resumo curto do conteudo principal. Retorne apenas texto puro.';

    let content = '';
    let promptTokens = estimateTokens(ocrInstruction);
    let completionTokens = 0;

    if (cfg.chatProvider === 'anthropic') {
      const anthropic = createNativeChatClient();
      const response = await withRetry429(
        () => anthropic.messages.create({
          model: cfg.fastChatModel,
          temperature: 0,
          max_tokens: Math.max(512, getAnthropicMaxTokens(cfg.fastChatModel)),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: ocrInstruction },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: getImageMediaType(ext),
                    data: base64,
                  },
                },
              ],
            },
          ],
        }),
        { label: 'image_ocr' }
      );

      content = extractTextFromAnthropicMessage(response);
      promptTokens = Number(response?.usage?.input_tokens || promptTokens);
      completionTokens = Number(response?.usage?.output_tokens || estimateTokens(content));
    } else {
      const openai = createAiClient();
      const response = await withRetry429(
        () => openai.chat.completions.create({
          model: cfg.fastChatModel,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: ocrInstruction
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/${ext};base64,${base64}`
                  }
                }
              ]
            }
          ]
        }),
        { label: 'image_ocr' }
      );

      content = (response.choices?.[0]?.message?.content || '').trim();
      promptTokens = Number(response?.usage?.prompt_tokens || promptTokens);
      completionTokens = Number(response?.usage?.completion_tokens || estimateTokens(content));
    }

    logAiUsageSafe({
      userId: logContext.userId,
      conversationId: logContext.conversationId,
      requestType: 'image_ocr',
      model: cfg.fastChatModel,
      status: 'success',
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: estimateCompletionCostUsd(promptTokens, completionTokens),
    });

    return content;
  } catch (e) {
    console.error('[IMAGE OCR] Erro ao extrair texto da imagem:', e.message);
    logAiUsageSafe({
      userId: logContext.userId,
      conversationId: logContext.conversationId,
      requestType: 'image_ocr',
      model: getAiRuntimeConfig().fastChatModel,
      status: 'error',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      errorMessage: e?.message || 'Falha ao extrair texto de imagem',
    });
    return '';
  }
}

async function extractAttachmentText(fullPath, originalname = '') {
  const lowerName = String(originalname || '').toLowerCase();

  if (lowerName.endsWith('.pdf')) {
    return await extractPdfText(fullPath);
  }

  if (isDocxFile(lowerName)) {
    try {
      const result = await mammoth.extractRawText({ path: fullPath });
      return (result.value || '').trim();
    } catch (e) {
      console.error('[DOCX] Erro ao extrair texto:', e.message);
      return '';
    }
  }

  if (isImageFile(lowerName)) {
    return await extractImageText(fullPath, lowerName);
  }

  if (isTextFile(lowerName)) {
    return await fs.promises.readFile(fullPath, 'utf-8');
  }

  return '';
}

function slugifyFilePart(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function decodeHtmlEntities(value = '') {
  return sharedDecodeHtmlEntities(value);
}

function extractPrimaryHtmlContent(html = '') {
  return sharedExtractPrimaryHtmlContent(html);
}

function htmlToPlainText(html = '') {
  return sharedHtmlToPlainText(html);
}

async function fetchLinkKnowledgeSource(rawUrl) {
  return sharedFetchLinkKnowledgeSource(rawUrl);
}

async function askGeminiDirectlyFromPdf(fullPath, fileName, question, agentInstructions = '', logContext = {}) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return '';

    const model = process.env.GEMINI_DIRECT_MODEL || process.env.GEMINI_PDF_MODEL || 'gemini-2.5-flash';
    const pdfBuffer = await fs.promises.readFile(fullPath);
    const maxBytes = 18 * 1024 * 1024;
    if (pdfBuffer.length > maxBytes) {
      console.warn('[PDF][DIRECT] Arquivo grande demais para leitura direta inline.');
      return '';
    }

    const base64Pdf = pdfBuffer.toString('base64');
    const prompt = `Você vai analisar um PDF anexado diretamente pelo usuário.
${agentInstructions ? `Instruções do agente: ${agentInstructions}\n` : ''}
Pergunta do usuário: ${question || 'Resuma o documento anexado.'}

Responda de forma objetiva em português. Se possível, traga resumo e pontos principais.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }
              ]
            }
          ],
          generationConfig: { temperature: 0.2 }
        })
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      console.warn('[PDF][DIRECT] Falha Gemini direct:', err?.slice(0, 300));
      return '';
    }

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const answer = parts.map(p => p?.text || '').join('\n').trim();
    const promptTokens = estimateTokens(`${agentInstructions || ''}\n${question || ''}`);
    const completionTokens = estimateTokens(answer);
    logAiUsageSafe({
      userId: logContext.userId,
      conversationId: logContext.conversationId,
      requestType: 'pdf_direct_analysis',
      model,
      status: 'success',
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: estimateCompletionCostUsd(promptTokens, completionTokens),
    });
    return answer;
  } catch (e) {
    console.warn('[PDF][DIRECT] Erro leitura direta:', e?.message || e);
    logAiUsageSafe({
      userId: logContext.userId,
      conversationId: logContext.conversationId,
      requestType: 'pdf_direct_analysis',
      model: process.env.GEMINI_DIRECT_MODEL || process.env.GEMINI_PDF_MODEL || 'gemini-2.5-flash',
      status: 'error',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      errorMessage: e?.message || 'Falha na leitura direta de PDF',
    });
    return '';
  }
}

function normalizeStructuredText(value = '') {
  const lines = [];
  for (const rawLine of String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const line = rawLine.replace(/[ \t]+/g, ' ').trim();
    if (line) {
      lines.push(line);
    } else if (lines.length > 0 && lines[lines.length - 1] !== '') {
      lines.push('');
    }
  }
  return lines.join('\n').trim();
}

function joinStructuredLines(lines = []) {
  const cleaned = [];
  for (const line of lines) {
    if (line) {
      cleaned.push(line);
    } else if (cleaned.length > 0 && cleaned[cleaned.length - 1] !== '') {
      cleaned.push('');
    }
  }
  return cleaned.join('\n').trim();
}

function buildChunkOverlapLines(lines = [], overlap = 0) {
  if (!Array.isArray(lines) || lines.length === 0 || overlap <= 0) {
    return [];
  }

  const overlapLines = [];
  let total = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    overlapLines.unshift(line);
    total += String(line || '').length + 1;
    if (total >= overlap) {
      break;
    }
  }

  while (overlapLines.length > 0 && overlapLines[0] === '') {
    overlapLines.shift();
  }

  return overlapLines;
}

function chunkLongLine(line = '', size = 1800, overlap = 250) {
  const cleanLine = String(line || '').trim();
  if (!cleanLine) {
    return [];
  }

  if (cleanLine.length <= size) {
    return [cleanLine];
  }

  const chunks = [];
  let start = 0;
  while (start < cleanLine.length) {
    let end = start + size;

    if (end < cleanLine.length) {
      const lastPeriod = cleanLine.lastIndexOf('.', end);
      const lastSpace = cleanLine.lastIndexOf(' ', end);

      if (lastPeriod > start + (size * 0.8)) {
        end = lastPeriod + 1;
      } else if (lastSpace > start + (size * 0.5)) {
        end = lastSpace;
      }
    }

    const chunk = cleanLine.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start >= end) {
      start = end;
    }
  }

  return chunks;
}

// 2️⃣ Chunking Inteligente - CONFIGURAÇÃO NUCLEAR (4000/1000)
function chunkText(text, size = 1800, overlap = 250) {
  if (!text || text.trim().length === 0) {
    console.warn('[CHUNK] Texto vazio, nenhum chunk criado.');
    return [];
  }

  const cleanText = normalizeStructuredText(text);
  if (!cleanText) {
    console.warn('[CHUNK] Texto sem conteudo apos normalizacao, nenhum chunk criado.');
    return [];
  }

  const lines = cleanText.split('\n');
  if (lines.length === 1) {
    const singleLineChunks = chunkLongLine(lines[0], size, overlap);
    console.log(`[CHUNK] Gerados ${singleLineChunks.length} chunks de aprox ${size} chars.`);
    return singleLineChunks;
  }

  const chunks = [];
  let currentLines = [];
  let currentLength = 0;

  const flush = () => {
    const chunk = joinStructuredLines(currentLines);
    if (chunk) {
      chunks.push(chunk);
    }
    currentLines = buildChunkOverlapLines(currentLines, overlap);
    currentLength = joinStructuredLines(currentLines).length;
  };

  for (const rawLine of lines) {
    const line = String(rawLine || '').trimEnd();

    if (!line.trim()) {
      if (currentLines.length > 0 && currentLines[currentLines.length - 1] !== '') {
        currentLines.push('');
      }
      continue;
    }

    if (line.length > size) {
      if (currentLines.length > 0) {
        flush();
      }

      for (const piece of chunkLongLine(line, size, overlap)) {
        if (currentLines.length > 0 && currentLength + piece.length + 1 > size) {
          flush();
        }
        currentLines.push(piece);
        currentLength = joinStructuredLines(currentLines).length;
      }
      continue;
    }

    const projectedLength = currentLength + (currentLines.length > 0 ? 1 : 0) + line.length;
    if (currentLines.length > 0 && projectedLength > size) {
      flush();
    }

    currentLines.push(line);
    currentLength = joinStructuredLines(currentLines).length;
  }

  const finalChunk = joinStructuredLines(currentLines);
  if (finalChunk) {
    chunks.push(finalChunk);
  }

  console.log(`[CHUNK] Gerados ${chunks.length} chunks de aprox ${size} chars.`);
  return chunks;
}

// 2.5️⃣ Contextual Retrieval (Anthropic) — adiciona ao chunk uma janela de contexto
//        do documento inteiro usando prompt cache. Reduz embeddings genéricos em ~35%.
const CONTEXTUAL_RETRIEVAL_MAX_DOC_CHARS = 180000;
const CONTEXTUAL_RETRIEVAL_CONCURRENCY = 4;

function isContextualRetrievalEnabled() {
  if (String(process.env.CONTEXTUAL_RETRIEVAL_ENABLED || '').toLowerCase() === 'false') {
    return false;
  }

  return Boolean(getAuxiliaryTextRuntimeConfig({
    requestedModel: process.env.CONTEXTUAL_RETRIEVAL_MODEL,
  }).enabled);
}

let _auxiliaryClientCache = new Map();
function getAuxiliaryTextClient(runtime) {
  if (!runtime?.enabled || !runtime?.model) {
    return null;
  }

  const cacheKey = JSON.stringify({
    provider: runtime.provider,
    baseURL: runtime.baseURL || '',
    model: runtime.model,
    hasKey: Boolean(runtime.apiKey),
  });

  if (_auxiliaryClientCache.has(cacheKey)) {
    return _auxiliaryClientCache.get(cacheKey);
  }

  try {
    const client = createAuxiliaryTextClient(runtime);
    _auxiliaryClientCache.set(cacheKey, client);
    return client;
  } catch (error) {
    console.warn('[AUX_LLM] Falha ao inicializar cliente auxiliar:', error?.message || error);
    _auxiliaryClientCache.set(cacheKey, null);
    return null;
  }
}

async function buildDocumentContextSummary(runtime, client, documentText, title = '') {
  if (!client || runtime?.provider === 'anthropic') {
    return documentText;
  }

  const response = await withRetry429(
    () => client.chat.completions.create({
      model: runtime.model,
      temperature: 0,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: 'Voce resume documentos juridicos/previdenciarios em portugues para apoiar busca semantica. Nao invente fatos. Entregue um resumo objetivo com topicos, secoes, assuntos centrais, entidades, datas e referencias normativas relevantes.'
        },
        {
          role: 'user',
          content: `Titulo: ${title || 'documento'}\n\nDocumento:\n${documentText}\n\nGere um resumo enxuto, mas rico em termos tecnicos, para apoiar a contextualizacao de trechos.`
        }
      ]
    }),
    { label: 'contextual_document_summary' }
  );

  return String(response?.choices?.[0]?.message?.content || '').trim() || documentText;
}

async function contextualizeSingleChunk(runtime, client, { documentText, documentSummary, chunkText: chunk, title, position }) {
  const systemPrompt = 'Voce adiciona contexto curto a trechos de documentos juridicos/previdenciarios para melhorar busca. Nunca inventa fatos. Responde em portugues, em 1-2 frases, direto ao ponto, sem rotulos como "Resposta:" ou "Contexto:".';

  const userText = `Trecho a contextualizar (posicao ${position}):\n<trecho>\n${chunk}\n</trecho>\n\n`
    + 'Em 1-2 frases situe este trecho dentro do documento: secao/topico principal e o assunto central que ele trata. '
    + 'Use vocabulario que aparece no documento. Sem introducao, sem rotulos, apenas o resumo.';

  if (runtime.provider === 'anthropic') {
    const systemBlocks = [
      {
        type: 'text',
        text: systemPrompt,
      },
      {
        type: 'text',
        text: `<documento titulo="${String(title || 'documento').replace(/"/g, '\'')}">\n${documentText}\n</documento>`,
        cache_control: { type: 'ephemeral' }
      }
    ];

    const response = await withRetry429(
      () => client.messages.create({
        model: runtime.model,
        max_tokens: 180,
        temperature: 0,
        system: systemBlocks,
        messages: [{ role: 'user', content: userText }],
      }),
      { label: 'contextual_chunk_anthropic' }
    );

    const blocks = Array.isArray(response?.content) ? response.content : [];
    return blocks.map((b) => (typeof b?.text === 'string' ? b.text : '')).join(' ').trim();
  }

  const response = await withRetry429(
    () => client.chat.completions.create({
      model: runtime.model,
      temperature: 0,
      max_tokens: 180,
      messages: [
        {
          role: 'system',
          content: `${systemPrompt}\n\nResumo global do documento:\n${documentSummary}`
        },
        {
          role: 'user',
          content: `Titulo do documento: ${title || 'documento'}\n\n${userText}`
        }
      ]
    }),
    { label: 'contextual_chunk_openai_compatible' }
  );

  return String(response?.choices?.[0]?.message?.content || '').trim();
}

async function contextualizeChunks(fullText, chunks, { title = '' } = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return chunks || [];
  }
  if (!isContextualRetrievalEnabled()) {
    return chunks;
  }
  const runtime = getAuxiliaryTextRuntimeConfig({
    requestedModel: process.env.CONTEXTUAL_RETRIEVAL_MODEL,
  });
  const client = getAuxiliaryTextClient(runtime);
  if (!client) {
    return chunks;
  }

  const truncatedDoc = String(fullText || '').slice(0, CONTEXTUAL_RETRIEVAL_MAX_DOC_CHARS);
  if (!truncatedDoc) {
    return chunks;
  }

  const startedAt = Date.now();
  const documentSummary = await buildDocumentContextSummary(runtime, client, truncatedDoc, title);
  console.log(`[CONTEXTUAL] Contextualizando ${chunks.length} chunks de "${title || 'documento'}" via ${runtime.model} (${runtime.provider})...`);

  const results = new Array(chunks.length);
  let cursor = 0;
  let failures = 0;

  const worker = async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= chunks.length) {
        return;
      }
      try {
        const ctx = await contextualizeSingleChunk(runtime, client, {
          documentText: truncatedDoc,
          documentSummary,
          chunkText: chunks[i],
          title,
          position: i,
        });
        results[i] = ctx ? `${ctx}\n\n${chunks[i]}` : chunks[i];
      } catch (error) {
        failures += 1;
        if (failures <= 3) {
          console.warn(`[CONTEXTUAL] Falha no chunk ${i}: ${error?.message || error}`);
        }
        results[i] = chunks[i];
      }
    }
  };

  const pool = Math.min(CONTEXTUAL_RETRIEVAL_CONCURRENCY, chunks.length);
  await Promise.all(Array.from({ length: pool }, () => worker()));

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const enriched = results.filter((c, i) => c && c !== chunks[i]).length;
  console.log(`[CONTEXTUAL] Concluido em ${elapsed}s — enriquecidos=${enriched}/${chunks.length} falhas=${failures}.`);

  return results;
}

async function prepareChunksForIndexing(text, { title = '' } = {}) {
  const baseChunks = chunkText(text);
  if (baseChunks.length === 0) {
    return baseChunks;
  }
  try {
    return await contextualizeChunks(text, baseChunks, { title });
  } catch (error) {
    console.warn('[CONTEXTUAL] Erro inesperado, mantendo chunks originais:', error?.message || error);
    return baseChunks;
  }
}

// 2.6️⃣ HyDE — gera um paragrafo hipotetico que serve como query adicional para busca
function isHydeEnabled() {
  if (String(process.env.HYDE_ENABLED || '').toLowerCase() === 'false') {
    return false;
  }

  return Boolean(getAuxiliaryTextRuntimeConfig({
    requestedModel: process.env.HYDE_MODEL,
  }).enabled);
}

async function generateHypotheticalAnswer(question) {
  const text = String(question || '').trim();
  if (!text || !isHydeEnabled()) {
    return '';
  }
  const runtime = getAuxiliaryTextRuntimeConfig({
    requestedModel: process.env.HYDE_MODEL,
  });
  const client = getAuxiliaryTextClient(runtime);
  if (!client) {
    return '';
  }

  try {
    if (runtime.provider === 'anthropic') {
      const response = await withRetry429(
        () => client.messages.create({
          model: runtime.model,
          max_tokens: 260,
          temperature: 0,
          system: 'Voce escreve um paragrafo hipotetico em portugues, com tom de documento juridico/normativo brasileiro, que poderia ser a resposta a pergunta. Use linguagem formal, vocabulario tecnico previdenciario/juridico quando aplicavel. Apenas o paragrafo, sem introducao nem rotulos.',
          messages: [{ role: 'user', content: `Pergunta: ${text}\n\nParagrafo hipotetico:` }],
        }),
        { label: 'hyde_anthropic' }
      );
      const blocks = Array.isArray(response?.content) ? response.content : [];
      return blocks.map((b) => (typeof b?.text === 'string' ? b.text : '')).join(' ').trim();
    }

    const response = await withRetry429(
      () => client.chat.completions.create({
        model: runtime.model,
        temperature: 0,
        max_tokens: 260,
        messages: [
          {
            role: 'system',
            content: 'Voce escreve um paragrafo hipotetico em portugues, com tom de documento juridico/normativo brasileiro, que poderia ser a resposta a pergunta. Use linguagem formal, vocabulario tecnico previdenciario/juridico quando aplicavel. Apenas o paragrafo, sem introducao nem rotulos.'
          },
          {
            role: 'user',
            content: `Pergunta: ${text}\n\nParagrafo hipotetico:`
          }
        ]
      }),
      { label: 'hyde_openai_compatible' }
    );

    return String(response?.choices?.[0]?.message?.content || '').trim();
  } catch (error) {
    console.warn('[HYDE] Falha ao gerar paragrafo hipotetico:', error?.message || error);
    return '';
  }
}

// 3️⃣ Gerar embeddings (OpenAI/Gemini)
async function generateQueryEmbedding(input, logContext = {}) {
  const cfg = getAiRuntimeConfig();
  const embeddingClient = createEmbeddingClient();
  if (!embeddingClient) {
    console.warn('[EMB] Nenhum provedor de embeddings configurado para consulta.');
    return null;
  }

  const normalizedInput = String(input || '').trim();
  if (!normalizedInput) {
    return null;
  }

  const response = await withRetry429(
    () => embeddingClient.embeddings.create({
      model: cfg.embeddingModel,
      input: normalizedInput,
    }),
    { label: logContext.label || 'embedding_query' }
  );

  const embeddingTokens = estimateTokens(normalizedInput);
  logAiUsageSafe({
    userId: logContext.userId,
    conversationId: logContext.conversationId,
    requestType: logContext.requestType || 'embedding_query',
    model: cfg.embeddingModel,
    status: 'success',
    promptTokens: embeddingTokens,
    completionTokens: 0,
    totalTokens: embeddingTokens,
    costUsd: estimateEmbeddingCostUsd(embeddingTokens),
  });

  return response?.data?.[0]?.embedding || null;
}

async function generateEmbeddings(chunks, logContext = {}) {
  const cfg = getAiRuntimeConfig();
  const embeddingClient = createEmbeddingClient();
  if (!embeddingClient) {
    throw new Error('Nenhum provedor de embeddings compatível configurado para indexação.');
  }

  const embeddings = [];
  console.log(`[EMB] Gerando embeddings para ${chunks.length} chunks...`);

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await withRetry429(
        () => embeddingClient.embeddings.create({
          model: cfg.embeddingModel,
          input: chunks[i]
        }),
        { label: `embedding_chunk_${i}` }
      );
      embeddings.push(res.data[0].embedding);
      if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
        console.log(`[EMB] Progresso: ${i + 1}/${chunks.length}`);
      }
    } catch (e) {
      console.error(`[EMB] Erro no chunk ${i}:`, e.message);
      embeddings.push(Array(3072).fill(0));
    }
  }

  const totalTokens = chunks.reduce((sum, chunk) => sum + estimateTokens(chunk), 0);
  logAiUsageSafe({
    userId: logContext.userId,
    conversationId: logContext.conversationId,
    requestType: logContext.requestType || 'embedding_generation',
    model: cfg.embeddingModel,
    status: 'success',
    promptTokens: totalTokens,
    completionTokens: 0,
    totalTokens,
    costUsd: estimateEmbeddingCostUsd(totalTokens),
  });

  return embeddings;
}

async function insertDocumentChunksWithOptionalEmbeddings(agentId, documentId, chunks = [], logContext = {}, dbClient = pool) {
  if (!agentId || !documentId || !Array.isArray(chunks) || chunks.length === 0) {
    return 0;
  }

  let embeddings = null;
  try {
    embeddings = await generateEmbeddings(chunks, logContext);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!message.includes('Nenhum provedor de embeddings compatível configurado para indexação.')) {
      throw error;
    }

    console.warn('[EMB] Nenhum provedor configurado; salvando chunks sem embedding vetorial.');
  }

  const batchSize = embeddings ? 10 : 50;

  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const values = [];
    const params = [];

    for (let offset = 0; offset < batch.length; offset += 1) {
      const chunkIndex = start + offset;
      const embedding = Array.isArray(embeddings?.[chunkIndex]) ? '[' + embeddings[chunkIndex].join(',') + ']' : null;
      const paramIndex = params.length + 1;

      if (embedding) {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}::vector, $${paramIndex + 4})`);
        params.push(agentId, documentId, batch[offset], embedding, chunkIndex);
        continue;
      }

      values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, NULL, $${paramIndex + 3})`);
      params.push(agentId, documentId, batch[offset], chunkIndex);
    }

    await dbClient.query(
      `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
       VALUES ${values.join(', ')}`,
      params
    );
  }

  return chunks.length;
}

// 4️⃣ Busca semântica com pgvector - CONFIGURAÇÃO OTIMIZADA (Limit 12, Sim >= 0.40)
function computeChunkLexicalScore(content = '', queryText = '') {
  const normalizedContent = normalizeRetrievalText(content);
  const tokens = buildRetrievalKeywords(queryText, { limit: 32 });
  if (!normalizedContent || tokens.length === 0) {
    return 0;
  }

  const contentTokens = ENABLE_RAG_TYPO_TOLERANCE
    ? extractRetrievalTokens(content, { minLength: 3, limit: 180 })
    : [];

  let score = 0;
  for (const token of tokens) {
    const exactMatch = normalizedContent.includes(token);
    if (exactMatch) {
      score += Math.min(token.length, 12);
      continue;
    }

    if (hasApproximateTokenMatch(token, contentTokens)) {
      score += Math.min(token.length, 12) * 0.65;
    }
  }

  const quotedPhrases = Array.from(String(queryText || '').matchAll(/"([^"]{4,})"/g))
    .map((match) => normalizeRetrievalText(match[1]));
  for (const phrase of quotedPhrases) {
    if (phrase && normalizedContent.includes(phrase)) {
      score += 20;
    }
  }

  return score;
}

function computeChunkLegalScore(content = '', queryText = '') {
  const normalizedContent = normalizeRetrievalText(content);
  const legalSignals = extractLegalReferenceSignals(queryText);
  const hasLegalSignals = legalSignals.articleNumbers.length > 0
    || legalSignals.lawReferences.length > 0
    || legalSignals.statuteAliases.length > 0
    || legalSignals.requiresParagraphUnique;

  if (!normalizedContent || !hasLegalSignals) {
    return 0;
  }

  let score = 0;
  const contentDigits = normalizeLawNumber(content);
  const isLeadMetadataChunk = normalizedContent.startsWith('fonte:') || normalizedContent.startsWith('fonte ');
  let matchedPrimaryReference = false;

  for (const articleNumber of legalSignals.articleNumbers) {
    const articlePattern = new RegExp(`art(?:igo)?\\s*[.ºo-]*\\s*${escapeRegExp(articleNumber)}(?:\\D|$)`, 'i');
    if (articlePattern.test(normalizedContent)) {
      score += 18;
    }
  }

  if (legalSignals.requiresParagraphUnique && normalizedContent.includes('paragrafo unico')) {
    score += 12;
  }

  for (const alias of legalSignals.statuteAliases) {
    if (normalizedContent.includes(alias)) {
      score += 22;
      matchedPrimaryReference = true;
    }
  }

  for (const reference of legalSignals.lawReferences) {
    const hasKind = reference.kind && normalizedContent.includes(reference.kind);
    const hasNumber = reference.number && contentDigits.includes(reference.number);
    if (hasKind && hasNumber) {
      score += 24;
      matchedPrimaryReference = true;
      continue;
    }

    if (hasNumber) {
      score += 12;
      matchedPrimaryReference = true;
    }
  }

  if (matchedPrimaryReference && isLeadMetadataChunk) {
    score += 18;
  }

  return score;
}

function computeChunkDefinitionScore(content = '', queryText = '') {
  const normalizedContent = normalizeRetrievalText(content);
  const normalizedQuery = normalizeRetrievalText(queryText);
  if (!normalizedContent || !/\b(conceito|define|definicao)\b/.test(normalizedQuery)) {
    return 0;
  }

  const subjectTokens = extractRetrievalTokens(queryText, { limit: 16 })
    .filter((token) => !RETRIEVAL_QUERY_META_TOKENS.has(token));

  let score = 0;
  for (const token of subjectTokens) {
    if (normalizedContent.includes(`considera-se ${token}`) || normalizedContent.includes(`considera se ${token}`)) {
      score += 24;
    }

    if (normalizedContent.includes(`${token} e `) || normalizedContent.includes(`${token} é `)) {
      score += 18;
    }
  }

  return score;
}

function computeChunkTermCoverageScore(content = '', queryText = '') {
  const normalizedContent = normalizeRetrievalText(content);
  const queryTokens = buildRetrievalKeywords(queryText, { limit: 28 }).slice(0, 20);
  if (!normalizedContent || queryTokens.length === 0) {
    return 0;
  }

  const contentTokens = ENABLE_RAG_TYPO_TOLERANCE
    ? extractRetrievalTokens(content, { minLength: 3, limit: 180 })
    : [];
  const matches = queryTokens.filter((token) => (
    contentHasRetrievalToken(normalizedContent, contentTokens, token)
  ));
  const coverageRatio = matches.length / Math.max(queryTokens.length, 1);

  let score = coverageRatio * 38;
  if (matches.length >= Math.min(4, queryTokens.length)) {
    score += 8;
  }

  return score;
}

function getRetrievedRowKey(row = {}) {
  return `${row?.documentId || 'sem-doc'}:${row?.chunkIndex}:${String(row?.content || '').slice(0, 80)}`;
}

function dedupeRetrievedRows(rows = []) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const key = getRetrievedRowKey(row);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function rerankRetrievedRows(rows = [], queryText = '', limit = DEFAULT_RAG_RETURN_LIMIT) {
  return dedupeRetrievedRows(rows)
    .map((row) => {
      const similarity = Number(row?.similarity || 0);
      const lexicalScore = computeChunkLexicalScore(row?.content || '', queryText);
      const legalScore = computeChunkLegalScore(row?.content || '', queryText);
      const definitionScore = computeChunkDefinitionScore(row?.content || '', queryText);
      const termCoverageScore = computeChunkTermCoverageScore(row?.content || '', queryText);
      const finalScore = (similarity * 120) + lexicalScore + (legalScore * 1.15) + definitionScore + termCoverageScore + (row?.injected ? 8 : 0);
      return {
        ...row,
        lexicalScore,
        legalScore,
        definitionScore,
        termCoverageScore,
        finalScore,
      };
    })
    .filter((row) => (
      row.similarity >= DEFAULT_RAG_MIN_SIMILARITY
      || row.lexicalScore > 0
      || row.legalScore > 0
      || row.definitionScore > 0
      || row.termCoverageScore > 10
    ))
    .sort((a, b) => (b.finalScore - a.finalScore) || (b.similarity - a.similarity) || (a.chunkIndex - b.chunkIndex))
    .slice(0, Math.max(1, limit));
}

function rerankRetrievedRowsForQueries(rows = [], queryTexts = [], limit = DEFAULT_RAG_RETURN_LIMIT) {
  const variants = Array.from(new Set(
    (Array.isArray(queryTexts) ? queryTexts : [queryTexts])
      .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  ));

  if (variants.length === 0) {
    return rerankRetrievedRows(rows, '', limit);
  }

  const bestByKey = new Map();
  const perQueryLimit = Math.max(limit * 5, DEFAULT_RAG_CANDIDATE_LIMIT);
  for (const queryText of variants) {
    const rankedRows = rerankRetrievedRows(rows, queryText, perQueryLimit);
    for (const row of rankedRows) {
      const key = getRetrievedRowKey(row);
      const current = bestByKey.get(key);
      if (!current || Number(row.finalScore || 0) > Number(current.finalScore || 0)) {
        bestByKey.set(key, {
          ...row,
          matchedQuery: queryText,
        });
      }
    }
  }

  return Array.from(bestByKey.values())
    .sort((a, b) => (b.finalScore - a.finalScore) || (b.similarity - a.similarity) || (a.chunkIndex - b.chunkIndex))
    .slice(0, Math.max(1, limit));
}

function summarizeRetrievedRows(rows = [], limit = 5) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, Math.max(1, limit))
    .map((row) => ({
      title: String(row?.documentTitle || 'Documento sem título').replace(/\s+/g, ' ').trim(),
      chunkIndex: row?.chunkIndex ?? null,
      similarity: Number.isFinite(row?.similarity) ? Number(Number(row.similarity).toFixed(3)) : null,
      lexicalScore: Number(row?.lexicalScore || 0),
      legalScore: Number(row?.legalScore || 0),
      termCoverageScore: Number(row?.termCoverageScore || 0),
      preview: String(row?.content || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    }));
}

function getEffectiveContextBudgetChars(chunkCount = 0) {
  if (!RAG_EXTREME_MODE) {
    return DEFAULT_RAG_CONTEXT_MAX_CHARS;
  }

  const totalChunks = Number(chunkCount || 0);
  if (totalChunks >= 5000) {
    return Math.max(DEFAULT_RAG_CONTEXT_MAX_CHARS, 140000);
  }

  if (totalChunks >= 2000) {
    return Math.max(DEFAULT_RAG_CONTEXT_MAX_CHARS, 120000);
  }

  if (totalChunks >= 800) {
    return Math.max(DEFAULT_RAG_CONTEXT_MAX_CHARS, 100000);
  }

  return Math.max(DEFAULT_RAG_CONTEXT_MAX_CHARS, 85000);
}

function selectContextRowsByBudget(rows = [], maxChars = DEFAULT_RAG_CONTEXT_MAX_CHARS, minRows = Math.min(DEFAULT_RAG_RETURN_LIMIT, 6)) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalizedMaxChars = Math.max(4000, Number(maxChars || DEFAULT_RAG_CONTEXT_MAX_CHARS));
  const requiredRows = Math.max(1, Number(minRows || 1));
  const selectedRows = [];
  let consumedChars = 0;

  for (const row of safeRows) {
    const estimatedSize = String(row?.content || '').length + 220;
    const canFit = consumedChars + estimatedSize <= normalizedMaxChars;
    if (!canFit && selectedRows.length >= requiredRows) {
      break;
    }

    selectedRows.push(row);
    consumedChars += estimatedSize;
  }

  return selectedRows;
}

function formatRetrievedContext(rows = [], options = {}) {
  const maxChars = Number(options?.maxChars || DEFAULT_RAG_CONTEXT_MAX_CHARS);
  const minRows = Number(options?.minRows || Math.min(DEFAULT_RAG_RETURN_LIMIT, 6));
  const rowsWithinBudget = selectContextRowsByBudget(rows, maxChars, minRows);
  return rowsWithinBudget
    .map((row, index) => {
      const title = String(row?.documentTitle || 'Documento sem título').replace(/\s+/g, ' ').trim();
      const similarityTag = Number.isFinite(row?.similarity) ? ` | sim ${Number(row.similarity).toFixed(3)}` : '';
      return `[Fonte ${index + 1} | ${title} | trecho ${row?.chunkIndex ?? '?'}${similarityTag}]\n${row?.content || ''}`.trim();
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function expandRetrievedRowsWithNeighbors(allRows = [], seedRows = [], queryTexts = [], {
  neighborWindow = DEFAULT_RAG_NEIGHBOR_WINDOW,
  seedLimit = DEFAULT_RAG_DEEP_SEED_LIMIT,
  finalLimit = DEFAULT_RAG_DEEP_RETURN_LIMIT,
} = {}) {
  const safeSeedRows = Array.isArray(seedRows) ? seedRows : [];
  if (safeSeedRows.length === 0) {
    return [];
  }

  const rowsByLocation = new Map(
    (Array.isArray(allRows) ? allRows : []).map((row) => [`${row?.documentId || 'sem-doc'}:${Number(row?.chunkIndex)}`, row])
  );
  const expandedRows = [...safeSeedRows];

  for (const seed of safeSeedRows.slice(0, Math.max(1, seedLimit))) {
    const baseChunkIndex = Number(seed?.chunkIndex);
    if (!Number.isFinite(baseChunkIndex)) {
      continue;
    }

    for (let offset = -neighborWindow; offset <= neighborWindow; offset += 1) {
      if (offset === 0) {
        continue;
      }

      const neighbor = rowsByLocation.get(`${seed?.documentId || 'sem-doc'}:${baseChunkIndex + offset}`);
      if (!neighbor) {
        continue;
      }

      expandedRows.push({
        ...neighbor,
        similarity: Math.max(
          Number(neighbor?.similarity || 0),
          Number(seed?.similarity || 0),
          DEFAULT_RAG_MIN_SIMILARITY
        ),
        injected: Boolean(neighbor?.injected || seed?.injected),
      });
    }
  }

  return rerankRetrievedRowsForQueries(expandedRows, queryTexts, finalLimit);
}

async function getAgentAttachmentChunkRows(agentId, attachments = []) {
  const validAttachments = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (!agentId || validAttachments.length === 0) {
    return [];
  }

  const cacheKey = `${agentId}:${validAttachments.join('|')}`;
  if (agentAttachmentChunkCache.has(cacheKey)) {
    return agentAttachmentChunkCache.get(cacheKey) || [];
  }

  const rows = [];
  for (const attachment of validAttachments) {
    try {
      const resolved = await ensureAgentAttachmentFileAvailable(attachment);
      if (!resolved || !fs.existsSync(resolved.fullPath)) {
        continue;
      }

      const text = await extractAttachmentText(resolved.fullPath, resolved.fileName);
      if (!text || text.trim().length < 50) {
        continue;
      }

      const chunks = chunkText(text);
      chunks.forEach((content, chunkIndex) => {
        rows.push({
          documentId: resolved.filePath,
          documentTitle: resolved.fileName,
          content,
          chunkIndex,
          similarity: 0,
          injected: true,
        });
      });
    } catch (error) {
      console.warn('[SEARCH][ATTACHMENTS] Erro ao ler attachment do agente:', attachment, error?.message || error);
    }
  }

  if (agentAttachmentChunkCache.size >= 16) {
    const firstKey = agentAttachmentChunkCache.keys().next().value;
    if (firstKey) {
      agentAttachmentChunkCache.delete(firstKey);
    }
  }

  agentAttachmentChunkCache.set(cacheKey, rows);
  return rows;
}

async function searchAttachmentChunks(queryText, agentId, attachments = [], limit = DEFAULT_RAG_RETURN_LIMIT) {
  const rows = await getAgentAttachmentChunkRows(agentId, attachments);
  if (rows.length === 0) {
    console.log(`[SEARCH][ATTACHMENTS] Nenhum chunk carregado dos arquivos do agente ${agentId}.`);
    return [];
  }

  const queryTexts = buildDeepRetrievalQueries(queryText, queryText);
  const hypothetical = await generateHypotheticalAnswer(queryText);
  if (hypothetical) {
    queryTexts.push(hypothetical);
  }
  const seedRows = rerankRetrievedRowsForQueries(rows, queryTexts, Math.max(limit * 8, DEFAULT_RAG_CANDIDATE_LIMIT));
  const rankedRows = expandRetrievedRowsWithNeighbors(rows, seedRows, queryTexts, { finalLimit: limit });
  console.log(`[SEARCH][ATTACHMENTS] ${rankedRows.length} chunks relevantes (de ${rows.length} carregados) para agente ${agentId}.`);
  return rankedRows;
}

async function searchSimilarChunks(queryEmbedding, agentId, limit = DEFAULT_RAG_VECTOR_LIMIT, queryText = '') {
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return [];
  }

  try {
    return await withDatabaseFallback(
      'searchSimilarChunks',
      async () => {
        const embeddingString = '[' + queryEmbedding.join(',') + ']';

        const result = await pool.query(`
          SELECT
            dc.document_id,
            dc.content,
            dc.chunk_index,
            COALESCE(d.title, 'Documento sem título') AS document_title,
            1 - (dc.embedding <=> $2::vector) as similarity
          FROM document_chunks dc
          LEFT JOIN documents d ON d.id = dc.document_id
          WHERE dc.agent_id = $1
            AND dc.embedding IS NOT NULL
          ORDER BY dc.embedding <=> $2::vector
          LIMIT $3
        `, [agentId, embeddingString, limit]);

        console.log('--- RAG PROFUNDO ---');
        console.log(`Agente: ${agentId}`);
        console.log(`Chunks brutos: ${result.rows.length}/${limit}`);

        if (result.rows.length > 0) {
          result.rows.slice(0, 3).forEach((row, index) => {
            console.log(`Chunk ${index + 1} (Sim: ${Number(row.similarity || 0).toFixed(3)}): ${String(row.content || '').substring(0, 60)}...`);
          });
        }

        const bestSimilarity = Number(result.rows?.[0]?.similarity || 0);
        if (bestSimilarity < DEFAULT_RAG_MIN_SIMILARITY) {
          console.log(`[SEARCH] Similaridade vetorial baixa (${bestSimilarity.toFixed(3)}). Mantendo reranking lexical.`);
        }

        // Filtra chunks com similaridade >= 0.40 (remove ruído)
        const rerankLimit = Math.max(
          DEFAULT_RAG_RETURN_LIMIT,
          Math.min(Math.max(1, Number(limit || DEFAULT_RAG_RETURN_LIMIT)), DEFAULT_RAG_DEEP_RETURN_LIMIT)
        );

        const relevantRows = rerankRetrievedRows(
          result.rows.map((row) => ({
            documentId: row.document_id,
            documentTitle: row.document_title,
            content: row.content,
            chunkIndex: row.chunk_index,
            similarity: Number(row.similarity || 0),
          })),
          queryText,
          rerankLimit
        );
        console.log(`Chunks apos reranking: ${relevantRows.length}`);
        console.log('----------------------------------');

        return relevantRows;
      },
      () => searchSimilarChunksViaSupabase(queryText, agentId, limit)
    );
  } catch (e) {
    console.error('[SEARCH] Erro fatal na busca vetorial:', e.message);
    return [];
  }
}

// 4B️⃣ Busca por palavra-chave (fallback)
async function searchKeywordChunks(queryText, agentId, limit = DEFAULT_RAG_KEYWORD_LIMIT) {
  const keywords = buildRetrievalKeywords(queryText, { limit: Math.max(DEFAULT_RAG_KEYWORD_LIMIT, 18) });
  if (keywords.length === 0) {
    return [];
  }

  try {
    return await withDatabaseFallback(
      'searchKeywordChunks',
      async () => {
        const likeClauses = keywords.map((_, index) => `dc.content ILIKE $${index + 2}`);
        const result = await pool.query(`
          SELECT
            dc.document_id,
            dc.content,
            dc.chunk_index,
            COALESCE(d.title, 'Documento sem título') AS document_title
          FROM document_chunks dc
          LEFT JOIN documents d ON d.id = dc.document_id
          WHERE dc.agent_id = $1
            AND (${likeClauses.join(' OR ')})
          ORDER BY dc.chunk_index ASC
          LIMIT $${keywords.length + 2}
        `, [agentId, ...keywords.map((keyword) => `%${keyword}%`), Math.max(limit * 12, DEFAULT_RAG_CANDIDATE_LIMIT)]);

        let candidateRows = Array.isArray(result.rows) ? [...result.rows] : [];
        const lowStrictRecall = candidateRows.length < Math.max(10, Math.floor(limit * 0.75));

        if (ENABLE_RAG_TYPO_TOLERANCE && lowStrictRecall) {
          const fallbackLimit = Math.max(limit * 16, Math.min(DEFAULT_RAG_CANDIDATE_LIMIT, 4000));
          const fallbackResult = await pool.query(`
            SELECT
              dc.document_id,
              dc.content,
              dc.chunk_index,
              COALESCE(d.title, 'Documento sem título') AS document_title
            FROM document_chunks dc
            LEFT JOIN documents d ON d.id = dc.document_id
            WHERE dc.agent_id = $1
            ORDER BY dc.chunk_index ASC
            LIMIT $2
          `, [agentId, fallbackLimit]);

          candidateRows = candidateRows.concat(fallbackResult.rows || []);
          console.log(`[KEYWORD_SEARCH] Fallback typo-tolerante ativado: ${result.rows.length} strict + ${fallbackResult.rows?.length || 0} broad.`);
        }

        console.log(`[KEYWORD_SEARCH] Encontrados ${candidateRows.length} chunks candidatos para ${keywords.length} palavras-chave.`);
        return rerankRetrievedRows(
          candidateRows.map((row) => ({
            documentId: row.document_id,
            documentTitle: row.document_title,
            content: row.content,
            chunkIndex: row.chunk_index,
            similarity: 0,
          })),
          queryText,
          limit
        );
      },
      () => searchKeywordChunksViaSupabase(queryText, agentId, limit)
    );
  } catch (e) {
    console.error('[KEYWORD_SEARCH] Erro:', e.message);
    return [];
  }
}

// 4C️⃣ Busca por ordem cronológica
async function getFirstChunks(agentId, limit = 3) {
  try {
    return await withDatabaseFallback(
      'getFirstChunks',
      async () => {
        const result = await pool.query(`
          SELECT
            dc.document_id,
            dc.content,
            dc.chunk_index,
            COALESCE(d.title, 'Documento sem título') AS document_title
          FROM document_chunks dc
          LEFT JOIN documents d ON d.id = dc.document_id
          WHERE dc.agent_id = $1
          ORDER BY d.created_at ASC NULLS LAST, dc.chunk_index ASC
          LIMIT $2
        `, [agentId, limit]);

        console.log(`[ORDER_SEARCH] Recuperados os primeiros ${result.rows.length} chunks.`);
        return result.rows.map((row) => ({
          documentId: row.document_id,
          documentTitle: row.document_title,
          content: row.content,
          chunkIndex: row.chunk_index,
          similarity: 1,
        }));
      },
      () => getFirstChunksViaSupabase(agentId, limit)
    );
  } catch (e) {
    console.error('[ORDER_SEARCH] Erro:', e.message);
    return [];
  }
}

function normalizeConversationMessage(content = '') {
  return String(content || '')
    .replace(/\n\n\[Anexo enviado:[^\]]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildConversationContext(messages = [], maxMessages = 8, maxChars = 3500) {
  const recentMessages = Array.isArray(messages) ? messages.slice(-maxMessages) : [];
  const normalized = recentMessages
    .map((message) => {
      const roleLabel = message?.role === 'assistant' ? 'Assistente' : 'Usuário';
      const content = normalizeConversationMessage(message?.content || '');
      if (!content) return '';
      return `${roleLabel}: ${content}`;
    })
    .filter(Boolean);

  const joined = normalized.join('\n');
  if (joined.length <= maxChars) {
    return joined;
  }

  return joined.slice(joined.length - maxChars);
}

function buildRetrievalQuery(question = '', conversationContext = '') {
  const normalizedQuestion = String(question || '').trim();
  const normalizedConversation = String(conversationContext || '').trim();

  if (!normalizedConversation) {
    return normalizedQuestion;
  }

  return [
    `Pergunta atual: ${normalizedQuestion}`,
    'Contexto recente da conversa para manter continuidade e evitar repetição:',
    normalizedConversation,
  ].join('\n').slice(0, 5000);
}

function buildDeepRetrievalQueries(question = '', retrievalQuery = '') {
  const combinedText = [question, retrievalQuery].filter(Boolean).join('\n').trim();
  const queries = [];
  const seen = new Set();

  const pushQuery = (value = '') => {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return;
    }

    const key = normalizeRetrievalText(cleaned);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    queries.push(cleaned);
  };

  pushQuery(retrievalQuery);
  pushQuery(question);

  const keywordTokens = buildRetrievalKeywords(combinedText, { limit: 28 }).slice(0, 20);
  if (keywordTokens.length > 0) {
    pushQuery(`Pergunta foco: ${question || retrievalQuery}\nTermos-chave: ${keywordTokens.join(' ')}`);
  }

  const legalSignals = extractLegalReferenceSignals(combinedText);
  const legalHints = [
    ...legalSignals.articleNumbers.slice(0, 4).map((number) => `art ${number}`),
    ...legalSignals.lawReferences.slice(0, 4).map((reference) => `${reference.kind} ${reference.number}`),
    ...legalSignals.statuteAliases.slice(0, 4),
    ...legalSignals.keywordHints.slice(0, 8),
  ];

  if (legalHints.length > 0) {
    pushQuery(`${question || retrievalQuery}\nReferencias normativas: ${Array.from(new Set(legalHints)).join(' ')}`);
  }

  return queries.slice(0, 6);
}

function shouldTriggerProactiveDeepSearch({ userText = '', retrievalQuery = '', relevantChunks = [], legalSignals = null, chunkCount = 0 } = {}) {
  const combinedText = [userText, retrievalQuery].filter(Boolean).join('\n');
  const normalized = normalizeRetrievalText(combinedText);
  if (RAG_EXTREME_MODE) {
    const looksAnalyticalQuestion = /\b(quais|qual|quando|como|situac|hipotese|document|requisito|inciso|alinea|caput|art|decreto|lei|norma|prazo|cessa|concessao)\b/i.test(normalized);
    if (looksAnalyticalQuestion) {
      return true;
    }
  }

  const resolvedSignals = legalSignals || extractLegalReferenceSignals(combinedText);
  const hasLegalSignals = resolvedSignals.articleNumbers.length > 0
    || resolvedSignals.lawReferences.length > 0
    || resolvedSignals.statuteAliases.length > 0
    || resolvedSignals.requiresParagraphUnique;
  const hasQuotedPhrase = /"[^\"]{5,}"/.test(String(userText || ''));
  const hasDetailIntent = /\b(paragrafo|inciso|alinea|caput|prazo|requisito|hipotese|excecao|vedacao|competencia|fundamento|condicao)\b/i.test(normalized);
  const retrievedCount = Array.isArray(relevantChunks) ? relevantChunks.length : 0;
  const topChunk = retrievedCount > 0 ? relevantChunks[0] : null;
  const topSimilarity = Number(topChunk?.similarity || 0);
  const topScore = Number(topChunk?.finalScore || 0);
  const lowInitialRecall = retrievedCount < Math.max(6, Math.floor(DEFAULT_RAG_RETURN_LIMIT * 0.75));
  const weakTopMatch = topSimilarity < (DEFAULT_RAG_MIN_SIMILARITY + 0.05) && topScore < 48;
  const largeCorpus = Number(chunkCount || 0) >= 1200;

  return hasQuotedPhrase
    || hasLegalSignals
    || lowInitialRecall
    || weakTopMatch
    || (largeCorpus && hasDetailIntent);
}

async function reindexAgentAttachments(agentId, attachments = []) {
  const validAttachments = Array.from(new Set((Array.isArray(attachments) ? attachments : []).filter(Boolean)));

  // Slow work (file restore, text extraction, contextualization) happens OUTSIDE the DB transaction
  // to avoid holding Postgres locks while LLMs are running.
  const prepared = [];
  let preSkipped = 0;
  for (const attachment of validAttachments) {
    try {
      const resolved = await ensureAgentAttachmentFileAvailable(attachment);
      if (!resolved || !fs.existsSync(resolved.fullPath)) {
        preSkipped += 1;
        continue;
      }
      const text = await extractAttachmentText(resolved.fullPath, resolved.fileName);
      if (!text || text.trim().length < 50) {
        preSkipped += 1;
        continue;
      }
      const chunks = await prepareChunksForIndexing(text, { title: resolved.fileName });
      if (!chunks || chunks.length === 0) {
        preSkipped += 1;
        continue;
      }
      prepared.push({ attachment, fileName: resolved.fileName, chunks });
    } catch (error) {
      preSkipped += 1;
      console.error('[REINDEX] Erro ao preparar attachment:', attachment, error?.message || error);
    }
  }

  const summary = await withDatabaseFallback(
    'reindexAgentAttachments',
    async () => {
      let processedCount = 0;
      let skippedCount = preSkipped;
      let totalChunks = 0;

      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM documents WHERE agent_id = $1', [agentId]);

        for (const item of prepared) {
          try {
            const docResult = await client.query(
              'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
              [agentId, item.fileName]
            );
            const documentId = docResult.rows[0].id;

            await insertDocumentChunksWithOptionalEmbeddings(agentId, documentId, item.chunks, {}, client);

            processedCount += 1;
            totalChunks += item.chunks.length;
          } catch (error) {
            skippedCount += 1;
            console.error('[REINDEX] Erro ao gravar attachment:', item.attachment, error?.message || error);
          }
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      return {
        processedCount,
        skippedCount,
        totalChunks,
      };
    },
    () => reindexAgentAttachmentsViaSupabase(agentId, validAttachments)
  );

  const agentData = await getAgentForPythonSync(agentId).catch(() => null);
  const python = await syncPythonAgentAttachments({
    agentId,
    attachments: validAttachments,
    agentData,
    recreate: true,
  });

  const expectedAttachmentCount = validAttachments.length;
  const localIncomplete = expectedAttachmentCount > 0 && summary.processedCount < expectedAttachmentCount;
  const pythonIncomplete = python?.enabled && expectedAttachmentCount > 0 && python.processedCount < expectedAttachmentCount;
  if (summary.skippedCount > 0 || localIncomplete || python?.skippedCount > 0 || python?.failedCount > 0 || pythonIncomplete) {
    throw new Error(`Indexacao incompleta dos anexos. Esperados: ${expectedAttachmentCount}; local processados: ${summary.processedCount}; local ignorados: ${summary.skippedCount}; Python processados: ${python?.processedCount ?? 0}; Python ignorados: ${python?.skippedCount ?? 0}; Python falhas: ${python?.failedCount ?? 0}.`);
  }

  return { ...summary, python };
}

// ============================================
// 1️⃣ RESPONSE ORCHESTRATOR
// ============================================

function orchestrateResponse(rawResponse, questionType, hasContext = true) {
  // Se não tiver resposta alguma, devolve fallback amigável
  if (!rawResponse || rawResponse.trim().length === 0) {
    return hasContext
      ? "Nao encontrei isso no material que o agente tem agora. Se quiser, eu posso tentar outra busca."
      : "Não consegui gerar uma resposta agora. Pode reformular sua pergunta?";
  }

  let formattedResponse = rawResponse;

  // Remover IDs internos de chunk
  formattedResponse = formattedResponse.replace(/\[\s*Trecho\s*ID\s*:\s*\d+\s*\]/gi, '').trim();
  formattedResponse = formattedResponse.replace(/\s*\[(?:Fonte:[^\]]+|Fonte\s+\d+)\]/gi, '').trim();

  const responseLines = formattedResponse.replace(/\r\n/g, '\n').split('\n');
  const cleanedLines = [];
  let skipQuotedQuestion = false;

  for (const rawLine of responseLines) {
    const line = rawLine.trim();
    const normalized = normalizeRetrievalText(line);

    if (!line) {
      if (skipQuotedQuestion) {
        skipQuotedQuestion = false;
      }
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

    if (normalized === 'resposta final' || normalized === 'informacao ausente no contexto documental') {
      continue;
    }

    if (normalized.startsWith('pergunta identificada')) {
      skipQuotedQuestion = true;
      continue;
    }

    if (skipQuotedQuestion && (/^>/.test(line) || /^["'“]/.test(line))) {
      continue;
    }

    skipQuotedQuestion = false;
    cleanedLines.push(rawLine);
  }

  formattedResponse = cleanedLines.join('\n')
    .replace(/\bApos analise(?: integral)? de todos os trechos recuperados,?\s*/gi, '')
    .replace(/\bCom base(?: apenas)? nos anexos processados,?\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Remover prefixos robóticos
  const robotPrefixes = [
    /^No documento analisado,?\s*/i,
    /^De acordo com o texto,?\s*/i,
    /^Com base no contexto,?\s*/i,
    /^Conforme o documento,?\s*/i,
    /^O contexto informa,?\s*/i,
    /^Analisei o documento e encontrei,?\s*/i
  ];

  robotPrefixes.forEach(prefix => {
    formattedResponse = formattedResponse.replace(prefix, '');
  });

  if (formattedResponse.length > 0) {
    formattedResponse = formattedResponse.charAt(0).toUpperCase() + formattedResponse.slice(1);
  }

  return formattedResponse;
}

function detectQuestionType(question) {
  const factualTerms = /liste|qual é|quais são|quantos|quando|onde|nome|autor|enumere/i;
  const structuralTerms = /primeira frase|título|inicio|começo|capítulo|seção|estrutura/i;
  const explanatoryTerms = /explique|como funciona|por que|descreva|como é|diferença/i;

  if (structuralTerms.test(question)) return 'structural';
  if (explanatoryTerms.test(question)) return 'explanatory';
  if (factualTerms.test(question)) return 'factual';
  return 'general';
}

function buildOfflineAttachmentResponse(attachmentContext, question = '', fileName = 'arquivo') {
  const raw = String(attachmentContext || '')
    .replace(/^ANEXO ENVIADO PELO USUÁRIO \([^\)]*\):\n?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) {
    return 'Recebi seu anexo, mas não consegui extrair texto útil dele. Tente enviar outra versão (PDF pesquisável, DOCX ou imagem mais nítida).';
  }

  const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  const excerpt = (sentences.slice(0, 4).join(' ') || raw.slice(0, 700)).trim();
  const topicHint = question ? `Pergunta: "${question}".` : '';

  return `Recebi o anexo ${fileName} e fiz uma análise local preliminar.${topicHint}\n\nResumo inicial:\n${excerpt}\n\nSe quiser, posso detalhar por tópicos (objetivo, pontos principais, riscos e próximos passos).`;
}

function shouldForceContextOnlyMode(agentInstructions = '') {
  const text = String(agentInstructions || '').toLowerCase();
  if (!text) {
    return false;
  }

  const strictPatterns = [
    /somente com o conte[uú]do/i,
    /apenas com o conte[uú]do/i,
    /s[oó] responda com base/i,
    /responda apenas com base/i,
    /responda somente usando/i,
    /responda apenas usando/i,
    /use apenas o conte[uú]do/i,
    /use apenas o contexto/i,
    /use apenas o contexto lido/i,
    /s[oó] responda o que estiver na base/i,
    /somente usando o conte[uú]do da base/i,
    /sua [uú]nica fonte/i,
    /[uú]nica fonte [ée] o conte[uú]do/i,
    /base do agente/i,
    /base lida/i,
    /base de conhecimento/i,
    /nada de completar/i,
    /n[aã]o responda por fora/i,
    /n[aã]o invente/i,
    /n[aã]o use conhecimento externo/i,
    /apenas o que est[aá] nos (links|anexos|documentos)/i,
    /somente o que o rag/i,
    /s[oó] o que o rag/i,
  ];

  return strictPatterns.some((pattern) => pattern.test(text));
}

// 5️⃣ Prompt GLOBAL DEFINITIVO (Ajustado para Visão Panorâmica)
function buildPrompt(context, agentInstructions, question, toneStyle = 'chatgpt', conversationContext = '') {
  const hasContext = Boolean(context && context.trim().length > 0);
  const hasConversationContext = Boolean(conversationContext && conversationContext.trim().length > 0);
  const forceContextOnlyMode = shouldForceContextOnlyMode(agentInstructions);
  const conversationBlock = hasConversationContext
    ? `\nCONTEXTO RECENTE DA CONVERSA:\n${conversationContext}\n`
    : '';

  if (!hasContext) {
    // Sem contexto/chunks, modo strict NÃO se aplica — não existe base para restringir.
    // O agente responde usando instruções + conhecimento geral do modelo.
    return `🎯 PERSONA: CONSULTOR SÊNIOR
Você é um assistente experiente, claro e conversacional.

INSTRUÇÕES DO AGENTE:
${agentInstructions || "Atue como um assistente técnico."}

REGRAS:
1. Responda com clareza, naturalidade e tom de conversa.
2. Se a pergunta for sobre o tema principal do agente, responda normalmente com base nas instruções acima e no seu conhecimento especializado.
3. Se não souber com certeza, seja transparente e informe que a resposta pode necessitar de verificação complementar.
4. Considere o histórico recente da conversa para não repetir perguntas já respondidas.
5. Se o usuário estiver retomando um assunto anterior, continue do ponto em que a conversa parou.
6. NUNCA diga "Não encontrei essa informação na base do agente" — responda SEMPRE com base nas instruções e no seu domínio técnico.
7. Nao repita a pergunta do usuario.
8. Nao use titulos como "Resposta Final" nem linguagem de relatorio.

${conversationBlock}
PERGUNTA DO USUÁRIO:
${question}

RESPONDA AGORA:`;
  }

  const contextBlock = (context && context.trim().length > 0)
    ? `[INÍCIO DO CONTEXTO EXTENDIDO]\n${context}\n[FIM DO CONTEXTO EXTENDIDO]`
    : '';

  return `🎯 PERSONA: CONSULTOR SÊNIOR
Você é um assistente experiente, claro e conversacional.

### REGRAS CRÍTICAS (MODO VISÃO PANORÂMICA):
1. **LEITURA COMPLETA**: Você recebeu um volume amplo de contexto relevante (trechos pré-filtrados por similaridade). Você DEVE ler e considerar TODOS os fragmentos antes de responder.
2. **SÍNTESE OBRIGATÓRIA**: Informações complexas podem estar divididas entre vários trechos. Una os pontos.
3. **FIDELIDADE**: Priorize os trechos abaixo quando a pergunta estiver relacionada aos anexos, URLs e documentos.
4. **TOM NATURAL**: Responda como em uma conversa normal. Nao repita a pergunta, nao use titulos como "Resposta Final" e nao diga coisas como "com base no contexto" ou "trechos recuperados".
5. **BUSCA PROFUNDA**: Se o usuário perguntar por um detalhe específico, vasculhe cada linha do contexto fornecido. Se estiver lá, você deve encontrar.
6. **MODO ${forceContextOnlyMode ? 'ESTRITO' : 'HÍBRIDO'}**: ${forceContextOnlyMode ? 'Responda exclusivamente com base no contexto fornecido. Se faltar informacao, explique objetivamente o que foi encontrado e qual ponto ficou sem base documental, sem usar conhecimento externo.' : 'Se a pergunta não estiver relacionada ao conteúdo dos anexos, responda normalmente seguindo as instruções do agente.'}
7. **MEMÓRIA DE CONVERSA**: Use o histórico recente para manter continuidade, não repetir respostas e não pedir novamente informações que já foram dadas.
8. **SEM CONHECIMENTO EXTERNO**: ${forceContextOnlyMode ? 'É proibido complementar a resposta com conhecimento geral do modelo.' : 'Conhecimento externo só pode ser usado quando não contrariar nem substituir o contexto.'}
9. **SEM RASTROS TÉCNICOS**: Nao exponha [Fonte N], [Trecho ID], nomes de blocos de prompt nem notas de processo, a menos que o usuario peca isso.

FONTE DE VERDADE:
Responda baseando-se no [CONTEXTO] abaixo. ${forceContextOnlyMode ? 'Sua resposta deve sair exclusivamente dele.' : 'Use as informações fornecidas para construir uma resposta útil e completa.'}

═══════════════════════════════════════════════════════════════════
INSTRUÇÕES DO AGENTE:
═══════════════════════════════════════════════════════════════════
${agentInstructions || "Atue como um assistente técnico."}

${hasConversationContext ? `═══════════════════════════════════════════════════════════════════
CONTEXTO RECENTE DA CONVERSA:
═══════════════════════════════════════════════════════════════════
${conversationContext}

` : ''}═══════════════════════════════════════════════════════════════════
CONTEXTO (SUA ÚNICA FONTE):
═══════════════════════════════════════════════════════════════════
${contextBlock}

═══════════════════════════════════════════════════════════════════
PERGUNTA DO USUÁRIO:
═══════════════════════════════════════════════════════════════════
${question}

═══════════════════════════════════════════════════════════════════
RESPONDA AGORA:
═══════════════════════════════════════════════════════════════════`;
}

// Validador de Saída
function buildGroundedPrompt(context, agentInstructions, question, conversationContext = '') {
  const hasContext = Boolean(context && context.trim().length > 0);
  const hasConversationContext = Boolean(conversationContext && conversationContext.trim().length > 0);
  const conversationBlock = hasConversationContext
    ? `CONTEXTO RECENTE DA CONVERSA:\n${conversationContext}\n\n`
    : '';

  if (!hasContext) {
    return `PERSONA: CONSULTOR TECNICO SENIOR
Voce responde de forma objetiva, natural e inteiramente ancorada na base do agente.

INSTRUCOES DO AGENTE:
${agentInstructions || "Atue como um assistente técnico."}

REGRAS:
1. Use exclusivamente o contexto documental fornecido.
2. Se o contexto estiver vazio ou insuficiente, responda com transparencia: diga o que nao foi possivel confirmar no material disponivel e quais pontos faltaram.
3. Nunca complete com conhecimento externo.
4. Nunca invente artigos, nomes, datas, prazos, procedimentos ou conclusoes.
5. Se houver contexto suficiente, responda em portugues claro, direto e com tom de conversa.
6. Nao repita a pergunta e nao use titulos como "Resposta Final".
7. As instrucoes do agente definem o assunto e os limites da resposta; anexos de outro tema nao transformam o agente em especialista geral.
8. Quando houver varios anexos relevantes, combine-os como uma unica base do agente antes de responder.
9. Nao cite numero, nome ou data de norma apenas porque apareceu nas instrucoes do agente; esses dados precisam estar no contexto documental recuperado.

${conversationBlock}PERGUNTA DO USUARIO:
${question}

CONTEXTO DOCUMENTAL:
${context || '[sem contexto]'}

RESPONDA AGORA:`;
  }

  return `PERSONA: CONSULTOR TECNICO SENIOR
Voce responde com fidelidade maxima ao RAG, sem conhecimento externo e sem preencher lacunas, mas com linguagem natural e sem cara de relatorio.

INSTRUCOES DO AGENTE:
${agentInstructions || "Atue como um assistente técnico."}

REGRAS CRITICAS:
1. Leia todos os trechos recuperados antes de responder.
2. Responda exclusivamente com base no contexto documental abaixo.
3. Se a pergunta mencionar artigo, paragrafo, lei, decreto, codigo ou sigla normativa, procure primeiro esses identificadores no contexto antes de concluir que a informacao nao esta disponivel.
4. Se a resposta depender de mais de um trecho, una os trechos sem extrapolar.
5. Responda de forma natural, como em um chat, sem repetir a pergunta e sem usar titulos como "Resposta Final" ou "Pergunta identificada".
6. Nao exponha [Fonte N], nomes de trechos, notas de revisao ou detalhes do processo, a menos que o usuario peca isso.
7. Se a informacao nao estiver expressamente nos trechos, explique isso de forma breve, natural e objetiva, sem usar conhecimento externo.
8. Nao use conhecimento externo, memoria do modelo ou suposicoes.
9. Quando o contexto trouxer texto legal ou normativo, prefira reproduzir a redacao essencial em vez de parafrasear demais.
10. Se houver divergencia entre trechos, aponte a divergencia de forma natural e objetiva.
11. Em perguntas que pedem lista (ex.: "quais", "em quais situacoes", "documentos"), entregue os itens em bullets com redacao o mais literal possivel dos trechos.
12. Priorize o trecho cujo texto tenha maior sobreposicao lexical com o nucleo da pergunta; nao substitua esse trecho por regra parecida de outro artigo.
13. Se houver mais de uma regra sobre o mesmo beneficio, identifique qual frase responde exatamente ao enunciado e use essa frase como base da resposta.
14. Antes de finalizar, confira se todos os elementos centrais perguntados estao cobertos (sujeito, condicoes, excecoes e marcos normativos citados no enunciado).
15. Em contexto normativo, priorize sempre a redacao mais recente indicada no proprio texto (ex.: "Atualizada em", "Redacao dada", "alterado pela", "revogado por"). Trate redacoes anteriores apenas como historico, sem apresenta-las como regra vigente.
16. Se a pergunta envolver atualizacao/alteracao/revogacao, responda com norma-base alterada, norma alteradora e data associada quando isso estiver no contexto.
17. Se o usuario pedir lista de normas do documento, apresente inventario por tipo+numero+data apenas do que estiver expresso nos trechos; nao complete com normas externas.
18. As instrucoes do agente delimitam o escopo do assunto; use os anexos para sustentar esse escopo, sem transformar documentos de apoio em autorizacao para responder sobre outro tema.
19. Quando a colecao tiver varios documentos relevantes (portarias, PDFs, planilhas ou links), sintetize os pontos complementares em uma unica resposta.
20. Numeros, nomes e datas de portarias, leis ou atos citados nas instrucoes do agente sao apenas pistas de escopo; so afirme esses dados quando tambem aparecerem no contexto documental.

${conversationBlock}CONTEXTO DOCUMENTAL:
${context}

PERGUNTA DO USUARIO:
${question}

RESPONDA AGORA:`;
}

function hasGroundedSourceMarkers(text = '') {
  return /\[Fonte\s+\d+\]/i.test(String(text || ''));
}

function getGroundedCoverageStats(text = '', context = '') {
  const answerTokens = extractRetrievalTokens(text, { limit: 32 });
  const normalizedContext = normalizeRetrievalText(context);
  if (!normalizedContext || answerTokens.length === 0) {
    return {
      answerTokens,
      matchedTokens: [],
      matches: 0,
      ratio: 0,
    };
  }

  const matchedTokens = answerTokens.filter((token) => normalizedContext.includes(token));
  return {
    answerTokens,
    matchedTokens,
    matches: matchedTokens.length,
    ratio: matchedTokens.length / Math.max(answerTokens.length, 1),
  };
}

function hasGroundedCoverage(text = '', context = '') {
  const stats = getGroundedCoverageStats(text, context);
  return stats.ratio >= 0.18;
}

function buildContextLimitationResponse(question = '', context = '') {
  const hasContext = String(context || '').trim().length > 0;

  if (!hasContext) {
    return 'Com o material disponivel agora, nao consegui confirmar esse ponto com seguranca. Se quiser, eu posso refinar a busca por artigo, paragrafo ou termo-chave.';
  }

  return 'Nao consegui confirmar esse ponto com seguranca no material que o agente tem agora. Se quiser, eu posso refinar a busca no acervo por artigo, paragrafo ou termo exato.';
}

function validateOutput(text, hasContext = true, question = '', questionType = 'general', contextSize = 0, chunksUsed = 0, context = '') {
  let finalResponse = text;

  // Padrões de alucinação
  const severeAllucinationPatterns = [
    /de acordo com meu conhecimento/i,
    /em minha opinião/i,
    /geralmente se sabe que/i
  ];

  for (const pattern of severeAllucinationPatterns) {
    if (pattern.test(text)) {
      console.log(`[VALIDATOR] 🚨 Alucinação detectada e bloqueada.`);
      return buildContextLimitationResponse(question, context);
    }
  }

  if (hasContext) {
    const hasSourceMarkers = hasGroundedSourceMarkers(text);
    const coverageStats = getGroundedCoverageStats(text, context);
    const hasCoverage = coverageStats.ratio >= 0.18;
    const validatorSummary = {
      questionType,
      contextSize,
      chunksUsed,
      hasSourceMarkers,
      coverageRatio: Number(coverageStats.ratio.toFixed(3)),
      matchedTokens: coverageStats.matches,
      answerTokens: coverageStats.answerTokens.length,
      answerPreview: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    };

    if (!hasSourceMarkers && !hasCoverage) {
      console.log(`[VALIDATOR] Bloqueando resposta sem fonte e com baixa cobertura: ${JSON.stringify(validatorSummary)}`);
      return buildContextLimitationResponse(question, context);
    }

    if (!hasSourceMarkers && hasCoverage) {
      console.log(`[VALIDATOR] Permitindo resposta sem [Fonte N] por cobertura suficiente: ${JSON.stringify(validatorSummary)}`);
    } else if (hasSourceMarkers && !hasCoverage) {
      console.log(`[VALIDATOR] Permitindo resposta com [Fonte N] apesar de baixa cobertura lexical: ${JSON.stringify(validatorSummary)}`);
    } else {
      console.log(`[VALIDATOR] Resposta validada: ${JSON.stringify(validatorSummary)}`);
    }
  }

  finalResponse = orchestrateResponse(finalResponse, questionType, hasContext);
  return finalResponse;
}

function isGroundedFallbackResponse(text = '') {
  const normalized = normalizeRetrievalText(text);
  return normalized.startsWith('nao encontrei essa informacao')
    || normalized.includes('nao localizei essa informacao')
    || normalized.includes('o documento nao aborda esse ponto')
    || normalized.startsWith('com os trechos disponiveis')
    || normalized.startsWith('com o material disponivel')
    || normalized.includes('nao foi possivel confirmar com precisao');
}

function shouldRunStrictGroundedRefinement(question = '', hasContext = false) {
  if (!hasContext) {
    return false;
  }

  if (RAG_EXTREME_MODE) {
    return true;
  }

  const normalized = normalizeRetrievalText(question);
  return /\b(quais|qual|quando|como|situac|hipotese|document|requisito|inciso|alinea|caput|art|decreto|lei|norma|prazo)\b/i.test(normalized);
}

async function refineGroundedAnswerIfNeeded({
  answer = '',
  question = '',
  context = '',
  hasContext = false,
  questionType = 'general',
  contextSize = 0,
  chunksUsed = 0,
  userId = null,
  conversationId = null,
  requestType = 'chat_completion_grounded_refinement',
} = {}) {
  const baseAnswer = String(answer || '').trim();
  if (!baseAnswer || !shouldRunStrictGroundedRefinement(question, hasContext)) {
    return baseAnswer || answer;
  }

  const refinementContext = String(context || '').trim();
  if (!refinementContext) {
    return baseAnswer;
  }

  const contextWindow = refinementContext.slice(0, Math.max(DEFAULT_RAG_CONTEXT_MAX_CHARS, 60000));
  const refinementPrompt = `PERSONA: REVISOR JURIDICO RAG DE PRECISAO MAXIMA
Sua tarefa e reescrever uma resposta para que ela fique 100% aderente ao contexto, com linguagem natural e sem cara de relatorio.

REGRAS OBRIGATORIAS:
1. Use somente o contexto abaixo.
2. Identifique no contexto o trecho com maior sobreposicao lexical com a pergunta e use-o como base principal.
3. Se a pergunta pedir lista/situacoes/documentos/requisitos, entregue a lista completa e literal dos itens do trecho principal.
4. Nao misture regras de artigos diferentes quando o enunciado apontar uma situacao especifica.
5. Nao repita a pergunta e nao use titulos como "Resposta Final", "Pergunta identificada" ou avisos de auditoria.
6. Nao exponha [Fonte N], IDs, nomes de trechos ou notas do processo, a menos que o usuario peca isso.
7. Se faltar informacao no contexto, explique de forma breve e natural qual ponto nao deu para confirmar.
8. Nao use conhecimento externo.
9. Em materia normativa, privilegie a redacao mais recente indicada no proprio contexto ("Atualizada em", "Redacao dada", "alterado pela", "revogado").
10. Se houver alteracao normativa, inclua explicitamente a norma-base e a norma alteradora com data quando disponivel no trecho.
11. Nunca trate norma historica/revogada como vigente quando o contexto indicar substituicao.

CONTEXTO DOCUMENTAL:
${contextWindow}

PERGUNTA:
${question}

RESPOSTA PRELIMINAR:
${baseAnswer}

Reescreva agora a resposta corrigida em tom natural, direto e amigavel.`;

  try {
    const aiCfg = getAiRuntimeConfig();
    const refinedAnswer = await runChatCompletion({
      messages: [{ role: 'system', content: refinementPrompt }],
      model: aiCfg.chatModel,
      userId,
      conversationId,
      requestType,
      temperature: 0,
      maxTokens: Math.max(1600, DEFAULT_CHAT_MAX_TOKENS),
    });

    const refinedText = String(refinedAnswer || '').trim();
    if (!refinedText) {
      return baseAnswer;
    }

    const validatedRefined = validateOutput(
      refinedText,
      hasContext,
      question,
      questionType,
      contextSize,
      chunksUsed,
      contextWindow,
    );

    return String(validatedRefined || baseAnswer).trim() || baseAnswer;
  } catch (error) {
    console.warn('[CHAT][REFINE] Falha na revisao estrita da resposta:', error?.message || error);
    return baseAnswer;
  }
}

// ============================================
// 📊 INICIALIZAR TABELAS RAG
// ============================================

async function initializeRagTables() {
  if (!hasDatabaseUrl) {
    console.warn('[RAG] Banco não configurado (DATABASE_URL ausente). Inicialização RAG ignorada.');
    return;
  }

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        agent_id UUID,
        user_id UUID,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try { await pool.query(`ALTER TABLE conversations ADD COLUMN agent_id UUID`); } catch (e) {}
    try { await pool.query(`ALTER TABLE conversations ADD COLUMN user_id UUID`); } catch (e) {}
    await pool.query('CREATE INDEX IF NOT EXISTS conversations_user_agent_created_idx ON conversations (user_id, agent_id, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS conversations_user_created_idx ON conversations (user_id, created_at DESC)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at ASC)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(3072),
        chunk_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_agent_created ON documents (agent_id, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_document_chunks_agent_doc_chunk ON document_chunks (agent_id, document_id, chunk_index ASC)');

    try {
      await ensureAgentsPythonCoreColumns();
    } catch (agentColumnError) {
      console.warn('[PYTHON_AGENT_CORE] Nao foi possivel garantir coluna python_collection_id em agents:', agentColumnError?.message || agentColumnError);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
        ON document_chunks USING hnsw (embedding vector_cosine_ops)
      `);
    } catch (indexError) {
      console.warn('[RAG] hnsw não disponível, usando busca sem índice');
    }

    console.log('[RAG] ✅ Tabelas RAG inicializadas');
  } catch (e) {
    if (isPostgresUnavailableError(e)) {
      console.warn('[RAG] Postgres indisponivel na inicializacao; operando com fallback via Supabase REST.');
      return;
    }
    console.error('[RAG] Erro ao inicializar:', e.message);
  }
}

async function ensureChatTables() {
  if (!hasDatabaseUrl) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      agent_id UUID,
      user_id UUID,
      title VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try { await pool.query(`ALTER TABLE conversations ADD COLUMN agent_id UUID`); } catch (e) {}
  try { await pool.query(`ALTER TABLE conversations ADD COLUMN user_id UUID`); } catch (e) {}
  await pool.query('CREATE INDEX IF NOT EXISTS conversations_user_agent_created_idx ON conversations (user_id, agent_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS conversations_user_created_idx ON conversations (user_id, created_at DESC)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at ASC)');
}

initializeRagTables();

async function ensureTutorialsTable() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS public.tutorials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      url text NOT NULL,
      display_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );

    ALTER TABLE public.tutorials
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();

    UPDATE public.tutorials
    SET description = COALESCE(description, '')
    WHERE description IS NULL;
  `);
}

async function isAdminUser(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return false;
  }

  if (normalizedUserId === TUTORIAL_ADMIN_USER_ID) {
    return true;
  }

  try {
    return await withDatabaseFallback(
      'isAdminUser',
      async () => {
        const result = await pool.query(
          `
          SELECT role
          FROM profiles
          WHERE id = $1
          LIMIT 1
          `,
          [normalizedUserId]
        );

        return String(result.rows?.[0]?.role || '').trim().toLowerCase() === 'admin';
      },
      async () => {
        const response = await supabaseAdminClient
          .from('profiles')
          .select('role')
          .eq('id', normalizedUserId)
          .maybeSingle();

        if (response.error) {
          throw createSupabaseFallbackError(response.error, 'Erro ao validar usuário administrador');
        }

        return String(response.data?.role || '').trim().toLowerCase() === 'admin';
      }
    );
  } catch (error) {
    console.warn('[TUTORIALS] Falha ao validar admin em profiles:', error?.message || error);
    return false;
  }
}

function normalizeTutorialPayload(payload = {}) {
  return {
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    url: String(payload.url || '').trim(),
    displayOrder: Number.parseInt(String(payload.display_order ?? payload.displayOrder ?? 0), 10) || 0,
  };
}

function splitAccountFullName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: null, lastName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

const ACCOUNT_PROFESSION_MARKER = '__profissao__:';

function normalizeAccountTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAccountProfession(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function extractAccountStoredFields(value) {
  const items = normalizeAccountTextArray(value);
  const practiceAreas = [];
  let profissao = null;

  for (const item of items) {
    if (item.toLowerCase().startsWith(ACCOUNT_PROFESSION_MARKER)) {
      profissao = normalizeAccountProfession(item.slice(ACCOUNT_PROFESSION_MARKER.length));
      continue;
    }

    practiceAreas.push(item);
  }

  return {
    profissao,
    practiceAreas: [...new Set(practiceAreas)],
  };
}

function buildAccountStoredPracticeAreas(practiceAreas, profissao) {
  const normalizedPracticeAreas = normalizeAccountTextArray(practiceAreas)
    .filter((item) => !item.toLowerCase().startsWith(ACCOUNT_PROFESSION_MARKER));
  const normalizedProfession = normalizeAccountProfession(profissao);

  if (normalizedProfession) {
    normalizedPracticeAreas.push(`${ACCOUNT_PROFESSION_MARKER}${normalizedProfession}`);
  }

  return [...new Set(normalizedPracticeAreas)];
}

function normalizeAccountDate(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(`${rawValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function deriveRegionFromStateServer(value) {
  const state = String(value || '').trim().toUpperCase();
  const regions = {
    AC: 'Norte',
    AL: 'Nordeste',
    AP: 'Norte',
    AM: 'Norte',
    BA: 'Nordeste',
    CE: 'Nordeste',
    DF: 'Centro-Oeste',
    ES: 'Sudeste',
    GO: 'Centro-Oeste',
    MA: 'Nordeste',
    MT: 'Centro-Oeste',
    MS: 'Centro-Oeste',
    MG: 'Sudeste',
    PA: 'Norte',
    PB: 'Nordeste',
    PR: 'Sul',
    PE: 'Nordeste',
    PI: 'Nordeste',
    RJ: 'Sudeste',
    RN: 'Nordeste',
    RS: 'Sul',
    RO: 'Norte',
    RR: 'Norte',
    SC: 'Sul',
    SP: 'Sudeste',
    SE: 'Nordeste',
    TO: 'Norte',
  };

  return regions[state] || null;
}

function calculateAccountAgeFromBirthDate(value) {
  const normalizedDate = normalizeAccountDate(value);
  if (!normalizedDate) {
    return null;
  }

  const birthDate = new Date(`${normalizedDate}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

const ACCOUNT_USUARIOS_SELECT = 'user_id, nome_completo, email, documento, telefone, ramos_atuacao, cep, logradouro, numero, complemento, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em, status_da_assinatura, updated_at, created_at';

function buildAccountProfileResponse(userId, profileRow = {}, userRow = {}) {
  const parsedAddress = parseManagedAddressSafe(userRow.logradouro || null);
  const accountStoredFields = extractAccountStoredFields(userRow.ramos_atuacao);
  const explicitFirstName = String(profileRow.first_name || '').trim();
  const explicitLastName = String(profileRow.last_name || '').trim();
  const fullName = String(userRow.nome_completo || [explicitFirstName, explicitLastName].filter(Boolean).join(' ') || '').trim();
  const splitName = splitAccountFullName(fullName);

  return {
    id: String(profileRow.id || userId),
    first_name: explicitFirstName || splitName.firstName,
    last_name: explicitLastName || splitName.lastName,
    avatar_url: profileRow.avatar_url || null,
    role: String(profileRow.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
    updated_at: profileRow.updated_at || userRow.updated_at || null,
    nome_completo: fullName || null,
    email: String(userRow.email || '').trim() || null,
    documento: String(userRow.documento || '').trim() || null,
    telefone: String(userRow.telefone || '').trim() || null,
    profissao: accountStoredFields.profissao,
    ramos_atuacao: accountStoredFields.practiceAreas,
    cep: String(userRow.cep || '').trim() || null,
    logradouro: parsedAddress.logradouro || String(userRow.logradouro || '').trim() || null,
    numero: String(userRow.numero || '').trim() || parsedAddress.numero,
    complemento: String(userRow.complemento || '').trim() || parsedAddress.complemento,
    bairro: String(userRow.bairro || '').trim() || null,
    cidade: String(userRow.cidade || '').trim() || null,
    estado: String(userRow.estado || '').trim() || null,
    regiao: String(userRow.regiao || '').trim() || null,
    sexo: String(userRow.sexo || '').trim() || null,
    idade: Number.isFinite(Number(userRow.idade)) ? Number(userRow.idade) : null,
    data_nascimento: String(userRow.data_nascimento || '').trim() || null,
    origem_cadastro: String(userRow.origem_cadastro || '').trim() || null,
    cadastro_finalizado_em: userRow.cadastro_finalizado_em || null,
    status_da_assinatura: String(userRow.status_da_assinatura || '').trim() || null,
  };
}

async function readAccountProfileViaSupabase(userId) {
  const [profileResponse, initialUserResponse] = await Promise.all([
    supabaseAdminClient
      .from('profiles')
      .select('id, first_name, last_name, avatar_url, role, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    supabaseAdminClient
      .from('usuarios')
      .select(ACCOUNT_USUARIOS_SELECT)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
  ]);

  let userResponse = initialUserResponse;

  if (profileResponse.error) {
    throw createSupabaseFallbackError(profileResponse.error, 'Erro ao carregar perfil em profiles');
  }

  if (userResponse.error) {
    throw createSupabaseFallbackError(userResponse.error, 'Erro ao carregar perfil em usuarios');
  }

  const profileRow = profileResponse.data || {};
  const userRow = Array.isArray(userResponse.data) ? (userResponse.data[0] || {}) : {};

  return buildAccountProfileResponse(userId, profileRow, userRow);
}

async function saveAccountProfileViaSupabase(userId, payload = {}) {
  const normalizedFullName = String(payload.full_name || payload.nome_completo || '').trim();
  const normalizedEmail = String(payload.email || '').trim().toLowerCase();
  const normalizedDocumento = String(payload.documento || '').trim();
  const normalizedTelefone = String(payload.telefone || '').trim();
  const normalizedPracticeAreas = normalizeAccountTextArray(payload.practice_areas || payload.ramos_atuacao);
  const normalizedProfession = normalizeAccountProfession(payload.profissao || payload.profession);
  const normalizedCep = String(payload.cep || '').trim();
  const normalizedLogradouro = String(payload.logradouro || '').trim();
  const normalizedNumero = String(payload.numero || '').trim();
  const normalizedComplemento = String(payload.complemento || '').trim();
  const normalizedBairro = String(payload.bairro || '').trim();
  const normalizedCidade = String(payload.cidade || '').trim();
  const normalizedEstado = String(payload.estado || '').trim().toUpperCase();
  const normalizedRegiao = String(payload.regiao || '').trim() || deriveRegionFromStateServer(normalizedEstado);
  const normalizedSexo = String(payload.sexo || '').trim();
  const normalizedBirthDate = normalizeAccountDate(payload.data_nascimento || payload.dataNascimento);
  const normalizedAge = calculateAccountAgeFromBirthDate(normalizedBirthDate) ?? normalizeAccountAge(payload.idade);
  const normalizedOrigin = String(payload.origem_cadastro || '').trim();
  const nowIso = new Date().toISOString();
  const cadastroFinalizadoEm = payload.cadastro_finalizado_em ? String(payload.cadastro_finalizado_em).trim() : nowIso;
  const { firstName, lastName } = splitAccountFullName(normalizedFullName);

  const usuarioPayload = {
    user_id: userId,
    nome_completo: normalizedFullName || null,
    email: normalizedEmail || null,
    documento: normalizedDocumento || null,
    telefone: normalizedTelefone || null,
    ramos_atuacao: buildAccountStoredPracticeAreas(normalizedPracticeAreas, normalizedProfession),
    cep: normalizedCep || null,
    logradouro: normalizedLogradouro || null,
    numero: normalizedNumero || null,
    complemento: normalizedComplemento || null,
    bairro: normalizedBairro || null,
    cidade: normalizedCidade || null,
    estado: normalizedEstado || null,
    regiao: normalizedRegiao || null,
    sexo: normalizedSexo || null,
    idade: normalizedAge,
    data_nascimento: normalizedBirthDate,
    origem_cadastro: normalizedOrigin || undefined,
    cadastro_finalizado_em: cadastroFinalizadoEm,
    updated_at: nowIso,
  };

  const usuarioResponse = await supabaseAdminClient
    .from('usuarios')
    .upsert([usuarioPayload], { onConflict: 'user_id' });

  if (usuarioResponse.error) {
    throw createSupabaseFallbackError(usuarioResponse.error, 'Erro ao salvar dados do usuário');
  }

  const profileResponse = await supabaseAdminClient
    .from('profiles')
    .upsert(
      [{
        id: userId,
        first_name: firstName,
        last_name: lastName,
        updated_at: nowIso,
      }],
      { onConflict: 'id' }
    );

  if (profileResponse.error) {
    console.warn('[ACCOUNT] Não foi possível atualizar profiles via Supabase REST:', profileResponse.error.message);
  }

  return readAccountProfileViaSupabase(userId);
}

async function readAccountProfile(userId) {
  return withDatabaseFallback(
    'readAccountProfile',
    async () => {
      const [profileResult, userResult] = await Promise.all([
        pool.query(
          `
          SELECT id, first_name, last_name, avatar_url, role, updated_at
          FROM public.profiles
          WHERE id = $1
          LIMIT 1
          `,
          [userId]
        ),
        pool.query(
          `
          SELECT user_id, nome_completo, email, documento, telefone, status_da_assinatura, updated_at, created_at
          , ramos_atuacao, cep, logradouro, numero, complemento, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em
          FROM public.usuarios
          WHERE user_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          `,
          [userId]
        )
      ]);

      const profileRow = profileResult.rows?.[0] || {};
      const userRow = userResult.rows?.[0] || {};

      return buildAccountProfileResponse(userId, profileRow, userRow);
    },
    () => readAccountProfileViaSupabase(userId)
  );
}

async function saveAccountProfile(userId, payload = {}) {
  return withDatabaseFallback(
    'saveAccountProfile',
    async () => {
      const normalizedFullName = String(payload.full_name || payload.nome_completo || '').trim();
      const normalizedEmail = String(payload.email || '').trim().toLowerCase();
      const normalizedDocumento = String(payload.documento || '').trim();
      const normalizedTelefone = String(payload.telefone || '').trim();
      const normalizedPracticeAreas = normalizeAccountTextArray(payload.practice_areas || payload.ramos_atuacao);
      const normalizedProfession = normalizeAccountProfession(payload.profissao || payload.profession);
      const normalizedCep = String(payload.cep || '').trim();
      const normalizedLogradouro = String(payload.logradouro || '').trim();
      const normalizedNumero = String(payload.numero || '').trim();
      const normalizedComplemento = String(payload.complemento || '').trim();
      const normalizedBairro = String(payload.bairro || '').trim();
      const normalizedCidade = String(payload.cidade || '').trim();
      const normalizedEstado = String(payload.estado || '').trim().toUpperCase();
      const normalizedRegiao = String(payload.regiao || '').trim() || deriveRegionFromStateServer(normalizedEstado);
      const normalizedSexo = String(payload.sexo || '').trim();
      const normalizedBirthDate = normalizeAccountDate(payload.data_nascimento || payload.dataNascimento);
      const normalizedAge = calculateAccountAgeFromBirthDate(normalizedBirthDate) ?? normalizeAccountAge(payload.idade);
      const normalizedOrigin = String(payload.origem_cadastro || '').trim();
      const { firstName, lastName } = splitAccountFullName(normalizedFullName);

      const updatedUser = await pool.query(
        `
        UPDATE public.usuarios
        SET nome_completo = $2,
            email = $3,
            documento = $4,
            telefone = $5,
            ramos_atuacao = $6,
            cep = $7,
            logradouro = $8,
            numero = $9,
            complemento = $10,
            bairro = $11,
            cidade = $12,
            estado = $13,
            regiao = $14,
            sexo = $15,
            idade = $16,
            data_nascimento = $17,
            origem_cadastro = COALESCE(NULLIF($18, ''), origem_cadastro),
            cadastro_finalizado_em = COALESCE(cadastro_finalizado_em, NOW()),
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id
        `,
        [
          userId,
          normalizedFullName || null,
          normalizedEmail || null,
          normalizedDocumento || null,
          normalizedTelefone || null,
          buildAccountStoredPracticeAreas(normalizedPracticeAreas, normalizedProfession),
          normalizedCep || null,
          normalizedLogradouro || null,
          normalizedNumero || null,
          normalizedComplemento || null,
          normalizedBairro || null,
          normalizedCidade || null,
          normalizedEstado || null,
          normalizedRegiao || null,
          normalizedSexo || null,
          normalizedAge,
          normalizedBirthDate,
          normalizedOrigin || null,
        ]
      );

      if (!updatedUser.rows.length) {
        await pool.query(
          `
          INSERT INTO public.usuarios (user_id, nome_completo, email, documento, telefone, ramos_atuacao, cep, logradouro, numero, complemento, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
          `,
          [
            userId,
            normalizedFullName || null,
            normalizedEmail || null,
            normalizedDocumento || null,
            normalizedTelefone || null,
            buildAccountStoredPracticeAreas(normalizedPracticeAreas, normalizedProfession),
            normalizedCep || null,
            normalizedLogradouro || null,
            normalizedNumero || null,
            normalizedComplemento || null,
            normalizedBairro || null,
            normalizedCidade || null,
            normalizedEstado || null,
            normalizedRegiao || null,
            normalizedSexo || null,
            normalizedAge,
            normalizedBirthDate,
            normalizedOrigin || null,
          ]
        );
      }

      try {
        await pool.query(
          `
          INSERT INTO public.profiles (id, first_name, last_name, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (id) DO UPDATE
          SET first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              updated_at = NOW()
          `,
          [userId, firstName, lastName]
        );
      } catch (error) {
        console.warn('[ACCOUNT] Não foi possível atualizar public.profiles:', error?.message || error);
      }

      return readAccountProfile(userId);
    },
    () => saveAccountProfileViaSupabase(userId, payload)
  );
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asCleanString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function asIsoDate(value) {
  const stringValue = asCleanString(value);
  if (!stringValue) {
    return null;
  }

  const parsed = new Date(stringValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const stringValue = asCleanString(value);
  if (!stringValue) {
    return null;
  }

  const normalized = stringValue.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRecord(value, key) {
  const nextValue = isPlainObject(value) ? value[key] : null;
  return isPlainObject(nextValue) ? nextValue : {};
}

function getFirstText(target, keys = []) {
  for (const key of keys) {
    const value = asCleanString(isPlainObject(target) ? target[key] : null);
    if (value) {
      return value;
    }
  }

  return null;
}

function getFirstDate(target, keys = []) {
  for (const key of keys) {
    const value = asIsoDate(isPlainObject(target) ? target[key] : null);
    if (value) {
      return value;
    }
  }

  return null;
}

function getFirstNumber(target, keys = []) {
  for (const key of keys) {
    const value = asNumber(isPlainObject(target) ? target[key] : null);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function prettifySubscriptionEvent(eventType) {
  const normalized = String(eventType || '').trim().toLowerCase();
  const labels = {
    purchase_approved: 'Compra aprovada',
    subscription_renewed: 'Renovação aprovada',
    subscription_canceled: 'Assinatura cancelada',
    subscription_cancelled: 'Assinatura cancelada',
    user_subscription_canceled: 'Cancelamento solicitado no app',
    refund: 'Reembolso',
    chargeback: 'Chargeback',
    purchase_refused: 'Compra recusada',
    boleto_gerado: 'Boleto gerado',
    pix_gerado: 'PIX gerado',
  };

  return labels[normalized] || (normalized ? normalized.replace(/_/g, ' ') : 'Evento');
}

function readSubscriptionDetails(payload = {}) {
  const root = isPlainObject(payload) ? payload : {};
  const data = getRecord(root, 'data');
  const offer = getRecord(data, 'offer');
  const product = getRecord(data, 'product');
  const card = getRecord(data, 'card');
  const subscription = getRecord(data, 'subscription');
  const manualCancellation = getRecord(root, 'manual_cancellation');
  const currentSubscription = getRecord(root, 'current_subscription');
  const remoteSync = getRecord(manualCancellation, 'provider_sync');

  const amount =
    getFirstNumber(currentSubscription, ['amount']) ??
    getFirstNumber(data, ['amount', 'baseAmount', 'charged_fees']) ??
    getFirstNumber(offer, ['price']);

  return {
    product_name:
      getFirstText(currentSubscription, ['product_name']) ??
      getFirstText(product, ['name']) ??
      getFirstText(offer, ['name']),
    offer_name: getFirstText(offer, ['name']),
    amount,
    currency:
      getFirstText(currentSubscription, ['currency']) ??
      getFirstText(offer, ['currency']) ??
      'BRL',
    payment_method:
      getFirstText(currentSubscription, ['payment_method']) ??
      getFirstText(data, ['paymentMethodName', 'paymentMethod']),
    purchase_date:
      getFirstDate(currentSubscription, ['purchase_date']) ??
      getFirstDate(data, ['paidAt', 'createdAt']),
    due_date:
      getFirstDate(currentSubscription, ['due_date']) ??
      getFirstDate(data, ['due_date']),
    next_charge_at:
      getFirstDate(currentSubscription, ['next_charge_at']) ??
      getFirstDate(subscription, ['next_charge_at']),
    expires_at:
      getFirstDate(currentSubscription, ['expires_at']) ??
      getFirstDate(subscription, ['expires_at']),
    subscription_period:
      getFirstText(currentSubscription, ['subscription_period']) ??
      getFirstText(data, ['subscription_period']) ??
      getFirstText(subscription, ['subscription_period']),
    order_reference: getFirstText(data, ['refId']),
    status:
      getFirstText(currentSubscription, ['status']) ??
      getFirstText(data, ['status']) ??
      getFirstText(root, ['status']),
    card_brand:
      getFirstText(currentSubscription, ['card_brand']) ??
      getFirstText(card, ['brand']),
    card_last_digits:
      getFirstText(currentSubscription, ['card_last_digits']) ??
      getFirstText(card, ['lastDigits']),
    external_subscription_id:
      getFirstText(currentSubscription, ['external_subscription_id']) ??
      getFirstText(subscription, ['id', 'subscription_id']),
    canceled_at: getFirstDate(data, ['canceledAt']),
    refund_at: getFirstDate(data, ['refundedAt']),
    chargeback_at: getFirstDate(data, ['chargedbackAt']),
    cancellation_reason: getFirstText(manualCancellation, ['reason']),
    provider_sync_status: getFirstText(remoteSync, ['status', 'reason']),
  };
}

function buildSubscriptionCapability(current) {
  const endpoint = String(process.env.CAKTO_CANCEL_ENDPOINT || process.env.CAKTO_CANCEL_ENDPOINT_TEMPLATE || '').trim();
  const token = String(process.env.CAKTO_API_TOKEN || process.env.CAKTO_API_KEY || '').trim();
  const provider = String(current?.provider || '').trim().toLowerCase();
  const currentStatus = String(current?.status || '').trim().toLowerCase();
  const hasRemoteIdentifier = Boolean(current?.external_subscription_id || current?.external_customer_id);
  const remoteConfigured = Boolean(endpoint && token);

  let remoteReason = null;
  if (provider !== 'cakto') {
    remoteReason = 'provider_not_supported';
  } else if (!remoteConfigured) {
    remoteReason = 'provider_api_not_configured';
  } else if (!hasRemoteIdentifier) {
    remoteReason = 'missing_provider_subscription_id';
  }

  return {
    can_cancel: Boolean(current) && !['cancelled', 'inactive', 'expired'].includes(currentStatus),
    remote_sync_available: provider === 'cakto' && remoteConfigured && hasRemoteIdentifier,
    remote_sync_reason: remoteReason,
  };
}

function buildSubscriptionProductName(planType) {
  const normalized = String(planType || '').trim().toLowerCase();
  const labels = {
    basic: 'FlixPrev Basico',
    premium: 'FlixPrev Premium',
    enterprise: 'FlixPrev Enterprise',
  };

  return labels[normalized] || (normalized ? `FlixPrev ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : null);
}

function inferSubscriptionPeriod(startsAt, expiresAt) {
  const startDate = startsAt ? new Date(startsAt) : null;
  const endDate = expiresAt ? new Date(expiresAt) : null;

  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return null;
  }

  if (diffDays <= 35) {
    return 'mensal';
  }

  if (diffDays <= 100) {
    return 'trimestral';
  }

  if (diffDays <= 200) {
    return 'semestral';
  }

  if (diffDays <= 400) {
    return 'anual';
  }

  return 'periodico';
}

function buildCurrentSubscriptionDetails(subscriptionRow, details) {
  const startsAt = asIsoDate(subscriptionRow?.starts_at);
  const expiresAt = asIsoDate(subscriptionRow?.expires_at) || details.expires_at;
  const nextChargeAt = details.next_charge_at || expiresAt;
  const dueDate = details.due_date || expiresAt || nextChargeAt;
  const purchaseDate = details.purchase_date || startsAt;
  const subscriptionPeriod = details.subscription_period || inferSubscriptionPeriod(startsAt, expiresAt);
  const productName = details.product_name || details.offer_name || buildSubscriptionProductName(subscriptionRow?.plan_type);

  return {
    starts_at: startsAt,
    expires_at: expiresAt,
    product_name: productName,
    offer_name: details.offer_name || productName,
    purchase_date: purchaseDate,
    due_date: dueDate,
    next_charge_at: nextChargeAt,
    subscription_period: subscriptionPeriod,
  };
}

function buildSyntheticSubscriptionHistory(current) {
  if (!current) {
    return [];
  }

  const occurredAt =
    current.purchase_date ||
    current.starts_at ||
    current.updated_by_webhook_at ||
    current.updated_at ||
    current.expires_at ||
    null;

  return [{
    id: `synthetic-${String(current.id || crypto.randomUUID())}`,
    provider: current.provider || 'manual',
    event_id: null,
    event_type: 'manual_subscription_created',
    label: current.provider === 'manual' ? 'Assinatura liberada pelo admin' : 'Assinatura registrada',
    processing_status: 'processed',
    occurred_at: occurredAt,
    created_at: occurredAt,
    status: current.status || current.user_status || 'active',
    plan_type: current.plan_type || null,
    product_name: current.product_name || null,
    offer_name: current.offer_name || null,
    amount: current.amount,
    currency: current.currency,
    payment_method: current.payment_method,
    purchase_date: current.purchase_date,
    due_date: current.due_date,
    next_charge_at: current.next_charge_at,
    expires_at: current.expires_at,
    subscription_period: current.subscription_period,
    order_reference: current.order_reference,
    card_brand: current.card_brand,
    card_last_digits: current.card_last_digits,
    cancellation_reason: current.cancellation_reason,
    provider_sync_status: current.provider_sync_status,
  }];
}

function buildSubscriptionResponse(subscriptionRow, userRow, eventRows = []) {
  const details = readSubscriptionDetails(subscriptionRow?.metadata || {});
  const derivedDetails = subscriptionRow ? buildCurrentSubscriptionDetails(subscriptionRow, details) : null;
  const current = subscriptionRow
    ? {
        id: String(subscriptionRow.id || ''),
        status: asCleanString(subscriptionRow.status),
        user_status: asCleanString(userRow?.status_da_assinatura),
        plan_type: asCleanString(subscriptionRow.plan_type),
        provider: asCleanString(subscriptionRow.provider) || 'manual',
        starts_at: derivedDetails?.starts_at || null,
        expires_at: derivedDetails?.expires_at || null,
        updated_at: asIsoDate(subscriptionRow.updated_at),
        updated_by_webhook_at: asIsoDate(subscriptionRow.updated_by_webhook_at),
        external_customer_id: asCleanString(subscriptionRow.external_customer_id),
        external_subscription_id: asCleanString(subscriptionRow.external_subscription_id) || details.external_subscription_id,
        product_name: derivedDetails?.product_name || null,
        offer_name: derivedDetails?.offer_name || null,
        amount: details.amount,
        currency: details.currency,
        payment_method: details.payment_method,
        purchase_date: derivedDetails?.purchase_date || null,
        due_date: derivedDetails?.due_date || null,
        next_charge_at: derivedDetails?.next_charge_at || null,
        subscription_period: derivedDetails?.subscription_period || null,
        order_reference: details.order_reference,
        card_brand: details.card_brand,
        card_last_digits: details.card_last_digits,
        cancellation_reason: details.cancellation_reason,
        provider_sync_status: details.provider_sync_status,
      }
    : userRow
      ? {
          id: null,
          status: null,
          user_status: asCleanString(userRow.status_da_assinatura),
          plan_type: null,
          provider: null,
          starts_at: null,
          expires_at: null,
          updated_at: asIsoDate(userRow.updated_at),
          updated_by_webhook_at: null,
          external_customer_id: null,
          external_subscription_id: null,
          product_name: null,
          offer_name: null,
          amount: null,
          currency: 'BRL',
          payment_method: null,
          purchase_date: null,
          due_date: null,
          next_charge_at: null,
          subscription_period: null,
          order_reference: null,
          card_brand: null,
          card_last_digits: null,
          cancellation_reason: null,
          provider_sync_status: null,
        }
      : null;

  const history = (Array.isArray(eventRows) ? eventRows : []).map((eventRow) => {
    const eventPayload = isPlainObject(eventRow.payload) ? eventRow.payload : {};
    const eventDetails = readSubscriptionDetails(eventPayload);

    return {
      id: String(eventRow.id || eventRow.event_id || crypto.randomUUID()),
      provider: asCleanString(eventRow.provider) || 'manual',
      event_id: asCleanString(eventRow.event_id),
      event_type: asCleanString(eventRow.event_type),
      label: prettifySubscriptionEvent(eventRow.event_type),
      processing_status: asCleanString(eventRow.processing_status) || 'processed',
      occurred_at: asIsoDate(eventRow.processed_at) || asIsoDate(eventRow.created_at),
      created_at: asIsoDate(eventRow.created_at),
      status: eventDetails.status,
      plan_type: current?.plan_type || null,
      product_name: eventDetails.product_name,
      offer_name: eventDetails.offer_name,
      amount: eventDetails.amount,
      currency: eventDetails.currency,
      payment_method: eventDetails.payment_method,
      purchase_date: eventDetails.purchase_date,
      due_date: eventDetails.due_date,
      next_charge_at: eventDetails.next_charge_at,
      expires_at: eventDetails.expires_at,
      subscription_period: eventDetails.subscription_period,
      order_reference: eventDetails.order_reference,
      card_brand: eventDetails.card_brand,
      card_last_digits: eventDetails.card_last_digits,
      cancellation_reason: eventDetails.cancellation_reason,
      provider_sync_status: eventDetails.provider_sync_status,
    };
  });

  const normalizedHistory = history.length > 0 ? history : buildSyntheticSubscriptionHistory(current);

  return {
    current,
    history: normalizedHistory,
    capabilities: buildSubscriptionCapability(current),
  };
}

async function readAccountSubscriptionViaSupabase(userId) {
  const [subscriptionResponse, userResponse, historyResponse] = await Promise.all([
    supabaseAdminClient
      .from('subscriptions')
      .select('id, user_id, status, plan_type, provider, external_customer_id, external_subscription_id, starts_at, expires_at, metadata, updated_by_webhook_at, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdminClient
      .from('usuarios')
      .select('user_id, status_da_assinatura, email, updated_at, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdminClient
      .from('subscription_webhook_events')
      .select('id, provider, event_id, event_type, payload, processing_status, created_at, processed_at')
      .eq('matched_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
  ]);

  if (subscriptionResponse.error) {
    throw createSupabaseFallbackError(subscriptionResponse.error, 'Erro ao carregar assinatura atual');
  }

  if (userResponse.error) {
    throw createSupabaseFallbackError(userResponse.error, 'Erro ao carregar status do usuário');
  }

  if (historyResponse.error) {
    throw createSupabaseFallbackError(historyResponse.error, 'Erro ao carregar histórico de assinatura');
  }

  return buildSubscriptionResponse(subscriptionResponse.data || null, userResponse.data || null, historyResponse.data || []);
}

async function readAccountSubscription(userId) {
  return withDatabaseFallback(
    'readAccountSubscription',
    async () => {
      const [subscriptionResult, userResult, historyResult] = await Promise.all([
        pool.query(
          `
          SELECT id, user_id, status, plan_type, provider, external_customer_id, external_subscription_id, starts_at, expires_at, metadata, updated_by_webhook_at, created_at, updated_at
          FROM public.subscriptions
          WHERE user_id = $1
          LIMIT 1
          `,
          [userId]
        ),
        pool.query(
          `
          SELECT user_id, status_da_assinatura, email, updated_at, created_at
          FROM public.usuarios
          WHERE user_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          `,
          [userId]
        ),
        pool.query(
          `
          SELECT id, provider, event_id, event_type, payload, processing_status, created_at, processed_at
          FROM public.subscription_webhook_events
          WHERE matched_user_id = $1
          ORDER BY created_at DESC NULLS LAST
          LIMIT 20
          `,
          [userId]
        )
      ]);

      return buildSubscriptionResponse(
        subscriptionResult.rows?.[0] || null,
        userResult.rows?.[0] || null,
        historyResult.rows || []
      );
    },
    () => readAccountSubscriptionViaSupabase(userId)
  );
}

async function attemptCaktoRemoteCancellation(current, context = {}) {
  const provider = String(current?.provider || '').trim().toLowerCase();
  if (provider !== 'cakto') {
    return { attempted: false, ok: false, status: 'provider_not_supported' };
  }

  const externalSubscriptionId = String(current?.external_subscription_id || '').trim();
  const externalCustomerId = String(current?.external_customer_id || '').trim();
  const endpointTemplate = String(process.env.CAKTO_CANCEL_ENDPOINT_TEMPLATE || '').trim();
  const endpointBase = String(process.env.CAKTO_CANCEL_ENDPOINT || '').trim();
  const apiToken = String(process.env.CAKTO_API_TOKEN || process.env.CAKTO_API_KEY || '').trim();

  if (!apiToken) {
    return { attempted: false, ok: false, status: 'provider_api_not_configured' };
  }

  let endpoint = endpointBase;
  if (endpointTemplate) {
    endpoint = endpointTemplate
      .replace('{subscriptionId}', encodeURIComponent(externalSubscriptionId))
      .replace('{customerId}', encodeURIComponent(externalCustomerId));
  }

  if (!endpoint) {
    return { attempted: false, ok: false, status: 'provider_api_not_configured' };
  }

  if (!externalSubscriptionId && !externalCustomerId) {
    return { attempted: false, ok: false, status: 'missing_provider_subscription_id' };
  }

  const method = String(process.env.CAKTO_CANCEL_METHOD || 'POST').trim().toUpperCase();

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
        'x-api-key': apiToken,
      },
      body: JSON.stringify({
        subscription_id: externalSubscriptionId || null,
        customer_id: externalCustomerId || null,
        reason: context.reason || null,
        user_id: context.userId || null,
        email: context.email || null,
      }),
    });

    const rawText = await response.text();
    let parsedBody = null;
    try {
      parsedBody = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsedBody = rawText || null;
    }

    return {
      attempted: true,
      ok: response.ok,
      status: response.ok ? 'synced' : 'provider_error',
      http_status: response.status,
      response: parsedBody,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: 'provider_request_failed',
      error: error instanceof Error ? error.message : 'Falha ao cancelar no provedor',
    };
  }
}

async function cancelAccountSubscriptionViaSupabase(userId, payload = {}) {
  const currentState = await readAccountSubscriptionViaSupabase(userId);
  const current = currentState.current;
  const existingSubscriptionResponse = await supabaseAdminClient
    .from('subscriptions')
    .select('metadata')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingSubscriptionResponse.error) {
    throw createSupabaseFallbackError(existingSubscriptionResponse.error, 'Erro ao ler metadados atuais da assinatura');
  }

  const userEmail = asCleanString(payload.email) || null;
  const reason = asCleanString(payload.reason) || 'user_requested_cancellation';
  const remoteSync = await attemptCaktoRemoteCancellation(current, {
    userId,
    email: userEmail,
    reason,
  });
  const nowIso = new Date().toISOString();
  const metadataPatch = {
    manual_cancellation: {
      canceled_at: nowIso,
      reason,
      provider_sync: remoteSync,
    },
  };

  const currentMetadata = isPlainObject(existingSubscriptionResponse.data?.metadata)
    ? existingSubscriptionResponse.data.metadata
    : {};
  const nextMetadata = {
    ...currentMetadata,
    ...metadataPatch,
  };

  const subscriptionResponse = await supabaseAdminClient
    .from('subscriptions')
    .upsert([
      {
        user_id: userId,
        status: 'cancelled',
        plan_type: current?.plan_type || 'basic',
        provider: current?.provider || 'manual',
        external_customer_id: current?.external_customer_id || null,
        external_subscription_id: current?.external_subscription_id || null,
        starts_at: current?.starts_at || nowIso,
        expires_at: nowIso,
        metadata: nextMetadata,
        updated_by_webhook_at: nowIso,
        updated_at: nowIso,
      }
    ], { onConflict: 'user_id' });

  if (subscriptionResponse.error) {
    throw createSupabaseFallbackError(subscriptionResponse.error, 'Erro ao cancelar assinatura');
  }

  const usuarioResponse = await supabaseAdminClient
    .from('usuarios')
    .upsert([
      {
        user_id: userId,
        email: userEmail,
        status_da_assinatura: 'inativo',
        updated_at: nowIso,
      }
    ], { onConflict: 'user_id' });

  if (usuarioResponse.error) {
    throw createSupabaseFallbackError(usuarioResponse.error, 'Erro ao atualizar status do usuário');
  }

  const historyResponse = await supabaseAdminClient
    .from('subscription_webhook_events')
    .insert([
      {
        provider: current?.provider || 'manual',
        event_id: crypto.randomUUID(),
        event_type: 'user_subscription_canceled',
        payload: {
          manual_cancellation: {
            canceled_at: nowIso,
            reason,
            provider_sync: remoteSync,
          },
          current_subscription: current,
        },
        processing_status: 'processed',
        matched_user_id: userId,
        processed_at: nowIso,
      }
    ]);

  if (historyResponse.error) {
    throw createSupabaseFallbackError(historyResponse.error, 'Erro ao registrar histórico de cancelamento');
  }

  const updatedState = await readAccountSubscriptionViaSupabase(userId);
  return {
    success: true,
    current: updatedState.current,
    history: updatedState.history,
    capabilities: updatedState.capabilities,
    cancellation: {
      executed_at: nowIso,
      access_revoked: true,
      remote_sync: remoteSync,
    },
  };
}

async function cancelAccountSubscription(userId, payload = {}) {
  return withDatabaseFallback(
    'cancelAccountSubscription',
    async () => {
      const currentState = await readAccountSubscription(userId);
      const current = currentState.current;
      const reason = asCleanString(payload.reason) || 'user_requested_cancellation';
      const userEmail = asCleanString(payload.email) || null;
      const remoteSync = await attemptCaktoRemoteCancellation(current, {
        userId,
        email: userEmail,
        reason,
      });
      const nowIso = new Date().toISOString();
      const metadataPatch = JSON.stringify({
        manual_cancellation: {
          canceled_at: nowIso,
          reason,
          provider_sync: remoteSync,
        },
      });

      await pool.query(
        `
        INSERT INTO public.subscriptions (
          user_id,
          status,
          plan_type,
          provider,
          external_customer_id,
          external_subscription_id,
          starts_at,
          expires_at,
          metadata,
          updated_by_webhook_at,
          updated_at
        )
        VALUES (
          $1,
          'cancelled',
          $2,
          $3,
          $4,
          $5,
          COALESCE($6::timestamptz, NOW()),
          NOW(),
          $7::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT (user_id) DO UPDATE
        SET status = 'cancelled',
            plan_type = COALESCE(EXCLUDED.plan_type, public.subscriptions.plan_type),
            provider = COALESCE(EXCLUDED.provider, public.subscriptions.provider),
            external_customer_id = COALESCE(EXCLUDED.external_customer_id, public.subscriptions.external_customer_id),
            external_subscription_id = COALESCE(EXCLUDED.external_subscription_id, public.subscriptions.external_subscription_id),
            expires_at = NOW(),
            metadata = COALESCE(public.subscriptions.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_by_webhook_at = NOW(),
            updated_at = NOW()
        `,
        [
          userId,
          current?.plan_type || 'basic',
          current?.provider || 'manual',
          current?.external_customer_id || null,
          current?.external_subscription_id || null,
          current?.starts_at || null,
          metadataPatch,
        ]
      );

      await pool.query(
        `
        INSERT INTO public.usuarios (user_id, email, status_da_assinatura, updated_at)
        VALUES ($1, $2, 'inativo', NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET email = COALESCE(EXCLUDED.email, public.usuarios.email),
            status_da_assinatura = 'inativo',
            updated_at = NOW()
        `,
        [userId, userEmail]
      );

      await pool.query(
        `
        INSERT INTO public.subscription_webhook_events (
          provider,
          event_id,
          event_type,
          payload,
          processing_status,
          matched_user_id,
          processed_at
        )
        VALUES ($1, $2, 'user_subscription_canceled', $3::jsonb, 'processed', $4, NOW())
        `,
        [
          current?.provider || 'manual',
          crypto.randomUUID(),
          JSON.stringify({
            manual_cancellation: {
              canceled_at: nowIso,
              reason,
              provider_sync: remoteSync,
            },
            current_subscription: current,
          }),
          userId,
        ]
      );

      const updatedState = await readAccountSubscription(userId);
      return {
        success: true,
        current: updatedState.current,
        history: updatedState.history,
        capabilities: updatedState.capabilities,
        cancellation: {
          executed_at: nowIso,
          access_revoked: true,
          remote_sync: remoteSync,
        },
      };
    },
    () => cancelAccountSubscriptionViaSupabase(userId, payload)
  );
}

function ensureSupabaseAdminAvailable() {
  if (!supabaseAdminClient) {
    throw new Error('Supabase admin client não configurado para fallback de conversas.');
  }

  return supabaseAdminClient;
}

const ADMIN_CREATED_PLAN_TYPE = ['basic', 'premium', 'enterprise'].includes(String(process.env.ADMIN_CREATED_PLAN_TYPE || '').trim().toLowerCase())
  ? String(process.env.ADMIN_CREATED_PLAN_TYPE || '').trim().toLowerCase()
  : 'premium';

function normalizeManagedPlanType(raw) {
  const normalized = String(raw || '').trim().toLowerCase();
  return ['basic', 'premium', 'enterprise'].includes(normalized) ? normalized : ADMIN_CREATED_PLAN_TYPE;
}

function parseManagedAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { logradouro: null, numero: null, complemento: null };
  }

  const [basePart, complementoPart] = raw.split(/\s+-0?| /).length > 1
    ? [raw.split(/\s+-0?| /)[0], raw.split(/\s+-0?| /).slice(1).join(' - ')]
    : raw.split(/\s+-0?| /);

  const dashSplit = raw.split(/\s+-0?| /);
  const normalizedBase = String(dashSplit[0] || '').trim();
  const complemento = dashSplit.length > 1 ? dashSplit.slice(1).join(' - ').trim() || null : null;

  const commaIndex = normalizedBase.lastIndexOf(',');
  if (commaIndex === -1) {
    return {
      logradouro: normalizedBase || null,
      numero: null,
      complemento,
    };
  }

  const possibleNumero = normalizedBase.slice(commaIndex + 1).trim();
  const logradouro = normalizedBase.slice(0, commaIndex).trim();

  if (!possibleNumero || possibleNumero.length > 20) {
    return {
      logradouro: normalizedBase || null,
      numero: null,
      complemento,
    };
  }

  return {
    logradouro: logradouro || null,
    numero: possibleNumero || null,
    complemento,
  };
}

function parseManagedAddressSafe(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { logradouro: null, numero: null, complemento: null };
  }

  const dashSplit = raw.split(/\s+-\s+/);
  const normalizedBase = String(dashSplit[0] || '').trim();
  const complemento = dashSplit.length > 1 ? dashSplit.slice(1).join(' - ').trim() || null : null;

  const commaIndex = normalizedBase.lastIndexOf(',');
  if (commaIndex === -1) {
    return {
      logradouro: normalizedBase || null,
      numero: null,
      complemento,
    };
  }

  const possibleNumero = normalizedBase.slice(commaIndex + 1).trim();
  const logradouro = normalizedBase.slice(0, commaIndex).trim();

  if (!possibleNumero || possibleNumero.length > 20) {
    return {
      logradouro: normalizedBase || null,
      numero: null,
      complemento,
    };
  }

  return {
    logradouro: logradouro || null,
    numero: possibleNumero || null,
    complemento,
  };
}

function isMissingAppSettingsRelation(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return message.includes('app_settings') || code === 'pgrst205' || code === '42p01';
}

async function ensureAppSettingsTable() {
  if (!hasDatabaseUrl) {
    return;
  }

  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS public.app_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      facebook_pixel_id text,
      facebook_capi_token text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

async function readAppSettingsViaSupabase() {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('app_settings')
    .select('facebook_pixel_id, facebook_capi_token')
    .limit(1)
    .maybeSingle();

  if (response.error) {
    if (isMissingAppSettingsRelation(response.error)) {
      return { facebook_pixel_id: null, facebook_capi_token: null };
    }

    throw createSupabaseFallbackError(response.error, 'Erro ao carregar app_settings');
  }

  return response.data || { facebook_pixel_id: null, facebook_capi_token: null };
}

async function readAppSettings() {
  return withDatabaseFallback(
    'readAppSettings',
    async () => {
      await ensureAppSettingsTable();
      const result = await pool.query(
        `
        SELECT facebook_pixel_id, facebook_capi_token
        FROM public.app_settings
        ORDER BY created_at ASC
        LIMIT 1
        `
      );

      return result.rows?.[0] || { facebook_pixel_id: null, facebook_capi_token: null };
    },
    () => readAppSettingsViaSupabase()
  );
}

async function saveAppSettingsViaSupabase(payload = {}) {
  const client = ensureSupabaseAdminAvailable();
  const updateData = {
    facebook_pixel_id: String(payload.facebook_pixel_id || '').trim() || null,
    facebook_capi_token: String(payload.facebook_capi_token || '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const existing = await client
    .from('app_settings')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing.error && !isMissingAppSettingsRelation(existing.error)) {
    throw createSupabaseFallbackError(existing.error, 'Erro ao carregar app_settings para salvar');
  }

  if (existing.error && isMissingAppSettingsRelation(existing.error)) {
    return { ...updateData };
  }

  if (existing.data?.id) {
    const response = await client
      .from('app_settings')
      .update(updateData)
      .eq('id', existing.data.id)
      .select('facebook_pixel_id, facebook_capi_token')
      .single();

    if (response.error) {
      throw createSupabaseFallbackError(response.error, 'Erro ao atualizar app_settings');
    }

    return response.data;
  }

  const response = await client
    .from('app_settings')
    .insert([updateData])
    .select('facebook_pixel_id, facebook_capi_token')
    .single();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao inserir app_settings');
  }

  return response.data;
}

async function saveAppSettings(payload = {}) {
  return withDatabaseFallback(
    'saveAppSettings',
    async () => {
      await ensureAppSettingsTable();

      const updateData = {
        facebook_pixel_id: String(payload.facebook_pixel_id || '').trim() || null,
        facebook_capi_token: String(payload.facebook_capi_token || '').trim() || null,
      };

      const existing = await pool.query('SELECT id FROM public.app_settings ORDER BY created_at ASC LIMIT 1');

      if (existing.rows?.[0]?.id) {
        const result = await pool.query(
          `
          UPDATE public.app_settings
          SET facebook_pixel_id = $2,
              facebook_capi_token = $3,
              updated_at = NOW()
          WHERE id = $1
          RETURNING facebook_pixel_id, facebook_capi_token
          `,
          [existing.rows[0].id, updateData.facebook_pixel_id, updateData.facebook_capi_token]
        );

        return result.rows[0] || { facebook_pixel_id: null, facebook_capi_token: null };
      }

      const inserted = await pool.query(
        `
        INSERT INTO public.app_settings (facebook_pixel_id, facebook_capi_token)
        VALUES ($1, $2)
        RETURNING facebook_pixel_id, facebook_capi_token
        `,
        [updateData.facebook_pixel_id, updateData.facebook_capi_token]
      );

      return inserted.rows[0] || { facebook_pixel_id: null, facebook_capi_token: null };
    },
    () => saveAppSettingsViaSupabase(payload)
  );
}

async function listAdminUsersViaSupabase() {
  const client = ensureSupabaseAdminAvailable();
  let authUsers = [];
  let authUsersAvailable = false;

  // Try auth.admin.listUsers — requires service_role key (JWT).
  // When the key is invalid / anon key fallback, Supabase returns "User not allowed".
  try {
    let page = 1;
    while (true) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        throw new Error(error.message || 'Erro ao listar usuários de autenticação');
      }

      const currentPageUsers = data?.users || [];
      authUsers.push(...currentPageUsers);

      if (currentPageUsers.length < 200) {
        break;
      }

      page += 1;
    }
    authUsersAvailable = true;
  } catch (authListError) {
    console.warn('[ADMIN][DASHBOARD] auth.admin.listUsers indisponível (service_role key inválida?), usando fallback via tabelas profiles+usuarios:', authListError?.message);
    authUsers = [];
    authUsersAvailable = false;
  }

  const [profilesResponse, subscriptionsResponse, usuariosPrimaryResponse] = await Promise.all([
    client.from('profiles').select('id, first_name, last_name, avatar_url, role, updated_at, created_at'),
    client.from('subscriptions').select('user_id, status, plan_type, starts_at, expires_at, metadata, created_at, updated_at'),
    client.from('usuarios').select('user_id, status_da_assinatura, documento, telefone, nome_completo, email, ramos_atuacao, cep, logradouro, numero, complemento, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em, created_at')
  ]);

  let usuariosRows = usuariosPrimaryResponse.data || [];
  if (usuariosPrimaryResponse.error) {
    const fallbackUsuariosResponse = await client
      .from('usuarios')
      .select('user_id, status_da_assinatura, documento, telefone, nome_completo, email');

    if (fallbackUsuariosResponse.error) {
      throw new Error(fallbackUsuariosResponse.error.message || 'Erro ao listar usuários');
    }

    usuariosRows = fallbackUsuariosResponse.data || [];
  }

  if (profilesResponse.error) {
    throw new Error(profilesResponse.error.message || 'Erro ao listar perfis');
  }

  if (subscriptionsResponse.error) {
    throw new Error(subscriptionsResponse.error.message || 'Erro ao listar assinaturas');
  }

  const profilesById = new Map((profilesResponse.data || []).map((profile) => [String(profile.id), profile]));
  const usuariosById = new Map((usuariosRows || []).map((usuario) => [String(usuario.user_id), usuario]));
  const subscriptionsById = new Map((subscriptionsResponse.data || []).map((subscription) => [String(subscription.user_id), subscription]));

  // When auth.admin.listUsers is available, use auth users as the base list
  if (authUsersAvailable && authUsers.length > 0) {
    return authUsers
      .map((authUser) => {
        const userId = String(authUser.id || '').trim();
        const profile = profilesById.get(userId) || {};
        const usuario = usuariosById.get(userId) || {};
        const subscription = subscriptionsById.get(userId) || {};
        const userMetadata = authUser.user_metadata || {};
        const parsedAddress = parseManagedAddressSafe(usuario.logradouro || null);
        const accountStoredFields = extractAccountStoredFields(usuario.ramos_atuacao);

        return {
          id: userId,
          email: String(authUser.email || usuario.email || '').trim() || null,
          created_at: authUser.created_at || null,
          last_sign_in_at: authUser.last_sign_in_at || null,
          first_name: profile.first_name || userMetadata.first_name || null,
          last_name: profile.last_name || userMetadata.last_name || null,
          role: String(profile.role || userMetadata.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
          avatar_url: profile.avatar_url || null,
          status_da_assinatura: String(usuario.status_da_assinatura || '').trim() || null,
          documento: usuario.documento || null,
          telefone: usuario.telefone || null,
          profissao: accountStoredFields.profissao,
          ramos_atuacao: accountStoredFields.practiceAreas,
          cep: usuario.cep || null,
          logradouro: usuario.logradouro ? (parsedAddress.logradouro || usuario.logradouro) : null,
          numero: usuario.numero || parsedAddress.numero,
          complemento: usuario.complemento || parsedAddress.complemento,
          bairro: usuario.bairro || null,
          cidade: usuario.cidade || null,
          estado: usuario.estado || null,
          regiao: usuario.regiao || null,
          sexo: usuario.sexo || null,
          idade: Number.isFinite(Number(usuario.idade)) ? Number(usuario.idade) : null,
          data_nascimento: usuario.data_nascimento || null,
          origem_cadastro: usuario.origem_cadastro || null,
          cadastro_finalizado_em: usuario.cadastro_finalizado_em || null,
          plan_type: subscription.plan_type || null,
          subscription_status: subscription.status || null,
          subscription_starts_at: subscription.starts_at || null,
          subscription_expires_at: subscription.expires_at || null,
          subscription_created_at: subscription.created_at || null,
          subscription_updated_at: subscription.updated_at || null,
          subscription_metadata: isPlainObject(subscription.metadata) ? subscription.metadata : null,
          nome_completo: usuario.nome_completo || userMetadata.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null,
        };
      })
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  // Fallback: build user list from profiles + usuarios tables (no auth.admin required)
  const allUserIds = new Set();
  for (const profile of (profilesResponse.data || [])) {
    allUserIds.add(String(profile.id));
  }
  for (const usuario of usuariosRows) {
    if (usuario.user_id) allUserIds.add(String(usuario.user_id));
  }

  return [...allUserIds]
    .map((userId) => {
      const profile = profilesById.get(userId) || {};
      const usuario = usuariosById.get(userId) || {};
      const subscription = subscriptionsById.get(userId) || {};
      const parsedAddress = parseManagedAddressSafe(usuario.logradouro || null);
      const accountStoredFields = extractAccountStoredFields(usuario.ramos_atuacao);

      return {
        id: userId,
        email: String(usuario.email || '').trim() || null,
        created_at: profile.created_at || usuario.created_at || null,
        last_sign_in_at: null,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        role: String(profile.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
        avatar_url: profile.avatar_url || null,
        status_da_assinatura: String(usuario.status_da_assinatura || '').trim() || null,
        documento: usuario.documento || null,
        telefone: usuario.telefone || null,
        profissao: accountStoredFields.profissao,
        ramos_atuacao: accountStoredFields.practiceAreas,
        cep: usuario.cep || null,
        logradouro: usuario.logradouro ? (parsedAddress.logradouro || usuario.logradouro) : null,
        numero: usuario.numero || parsedAddress.numero,
        complemento: usuario.complemento || parsedAddress.complemento,
        bairro: usuario.bairro || null,
        cidade: usuario.cidade || null,
        estado: usuario.estado || null,
        regiao: usuario.regiao || null,
        sexo: usuario.sexo || null,
        idade: Number.isFinite(Number(usuario.idade)) ? Number(usuario.idade) : null,
        data_nascimento: usuario.data_nascimento || null,
        origem_cadastro: usuario.origem_cadastro || null,
        cadastro_finalizado_em: usuario.cadastro_finalizado_em || null,
        plan_type: subscription.plan_type || null,
        subscription_status: subscription.status || null,
        subscription_starts_at: subscription.starts_at || null,
        subscription_expires_at: subscription.expires_at || null,
        subscription_created_at: subscription.created_at || null,
        subscription_updated_at: subscription.updated_at || null,
        subscription_metadata: isPlainObject(subscription.metadata) ? subscription.metadata : null,
        nome_completo: usuario.nome_completo || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null,
      };
    })
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

const ADMIN_DASHBOARD_PERIODS = new Set(['today', '7d', '30d', 'all']);

function normalizeAdminDashboardPeriod(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ADMIN_DASHBOARD_PERIODS.has(normalized) ? normalized : 'all';
}

function startOfUtcDay(value) {
  const next = new Date(value);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function startOfUtcWeek(value) {
  const next = startOfUtcDay(value);
  const currentDay = next.getUTCDay();
  const offset = currentDay === 0 ? -6 : 1 - currentDay;
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

function startOfUtcMonth(value) {
  const next = new Date(value);
  next.setUTCDate(1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function addUtcDays(value, amount) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + Number(amount || 0));
  return next;
}

function addUtcHours(value, amount) {
  const next = new Date(value);
  next.setUTCHours(next.getUTCHours() + Number(amount || 0));
  return next;
}

function addUtcMonths(value, amount) {
  const next = new Date(value);
  next.setUTCMonth(next.getUTCMonth() + Number(amount || 0));
  return next;
}

function getAdminDashboardPeriodConfig(rawPeriod, now = new Date()) {
  const value = normalizeAdminDashboardPeriod(rawPeriod);

  if (value === 'today') {
    return {
      value,
      label: 'Hoje',
      metric_start: startOfUtcDay(now),
      new_users_start: startOfUtcDay(now),
      new_users_label: 'Hoje',
      active_users_start: startOfUtcDay(now),
      chart_granularity: 'hour',
      chart_bucket_count: 24,
    };
  }

  if (value === '7d') {
    const start = startOfUtcDay(addUtcDays(now, -6));
    return {
      value,
      label: 'Últimos 7 dias',
      metric_start: start,
      new_users_start: start,
      new_users_label: 'Últimos 7 dias',
      active_users_start: start,
      chart_granularity: 'day',
      chart_bucket_count: 7,
    };
  }

  if (value === '30d') {
    const start = startOfUtcDay(addUtcDays(now, -29));
    return {
      value,
      label: 'Últimos 30 dias',
      metric_start: start,
      new_users_start: start,
      new_users_label: 'Últimos 30 dias',
      active_users_start: start,
      chart_granularity: 'day',
      chart_bucket_count: 30,
    };
  }

  return {
    value,
    label: 'Todo o período',
    metric_start: null,
    new_users_start: startOfUtcWeek(now),
    new_users_label: 'Esta semana',
    active_users_start: null,
    chart_granularity: 'month',
    chart_bucket_count: 6,
  };
}

function getAdminDashboardBucketKey(value, granularity) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');

  if (granularity === 'hour') {
    return `${year}-${month}-${day}T${hour}`;
  }

  if (granularity === 'day') {
    return `${year}-${month}-${day}`;
  }

  return `${year}-${month}`;
}

function formatAdminDashboardBucketLabel(value, granularity) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  if (granularity === 'hour') {
    return `${String(date.getUTCHours()).padStart(2, '0')}h`;
  }

  if (granularity === 'day') {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).format(date).replace('.', '');
  }

  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function createAdminDashboardSeriesBuckets(periodConfig, now = new Date()) {
  const buckets = [];

  if (periodConfig.chart_granularity === 'hour') {
    let cursor = startOfUtcDay(now);
    for (let index = 0; index < periodConfig.chart_bucket_count; index += 1) {
      buckets.push({
        key: getAdminDashboardBucketKey(cursor, 'hour'),
        label: formatAdminDashboardBucketLabel(cursor, 'hour'),
        value: 0,
      });
      cursor = addUtcHours(cursor, 1);
    }
    return buckets;
  }

  if (periodConfig.chart_granularity === 'day') {
    let cursor = new Date(periodConfig.metric_start);
    for (let index = 0; index < periodConfig.chart_bucket_count; index += 1) {
      buckets.push({
        key: getAdminDashboardBucketKey(cursor, 'day'),
        label: formatAdminDashboardBucketLabel(cursor, 'day'),
        value: 0,
      });
      cursor = addUtcDays(cursor, 1);
    }
    return buckets;
  }

  let cursor = startOfUtcMonth(addUtcMonths(now, -(periodConfig.chart_bucket_count - 1)));
  for (let index = 0; index < periodConfig.chart_bucket_count; index += 1) {
    buckets.push({
      key: getAdminDashboardBucketKey(cursor, 'month'),
      label: formatAdminDashboardBucketLabel(cursor, 'month'),
      value: 0,
    });
    cursor = addUtcMonths(cursor, 1);
  }

  return buckets;
}

function normalizeAdminDashboardSubscriptionState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['approved', 'active', 'ativo', 'paid', 'premium', 'success', 'completed'].includes(normalized)) {
    return 'active';
  }

  if (['trial', 'teste'].includes(normalized)) {
    return 'trial';
  }

  if (['pending', 'pendente', 'waiting', 'awaiting_payment', 'waiting_payment', 'processing', 'created', 'pix_gerado', 'boleto_gerado'].includes(normalized)) {
    return 'pending';
  }

  if (['cancelled', 'canceled', 'cancelado'].includes(normalized)) {
    return 'cancelled';
  }

  if (['expired', 'expirado', 'vencido', 'ended', 'overdue'].includes(normalized)) {
    return 'expired';
  }

  if (['inactive', 'inativo'].includes(normalized)) {
    return 'inactive';
  }

  return normalized;
}

function normalizeAdminDashboardAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const normalized = amount > 999 ? amount / 100 : amount;
  return Number(normalized.toFixed(2));
}

function getAdminDashboardSubscriptionAmount(user) {
  const details = readSubscriptionDetails(isPlainObject(user?.subscription_metadata) ? user.subscription_metadata : {});
  return normalizeAdminDashboardAmount(details.amount);
}

function hasAdminDashboardCompletedProfile(user) {
  if (user?.cadastro_finalizado_em) {
    return true;
  }

  const hasName = Boolean(String(user?.nome_completo || `${user?.first_name || ''} ${user?.last_name || ''}`).trim());
  const hasContact = Boolean(String(user?.email || '').trim()) && Boolean(String(user?.telefone || '').trim());
  const hasDocument = Boolean(String(user?.documento || '').trim());
  const hasAddress = Boolean(String(user?.cidade || '').trim()) && Boolean(String(user?.estado || '').trim());
  return hasName && hasContact && hasDocument && hasAddress;
}

function getAdminDashboardSubscriptionBucket(user, now = new Date()) {
  const subscriptionState = normalizeAdminDashboardSubscriptionState(user?.subscription_status);
  const userState = normalizeAdminDashboardSubscriptionState(user?.status_da_assinatura);
  const planType = String(user?.plan_type || '').trim().toLowerCase();
  const expiresAt = asIsoDate(user?.subscription_expires_at);
  const expiresAtTime = expiresAt ? new Date(expiresAt).getTime() : null;

  if (planType === 'trial' || subscriptionState === 'trial' || userState === 'trial') {
    return 'trial';
  }

  if (subscriptionState === 'active' || userState === 'active') {
    return 'active';
  }

  if (subscriptionState === 'cancelled' || userState === 'cancelled') {
    return 'cancelled';
  }

  if (subscriptionState === 'expired' || userState === 'expired') {
    return 'expired';
  }

  if (subscriptionState === 'inactive' || userState === 'inactive') {
    return expiresAtTime && expiresAtTime < now.getTime() ? 'expired' : 'cancelled';
  }

  if (expiresAtTime && expiresAtTime < now.getTime() && subscriptionState !== 'pending') {
    return 'expired';
  }

  return 'free';
}

function isAdminDashboardPendingPayment(user) {
  const subscriptionState = normalizeAdminDashboardSubscriptionState(user?.subscription_status);
  const userState = normalizeAdminDashboardSubscriptionState(user?.status_da_assinatura);
  return subscriptionState === 'pending' || userState === 'pending';
}

function isAdminDashboardActiveUser(user, periodConfig) {
  const lastSignInAt = asIsoDate(user?.last_sign_in_at);
  if (!lastSignInAt) {
    return false;
  }

  if (!periodConfig.active_users_start) {
    return true;
  }

  return new Date(lastSignInAt).getTime() >= periodConfig.active_users_start.getTime();
}

function isAdminDashboardNewUser(user, periodConfig) {
  const createdAt = asIsoDate(user?.created_at);
  if (!createdAt || !periodConfig.new_users_start) {
    return false;
  }

  return new Date(createdAt).getTime() >= periodConfig.new_users_start.getTime();
}

function getAdminDashboardRevenueDate(user) {
  return asIsoDate(user?.subscription_starts_at)
    || asIsoDate(user?.subscription_created_at)
    || asIsoDate(user?.subscription_updated_at)
    || null;
}

function buildAdminDashboardTopBuckets(items, normalizeLabel, limit = 5) {
  const counts = new Map();

  for (const item of items) {
    const label = normalizeLabel(item);
    counts.set(label, Number(counts.get(label) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function getAdminDashboardAgeRange(user) {
  const age = Number(user?.idade);
  if (!Number.isFinite(age) || age <= 0) {
    return 'Nao informado';
  }

  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  if (age <= 64) return '55-64';
  return '65+';
}

function formatOriginLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Nao informado';
  return String(value).trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildAdminDashboardAudienceMetrics(users) {
  return {
    by_origin: buildAdminDashboardTopBuckets(users, (user) => formatOriginLabel(user?.origem_cadastro), 6),
    by_region: buildAdminDashboardTopBuckets(users, (user) => String(user?.regiao || 'Nao informado').trim() || 'Nao informado', 6),
    by_sex: buildAdminDashboardTopBuckets(users, (user) => {
      const normalized = String(user?.sexo || '').trim().toLowerCase();
      if (normalized === 'feminino') return 'Feminino';
      if (normalized === 'masculino') return 'Masculino';
      if (normalized === 'outro') return 'Outro';
      if (normalized === 'prefiro_nao_informar') return 'Prefiro nao informar';
      return 'Nao informado';
    }, 5),
    by_profession: buildAdminDashboardTopBuckets(users, (user) => String(user?.profissao || 'Nao informado').trim() || 'Nao informado', 8),
    by_age_range: buildAdminDashboardTopBuckets(users, (user) => getAdminDashboardAgeRange(user), 6),
  };
}

function getAdminDashboardActionWindowStart(periodConfig, now = new Date()) {
  if (periodConfig.metric_start) {
    return periodConfig.metric_start;
  }

  return addUtcDays(now, -30);
}

async function ensurePlatformActionEventsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.platform_action_events (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID,
      action TEXT NOT NULL,
      label TEXT,
      channel TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS platform_action_events_created_at_idx
    ON public.platform_action_events (created_at DESC);

    CREATE INDEX IF NOT EXISTS platform_action_events_user_id_idx
    ON public.platform_action_events (user_id);
  `);
}

function readPlatformActionEventsFromRuntime(windowStart) {
  const threshold = windowStart.getTime();

  return runtimeMonitor.recentEvents
    .filter((event) => {
      if (event.type !== 'platform_action') {
        return false;
      }

      const eventTime = new Date(event.timestamp).getTime();
      return Number.isFinite(eventTime) && eventTime >= threshold;
    })
    .map((event) => ({
      id: event.id,
      user_id: String(event.user_id || '').trim() || null,
      action: String(event.action || '').trim() || 'unknown',
      label: String(event.label || '').trim() || null,
      channel: String(event.channel || '').trim() || null,
      metadata: isPlainObject(event.metadata) ? event.metadata : null,
      created_at: event.timestamp,
    }));
}

async function listPlatformActionEvents(windowStart) {
  const runtimeRows = readPlatformActionEventsFromRuntime(windowStart);

  if (!hasDatabaseUrl) {
    return runtimeRows;
  }

  const startIso = windowStart.toISOString();

  const databaseRows = await withDatabaseFallback(
    'adminDashboardPlatformActions',
    async () => {
      await ensurePlatformActionEventsTable();
      const result = await pool.query(
        `
        SELECT id, user_id, action, label, channel, metadata, created_at
        FROM public.platform_action_events
        WHERE created_at >= $1
        ORDER BY created_at DESC
        LIMIT 500
        `,
        [startIso]
      );

      return result.rows || [];
    },
    async () => {
      if (!supabaseAdminClient) {
        return [];
      }

      const response = await supabaseAdminClient
        .from('platform_action_events')
        .select('id, user_id, action, label, channel, metadata, created_at')
        .gte('created_at', startIso)
        .order('created_at', { ascending: false })
        .limit(500);

      if (response.error) {
        if (isMissingRelationFromSchemaCacheError(response.error, 'platform_action_events')) {
          return [];
        }

        throw createSupabaseFallbackError(response.error, 'Erro ao carregar ações da plataforma');
      }

      return response.data || [];
    }
  );

  return databaseRows.length > 0 ? databaseRows : runtimeRows;
}

async function recordPlatformActionEvent({ userId, action, label, channel, metadata }) {
  const normalizedUserId = String(userId || '').trim() || null;
  const normalizedAction = String(action || '').trim().toLowerCase();
  const normalizedLabel = String(label || '').trim() || null;
  const normalizedChannel = String(channel || '').trim().toLowerCase() || null;
  const safeMetadata = isPlainObject(metadata) ? metadata : null;

  const runtimeEvent = pushRuntimeEvent('platform_action', {
    user_id: normalizedUserId,
    action: normalizedAction,
    label: normalizedLabel,
    channel: normalizedChannel,
    metadata: safeMetadata,
  });

  if (!normalizedAction || !hasDatabaseUrl) {
    return runtimeEvent;
  }

  return withDatabaseFallback(
    'recordPlatformActionEvent',
    async () => {
      await ensurePlatformActionEventsTable();
      const result = await pool.query(
        `
        INSERT INTO public.platform_action_events (user_id, action, label, channel, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, action, label, channel, metadata, created_at
        `,
        [normalizedUserId, normalizedAction, normalizedLabel, normalizedChannel, safeMetadata]
      );

      return result.rows?.[0] || runtimeEvent;
    },
    async () => {
      if (!supabaseAdminClient) {
        return runtimeEvent;
      }

      const response = await supabaseAdminClient
        .from('platform_action_events')
        .insert({
          user_id: normalizedUserId,
          action: normalizedAction,
          label: normalizedLabel,
          channel: normalizedChannel,
          metadata: safeMetadata,
        })
        .select('id, user_id, action, label, channel, metadata, created_at')
        .maybeSingle();

      if (response.error) {
        if (isMissingRelationFromSchemaCacheError(response.error, 'platform_action_events')) {
          return runtimeEvent;
        }

        throw createSupabaseFallbackError(response.error, 'Erro ao registrar ação da plataforma');
      }

      return response.data || runtimeEvent;
    }
  );
}

async function buildAdminDashboardActionMetrics(users, periodConfig, now = new Date()) {
  const windowStart = getAdminDashboardActionWindowStart(periodConfig, now);
  const rows = await listPlatformActionEvents(windowStart);
  const usersById = new Map(users.map((user) => [String(user.id || '').trim(), user]));
  const byAction = new Map();
  const byChannel = new Map();
  const uniqueUsers = new Set();

  for (const row of rows) {
    const action = String(row.action || 'unknown').trim() || 'unknown';
    const channel = String(row.channel || 'app').trim() || 'app';
    const userId = String(row.user_id || '').trim();

    byAction.set(action, Number(byAction.get(action) || 0) + 1);
    byChannel.set(channel, Number(byChannel.get(channel) || 0) + 1);
    if (userId) {
      uniqueUsers.add(userId);
    }
  }

  return {
    total_events: rows.length,
    active_users: uniqueUsers.size,
    by_action: [...byAction.entries()]
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 8)
      .map(([label, value]) => ({ label, value })),
    by_channel: [...byChannel.entries()]
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 6)
      .map(([label, value]) => ({ label, value })),
    recent_events: rows.slice(0, 10).map((row) => {
      const user = usersById.get(String(row.user_id || '').trim());
      const userName = user?.nome_completo
        || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
        || user?.email
        || 'Usuário';

      return {
        label: String(row.label || row.action || 'Ação').trim() || 'Ação',
        action: String(row.action || '').trim() || 'unknown',
        channel: String(row.channel || '').trim() || 'app',
        user_name: userName,
        created_at: row.created_at || null,
      };
    }),
  };
}

async function buildAdminDashboardSummary(periodValue) {
  const now = new Date();
  const periodConfig = getAdminDashboardPeriodConfig(periodValue, now);
  const users = await listAdminUsersViaSupabase();
  const totalUsers = users.length;
  const userGrowth = createAdminDashboardSeriesBuckets(periodConfig, now);
  const revenueGrowth = createAdminDashboardSeriesBuckets(periodConfig, now);
  const userGrowthByKey = new Map(userGrowth.map((bucket) => [bucket.key, bucket]));
  const revenueGrowthByKey = new Map(revenueGrowth.map((bucket) => [bucket.key, bucket]));

  const subscriptionStatus = {
    free: 0,
    trial: 0,
    active: 0,
    cancelled: 0,
    expired: 0,
  };

  let activeUsers = 0;
  let newUsers = 0;
  let pendingPayments = 0;
  let completedProfiles = 0;
  let mrr = 0;

  for (const user of users) {
    if (isAdminDashboardActiveUser(user, periodConfig)) {
      activeUsers += 1;
    }

    if (isAdminDashboardNewUser(user, periodConfig)) {
      newUsers += 1;
    }

    if (isAdminDashboardPendingPayment(user)) {
      pendingPayments += 1;
    }

    if (hasAdminDashboardCompletedProfile(user)) {
      completedProfiles += 1;
    }

    const bucket = getAdminDashboardSubscriptionBucket(user, now);
    if (bucket !== 'free') {
      subscriptionStatus[bucket] += 1;
    }

    const createdAt = asIsoDate(user?.created_at);
    const userGrowthKey = createdAt ? getAdminDashboardBucketKey(createdAt, periodConfig.chart_granularity) : null;
    if (userGrowthKey && userGrowthByKey.has(userGrowthKey)) {
      userGrowthByKey.get(userGrowthKey).value += 1;
    }

    const revenueDate = getAdminDashboardRevenueDate(user);
    const revenueAmount = getAdminDashboardSubscriptionAmount(user);
    const revenueBucketKey = revenueDate ? getAdminDashboardBucketKey(revenueDate, periodConfig.chart_granularity) : null;
    if (revenueAmount > 0 && revenueBucketKey && revenueGrowthByKey.has(revenueBucketKey)) {
      revenueGrowthByKey.get(revenueBucketKey).value = Number((revenueGrowthByKey.get(revenueBucketKey).value + revenueAmount).toFixed(2));
    }

    if (bucket === 'active') {
      mrr += revenueAmount;
    }
  }

  subscriptionStatus.free = Math.max(
    totalUsers - subscriptionStatus.trial - subscriptionStatus.active - subscriptionStatus.cancelled - subscriptionStatus.expired,
    0
  );

  const completedProfilesPercent = totalUsers > 0
    ? Number(((completedProfiles / totalUsers) * 100).toFixed(0))
    : 0;
  const conversionRate = totalUsers > 0
    ? Number(((subscriptionStatus.active / totalUsers) * 100).toFixed(0))
    : 0;
  const averageTicket = subscriptionStatus.active > 0
    ? Number((mrr / subscriptionStatus.active).toFixed(2))
    : 0;
  const inactiveUsers = Math.max(totalUsers - activeUsers, 0);
  const demographics = buildAdminDashboardAudienceMetrics(users);
  const actionMetrics = await buildAdminDashboardActionMetrics(users, periodConfig, now);

  return {
    period: periodConfig.value,
    period_label: periodConfig.label,
    new_users_label: periodConfig.new_users_label,
    generated_at: now.toISOString(),
    summary: {
      mrr: Number(mrr.toFixed(2)),
      total_users: totalUsers,
      active_users: activeUsers,
      new_users: newUsers,
      pending_payments: pendingPayments,
      subscription_status: subscriptionStatus,
      completed_profiles: {
        count: completedProfiles,
        percent: completedProfilesPercent,
      },
      quick_summary: {
        conversion_rate: conversionRate,
        average_ticket: averageTicket,
        inactive_users: inactiveUsers,
      },
      demographics,
      action_metrics: actionMetrics,
    },
    charts: {
      user_growth: userGrowth.map((bucket) => ({
        label: bucket.label,
        value: bucket.value,
      })),
      revenue: revenueGrowth.map((bucket) => ({
        label: bucket.label,
        value: Number(bucket.value.toFixed(2)),
      })),
    },
  };
}

async function createAdminUserViaSupabase(payload = {}) {
  const client = ensureSupabaseAdminAvailable();

  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.full_name || payload.fullName || '').trim();
  const role = String(payload.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  const password = String(payload.password || '');
  const documento = String(payload.documento || '').trim() || null;
  const telefone = String(payload.telefone || '').trim() || null;
  const profissao = normalizeAccountProfession(payload.profissao || payload.profession);
  const ramosAtuacao = Array.isArray(payload.practice_areas || payload.practiceAreas)
    ? (payload.practice_areas || payload.practiceAreas).map((item) => String(item || '').trim()).filter(Boolean)
    : String(payload.practice_areas || payload.practiceAreas || '').split(/[\n,;|]+/).map((item) => item.trim()).filter(Boolean);
  const cep = String(payload.cep || '').trim() || null;
  const logradouro = String(payload.logradouro || '').trim() || null;
  const numero = String(payload.numero || '').trim() || null;
  const complemento = String(payload.complemento || '').trim() || null;
  const bairro = String(payload.bairro || '').trim() || null;
  const cidade = String(payload.cidade || '').trim() || null;
  const estado = String(payload.estado || '').trim().toUpperCase() || null;
  const regiao = String(payload.regiao || '').trim() || null;
  const sexo = String(payload.sexo || '').trim() || null;
  const dataNascimento = String(payload.data_nascimento || payload.dataNascimento || '').trim() || null;
  const idade = calculateAccountAgeFromBirthDate(dataNascimento) ?? normalizeAccountAge(payload.idade);
  const lifetimeAccess = Boolean(payload.lifetime_access ?? payload.lifetimeAccess);
  const expiresAtRaw = String(payload.expires_at || payload.expiresAt || '').trim();
  const expiresAt = !lifetimeAccess && expiresAtRaw ? new Date(`${expiresAtRaw}T23:59:59`).toISOString() : null;
  const planType = normalizeManagedPlanType(payload.plan_type || payload.planType);
  const { firstName, lastName } = splitAccountFullName(fullName);

  if (!email || !password) {
    throw new Error('Email e senha são obrigatórios.');
  }

  if (password.length < 8) {
    throw new Error('Senha deve ter no mínimo 8 caracteres.');
  }

  const { data: newUser, error: createUserError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, role, full_name: fullName, profession: profissao },
  });

  if (createUserError || !newUser?.user?.id) {
    const errorMessage = String(createUserError?.message || 'Falha ao criar usuário').toLowerCase();
    if (errorMessage.includes('already') || errorMessage.includes('registered') || errorMessage.includes('duplicate')) {
      const conflictError = new Error('Um usuário com este email já está registrado.');
      conflictError.statusCode = 409;
      throw conflictError;
    }

    throw new Error(createUserError?.message || 'Falha ao criar usuário');
  }

  const userId = newUser.user.id;

  const profileResponse = await client
    .from('profiles')
    .upsert([{ id: userId, first_name: firstName, last_name: lastName, role, updated_at: new Date().toISOString() }], { onConflict: 'id' })
    .select('id, first_name, last_name, role')
    .maybeSingle();

  if (profileResponse.error) {
    await client.auth.admin.deleteUser(userId).catch(() => undefined);
    throw new Error(profileResponse.error.message || 'Falha ao atualizar perfil do usuário');
  }

  const usuarioResponse = await client
    .from('usuarios')
    .upsert({
      user_id: userId,
      email,
      nome_completo: fullName || [firstName, lastName].filter(Boolean).join(' ') || null,
      documento,
      telefone,
      ramos_atuacao: buildAccountStoredPracticeAreas(ramosAtuacao, profissao),
      cep,
      logradouro: logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      regiao,
      sexo,
      idade,
      data_nascimento: dataNascimento,
      origem_cadastro: 'cadastro_admin',
      cadastro_finalizado_em: new Date().toISOString(),
      status_da_assinatura: 'ativo',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (usuarioResponse.error) {
    await client.auth.admin.deleteUser(userId).catch(() => undefined);
    throw new Error(usuarioResponse.error.message || 'Falha ao criar registro do usuário');
  }

  const subscriptionResponse = await client
    .from('subscriptions')
    .upsert({
      user_id: userId,
      status: 'active',
      plan_type: planType,
      provider: 'manual',
      starts_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'user_id' });

  if (subscriptionResponse.error) {
    await client.auth.admin.deleteUser(userId).catch(() => undefined);
    throw new Error(subscriptionResponse.error.message || 'Falha ao criar assinatura do usuário');
  }

  return {
    message: 'Usuário criado com sucesso! O usuário já pode fazer login.',
    user: {
      id: userId,
      email,
      first_name: profileResponse.data?.first_name || firstName,
      last_name: profileResponse.data?.last_name || lastName,
      role: profileResponse.data?.role || role,
    },
  };
}

async function updateAdminUserViaSupabase(userId, payload = {}) {
  const client = ensureSupabaseAdminAvailable();
  const existingUserResponse = await client.auth.admin.getUserById(userId);
  if (existingUserResponse.error || !existingUserResponse.data?.user) {
    throw new Error(existingUserResponse.error?.message || 'Usuário não encontrado');
  }

  const existingUser = existingUserResponse.data.user;
  const email = String(payload.email || existingUser.email || '').trim().toLowerCase();
  const fullName = String(payload.full_name || payload.fullName || payload.nome_completo || '').trim();
  const role = String(payload.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  const documento = String(payload.documento || '').trim() || null;
  const telefone = String(payload.telefone || '').trim() || null;
  const profissao = normalizeAccountProfession(payload.profissao || payload.profession);
  const ramosAtuacao = Array.isArray(payload.practice_areas || payload.practiceAreas)
    ? (payload.practice_areas || payload.practiceAreas).map((item) => String(item || '').trim()).filter(Boolean)
    : String(payload.practice_areas || payload.practiceAreas || '').split(/[\n,;|]+/).map((item) => item.trim()).filter(Boolean);
  const cep = String(payload.cep || '').trim() || null;
  const logradouro = String(payload.logradouro || '').trim() || null;
  const numero = String(payload.numero || '').trim() || null;
  const complemento = String(payload.complemento || '').trim() || null;
  const bairro = String(payload.bairro || '').trim() || null;
  const cidade = String(payload.cidade || '').trim() || null;
  const estado = String(payload.estado || '').trim().toUpperCase() || null;
  const regiao = String(payload.regiao || '').trim() || null;
  const sexo = String(payload.sexo || '').trim() || null;
  const dataNascimento = String(payload.data_nascimento || payload.dataNascimento || '').trim() || null;
  const idade = calculateAccountAgeFromBirthDate(dataNascimento) ?? normalizeAccountAge(payload.idade);
  const lifetimeAccess = Boolean(payload.lifetime_access ?? payload.lifetimeAccess);
  const expiresAtRaw = String(payload.expires_at || payload.expiresAt || '').trim();
  const expiresAt = !lifetimeAccess && expiresAtRaw ? new Date(`${expiresAtRaw}T23:59:59`).toISOString() : null;
  const planType = normalizeManagedPlanType(payload.plan_type || payload.planType);
  const { firstName, lastName } = splitAccountFullName(fullName);
  const password = String(payload.password || '').trim();
  const nowIso = new Date().toISOString();

  const nextMetadata = {
    ...(existingUser.user_metadata || {}),
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    profession: profissao,
    role,
  };

  const authUpdatePayload = {
    email,
    user_metadata: nextMetadata,
    ...(password ? { password } : {}),
  };

  const authUpdateResponse = await client.auth.admin.updateUserById(userId, authUpdatePayload);
  if (authUpdateResponse.error) {
    const errorMessage = String(authUpdateResponse.error.message || '').toLowerCase();
    if (errorMessage.includes('already') || errorMessage.includes('registered') || errorMessage.includes('duplicate')) {
      const conflictError = new Error('Um usuário com este email já está registrado.');
      conflictError.statusCode = 409;
      throw conflictError;
    }

    throw new Error(authUpdateResponse.error.message || 'Falha ao atualizar usuário no Auth');
  }

  const profileResponse = await client
    .from('profiles')
    .upsert([{ id: userId, first_name: firstName, last_name: lastName, role, updated_at: nowIso }], { onConflict: 'id' })
    .select('id, first_name, last_name, role')
    .maybeSingle();

  if (profileResponse.error) {
    throw new Error(profileResponse.error.message || 'Falha ao atualizar perfil do usuário');
  }

  const usuarioResponse = await client
    .from('usuarios')
    .upsert({
      user_id: userId,
      email,
      nome_completo: fullName || [firstName, lastName].filter(Boolean).join(' ') || null,
      documento,
      telefone,
      ramos_atuacao: buildAccountStoredPracticeAreas(ramosAtuacao, profissao),
      cep,
      logradouro: logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      regiao,
      sexo,
      idade,
      data_nascimento: dataNascimento,
      origem_cadastro: 'cadastro_admin',
      cadastro_finalizado_em: nowIso,
      status_da_assinatura: 'ativo',
      updated_at: nowIso,
    }, { onConflict: 'user_id' });

  if (usuarioResponse.error) {
    throw new Error(usuarioResponse.error.message || 'Falha ao atualizar registro do usuário');
  }

  const subscriptionResponse = await client
    .from('subscriptions')
    .upsert({
      user_id: userId,
      status: 'active',
      plan_type: planType,
      provider: 'manual',
      starts_at: existingUser.created_at || nowIso,
      expires_at: expiresAt,
      updated_at: nowIso,
    }, { onConflict: 'user_id' });

  if (subscriptionResponse.error) {
    throw new Error(subscriptionResponse.error.message || 'Falha ao atualizar assinatura do usuário');
  }

  return {
    message: 'Usuário atualizado com sucesso!',
    user: await listAdminUsersViaSupabase().then((rows) => rows.find((row) => row.id === userId) || null),
  };
}

async function updateAdminUserRoleViaSupabase(userId, newRole) {
  const client = ensureSupabaseAdminAvailable();
  const role = String(newRole || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';

  const currentUser = await client.auth.admin.getUserById(userId);
  if (currentUser.error) {
    throw new Error(currentUser.error.message || 'Falha ao carregar usuário para atualizar papel');
  }

  const currentMetadata = currentUser.data?.user?.user_metadata || {};
  const updateAuthResponse = await client.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...currentMetadata,
      role,
    },
  });

  if (updateAuthResponse.error) {
    throw new Error(updateAuthResponse.error.message || 'Falha ao atualizar papel no Auth');
  }

  const profileResponse = await client
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, role')
    .single();

  if (profileResponse.error) {
    throw new Error(profileResponse.error.message || 'Falha ao atualizar papel do perfil');
  }

  return profileResponse.data;
}

async function updateAdminUserSubscriptionStatusViaSupabase(userId, newStatus) {
  const client = ensureSupabaseAdminAvailable();
  const normalizedStatus = String(newStatus || '').trim().toLowerCase() === 'ativo' ? 'ativo' : 'desativado';
  const subscriptionStatus = normalizedStatus === 'ativo' ? 'active' : 'inactive';
  const nowIso = new Date().toISOString();

  const usuarioResponse = await client
    .from('usuarios')
    .update({ status_da_assinatura: normalizedStatus, updated_at: nowIso })
    .eq('user_id', userId);

  if (usuarioResponse.error) {
    throw new Error(usuarioResponse.error.message || 'Falha ao atualizar status do usuário');
  }

  const existingSubscription = await client
    .from('subscriptions')
    .select('id, plan_type')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existingSubscription.error) {
    throw new Error(existingSubscription.error.message || 'Falha ao consultar assinatura atual');
  }

  const subscriptionResponse = await client
    .from('subscriptions')
    .upsert({
      user_id: userId,
      status: subscriptionStatus,
      plan_type: normalizeManagedPlanType(existingSubscription.data?.plan_type),
      provider: 'manual',
      updated_at: nowIso,
    }, { onConflict: 'user_id' });

  if (subscriptionResponse.error) {
    throw new Error(subscriptionResponse.error.message || 'Falha ao atualizar assinatura do usuário');
  }

  return { userId, status_da_assinatura: normalizedStatus, subscription_status: subscriptionStatus };
}

async function deleteAdminUserViaSupabase(userId) {
  const client = ensureSupabaseAdminAvailable();

  await client.from('subscription_webhook_events').delete().eq('matched_user_id', userId).then(() => undefined, () => undefined);
  await client.from('subscriptions').delete().eq('user_id', userId).then(() => undefined, () => undefined);
  await client.from('usuarios').delete().eq('user_id', userId).then(() => undefined, () => undefined);
  await client.from('profiles').delete().eq('id', userId).then(() => undefined, () => undefined);

  const response = await client.auth.admin.deleteUser(userId);
  if (response.error) {
    throw new Error(response.error.message || 'Falha ao excluir usuário');
  }

  return { success: true, userId };
}

async function listConversationsViaSupabase(userId, agentId = null) {
  const client = ensureSupabaseAdminAvailable();
  let query = client
    .from('conversations')
    .select('id, agent_id, user_id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (agentId) {
    query = query.eq('agent_id', agentId);
  }

  const response = await query;
  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao listar conversas');
  }

  return response.data || [];
}

async function createConversationViaSupabase(userId, title, agentId = null) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('conversations')
    .insert([{ user_id: userId, agent_id: agentId || null, title: title || 'New Chat' }])
    .select('id, agent_id, user_id, title, created_at, updated_at')
    .single();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao criar conversa');
  }

  return response.data;
}

async function getConversationViaSupabase(userId, conversationId) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('conversations')
    .select('id, agent_id, user_id, title, created_at, updated_at')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao carregar conversa');
  }

  return response.data || null;
}

async function listConversationMessagesViaSupabase(userId, conversationId) {
  const client = ensureSupabaseAdminAvailable();
  const conversation = await getConversationViaSupabase(userId, conversationId);
  if (!conversation) {
    return null;
  }

  const response = await client
    .from('messages')
    .select('id, conversation_id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao listar mensagens da conversa');
  }

  return response.data || [];
}

async function insertConversationMessageViaSupabase(conversationId, role, content) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('messages')
    .insert([{ conversation_id: conversationId, role, content }])
    .select('id, conversation_id, role, content, created_at')
    .single();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao salvar mensagem');
  }

  return response.data;
}

async function deleteConversationViaSupabase(userId, conversationId) {
  const client = ensureSupabaseAdminAvailable();
  const conversation = await getConversationViaSupabase(userId, conversationId);
  if (!conversation) {
    return false;
  }

  const response = await client
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao excluir conversa');
  }

  return true;
}

async function updateConversationTitleViaSupabase(userId, conversationId, title) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId)
    .select('id, agent_id, user_id, title, created_at, updated_at')
    .maybeSingle();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao renomear conversa');
  }

  return response.data || null;
}

async function clearAllConversationsViaSupabase(userId) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('conversations')
    .delete()
    .eq('user_id', userId);

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao limpar conversas');
  }

  return true;
}

async function deleteAgentConversationsViaSupabase(agentId) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('conversations')
    .delete()
    .eq('agent_id', agentId)
    .select('id');

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao excluir conversas do agente');
  }

  return response.data?.length || 0;
}

async function getAgentViaSupabase(agentId) {
  if (!agentId) {
    return null;
  }

  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .maybeSingle();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao carregar agente');
  }

  return response.data || null;
}

async function listAgentsViaSupabase() {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('agents')
    .select('id, title, description, link, category_ids, created_at, icon, user_id')
    .order('created_at', { ascending: false });

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao listar agentes');
  }

  return response.data || [];
}

async function updateAgentKnowledgeViaSupabase(agentId, attachments = [], extraLinks = []) {
  const client = ensureSupabaseAdminAvailable();
  const payload = {
    attachments: Array.isArray(attachments) ? attachments : [],
    extra_links: Array.isArray(extraLinks) ? extraLinks : [],
    updated_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await client
      .from('agents')
      .update(payload)
      .eq('id', agentId)
      .select('*')
      .maybeSingle();

    if (!response.error) {
      return response.data || null;
    }

    const missingColumn = extractMissingColumnFromSchemaCacheError(response.error);
    if (!missingColumn || !(missingColumn in payload)) {
      throw createSupabaseFallbackError(response.error, 'Erro ao atualizar base de conhecimento do agente');
    }

    delete payload[missingColumn];
  }

  throw new Error('Erro ao atualizar base de conhecimento do agente após múltiplas tentativas de compatibilidade.');
}

async function getAgentPythonCollectionIdViaSupabase(agentId) {
  const agent = await getAgentViaSupabase(agentId);
  return String(agent?.python_collection_id || '').trim();
}

async function listAgentsWithAttachmentsViaSupabase() {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('agents')
    .select('id, attachments')
    .not('attachments', 'is', null);

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao listar anexos dos agentes');
  }

  return (response.data || []).filter((agent) => Array.isArray(agent.attachments) && agent.attachments.length > 0);
}

async function deleteAgentDocumentsViaSupabase(agentId) {
  const client = ensureSupabaseAdminAvailable();
  await client.from('document_chunks').delete().eq('agent_id', agentId).then(() => undefined, () => undefined);
  await client.from('documents').delete().eq('agent_id', agentId).then(() => undefined, () => undefined);
}

async function insertAgentDocumentViaSupabase(agentId, title) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('documents')
    .insert([{ agent_id: agentId, title }])
    .select('id')
    .single();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao criar documento do agente');
  }

  return response.data?.id || null;
}

async function insertAgentDocumentChunksViaSupabase(agentId, documentId, chunks = []) {
  const client = ensureSupabaseAdminAvailable();
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return 0;
  }

  const batchSize = 200;
  let inserted = 0;

  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const rows = batch.map((content, offset) => ({
      agent_id: agentId,
      document_id: documentId,
      content,
      chunk_index: start + offset,
      embedding: null,
    }));

    const response = await client.from('document_chunks').insert(rows);
    if (response.error) {
      throw createSupabaseFallbackError(response.error, 'Erro ao salvar chunks do agente');
    }

    inserted += rows.length;
  }

  return inserted;
}

async function countAgentChunksViaSupabase(agentId) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId);

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao contar chunks do agente');
  }

  if (typeof response.count === 'number') {
    return Number(response.count || 0);
  }

  console.warn(`[SEARCH][SUPABASE] countAgentChunks sem count retornado para agente ${agentId}; executando probe de existencia.`);
  const probeResponse = await client
    .from('document_chunks')
    .select('id')
    .eq('agent_id', agentId)
    .limit(1);

  if (probeResponse.error) {
    throw createSupabaseFallbackError(probeResponse.error, 'Erro ao verificar existencia de chunks do agente');
  }

  return Array.isArray(probeResponse.data) ? probeResponse.data.length : 0;
}

async function getFirstChunksViaSupabase(agentId, limit = 3) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('document_chunks')
    .select('document_id, content, chunk_index')
    .eq('agent_id', agentId)
    .order('chunk_index', { ascending: true })
    .limit(limit);

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao carregar primeiros chunks do agente');
  }

  return (response.data || []).map((row) => ({
    documentId: row.document_id,
    documentTitle: 'Documento sem título',
    content: row.content,
    chunkIndex: row.chunk_index,
    similarity: 1,
  }));
}

async function searchKeywordChunksViaSupabase(queryText, agentId, limit = 3) {
  const client = ensureSupabaseAdminAvailable();
  const keywords = buildRetrievalKeywords(queryText, { limit: Math.max(DEFAULT_RAG_KEYWORD_LIMIT, 18) });
  if (keywords.length === 0) {
    return [];
  }

  const response = await client
    .from('document_chunks')
    .select('document_id, content, chunk_index')
    .eq('agent_id', agentId)
    .order('chunk_index', { ascending: true })
    .limit(Math.max(limit * 12, DEFAULT_RAG_CANDIDATE_LIMIT));

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao buscar chunks por palavra-chave');
  }

  return rerankRetrievedRows(
    (response.data || [])
      .map((row) => ({
        documentId: row.document_id,
        documentTitle: 'Documento sem título',
        content: row.content,
        chunkIndex: row.chunk_index,
        similarity: 0,
      }))
      .filter((row) => contentHasRetrievalKeywordMatch(row.content, keywords)),
    queryText,
    limit
  );
}

async function searchSimilarChunksViaSupabase(queryText, agentId, limit = DEFAULT_RAG_RETURN_LIMIT) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('document_chunks')
    .select('document_id, content, chunk_index')
    .eq('agent_id', agentId)
    .order('chunk_index', { ascending: true })
    .limit(Math.max(limit * 12, DEFAULT_RAG_CANDIDATE_LIMIT));

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao recuperar chunks do agente');
  }

  const rankedRows = rerankRetrievedRows(
    (response.data || []).map((row) => ({
      documentId: row.document_id,
      documentTitle: 'Documento sem título',
      content: row.content,
      chunkIndex: row.chunk_index,
      similarity: 0,
    })),
    queryText,
    limit
  );

  if (rankedRows.length === 0) {
    console.log(`[SEARCH][SUPABASE] Nenhum chunk lexicalmente relevante para o agente ${agentId}.`);
    return [];
  }

  console.log(`[SEARCH][SUPABASE] ${rankedRows.length} chunks relevantes (de ${response.data.length} total) para agente ${agentId}.`);
  return rankedRows;
}

async function countAgentChunks(agentId) {
  return withDatabaseFallback(
    'countAgentChunks',
    async () => {
      const result = await pool.query(
        'SELECT COUNT(*) as count FROM document_chunks WHERE agent_id = $1',
        [agentId]
      );
      return parseInt(result.rows?.[0]?.count || '0', 10);
    },
    () => countAgentChunksViaSupabase(agentId)
  );
}

async function getAllAgentChunkRows(agentId, chunkCount = 0, limit = DEFAULT_RAG_DEEP_SCAN_LIMIT) {
  const numericChunkCount = Number(chunkCount || 0);
  const effectiveLimit = Math.max(
    DEFAULT_RAG_CANDIDATE_LIMIT,
    Math.min(Number.isFinite(numericChunkCount) && numericChunkCount > 0 ? numericChunkCount : limit, limit)
  );

  return withDatabaseFallback(
    'getAllAgentChunkRows',
    async () => {
      const result = await pool.query(`
        SELECT
          dc.document_id,
          dc.content,
          dc.chunk_index,
          COALESCE(d.title, 'Documento sem título') AS document_title
        FROM document_chunks dc
        LEFT JOIN documents d ON d.id = dc.document_id
        WHERE dc.agent_id = $1
        ORDER BY dc.document_id ASC, dc.chunk_index ASC
        LIMIT $2
      `, [agentId, effectiveLimit]);

      return result.rows.map((row) => ({
        documentId: row.document_id,
        documentTitle: row.document_title,
        content: row.content,
        chunkIndex: row.chunk_index,
        similarity: 0,
      }));
    },
    async () => {
      const client = ensureSupabaseAdminAvailable();
      const response = await client
        .from('document_chunks')
        .select('document_id, content, chunk_index')
        .eq('agent_id', agentId)
        .order('document_id', { ascending: true })
        .order('chunk_index', { ascending: true })
        .limit(effectiveLimit);

      if (response.error) {
        throw createSupabaseFallbackError(response.error, 'Erro ao carregar todos os chunks do agente');
      }

      return (response.data || []).map((row) => ({
        documentId: row.document_id,
        documentTitle: 'Documento sem título',
        content: row.content,
        chunkIndex: row.chunk_index,
        similarity: 0,
      }));
    }
  );
}

async function searchDeepAgentChunks({
  question = '',
  retrievalQuery = '',
  agentId,
  attachments = [],
  chunkCount = 0,
  limit = DEFAULT_RAG_DEEP_RETURN_LIMIT,
} = {}) {
  if (!agentId) {
    return { rows: [], scannedRows: 0, queryTexts: [] };
  }

  const queryTexts = buildDeepRetrievalQueries(question, retrievalQuery || question);
  const hypothetical = await generateHypotheticalAnswer(question || retrievalQuery);
  if (hypothetical) {
    queryTexts.push(hypothetical);
  }
  const databaseRows = Number(chunkCount || 0) > 0
    ? await getAllAgentChunkRows(agentId, chunkCount)
    : [];
  const attachmentRows = Array.isArray(attachments) && attachments.length > 0
    ? await getAgentAttachmentChunkRows(agentId, attachments)
    : [];
  const allRows = dedupeRetrievedRows([...databaseRows, ...attachmentRows]);

  if (allRows.length === 0) {
    return { rows: [], scannedRows: 0, queryTexts };
  }

  const deepCandidateLimit = Math.max(limit * 8, DEFAULT_RAG_CANDIDATE_LIMIT);
  const deepSeedLimit = Math.max(DEFAULT_RAG_DEEP_SEED_LIMIT, Math.ceil(limit * 0.8));
  const seedRows = rerankRetrievedRowsForQueries(
    allRows,
    queryTexts,
    deepCandidateLimit
  );
  const rows = expandRetrievedRowsWithNeighbors(allRows, seedRows, queryTexts, {
    neighborWindow: Math.max(DEFAULT_RAG_NEIGHBOR_WINDOW, 2),
    seedLimit: deepSeedLimit,
    finalLimit: Math.max(limit, DEFAULT_RAG_RETURN_LIMIT),
  });

  console.log(`[SEARCH][DEEP] ${rows.length} chunks relevantes apos varredura de ${allRows.length} chunks do agente ${agentId}.`);
  return {
    rows,
    scannedRows: allRows.length,
    queryTexts,
  };
}

async function indexAgentAttachmentContent(agentId, title, text) {
  const normalizedText = String(text || '').trim();
  if (!agentId || normalizedText.length <= 50) {
    return { chunksCount: 0 };
  }

  return withDatabaseFallback(
    'indexAgentAttachmentContent',
    async () => {
      const chunks = await prepareChunksForIndexing(normalizedText, { title });
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const docResult = await client.query(
          'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
          [agentId, title]
        );
        const documentId = docResult.rows[0].id;

        await insertDocumentChunksWithOptionalEmbeddings(agentId, documentId, chunks, {}, client);
        await client.query('COMMIT');

        return { chunksCount: chunks.length };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async () => {
      const documentId = await insertAgentDocumentViaSupabase(agentId, title);
      const chunks = await prepareChunksForIndexing(normalizedText, { title });
      await insertAgentDocumentChunksViaSupabase(agentId, documentId, chunks);
      return { chunksCount: chunks.length };
    }
  );
}

async function reindexAgentAttachmentsViaSupabase(agentId, attachments = []) {
  const validAttachments = Array.isArray(attachments) ? attachments : [];
  await deleteAgentDocumentsViaSupabase(agentId);

  let processedCount = 0;
  let skippedCount = 0;
  let totalChunks = 0;

  for (const attachment of validAttachments) {
    try {
      const resolved = await ensureAgentAttachmentFileAvailable(attachment);
      if (!resolved || !fs.existsSync(resolved.fullPath)) {
        skippedCount += 1;
        continue;
      }

      const text = await extractAttachmentText(resolved.fullPath, resolved.fileName);
      if (!text || text.trim().length < 50) {
        skippedCount += 1;
        continue;
      }

      const documentId = await insertAgentDocumentViaSupabase(agentId, resolved.fileName);
      const chunks = await prepareChunksForIndexing(text, { title: resolved.fileName });
      if (chunks.length === 0) {
        skippedCount += 1;
        continue;
      }

      await insertAgentDocumentChunksViaSupabase(agentId, documentId, chunks);
      processedCount += 1;
      totalChunks += chunks.length;
    } catch (error) {
      skippedCount += 1;
      console.error('[REINDEX][SUPABASE] Erro ao processar attachment:', attachment, error?.message || error);
    }
  }

  return { processedCount, skippedCount, totalChunks };
}

async function handleSupabaseConversationMessageFallback({ res, userId, cid, content, agentId, attachment, attachmentContext, directPdfAnswer }) {
  const userText = String(content || '').trim();
  const conversation = await getConversationViaSupabase(userId, cid);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversa não encontrada' });
  }

  const effectiveAgentId = conversation.agent_id || agentId || null;
  await insertConversationMessageViaSupabase(cid, 'user', `${userText}${attachment?.filename ? `\n\n[Anexo enviado: ${attachment.filename}]` : ''}`.trim());

  const historyRows = await listConversationMessagesViaSupabase(userId, cid) || [];
  const conversationContext = buildConversationContext(historyRows);
  const retrievalQuery = buildRetrievalQuery(userText, conversationContext);
  const rankingQueryText = String(userText || retrievalQuery || '').trim();

  let prompt = buildGroundedPrompt(attachmentContext || '', '', userText || 'Analise o anexo enviado.', conversationContext);
  let mergedContext = attachmentContext || '';
  let hasContext = Boolean(attachmentContext && attachmentContext.trim());
  let questionType = 'general';
  let contextSize = attachmentContext ? attachmentContext.length : 0;
  let chunksUsed = attachmentContext ? 1 : 0;
  let relevantContext = '';
  let relevantChunks = [];
  let agentDetails = null;
  let agentInstructions = '';
  let totalChunkCount = 0;
  const usedDirectPdfAnswer = Boolean(directPdfAnswer && directPdfAnswer.trim().length > 0);
  const retrievalDebug = {
    conversationId: cid,
    agentId: effectiveAgentId,
    hasChunks: false,
    totalChunks: 0,
    attachmentFallbackUsed: false,
    attachmentRetrieved: 0,
    embeddingAttempted: false,
    embeddingAvailable: false,
    vectorRetrieved: 0,
    keywordRetrieved: 0,
    deepSearchTriggered: false,
    deepScannedRows: 0,
    deepRetrieved: 0,
    retryAttempted: false,
    retryResolved: false,
    finalRetrieved: 0,
    contextLength: contextSize,
    questionPreview: userText.slice(0, 180),
    legalSignals: null,
    deepQueries: [],
    topChunks: [],
  };

  if (!usedDirectPdfAnswer) {
    const pythonAgentCoreResult = await tryHandlePythonAgentCoreMessage({
      res,
      cid,
      userText,
      effectiveAgentId,
      attachmentContext,
      loadAgentData: async () => effectiveAgentId ? getAgentViaSupabase(effectiveAgentId) : null,
      saveAssistantMessage: async (answer) => insertConversationMessageViaSupabase(cid, 'assistant', answer),
    });

    if (pythonAgentCoreResult.handled) {
      return;
    }
  }

  if (effectiveAgentId) {
    try {
      agentDetails = await getAgentViaSupabase(effectiveAgentId);
      if (agentDetails) {
        agentInstructions = agentDetails.instructions || agentDetails.description || '';
        questionType = detectQuestionType(userText);
        totalChunkCount = await countAgentChunks(effectiveAgentId);
        const hasChunks = totalChunkCount > 0;
        const legalSignals = extractLegalReferenceSignals(rankingQueryText || retrievalQuery);
        retrievalDebug.hasChunks = hasChunks;
        retrievalDebug.totalChunks = totalChunkCount;
        retrievalDebug.legalSignals = {
          articleNumbers: legalSignals.articleNumbers,
          lawReferences: legalSignals.lawReferences.slice(0, 4),
          statuteAliases: legalSignals.statuteAliases.slice(0, 4),
          requiresParagraphUnique: legalSignals.requiresParagraphUnique,
        };

        if (hasChunks) {
          const isLookingForBeginning = userText.match(/primeira frase|título|inicio|começo|autor/i);

          if (isLookingForBeginning) {
            relevantChunks = await getFirstChunks(effectiveAgentId, 5);
          } else {
            retrievalDebug.embeddingAttempted = true;
            const queryEmbedding = await generateQueryEmbedding(retrievalQuery || userText, {
              userId,
              conversationId: cid,
              requestType: 'chat_embedding_query_supabase_fallback',
              label: 'embedding_supabase_fallback',
            });

            if (queryEmbedding) {
              retrievalDebug.embeddingAvailable = true;
              relevantChunks = await searchSimilarChunks(
                queryEmbedding,
                effectiveAgentId,
                DEFAULT_RAG_VECTOR_LIMIT,
                rankingQueryText
              );
              retrievalDebug.vectorRetrieved = relevantChunks.length;
            }

            const keywords = userText.match(/[A-ZÁÉÍÓÚ][a-zàéíóúç]+/g) || [];
            if (keywords.length > 0) {
              const keywordContext = '';
              if (keywordContext) {
                relevantContext = [keywordContext, relevantContext].filter(Boolean).join('\n\n---\n\n');
              }
            }

            const keywordChunks = await searchKeywordChunks(rankingQueryText, effectiveAgentId, DEFAULT_RAG_KEYWORD_LIMIT);
            retrievalDebug.keywordRetrieved = keywordChunks.length;
            relevantChunks = rerankRetrievedRows(
              [...relevantChunks, ...keywordChunks],
              rankingQueryText,
              DEFAULT_RAG_RETURN_LIMIT
            );
          }

          const shouldDeepSearchEarly = shouldTriggerProactiveDeepSearch({
            userText,
            retrievalQuery: rankingQueryText || retrievalQuery,
            relevantChunks,
            legalSignals,
            chunkCount: totalChunkCount,
          });

          if (shouldDeepSearchEarly) {
            retrievalDebug.deepSearchTriggered = true;
            const deepLimit = Math.max(DEFAULT_RAG_DEEP_RETURN_LIMIT, DEFAULT_RAG_RETURN_LIMIT + 6);
            const deepResult = await searchDeepAgentChunks({
              question: userText,
              retrievalQuery: rankingQueryText || retrievalQuery,
              agentId: effectiveAgentId,
              attachments: Array.isArray(agentDetails.attachments) ? agentDetails.attachments : [],
              chunkCount: totalChunkCount,
              limit: deepLimit,
            });

            retrievalDebug.deepScannedRows = deepResult.scannedRows;
            retrievalDebug.deepRetrieved = deepResult.rows.length;
            retrievalDebug.deepQueries = deepResult.queryTexts.slice(0, 6);

            if (deepResult.rows.length > 0) {
              relevantChunks = rerankRetrievedRowsForQueries(
                [...relevantChunks, ...deepResult.rows],
                deepResult.queryTexts,
                deepLimit
              );
            }
          }

          relevantContext = formatRetrievedContext(relevantChunks, {
            maxChars: getEffectiveContextBudgetChars(totalChunkCount),
            minRows: RAG_EXTREME_MODE ? Math.min(DEFAULT_RAG_RETURN_LIMIT, 12) : Math.min(DEFAULT_RAG_RETURN_LIMIT, 6),
          });
        }

        if (relevantChunks.length === 0 && Array.isArray(agentDetails.attachments) && agentDetails.attachments.length > 0) {
          retrievalDebug.attachmentFallbackUsed = true;
          relevantChunks = await searchAttachmentChunks(
            rankingQueryText,
            effectiveAgentId,
            agentDetails.attachments,
            DEFAULT_RAG_RETURN_LIMIT
          );
          retrievalDebug.attachmentRetrieved = relevantChunks.length;
          relevantContext = formatRetrievedContext(relevantChunks, {
            maxChars: getEffectiveContextBudgetChars(totalChunkCount),
            minRows: RAG_EXTREME_MODE ? Math.min(DEFAULT_RAG_RETURN_LIMIT, 12) : Math.min(DEFAULT_RAG_RETURN_LIMIT, 6),
          });
        }

        mergedContext = [attachmentContext, relevantContext].filter(Boolean).join('\n\n---\n\n');
        prompt = buildGroundedPrompt(mergedContext || '', agentInstructions, userText || 'Analise o anexo enviado.', conversationContext);
        hasContext = Boolean(mergedContext && mergedContext.trim().length > 0);
        contextSize = mergedContext ? mergedContext.length : 0;
        chunksUsed = mergedContext ? mergedContext.split('\n\n---\n\n').filter(Boolean).length : 0;
        retrievalDebug.finalRetrieved = relevantChunks.length;
        retrievalDebug.contextLength = contextSize;
        retrievalDebug.topChunks = summarizeRetrievedRows(relevantChunks);
      }
    } catch (error) {
      console.warn('[CHAT][SUPABASE-FALLBACK] Falha ao carregar agente:', error?.message || error);
    }
  }

  console.log(`[CHAT][SUPABASE-FALLBACK] Retrieval summary: ${JSON.stringify(retrievalDebug)}`);

  let assistantText = directPdfAnswer && directPdfAnswer.trim().length > 0 ? directPdfAnswer : '';

  try {
    const generateAssistantText = async (systemPrompt, requestType = 'chat_completion_supabase_fallback') => {
      const aiCfg = getAiRuntimeConfig();
      return runChatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText || 'Analise o anexo enviado.' },
        ],
        model: aiCfg.chatModel,
        userId,
        conversationId: cid,
        requestType,
        temperature: 0,
      });
    };

    if (!assistantText) {
      assistantText = await generateAssistantText(prompt);
    }

    let finalAssistantText = validateOutput(
      assistantText.trim() || 'Não consegui gerar uma resposta agora.',
      hasContext,
      userText,
      questionType,
      contextSize,
      chunksUsed,
      relevantContext,
    );

    // Se a primeira passada cair em fallback (ou em modo extremo), varremos o indice inteiro antes de desistir.
    if (!usedDirectPdfAnswer && effectiveAgentId && agentDetails && (RAG_EXTREME_MODE || isGroundedFallbackResponse(finalAssistantText)) && (RAG_EXTREME_MODE || retrievalDebug.deepRetrieved === 0)) {
      retrievalDebug.retryAttempted = true;
      retrievalDebug.deepSearchTriggered = true;

      const deepResult = await searchDeepAgentChunks({
        question: userText,
        retrievalQuery: rankingQueryText || retrievalQuery,
        agentId: effectiveAgentId,
        attachments: Array.isArray(agentDetails.attachments) ? agentDetails.attachments : [],
        chunkCount: totalChunkCount,
        limit: Math.max(DEFAULT_RAG_DEEP_RETURN_LIMIT, DEFAULT_RAG_RETURN_LIMIT + 10),
      });

      retrievalDebug.deepScannedRows = deepResult.scannedRows;
      retrievalDebug.deepRetrieved = deepResult.rows.length;
      retrievalDebug.deepQueries = deepResult.queryTexts.slice(0, 6);

      if (deepResult.rows.length > 0) {
        const deepRelevantContext = formatRetrievedContext(deepResult.rows, {
          maxChars: getEffectiveContextBudgetChars(totalChunkCount),
          minRows: RAG_EXTREME_MODE ? Math.min(DEFAULT_RAG_DEEP_RETURN_LIMIT, 18) : Math.min(DEFAULT_RAG_RETURN_LIMIT, 8),
        });
        const deepMergedContext = [attachmentContext, deepRelevantContext].filter(Boolean).join('\n\n---\n\n');

        if (deepMergedContext && deepMergedContext !== mergedContext) {
          const deepPrompt = buildGroundedPrompt(
            deepMergedContext,
            agentInstructions,
            userText || 'Analise o anexo enviado.',
            conversationContext,
          );
          const deepAssistantText = await generateAssistantText(
            deepPrompt,
            'chat_completion_supabase_fallback_deep_retry'
          );
          const deepContextSize = deepMergedContext.length;
          const deepChunksUsed = deepMergedContext.split('\n\n---\n\n').filter(Boolean).length;
          const deepFinalAssistantText = validateOutput(
            deepAssistantText.trim() || 'Não consegui gerar uma resposta agora.',
            Boolean(deepMergedContext.trim()),
            userText,
            questionType,
            deepContextSize,
            deepChunksUsed,
            deepRelevantContext,
          );

          mergedContext = deepMergedContext;
          relevantContext = deepRelevantContext;
          relevantChunks = deepResult.rows;
          hasContext = Boolean(deepMergedContext.trim());
          contextSize = deepContextSize;
          chunksUsed = deepChunksUsed;
          retrievalDebug.retryResolved = !isGroundedFallbackResponse(deepFinalAssistantText);
          retrievalDebug.finalRetrieved = relevantChunks.length;
          retrievalDebug.contextLength = contextSize;
          retrievalDebug.topChunks = summarizeRetrievedRows(relevantChunks);
          finalAssistantText = deepFinalAssistantText;
        }
      }
    }

    finalAssistantText = await refineGroundedAnswerIfNeeded({
      answer: finalAssistantText,
      question: userText,
      context: mergedContext || relevantContext,
      hasContext,
      questionType,
      contextSize,
      chunksUsed,
      userId,
      conversationId: cid,
      requestType: 'chat_completion_supabase_fallback_refinement',
    });

    console.log(`[CHAT][SUPABASE-FALLBACK] Retrieval summary: ${JSON.stringify(retrievalDebug)}`);
    await insertConversationMessageViaSupabase(cid, 'assistant', finalAssistantText);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    const chunkSize = 50;
    for (let index = 0; index < finalAssistantText.length; index += chunkSize) {
      const chunk = finalAssistantText.substring(index, index + chunkSize);
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    return res.end();
  } catch (fallbackError) {
    console.error('[CHAT][SUPABASE-FALLBACK] Erro na geração de resposta:', fallbackError?.message || fallbackError);
    logAiUsageSafe({
      userId,
      conversationId: cid,
      requestType: 'chat_completion_supabase_fallback',
      model: getAiRuntimeConfig().chatModel,
      status: 'error',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      errorMessage: fallbackError?.message || 'Falha no chat fallback',
    });
    if (!res.headersSent) {
      res.status(500).json({ error: fallbackError?.message || 'Erro interno no chat' });
    } else {
      res.write(`data: ${JSON.stringify({ error: fallbackError?.message || 'Erro interno' })}\n\n`);
      res.end();
    }
  }
}

async function listTutorialsViaSupabase() {
  const response = await supabaseAdminClient
    .from('tutorials')
    .select('id, title, description, url, display_order, created_at, updated_at')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao carregar tutoriais');
  }

  return response.data || [];
}

async function createTutorialViaSupabase(tutorial) {
  const response = await supabaseAdminClient
    .from('tutorials')
    .insert([{ title: tutorial.title, description: tutorial.description, url: tutorial.url, display_order: tutorial.displayOrder }])
    .select('id, title, description, url, display_order, created_at, updated_at')
    .single();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao criar tutorial');
  }

  return response.data;
}

async function updateTutorialViaSupabase(tutorialId, tutorial) {
  const response = await supabaseAdminClient
    .from('tutorials')
    .update({
      title: tutorial.title,
      description: tutorial.description,
      url: tutorial.url,
      display_order: tutorial.displayOrder,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tutorialId)
    .select('id, title, description, url, display_order, created_at, updated_at')
    .maybeSingle();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao atualizar tutorial');
  }

  return response.data;
}

async function deleteTutorialViaSupabase(tutorialId) {
  const response = await supabaseAdminClient
    .from('tutorials')
    .delete()
    .eq('id', tutorialId)
    .select('id')
    .maybeSingle();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao remover tutorial');
  }

  return response.data;
}

// ============================================
// 🔌 ENDPOINTS
// ============================================

app.get('/api/tutorials', async (req, res) => {
  try {
    const tutorials = await withDatabaseFallback(
      'GET /api/tutorials',
      async () => {
        await ensureTutorialsTable();

        const result = await pool.query(
          `
          SELECT id, title, description, url, display_order, created_at, updated_at
          FROM public.tutorials
          ORDER BY display_order ASC, created_at ASC
          `
        );

        return result.rows || [];
      },
      () => listTutorialsViaSupabase()
    );

    return res.json(tutorials);
  } catch (error) {
    console.error('[TUTORIALS] GET /api/tutorials error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao carregar tutoriais' });
  }
});

app.post('/api/admin/tutorials', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(userId))) {
      return res.status(403).json({ error: 'Apenas administradores podem criar tutoriais' });
    }

    const tutorial = normalizeTutorialPayload(req.body);
    if (!tutorial.title || !tutorial.url) {
      return res.status(400).json({ error: 'Título e URL são obrigatórios' });
    }

    const created = await withDatabaseFallback(
      'POST /api/admin/tutorials',
      async () => {
        await ensureTutorialsTable();

        const result = await pool.query(
          `
          INSERT INTO public.tutorials (title, description, url, display_order)
          VALUES ($1, $2, $3, $4)
          RETURNING id, title, description, url, display_order, created_at, updated_at
          `,
          [tutorial.title, tutorial.description, tutorial.url, tutorial.displayOrder]
        );

        return result.rows[0];
      },
      () => createTutorialViaSupabase(tutorial)
    );

    return res.status(201).json(created);
  } catch (error) {
    console.error('[TUTORIALS] POST /api/admin/tutorials error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao criar tutorial' });
  }
});

app.put('/api/admin/tutorials/:id', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    const tutorialId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    if (!tutorialId) {
      return res.status(400).json({ error: 'ID do tutorial é obrigatório' });
    }

    if (!(await isAdminUser(userId))) {
      return res.status(403).json({ error: 'Apenas administradores podem editar tutoriais' });
    }

    const tutorial = normalizeTutorialPayload(req.body);
    if (!tutorial.title || !tutorial.url) {
      return res.status(400).json({ error: 'Título e URL são obrigatórios' });
    }

    const updated = await withDatabaseFallback(
      'PUT /api/admin/tutorials/:id',
      async () => {
        await ensureTutorialsTable();

        const result = await pool.query(
          `
          UPDATE public.tutorials
          SET title = $2,
              description = $3,
              url = $4,
              display_order = $5,
              updated_at = NOW()
          WHERE id = $1
          RETURNING id, title, description, url, display_order, created_at, updated_at
          `,
          [tutorialId, tutorial.title, tutorial.description, tutorial.url, tutorial.displayOrder]
        );

        return result.rows[0] || null;
      },
      () => updateTutorialViaSupabase(tutorialId, tutorial)
    );

    if (!updated) {
      return res.status(404).json({ error: 'Tutorial não encontrado' });
    }

    return res.json(updated);
  } catch (error) {
    console.error('[TUTORIALS] PUT /api/admin/tutorials/:id error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao atualizar tutorial' });
  }
});

app.delete('/api/admin/tutorials/:id', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    const tutorialId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    if (!tutorialId) {
      return res.status(400).json({ error: 'ID do tutorial é obrigatório' });
    }

    if (!(await isAdminUser(userId))) {
      return res.status(403).json({ error: 'Apenas administradores podem remover tutoriais' });
    }

    const deleted = await withDatabaseFallback(
      'DELETE /api/admin/tutorials/:id',
      async () => {
        await ensureTutorialsTable();

        const result = await pool.query('DELETE FROM public.tutorials WHERE id = $1 RETURNING id', [tutorialId]);
        return result.rows[0] || null;
      },
      () => deleteTutorialViaSupabase(tutorialId)
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Tutorial não encontrado' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[TUTORIALS] DELETE /api/admin/tutorials/:id error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao remover tutorial' });
  }
});

app.get('/api/account/profile', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const profile = await readAccountProfile(userId);
    return res.json({ profile });
  } catch (error) {
    console.error('[ACCOUNT] GET /api/account/profile error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao carregar perfil' });
  }
});

app.put('/api/account/profile', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const email = String(req.body?.email || '').trim();
    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório' });
    }

    const profile = await saveAccountProfile(userId, req.body || {});
    return res.json({ profile });
  } catch (error) {
    console.error('[ACCOUNT] PUT /api/account/profile error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao salvar perfil' });
  }
});

app.post('/api/platform-events', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const action = String(req.body?.action || '').trim();
    if (!action) {
      return res.status(400).json({ error: 'A ação é obrigatória' });
    }

    const event = await recordPlatformActionEvent({
      userId,
      action,
      label: req.body?.label,
      channel: req.body?.channel,
      metadata: isPlainObject(req.body?.metadata) ? req.body.metadata : null,
    });

    return res.json({ success: true, event });
  } catch (error) {
    console.error('[PLATFORM_EVENTS] POST /api/platform-events error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao registrar evento da plataforma' });
  }
});

app.get('/api/account/subscription', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const subscription = await readAccountSubscription(userId);
    return res.json(subscription);
  } catch (error) {
    console.error('[ACCOUNT] GET /api/account/subscription error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao carregar assinatura' });
  }
});

app.post('/api/account/subscription/cancel', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const result = await cancelAccountSubscription(userId, req.body || {});
    return res.json(result);
  } catch (error) {
    console.error('[ACCOUNT] POST /api/account/subscription/cancel error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao cancelar assinatura' });
  }
});

// GET conversas
app.get("/api/conversations", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const { agentId } = req.query;

    if (!hasDatabaseUrl) {
      const data = memoryChatStore.conversations
        .filter((c) => c.user_id === userId && (!agentId || String(c.agent_id) === String(agentId)))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return res.json(data);
    }

    const conversations = await withDatabaseFallback(
      'listConversations',
      async () => {
        await ensureChatTables();

        let query = 'SELECT * FROM conversations WHERE user_id = $1';
        const params = [userId];
        if (agentId) {
          params.push(agentId);
          query += ' AND agent_id = $2';
        }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        return result.rows || [];
      },
      () => listConversationsViaSupabase(userId, agentId ? String(agentId) : null)
    );

    res.json(conversations);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST nova conversa
app.post("/api/conversations", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const { title, agentId } = req.body;

    if (!hasDatabaseUrl) {
      const conv = {
        id: memoryChatStore.nextConversationId++,
        agent_id: agentId || null,
        user_id: userId,
        title: title || 'New Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryChatStore.conversations.unshift(conv);
      return res.status(201).json(conv);
    }

    const conversation = await withDatabaseFallback(
      'createConversation',
      async () => {
        await ensureChatTables();

        const result = await pool.query(
          'INSERT INTO conversations (agent_id, title, user_id) VALUES ($1, $2, $3) RETURNING *',
          [agentId || null, title || 'New Chat', userId]
        );
        return result.rows[0];
      },
      () => createConversationViaSupabase(userId, title || 'New Chat', agentId || null)
    );

    res.status(201).json(conversation);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET mensagens
app.get("/api/conversations/:id/messages", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const cid = parseInt(req.params.id);

    if (!hasDatabaseUrl) {
      const conv = memoryChatStore.conversations.find((c) => c.id === cid);
      if (!conv || conv.user_id !== userId) {
        return res.status(404).json({ error: "Conversa não encontrada" });
      }

      const rows = memoryChatStore.messages
        .filter((m) => m.conversation_id === cid)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return res.json(rows);
    }

    const messages = await withDatabaseFallback(
      'listConversationMessages',
      async () => {
        await ensureChatTables();

        const conversationResult = await pool.query(
          'SELECT id FROM conversations WHERE id = $1 AND user_id = $2 LIMIT 1',
          [cid, userId]
        );
        if (conversationResult.rows.length === 0) {
          return null;
        }

        const result = await pool.query(
          `
          SELECT m.*
          FROM messages m
          INNER JOIN conversations c ON c.id = m.conversation_id
          WHERE m.conversation_id = $1
            AND c.user_id = $2
          ORDER BY m.created_at ASC
          `,
          [cid, userId]
        );
        return result.rows || [];
      },
      () => listConversationMessagesViaSupabase(userId, cid)
    );

    if (!messages) {
      return res.status(404).json({ error: "Conversa não encontrada" });
    }

    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE conversa
app.delete("/api/conversations/:id", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const cid = parseInt(req.params.id);

    if (!hasDatabaseUrl) {
      const conv = memoryChatStore.conversations.find((c) => c.id === cid);
      if (!conv || conv.user_id !== userId) {
        return res.status(404).json({ error: "Conversa não encontrada" });
      }

      memoryChatStore.conversations = memoryChatStore.conversations.filter((c) => c.id !== cid);
      memoryChatStore.messages = memoryChatStore.messages.filter((m) => m.conversation_id !== cid);
      return res.json({ success: true });
    }

    const deleted = await withDatabaseFallback(
      'deleteConversation',
      async () => {
        await ensureChatTables();

        const result = await pool.query(
          'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
          [cid, userId]
        );
        return result.rows.length > 0;
      },
      () => deleteConversationViaSupabase(userId, cid)
    );

    if (!deleted) {
      return res.status(404).json({ error: "Conversa não encontrada" });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE todas as conversas de um agente
app.post("/api/delete-agent-conversations", async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    const { agentId } = req.body;
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado' });
    if (!agentId) return res.status(400).json({ error: 'agentId é obrigatório' });
    if (!(await isAdminUser(userId))) {
      return res.status(403).json({ error: 'Apenas administradores podem limpar conversas de um agente' });
    }

    if (!hasDatabaseUrl) {
      const idsToDelete = memoryChatStore.conversations
        .filter((c) => String(c.agent_id) === String(agentId))
        .map((c) => c.id);

      memoryChatStore.conversations = memoryChatStore.conversations.filter((c) => !idsToDelete.includes(c.id));
      memoryChatStore.messages = memoryChatStore.messages.filter((m) => !idsToDelete.includes(m.conversation_id));

      return res.json({ success: true, deletedCount: idsToDelete.length });
    }

    const deletedCount = await withDatabaseFallback(
      'deleteAgentConversations',
      async () => {
        await ensureChatTables();

        const result = await pool.query('DELETE FROM conversations WHERE agent_id = $1', [agentId]);
        return result.rowCount;
      },
      () => deleteAgentConversationsViaSupabase(agentId)
    );

    res.json({ success: true, deletedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET documentos do agente
app.get("/api/agents/:agentId/documents", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE agent_id = $1 ORDER BY created_at DESC', [req.params.agentId]);
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE documento
app.delete("/api/agents/:agentId/documents/:docId", async (req, res) => {
  try {
    const { agentId, docId } = req.params;
    await pool.query('DELETE FROM documents WHERE id = $1 AND agent_id = $2', [docId, agentId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 📎 Upload de anexos do chat
app.post('/api/chat/upload', chatUpload.single('file'), async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'x-user-id header is required' });

  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });

    const filePath = `/chat-attachments/${req.file.filename}`;
    res.json({
      success: true,
      path: filePath,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🚀 UPLOAD com RAG NUCLEAR (chunking 4000/1000)
app.post('/api/agents/upload', upload.single('file'), async (req, res) => {
  console.log('[UPLOAD] ========== INICIANDO UPLOAD NUCLEAR ==========');
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });

    let { agentId } = req.body;
    if (agentId === "undefined" || agentId === "null" || !agentId) agentId = null;
    const deferIndexing = String(req.body?.deferIndexing || '').trim() === '1';

    const filePath = `/agent-attachments/${req.file.filename}`;
    const originalname = req.file.originalname;
    const resolvedUpload = resolvePublicAttachmentPath(filePath);
    const fullPath = resolvedUpload?.fullPath || path.join(process.cwd(), 'public', filePath.replace(/^\/+/, ''));

    await persistAgentAttachmentToStorage(filePath, fullPath, req.file.mimetype);

    const shouldIndexImmediately = Boolean(agentId && !deferIndexing);
    let text = '';
    let indexingError = null;

    if (shouldIndexImmediately) {
      text = await extractAttachmentText(fullPath, originalname);
    }

    if (shouldIndexImmediately && text.trim().length > 50) {
      try {
        await indexAgentAttachmentContent(agentId, originalname, text);
        console.log(`[UPLOAD] ✅ RAG NUCLEAR processado para agente ${agentId}`);
      } catch (e) {
        console.error('[UPLOAD] Erro no pipeline RAG:', e.message);
        indexingError = e;
      }
    }

    if (agentId) {
      await withDatabaseFallback(
        'uploadAgentAttachment:updateAgent',
        async () => {
          const agentResult = await pool.query('SELECT attachments FROM "agents" WHERE id = $1 LIMIT 1', [agentId]);
          const currentAttachments = Array.isArray(agentResult.rows?.[0]?.attachments) ? agentResult.rows[0].attachments : [];
          const nextAttachments = Array.from(new Set([...currentAttachments, filePath]));
          await pool.query('UPDATE "agents" SET attachments = $1 WHERE id = $2', [nextAttachments, agentId]);
        },
        async () => {
          const agent = await getAgentViaSupabase(agentId);
          const currentAttachments = Array.isArray(agent?.attachments) ? agent.attachments : [];
          const nextAttachments = Array.from(new Set([...currentAttachments, filePath]));
          await updateAgentKnowledgeViaSupabase(agentId, nextAttachments, Array.isArray(agent?.extra_links) ? agent.extra_links : []);
        }
      );
    }

    if (indexingError) {
      return res.status(500).json({ error: indexingError.message || 'Falha ao indexar anexo do agente.' });
    }

    let python = null;
    if (shouldIndexImmediately && text.trim().length > 50) {
      const agentData = await getAgentForPythonSync(agentId).catch(() => null);
      python = await syncPythonAgentAttachments({
        agentId,
        attachments: [filePath],
        agentData,
        recreate: false,
      });
    }

    res.json({ success: true, path: filePath, filename: originalname, python, deferred: deferIndexing });
  } catch (e) {
    console.error('[UPLOAD] Erro fatal:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agents/:agentId/sync-links', async (req, res) => {
  const { agentId } = req.params;
  if (!agentId) {
    return res.status(400).json({ error: 'agentId é obrigatório' });
  }

  try {
    const rawLinks = Array.isArray(req.body?.links)
      ? req.body.links
      : (Array.isArray(req.body?.extra_links) ? req.body.extra_links : []);
    const normalizedLinks = rawLinks
      .map((item) => {
        const url = String(item?.url || '').trim();
        const label = String(item?.label || '').trim();
        if (!url) {
          return null;
        }

        try {
          return {
            url: new URL(url).toString(),
            label,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((item, index, arr) => arr.findIndex((entry) => entry.url === item.url) === index);

    const agent = await withDatabaseFallback(
      'syncAgentKnowledgeLinks:getAgent',
      async () => {
        const agentResult = await pool.query(
          'SELECT id, attachments FROM "agents" WHERE id = $1 LIMIT 1',
          [agentId]
        );

        return agentResult.rows?.[0] || null;
      },
      () => getAgentViaSupabase(agentId)
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agente não encontrado' });
    }

    const currentAttachments = Array.isArray(agent.attachments) ? agent.attachments : [];
    const relativeFolder = `/agent-attachments/link-sources/${agentId}`;
    const absoluteFolder = path.join(process.cwd(), 'public', 'agent-attachments', 'link-sources', agentId);

    await fs.promises.rm(absoluteFolder, { recursive: true, force: true });

    const keptAttachments = currentAttachments.filter((attachment) => !String(attachment).startsWith(relativeFolder));
    const generatedAttachments = [];
    const failures = [];

    if (normalizedLinks.length > 0) {
      await fs.promises.mkdir(absoluteFolder, { recursive: true });
    }

    for (let index = 0; index < normalizedLinks.length; index += 1) {
      const link = normalizedLinks[index];

      try {
        const source = await fetchLinkKnowledgeSource(link.url);
        const fileSlug = slugifyFilePart(link.label || source.title || `fonte-${index + 1}`) || `fonte-${index + 1}`;
        const hash = crypto.createHash('sha1').update(link.url).digest('hex').slice(0, 10);
        const fileName = `${String(index + 1).padStart(2, '0')}-${fileSlug}-${hash}.${source.extension}`;
        const absolutePath = path.join(absoluteFolder, fileName);
        const relativePath = `${relativeFolder}/${fileName}`;

        await fs.promises.writeFile(absolutePath, source.buffer);
        await persistAgentAttachmentToStorage(relativePath, absolutePath, source.contentType || 'text/plain; charset=utf-8');
        generatedAttachments.push(relativePath);
      } catch (error) {
        console.error('[LINK-SYNC] Erro ao ingerir link:', link.url, error?.message || error);
        failures.push({ url: link.url, error: error?.message || 'Erro ao processar link' });
      }
    }

    const nextAttachments = [...keptAttachments, ...generatedAttachments];

    await withDatabaseFallback(
      'syncAgentKnowledgeLinks:updateAgent',
      async () => {
        await pool.query(
          'UPDATE "agents" SET attachments = $1, extra_links = $2::jsonb WHERE id = $3',
          [nextAttachments, JSON.stringify(normalizedLinks), agentId]
        );
      },
      () => updateAgentKnowledgeViaSupabase(agentId, nextAttachments, normalizedLinks)
    );

    const reindexSummary = await reindexAgentAttachments(agentId, nextAttachments);

    res.json({
      success: true,
      attachments: nextAttachments,
      extra_links: normalizedLinks,
      failures,
      reindex: reindexSummary,
      python: reindexSummary.python || null,
    });
  } catch (e) {
    console.error('[LINK-SYNC] Erro fatal:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Falha ao sincronizar links do agente.' });
  }
});

// 🔄 REPROCESSAR ATTACHMENTS (COM CONFIGURAÇÃO NUCLEAR)
app.post('/api/admin/reprocess-attachments', async (req, res) => {
  console.log('[REPROCESS] ========== REPROCESSAMENTO NUCLEAR ==========');
  try {
    const agents = await withDatabaseFallback(
      'reprocessAttachments:listAgents',
      async () => {
        const agentsResult = await pool.query(
          'SELECT id, attachments FROM "agents" WHERE attachments IS NOT NULL AND array_length(attachments, 1) > 0'
        );

        return agentsResult.rows || [];
      },
      () => listAgentsWithAttachmentsViaSupabase()
    );

    let totalProcessed = 0;
    let totalChunks = 0;
    for (const agent of agents) {
      const agentId = agent.id;
      console.log(`[REPROCESS] Agente ${agentId}: reindexando knowledge base...`);
      const summary = await reindexAgentAttachments(agentId, agent.attachments || []);
      totalProcessed += summary.processedCount;
      totalChunks += summary.totalChunks;
    }
    res.json({ success: true, processedCount: totalProcessed, totalChunks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🔄 REPROCESSAR ATTACHMENTS DE UM AGENTE ESPECÍFICO
app.post('/api/admin/reprocess-agent-attachments/:agentId', async (req, res) => {
  const { agentId } = req.params;
  if (!agentId) return res.status(400).json({ error: 'agentId é obrigatório' });

  try {
    const agent = await withDatabaseFallback(
      'reprocessAgentAttachments:getAgent',
      async () => {
        const agentResult = await pool.query(
          'SELECT id, attachments FROM "agents" WHERE id = $1 LIMIT 1',
          [agentId]
        );

        return agentResult.rows?.[0] || null;
      },
      () => getAgentViaSupabase(agentId)
    );

    if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });

    const summary = await reindexAgentAttachments(agentId, agent.attachments || []);

    res.json({ success: true, agentId, ...summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 💬 CHAT com RAG OTIMIZADO (Top-K 12)
app.post("/api/conversations/:id/messages", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  const cid = parseInt(req.params.id);
  try {
    const { content, agentId, attachment } = req.body;
    const userText = String(content || '').trim();
    let attachmentContext = '';
    let directPdfAnswer = '';
    let attachmentFileName = attachment?.filename || '';
    let fullAttachmentPath = '';

    if (attachment?.path) {
      try {
        const normalizedPath = String(attachment.path).startsWith('/')
          ? String(attachment.path)
          : `/${String(attachment.path)}`;
        fullAttachmentPath = path.join(process.cwd(), 'public', normalizedPath);
        attachmentFileName = attachment?.filename || path.basename(normalizedPath);

        if (fs.existsSync(fullAttachmentPath)) {
          const extracted = await extractAttachmentText(fullAttachmentPath, attachmentFileName || normalizedPath);
          if (extracted && extracted.trim().length > 0) {
            attachmentContext = `ANEXO ENVIADO PELO USUÁRIO (${attachmentFileName || 'arquivo'}):\n${extracted}`;
          }

          if (ENABLE_DIRECT_PDF_ANALYSIS && /\.pdf$/i.test(attachmentFileName || normalizedPath)) {
            directPdfAnswer = await askGeminiDirectlyFromPdf(
              fullAttachmentPath,
              attachmentFileName,
              userText || 'Resuma o documento anexado.',
              '',
              { userId, conversationId: cid }
            );
          }
        }
      } catch (e) {
        console.error('[CHAT] Erro ao processar anexo da mensagem:', e.message);
      }
    }

    if (!hasDatabaseUrl) {
      const conv = memoryChatStore.conversations.find((c) => c.id === cid);
      if (!conv || conv.user_id !== userId) {
        return res.status(404).json({ error: "Conversa não encontrada" });
      }

      const now = new Date().toISOString();
      memoryChatStore.messages.push({
        id: memoryChatStore.nextMessageId++,
        conversation_id: cid,
        role: 'user',
        content: `${userText}${attachment?.filename ? `\n\n[Anexo enviado: ${attachment.filename}]` : ''}`.trim(),
        created_at: now
      });

      const fallbackText = 'Modo local ativo: o banco de dados não está configurado no servidor. Posso continuar respondendo de forma básica, mas sem histórico persistente e sem busca vetorial nos documentos.';
      let localResponse = attachment
        ? (attachmentContext
            ? buildOfflineAttachmentResponse(attachmentContext, userText, attachment?.filename || 'arquivo')
            : `Recebi o anexo ${attachment?.filename || 'arquivo'}, mas não consegui extrair texto útil dele no modo local. Tente enviar PDF pesquisável, DOCX, TXT ou cole uma imagem nítida via Ctrl+V.`)
        : fallbackText;

      try {
        const aiCfg = getAiRuntimeConfig();
        const hasAIKey = Boolean(aiCfg.chatApiKey);
        if (hasAIKey && (attachmentContext || userText)) {
          const localPrompt = buildGroundedPrompt(
            attachmentContext || '',
            'Voce esta no modo local sem banco de dados. Responda somente com o conteudo extraido do anexo ou com o contexto disponivel.',
            userText || 'Analise o anexo enviado pelo usuario.'
          );

          const generated = await runChatCompletion({
            messages: [{ role: 'system', content: localPrompt }],
            model: aiCfg.fastChatModel,
            userId,
            conversationId: cid,
            requestType: 'chat_local_fallback',
            temperature: 0,
            maxTokens: DEFAULT_FAST_CHAT_MAX_TOKENS,
          });

          if (generated) {
            localResponse = generated;
          }
        }
      } catch (e) {
        console.error('[CHAT][LOCAL] Erro ao gerar resposta local:', e.message);
        logAiUsageSafe({
          userId,
          conversationId: cid,
          requestType: 'chat_local_fallback',
          model: getAiRuntimeConfig().fastChatModel,
          status: 'error',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          errorMessage: e?.message || 'Falha no chat local',
        });
      }

      localResponse = validateOutput(
        localResponse,
        Boolean(attachmentContext && attachmentContext.trim()),
        userText,
        detectQuestionType(userText),
        attachmentContext ? attachmentContext.length : 0,
        attachmentContext ? 1 : 0,
        attachmentContext,
      );

      memoryChatStore.messages.push({
        id: memoryChatStore.nextMessageId++,
        conversation_id: cid,
        role: 'assistant',
        content: localResponse,
        created_at: new Date().toISOString()
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (res.flushHeaders) res.flushHeaders();

      const chunkSize = 50;
      for (let i = 0; i < localResponse.length; i += chunkSize) {
        const chunk = localResponse.substring(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      return res.end();
    }

    try {
      await ensureChatTables();
    } catch (error) {
      if (isPostgresUnavailableError(error) && supabaseAdminClient) {
        return await handleSupabaseConversationMessageFallback({
          res,
          userId,
          cid,
          content,
          agentId,
          attachment,
          attachmentContext,
          directPdfAnswer,
        });
      }

      throw error;
    }

    const conversationResult = await pool.query(
      'SELECT id, agent_id FROM conversations WHERE id = $1 AND user_id = $2 LIMIT 1',
      [cid, userId]
    );
    if (conversationResult.rows.length === 0) {
      return res.status(404).json({ error: "Conversa não encontrada" });
    }

    const conversationAgentId = conversationResult.rows[0].agent_id || null;
    const effectiveAgentId = conversationAgentId || agentId || null;

    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [cid, "user", `${userText}${attachment?.filename ? `\n\n[Anexo enviado: ${attachment.filename}]` : ''}`.trim()]
    );

    const hist = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [cid]
    );

    const conversationContext = buildConversationContext(hist.rows);
    const retrievalQuery = buildRetrievalQuery(userText, conversationContext);
    const rankingQueryText = String(userText || retrievalQuery || '').trim();

    if (directPdfAnswer && directPdfAnswer.trim().length > 0) {
      await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *',
        [cid, 'assistant', directPdfAnswer]
      );

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (res.flushHeaders) res.flushHeaders();

      const chunkSize = 50;
      for (let i = 0; i < directPdfAnswer.length; i += chunkSize) {
        const chunk = directPdfAnswer.substring(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      return res.end();
    }

    const pythonAgentCoreResult = await tryHandlePythonAgentCoreMessage({
      res,
      cid,
      userText,
      effectiveAgentId,
      attachmentContext,
      loadAgentData: async () => {
        if (!effectiveAgentId) {
          return null;
        }

        return withDatabaseFallback(
          'chat:getAgent:pythonCore',
          async () => {
            const agent = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [effectiveAgentId]);
            return agent.rows?.[0] || null;
          },
          () => getAgentViaSupabase(effectiveAgentId)
        );
      },
      saveAssistantMessage: async (answer) => {
        await pool.query(
          'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *',
          [cid, 'assistant', answer]
        );
      },
    });

    if (pythonAgentCoreResult.handled) {
      return;
    }

    let prompt = buildGroundedPrompt(attachmentContext || '', '', userText || 'Analise o anexo enviado.', conversationContext);
    let mergedContext = attachmentContext || '';
    let hasContext = Boolean(attachmentContext && attachmentContext.trim().length > 0);
    let questionType = 'general';
    let contextSize = attachmentContext ? attachmentContext.length : 0;
    let chunksUsed = attachmentContext ? 1 : 0;
    let relevantContext = '';
    let relevantChunks = [];
    let agentData = null;
    let agentInstructions = '';
    let totalChunkCount = 0;
    let preAnswerDeepRetrieved = 0;

    if (effectiveAgentId) {
      try {
        agentData = await withDatabaseFallback(
          'chat:getAgent',
          async () => {
            const agent = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [effectiveAgentId]);
            return agent.rows?.[0] || null;
          },
          () => getAgentViaSupabase(effectiveAgentId)
        );
        if (agentData) {
          agentInstructions = agentData.instructions || agentData.description || '';
          questionType = detectQuestionType(userText);

          totalChunkCount = await countAgentChunks(effectiveAgentId);
          const hasChunks = totalChunkCount > 0;
          const legalSignals = extractLegalReferenceSignals(rankingQueryText || retrievalQuery);

          if (hasChunks) {
            try {
              const isLookingForBeginning = userText.match(/primeira frase|t(?:itulo|\u00edtulo)|inicio|com(?:eco|e\u00e7o)|autor/i);

              if (isLookingForBeginning) {
                relevantChunks = await getFirstChunks(effectiveAgentId, 5);
              } else {
                const queryEmbedding = await generateQueryEmbedding(retrievalQuery || userText, {
                  userId,
                  conversationId: cid,
                  requestType: 'chat_embedding_query',
                  label: 'chat_embedding_query',
                });

                if (queryEmbedding) {
                  relevantChunks = await searchSimilarChunks(
                    queryEmbedding,
                    effectiveAgentId,
                    DEFAULT_RAG_VECTOR_LIMIT,
                    rankingQueryText
                  );
                }

                const keywordChunks = await searchKeywordChunks(
                  rankingQueryText,
                  effectiveAgentId,
                  DEFAULT_RAG_KEYWORD_LIMIT
                );

                relevantChunks = rerankRetrievedRows(
                  [...relevantChunks, ...keywordChunks],
                  rankingQueryText,
                  DEFAULT_RAG_RETURN_LIMIT
                );
              }

              const shouldDeepSearchEarly = shouldTriggerProactiveDeepSearch({
                userText,
                retrievalQuery: rankingQueryText || retrievalQuery,
                relevantChunks,
                legalSignals,
                chunkCount: totalChunkCount,
              });

              if (shouldDeepSearchEarly) {
                const deepLimit = Math.max(DEFAULT_RAG_DEEP_RETURN_LIMIT, DEFAULT_RAG_RETURN_LIMIT + 6);
                const deepResult = await searchDeepAgentChunks({
                  question: userText,
                  retrievalQuery: rankingQueryText || retrievalQuery,
                  agentId: effectiveAgentId,
                  attachments: Array.isArray(agentData.attachments) ? agentData.attachments : [],
                  chunkCount: totalChunkCount,
                  limit: deepLimit,
                });

                preAnswerDeepRetrieved = deepResult.rows.length;
                if (deepResult.rows.length > 0) {
                  relevantChunks = rerankRetrievedRowsForQueries(
                    [...relevantChunks, ...deepResult.rows],
                    deepResult.queryTexts,
                    deepLimit
                  );
                }

                console.log(`[CHAT][DEEP_EARLY] scanned=${deepResult.scannedRows} retrieved=${deepResult.rows.length} agent=${effectiveAgentId}`);
              }

              const contextBudgetChars = getEffectiveContextBudgetChars(totalChunkCount);
              relevantContext = formatRetrievedContext(relevantChunks, {
                maxChars: contextBudgetChars,
                minRows: RAG_EXTREME_MODE ? Math.min(DEFAULT_RAG_RETURN_LIMIT, 12) : Math.min(DEFAULT_RAG_RETURN_LIMIT, 6),
              });

              mergedContext = [attachmentContext, relevantContext].filter(Boolean).join('\n\n---\n\n');
              prompt = buildGroundedPrompt(mergedContext || '', agentInstructions, userText || 'Analise o anexo enviado.', conversationContext);
              hasContext = Boolean(mergedContext && mergedContext.trim().length > 0);
              contextSize = mergedContext ? mergedContext.length : 0;
              chunksUsed = mergedContext ? mergedContext.split('\n\n---\n\n').filter(Boolean).length : 0;

            } catch (e) {
              console.error('[CHAT] Erro ao buscar contexto:', e.message);
            }
          } else {
            prompt = buildGroundedPrompt(attachmentContext || '', agentInstructions, userText || 'Analise o anexo enviado.', conversationContext);
            hasContext = Boolean(attachmentContext);
            contextSize = attachmentContext ? attachmentContext.length : 0;
            chunksUsed = attachmentContext ? 1 : 0;
          }
        }
      } catch (e) {
        console.error('[CHAT] Erro ao buscar agente:', e.message);
      }
    }

    const msgs = [
      { role: "system", content: prompt },
    ];

    // Histórico limitado a 10 para não explodir com o contexto gigante
    const history = hist.rows.slice(-10).map(m => ({ role: m.role, content: m.content }));
    msgs.push(...history);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();

    const aiCfg = getAiRuntimeConfig();
    const fullResp = await runChatCompletion({
      messages: msgs,
      model: aiCfg.chatModel,
      userId,
      conversationId: cid,
      requestType: attachment ? 'chat_completion_with_attachment' : 'chat_completion',
      temperature: 0,
      maxTokens: DEFAULT_CHAT_MAX_TOKENS,
    });

    const cleanedFullResp = fullResp.replace(/\[\s*Trecho\s*ID\s*:\s*\d+\s*\]/gi, '').trim();
    let validatedResp = validateOutput(
      cleanedFullResp || 'N\u00e3o consegui gerar uma resposta agora.',
      hasContext,
      userText,
      questionType,
      contextSize,
      chunksUsed,
      relevantContext,
    );

    if (effectiveAgentId && agentData && (RAG_EXTREME_MODE || isGroundedFallbackResponse(validatedResp)) && (RAG_EXTREME_MODE || preAnswerDeepRetrieved === 0)) {
      try {
        const deepResult = await searchDeepAgentChunks({
          question: userText,
          retrievalQuery: rankingQueryText || retrievalQuery,
          agentId: effectiveAgentId,
          attachments: Array.isArray(agentData.attachments) ? agentData.attachments : [],
          chunkCount: totalChunkCount,
          limit: Math.max(DEFAULT_RAG_DEEP_RETURN_LIMIT, DEFAULT_RAG_RETURN_LIMIT + 10),
        });

        if (deepResult.rows.length > 0) {
          const deepRelevantContext = formatRetrievedContext(deepResult.rows, {
            maxChars: getEffectiveContextBudgetChars(totalChunkCount),
            minRows: RAG_EXTREME_MODE ? Math.min(DEFAULT_RAG_DEEP_RETURN_LIMIT, 18) : Math.min(DEFAULT_RAG_RETURN_LIMIT, 8),
          });
          const deepMergedContext = [attachmentContext, deepRelevantContext].filter(Boolean).join('\n\n---\n\n');

          if (deepMergedContext && deepMergedContext !== mergedContext) {
            const deepPrompt = buildGroundedPrompt(
              deepMergedContext,
              agentInstructions,
              userText || 'Analise o anexo enviado.',
              conversationContext,
            );
            const deepResp = await runChatCompletion({
              messages: [{ role: 'system', content: deepPrompt }, ...history],
              model: aiCfg.chatModel,
              userId,
              conversationId: cid,
              requestType: attachment ? 'chat_completion_with_attachment_deep_retry' : 'chat_completion_deep_retry',
              temperature: 0,
              maxTokens: DEFAULT_CHAT_MAX_TOKENS,
            });

            const cleanedDeepResp = deepResp.replace(/\[\s*Trecho\s*ID\s*:\s*\d+\s*\]/gi, '').trim();
            const deepValidatedResp = validateOutput(
              cleanedDeepResp || 'N\u00e3o consegui gerar uma resposta agora.',
              Boolean(deepMergedContext.trim()),
              userText,
              questionType,
              deepMergedContext.length,
              deepMergedContext.split('\n\n---\n\n').filter(Boolean).length,
              deepRelevantContext,
            );

            if (!isGroundedFallbackResponse(deepValidatedResp)) {
              validatedResp = deepValidatedResp;
              mergedContext = deepMergedContext;
              relevantContext = deepRelevantContext;
              relevantChunks = deepResult.rows;
              hasContext = true;
              contextSize = deepMergedContext.length;
              chunksUsed = deepMergedContext.split('\n\n---\n\n').filter(Boolean).length;
            }
          }
        }
      } catch (deepError) {
        console.warn('[CHAT][DEEP_RETRY] Falha ao tentar varredura profunda:', deepError?.message || deepError);
      }
    }

    validatedResp = await refineGroundedAnswerIfNeeded({
      answer: validatedResp,
      question: userText,
      context: mergedContext || relevantContext,
      hasContext,
      questionType,
      contextSize,
      chunksUsed,
      userId,
      conversationId: cid,
      requestType: attachment ? 'chat_completion_with_attachment_refinement' : 'chat_completion_refinement',
    });

    const chunkSize = 50;
    for (let i = 0; i < validatedResp.length; i += chunkSize) {
      const chunk = validatedResp.substring(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *',
      [cid, "assistant", validatedResp]
    );

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    logAiUsageSafe({
      userId,
      conversationId: Number.isFinite(cid) ? cid : null,
      requestType: 'chat_completion',
      model: getAiRuntimeConfig().chatModel,
      status: 'error',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      errorMessage: e?.message || 'Falha no chat principal',
    });
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`), res.end();
  }
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  const isApiRequest = req.path.startsWith('/api/');
  const shouldLogApiRequest = isApiRequest && !(req.method === 'GET' && req.path === '/api/notifications');

  runtimeMonitor.activeRequests += 1;
  runtimeMonitor.totalRequests += 1;
  runtimeMonitor.lastRequestAt = new Date().toISOString();

  if (isApiRequest) {
    runtimeMonitor.totalApiRequests += 1;
    if (shouldLogApiRequest) {
      console.log(`[API] ${req.method} ${req.path}`);
    }
  }

  res.on('finish', () => {
    runtimeMonitor.activeRequests = Math.max(0, runtimeMonitor.activeRequests - 1);

    if (!isApiRequest) {
      return;
    }

    const durationMs = Date.now() - startedAt;
    const routeKey = `${req.method} ${req.path}`;
    const currentStats = runtimeMonitor.routeStats.get(routeKey) || {
      count: 0,
      errors: 0,
      last_status: null,
      last_duration_ms: null,
      last_seen_at: null,
    };

    currentStats.count += 1;
    currentStats.last_status = res.statusCode;
    currentStats.last_duration_ms = durationMs;
    currentStats.last_seen_at = new Date().toISOString();
    if (res.statusCode >= 500) {
      currentStats.errors += 1;
    }
    runtimeMonitor.routeStats.set(routeKey, currentStats);

    pushRuntimeEvent('api_request', {
      route: routeKey,
      status_code: res.statusCode,
      duration_ms: durationMs,
    });

    if (durationMs >= RUNTIME_MONITOR_SLOW_REQUEST_MS) {
      pushRuntimeEvent('slow_request', {
        route: routeKey,
        status_code: res.statusCode,
        duration_ms: durationMs,
      });
    }

    if (res.statusCode >= 500) {
      pushRuntimeEvent('api_error', {
        route: routeKey,
        status_code: res.statusCode,
        duration_ms: durationMs,
      });
    }
  });

  next();
});

// Outras rotas (Categorias, Links, Login, Renomear) mantidas sem alteração
app.patch('/api/conversations/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const { id } = req.params;
    const { title } = req.body;
    if (!title || title.trim() === '') return res.status(400).json({ error: 'Título é obrigatório' });

    if (!hasDatabaseUrl) {
      const cid = parseInt(id);
      const conv = memoryChatStore.conversations.find((c) => c.id === cid);
      if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
      if (conv.user_id !== userId) return res.status(404).json({ error: 'Conversa não encontrada' });
      
      conv.title = title.trim();
      conv.updated_at = new Date().toISOString();
      return res.json(conv);
    }

    const numericId = parseInt(id);
    const updatedConversation = await withDatabaseFallback(
      'updateConversationTitle',
      async () => {
        await ensureChatTables();

        let result = await pool.query(
          'UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id::text = $2 AND user_id = $3 RETURNING *',
          [title.trim(), id, userId]
        );
        if (result.rows.length === 0 && !isNaN(numericId)) {
          result = await pool.query(
            'UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [title.trim(), numericId, userId]
          );
        }
        return result.rows[0] || null;
      },
      () => updateConversationTitleViaSupabase(userId, numericId, title.trim())
    );

    if (!updatedConversation) return res.status(404).json({ error: 'Conversa não encontrada' });
    res.json(updatedConversation);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/conversations/clear-all', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    if (!hasDatabaseUrl) {
      const idsToDelete = memoryChatStore.conversations
        .filter(c => c.user_id === userId)
        .map(c => c.id);
        
      memoryChatStore.conversations = memoryChatStore.conversations.filter(c => c.user_id !== userId);
      memoryChatStore.messages = memoryChatStore.messages.filter(m => !idsToDelete.includes(m.conversation_id));
      
      return res.json({ success: true, message: 'Todas as conversas foram excluídas' });
    }

    await withDatabaseFallback(
      'clearAllConversations',
      async () => {
        await ensureChatTables();

        await pool.query(`
          DELETE FROM messages 
          WHERE conversation_id IN (
            SELECT id FROM conversations WHERE user_id = $1
          )
        `, [userId]);

        await pool.query('DELETE FROM conversations WHERE user_id = $1', [userId]);
        return true;
      },
      () => clearAllConversationsViaSupabase(userId)
    );

    res.json({ success: true, message: 'Todas as conversas foram excluídas' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/ai-usage', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const requestedDays = Number(req.query.days);
    const rangeDays = Number.isFinite(requestedDays)
      ? Math.min(Math.max(Math.floor(requestedDays), 1), 365)
      : 30;

    const payload = hasDatabaseUrl
      ? await withDatabaseFallback(
          'GET /api/admin/ai-usage',
          async () => {
            await ensureAiUsageTable();

            const summaryQuery = await pool.query(
              `
              SELECT
                COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN total_tokens ELSE 0 END), 0)::int AS tokens_today,
                COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN cost_usd ELSE 0 END), 0)::numeric(12,6) AS cost_today,
                COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN total_tokens ELSE 0 END), 0)::int AS tokens_month,
                COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN cost_usd ELSE 0 END), 0)::numeric(12,6) AS cost_month,
                COALESCE(COUNT(*) FILTER (WHERE created_at >= NOW() - ($1 || ' days')::interval), 0)::int AS requests,
                COALESCE(COUNT(*) FILTER (WHERE created_at >= NOW() - ($1 || ' days')::interval AND status = 'error'), 0)::int AS errors,
                COALESCE(SUM(total_tokens) FILTER (WHERE created_at >= NOW() - ($1 || ' days')::interval), 0)::int AS total_tokens_range,
                COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - ($1 || ' days')::interval), 0)::numeric(12,6) AS total_cost_range
              FROM ai_request_logs
              `,
              [rangeDays]
            );

            const usersQuery = await pool.query(
              `
              SELECT
                COALESCE(l.user_id, 'desconhecido') AS user_id,
                COALESCE(
                  NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                  NULLIF(u.nome_completo, ''),
                  NULLIF(u.email, ''),
                  l.user_id,
                  'Sem identificação'
                ) AS nome,
                COALESCE(NULLIF(u.email, ''), '—') AS email,
                COUNT(*)::int AS requests,
                COALESCE(SUM(l.total_tokens), 0)::int AS total_tokens,
                COALESCE(SUM(l.cost_usd), 0)::numeric(12,6) AS total_cost_usd,
                MAX(l.created_at) AS ultima_atividade
              FROM ai_request_logs l
              LEFT JOIN profiles p ON p.id::text = l.user_id
              LEFT JOIN usuarios u ON u.user_id = l.user_id
              WHERE l.created_at >= NOW() - ($1 || ' days')::interval
              GROUP BY l.user_id, p.first_name, p.last_name, u.nome_completo, u.email
              ORDER BY total_tokens DESC
              LIMIT 200
              `,
              [rangeDays]
            );

            const requestsQuery = await pool.query(
              `
              SELECT
                l.id,
                l.created_at,
                COALESCE(
                  NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
                  NULLIF(u.email, ''),
                  l.user_id,
                  'Sem identificação'
                ) AS usuario,
                l.request_type AS tipo,
                l.total_tokens AS tokens,
                l.cost_usd,
                l.status
              FROM ai_request_logs l
              LEFT JOIN profiles p ON p.id::text = l.user_id
              LEFT JOIN usuarios u ON u.user_id = l.user_id
              WHERE l.created_at >= NOW() - ($1 || ' days')::interval
              ORDER BY l.created_at DESC
              LIMIT 200
              `,
              [rangeDays]
            );

            const summaryRow = summaryQuery.rows?.[0] || {};
            const requests = Number(summaryRow.requests || 0);
            const errors = Number(summaryRow.errors || 0);
            const errorRate = requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0;

            return {
              range_days: rangeDays,
              summary: {
                tokens_today: Number(summaryRow.tokens_today || 0),
                cost_today: Number(summaryRow.cost_today || 0),
                requests,
                errors,
                error_rate: errorRate,
                tokens_month: Number(summaryRow.tokens_month || 0),
                cost_month: Number(summaryRow.cost_month || 0),
                total_tokens_range: Number(summaryRow.total_tokens_range || 0),
                total_cost_range: Number(summaryRow.total_cost_range || 0),
              },
              by_user: usersQuery.rows || [],
              requests: requestsQuery.rows || [],
            };
          },
          () => getAiUsageViaSupabase(rangeDays)
        )
      : await getAiUsageViaSupabase(rangeDays);

    return res.json(payload);
  } catch (error) {
    console.error('[AI USAGE] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar consumo de IA' });
  }
});

app.get('/api/admin/agent-qa', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const requestedPage = Number(req.query.page);
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    const exportAll = ['1', 'true', 'all'].includes(String(req.query.export || '').trim().toLowerCase());

    const payload = hasDatabaseUrl
      ? await withDatabaseFallback(
          'GET /api/admin/agent-qa',
          () => getAdminQaRowsViaDatabase({ page, exportAll }),
          () => getAdminQaRowsViaSupabase({ page, exportAll })
        )
      : getAdminQaRowsFromMemory({ page, exportAll });

    return res.json(payload);
  } catch (error) {
    console.error('[ADMIN_QA] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar perguntas e respostas dos agentes' });
  }
});

app.get('/api/admin/runtime-status', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.json(getRuntimeStatusSnapshot());
  } catch (error) {
    console.error('[ADMIN][RUNTIME_STATUS] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar status operacional' });
  }
});

app.get('/api/admin/app-settings', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const settings = await readAppSettings();
    return res.json({ settings });
  } catch (error) {
    console.error('[ADMIN][APP_SETTINGS][GET] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar configurações do app' });
  }
});

app.post('/api/admin/app-settings', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const settings = await saveAppSettings(req.body || {});
    return res.json({ settings, message: 'Configurações salvas com sucesso.' });
  } catch (error) {
    console.error('[ADMIN][APP_SETTINGS][POST] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao salvar configurações do app' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const users = await listAdminUsersViaSupabase();
    return res.json(users);
  } catch (error) {
    console.error('[ADMIN][USERS][LIST] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar usuários' });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const payload = await createAdminUserViaSupabase(req.body || {});
    return res.status(201).json(payload);
  } catch (error) {
    console.error('[ADMIN][USERS][CREATE] Error:', error);
    return res.status(Number(error?.statusCode) || 500).json({ error: error?.message || 'Erro ao criar usuário' });
  }
});

app.put('/api/admin/users/:userId', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    const userId = String(req.params.userId || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const payload = await updateAdminUserViaSupabase(userId, req.body || {});
    return res.json(payload);
  } catch (error) {
    console.error('[ADMIN][USERS][UPDATE] Error:', error);
    return res.status(Number(error?.statusCode) || 500).json({ error: error?.message || 'Erro ao atualizar usuário' });
  }
});

app.post('/api/admin/users/:userId/role', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    const userId = String(req.params.userId || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const updated = await updateAdminUserRoleViaSupabase(userId, req.body?.newRole);
    return res.json({ message: 'Papel do usuário atualizado com sucesso.', user: updated });
  } catch (error) {
    console.error('[ADMIN][USERS][ROLE] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao atualizar papel do usuário' });
  }
});

app.post('/api/admin/users/:userId/subscription-status', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    const userId = String(req.params.userId || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const updated = await updateAdminUserSubscriptionStatusViaSupabase(userId, req.body?.newStatus);
    return res.json({ message: 'Status de assinatura atualizado com sucesso.', user: updated });
  } catch (error) {
    console.error('[ADMIN][USERS][SUBSCRIPTION_STATUS] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao atualizar status do usuário' });
  }
});

app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    const userId = String(req.params.userId || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const result = await deleteAdminUserViaSupabase(userId);
    return res.json({ message: 'Usuário removido com sucesso.', ...result });
  } catch (error) {
    console.error('[ADMIN][USERS][DELETE] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao remover usuário' });
  }
});

app.get('/api/admin/financial-summary', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const rows = await withDatabaseFallback(
      'adminFinancialSummary',
      async () => {
        const result = await pool.query(
          `
          WITH latest_subscriptions AS (
            SELECT DISTINCT ON (s.user_id)
              s.user_id,
              s.plan_type,
              s.expires_at,
              s.updated_at,
              s.created_at
            FROM subscriptions s
            ORDER BY s.user_id, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
          )
          SELECT
            u.id,
            u.user_id,
            u.nome_completo,
            u.email,
            u.status_da_assinatura,
            u.updated_at,
            ls.plan_type,
            ls.expires_at AS subscription_expires_at
          FROM usuarios u
          LEFT JOIN latest_subscriptions ls ON ls.user_id = u.user_id
          ORDER BY u.updated_at DESC NULLS LAST
          LIMIT 500
          `
        );

        return result.rows || [];
      },
      async () => {
        const [usuariosResponse, subscriptionsResponse] = await Promise.all([
          supabaseAdminClient
            .from('usuarios')
            .select('id, user_id, nome_completo, email, status_da_assinatura, updated_at')
            .order('updated_at', { ascending: false })
            .limit(500),
          supabaseAdminClient
            .from('subscriptions')
            .select('user_id, plan_type, expires_at, updated_at, created_at')
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .limit(1000)
        ]);

        if (usuariosResponse.error) {
          throw createSupabaseFallbackError(usuariosResponse.error, 'Erro ao carregar usuarios para o financeiro');
        }

        if (subscriptionsResponse.error) {
          throw createSupabaseFallbackError(subscriptionsResponse.error, 'Erro ao carregar subscriptions para o financeiro');
        }

        const subscriptionsByUser = new Map();
        for (const subscription of subscriptionsResponse.data || []) {
          const key = String(subscription.user_id || '').trim();
          if (key && !subscriptionsByUser.has(key)) {
            subscriptionsByUser.set(key, {
              plan_type: String(subscription.plan_type || '').trim() || null,
              subscription_expires_at: subscription.expires_at || null,
            });
          }
        }

        return (usuariosResponse.data || []).map((usuario) => ({
          ...usuario,
          plan_type: subscriptionsByUser.get(String(usuario.user_id || '').trim())?.plan_type || null,
          subscription_expires_at: subscriptionsByUser.get(String(usuario.user_id || '').trim())?.subscription_expires_at || null,
        }));
      }
    );

    return res.json({ rows });
  } catch (error) {
    console.error('[FINANCEIRO] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar dados financeiros' });
  }
});

app.get('/api/admin/dashboard-summary', async (req, res) => {
  try {
    const requesterId = String(req.header('x-user-id') || '').trim();
    if (!requesterId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!(await isAdminUser(requesterId))) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const payload = await buildAdminDashboardSummary(req.query.period);
    return res.json(payload);
  } catch (error) {
    console.error('[ADMIN][DASHBOARD_SUMMARY] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar resumo administrativo' });
  }
});

// GET notificações
app.get('/api/notifications', async (req, res) => {
  try {
    if (!hasDatabaseUrl) return res.json([]);
    const notifications = await withDatabaseFallback(
      'GET /api/notifications',
      async () => {
        const result = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
        return result.rows;
      },
      () => listNotificationsViaSupabase()
    );
    res.json(notifications);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST nova notificação
app.post('/api/notifications', async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Título e mensagem são obrigatórios' });
    
    if (!hasDatabaseUrl) return res.json({ id: Date.now(), title, message, created_at: new Date() });

    const created = await withDatabaseFallback(
      'POST /api/notifications',
      async () => {
        const result = await pool.query(
          'INSERT INTO notifications (title, message) VALUES ($1, $2) RETURNING *',
          [title, message]
        );
        return result.rows[0];
      },
      () => createNotificationViaSupabase(title, message)
    );
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  if (allowDevAdminLogin && email === 'admin@admin.com' && password === 'admin') {
    return res.status(200).json({ success: true, user: { id: '07d16581-fca5-4709-b0d3-e09859dbb286', email: 'admin@admin.com', role: 'admin' }, token: `token_admin_${Date.now()}` });
  }

  if (supabaseAuthClient) {
    try {
      const { data, error } = await supabaseAuthClient.auth.signInWithPassword({
        email: String(email).trim(),
        password: String(password)
      });

      if (error || !data?.user) {
        return res.status(401).json({ error: error?.message || 'Email ou senha incorretos' });
      }

      const role = String(data.user.user_metadata?.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';

      if (role !== 'admin') {
        const accessState = await getUserPlatformAccessState(data.user.id, data.user.email || email);

        if (!accessState.hasActiveAccess) {
          await supabaseAuthClient.auth.signOut().catch(() => undefined);
          return res.status(403).json({
            error: 'Seu acesso ainda não foi liberado. A conta pode ser criada após o pagamento, mas o sistema só fica disponível com pagamento aprovado e senha definida pelo e-mail enviado.',
            code: 'SUBSCRIPTION_INACTIVE',
            subscriptionStatus: accessState.status,
          });
        }
      }

      return res.status(200).json({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          role
        },
        token: data.session?.access_token || null
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Erro ao autenticar no Supabase' });
    }
  }

  return res.status(401).json({ error: 'Email ou senha incorretos' });
});

function normalizeReferralCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function makeReferralCode(userId) {
  const base = normalizeReferralCode(userId).slice(0, 6);
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return `${base}${rand}`.slice(0, 10) || rand || 'INDICADO';
}

function normalizeSubscriptionStatus(raw) {
  return String(raw || '').trim().toLowerCase();
}

function hasActiveSubscriptionAccess(raw) {
  return ['ativo', 'active', 'paid', 'premium', 'approved'].includes(normalizeSubscriptionStatus(raw));
}

async function getUserPlatformAccessState(userId, fallbackEmail) {
  return withDatabaseFallback(
    'getUserPlatformAccessState',
    async () => {
      const [userResult, subscriptionResult] = await Promise.all([
        pool.query(
          `
          SELECT email, status_da_assinatura
          FROM usuarios
          WHERE user_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          `,
          [userId]
        ),
        pool.query(
          `
          SELECT status, plan_type
          FROM subscriptions
          WHERE user_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          `,
          [userId]
        )
      ]);

      const userRow = userResult.rows?.[0] || {};
      const subscriptionRow = subscriptionResult.rows?.[0] || {};
      const userStatus = String(userRow.status_da_assinatura || '').trim() || null;
      const subscriptionStatus = String(subscriptionRow.status || '').trim() || null;
      const effectiveStatus = userStatus || subscriptionStatus;

      return {
        email: String(userRow.email || fallbackEmail || '').trim() || null,
        status: effectiveStatus,
        plan: normalizePlanName(subscriptionRow.plan_type),
        hasActiveAccess: hasActiveSubscriptionAccess(effectiveStatus),
      };
    },
    () => getUserPlatformAccessStateViaSupabase(userId, fallbackEmail)
  );
}

function isConfirmedReferralStatus(raw) {
  return hasActiveSubscriptionAccess(raw);
}

function normalizePlanName(raw) {
  const value = String(raw || '').trim();
  return value || null;
}

async function getUserPlatformAccessStateViaSupabase(userId, fallbackEmail) {
  const client = ensureSupabaseAdminAvailable();
  const [userResponse, subscriptionResponse] = await Promise.all([
    client
      .from('usuarios')
      .select('email, status_da_assinatura')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1),
    client
      .from('subscriptions')
      .select('status, plan_type')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1),
  ]);

  if (userResponse.error) {
    throw createSupabaseFallbackError(userResponse.error, 'Erro ao carregar status do usuário');
  }

  if (subscriptionResponse.error) {
    throw createSupabaseFallbackError(subscriptionResponse.error, 'Erro ao carregar assinatura do usuário');
  }

  const userRow = Array.isArray(userResponse.data) ? (userResponse.data[0] || {}) : {};
  const subscriptionRow = Array.isArray(subscriptionResponse.data) ? (subscriptionResponse.data[0] || {}) : {};
  const userStatus = String(userRow.status_da_assinatura || '').trim() || null;
  const subscriptionStatus = String(subscriptionRow.status || '').trim() || null;
  const effectiveStatus = userStatus || subscriptionStatus;

  return {
    email: String(userRow.email || fallbackEmail || '').trim() || null,
    status: effectiveStatus,
    plan: normalizePlanName(subscriptionRow.plan_type),
    hasActiveAccess: hasActiveSubscriptionAccess(effectiveStatus),
  };
}

function getReferralCreditUnits(status) {
  return isConfirmedReferralStatus(status) ? 1 : 0;
  return withDatabaseFallback(
    'getUserPlatformAccessState',
    async () => {
      const [userResult, subscriptionResult] = await Promise.all([
        pool.query(
          `
          SELECT email, status_da_assinatura
          FROM usuarios
          WHERE user_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          `,
          [userId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `
          SELECT status, plan_type
          FROM subscriptions
          WHERE user_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          `,
          [userId]
        ).catch(() => ({ rows: [] }))
      ]);

      const userRow = userResult.rows?.[0] || {};
      const subscriptionRow = subscriptionResult.rows?.[0] || {};
      const userStatus = String(userRow.status_da_assinatura || '').trim() || null;
      const subscriptionStatus = String(subscriptionRow.status || '').trim() || null;
      const effectiveStatus = userStatus || subscriptionStatus;

      return {
        email: String(userRow.email || fallbackEmail || '').trim() || null,
        status: effectiveStatus,
        plan: normalizePlanName(subscriptionRow.plan_type),
        hasActiveAccess: hasActiveSubscriptionAccess(effectiveStatus),
      };
    },
    () => getUserPlatformAccessStateViaSupabase(userId, fallbackEmail)
  );
}

function getReferralCommissionPercent(status) {
  return isConfirmedReferralStatus(status) ? Number(process.env.REFERRAL_COMMISSION_PERCENT || 0) : 0;
}

async function getReferralUserDetails(userId, fallbackEmail) {
  const [userResult, subscriptionResult] = await Promise.all([
    pool.query(
      `
      SELECT email, status_da_assinatura, plan_type
      FROM usuarios
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
      `,
      [userId]
    ),
    pool.query(
      `
      SELECT plan_type
      FROM subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
      `,
      [userId]
    ).catch(() => ({ rows: [] }))
  ]);

  const row = userResult.rows[0] || {};
  const subscription = subscriptionResult.rows?.[0] || {};
  return {
    email: String(row.email || fallbackEmail || '').trim() || null,
    status: String(row.status_da_assinatura || '').trim() || null,
    plan: normalizePlanName(subscription.plan_type || row.plan_type),
  };
}

async function getReferralUserDetailsViaSupabase(userId, fallbackEmail) {
  const [userResponse, subscriptionResponse] = await Promise.all([
    supabaseAdminClient
      .from('usuarios')
      .select('email, status_da_assinatura, plan_type')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdminClient
      .from('subscriptions')
      .select('plan_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (userResponse.error) {
    throw createSupabaseFallbackError(userResponse.error, 'Erro ao consultar usuário indicado');
  }

  if (subscriptionResponse.error) {
    throw createSupabaseFallbackError(subscriptionResponse.error, 'Erro ao consultar assinatura do usuário indicado');
  }

  const row = userResponse.data || {};
  const subscription = subscriptionResponse.data || {};
  return {
    email: String(row.email || fallbackEmail || '').trim() || null,
    status: String(row.status_da_assinatura || '').trim() || null,
    plan: normalizePlanName(subscription.plan_type || row.plan_type),
  };
}

function toMoneyNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function refreshReferralHistoriesForReferrer(referrerUserId) {
  const result = await pool.query(
    `
    SELECT id, referred_user_id, referred_email, plan, status, credit_units, valor_compra, comissao_percent, comissao_valor
    FROM referral_histories
    WHERE referrer_user_id = $1
    ORDER BY created_at DESC
    `,
    [referrerUserId]
  );

  for (const row of result.rows) {
    const referredUserId = String(row.referred_user_id || '').trim();
    if (!referredUserId) {
      continue;
    }

    const details = await getReferralUserDetails(referredUserId, row.referred_email);
    const nextStatus = isConfirmedReferralStatus(details.status) ? 'confirmado' : 'pendente';
    const nextPlan = details.plan;
    const nextCreditUnits = getReferralCreditUnits(details.status);
    const nextCommissionPercent = getReferralCommissionPercent(details.status);
    const valorCompra = toMoneyNumber(row.valor_compra);
    const nextCommissionValue = nextStatus === 'confirmado'
      ? Number(((valorCompra * nextCommissionPercent) / 100).toFixed(2))
      : 0;

    const currentStatus = String(row.status || '').trim();
    const currentPlan = normalizePlanName(row.plan);
    const currentCreditUnits = Number(row.credit_units || 0);
    const currentCommissionPercent = toMoneyNumber(row.comissao_percent);
    const currentCommissionValue = toMoneyNumber(row.comissao_valor);

    if (
      currentStatus === nextStatus &&
      currentPlan === nextPlan &&
      currentCreditUnits === nextCreditUnits &&
      currentCommissionPercent === nextCommissionPercent &&
      currentCommissionValue === nextCommissionValue
    ) {
      continue;
    }

    await pool.query(
      `
      UPDATE referral_histories
      SET referred_email = $2,
          plan = $3,
          status = $4,
          credit_units = $5,
          comissao_percent = $6,
          comissao_valor = $7,
          updated_at = NOW()
      WHERE id = $1
      `,
      [
        row.id,
        details.email,
        nextPlan,
        nextStatus,
        nextCreditUnits,
        nextCommissionPercent,
        nextCommissionValue,
      ]
    );
  }
}

async function upsertReferralHistory({ referralCode, referredUserId, referredEmail }) {
  const normalizedCode = normalizeReferralCode(referralCode);
  const normalizedUserId = String(referredUserId || '').trim();
  const normalizedEmail = String(referredEmail || '').trim().toLowerCase() || null;

  if (!normalizedCode || !normalizedUserId) {
    return { success: false, reason: 'invalid_payload' };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const codeResult = await client.query(
      `
      SELECT user_id, code
      FROM referral_codes
      WHERE code = $1
        AND is_active = true
      LIMIT 1
      `,
      [normalizedCode]
    );

    const referrerUserId = String(codeResult.rows[0]?.user_id || '').trim();
    if (!referrerUserId) {
      await client.query('ROLLBACK');
      return { success: false, reason: 'code_not_found' };
    }

    if (referrerUserId === normalizedUserId) {
      await client.query('ROLLBACK');
      return { success: true, ignored: true, reason: 'self_referral' };
    }

    const referralDetails = await getReferralUserDetails(normalizedUserId, normalizedEmail);
    const status = isConfirmedReferralStatus(referralDetails.status) ? 'confirmado' : 'pendente';
    const plan = referralDetails.plan;
    const creditUnits = getReferralCreditUnits(referralDetails.status);
    const comissaoPercent = getReferralCommissionPercent(referralDetails.status);

    const existingByUser = await client.query(
      `
      SELECT id, referrer_user_id
      FROM referral_histories
      WHERE referred_user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [normalizedUserId]
    );

    const existing = existingByUser.rows[0] || null;

    if (existing && String(existing.referrer_user_id || '').trim() !== referrerUserId) {
      await client.query('ROLLBACK');
      return { success: true, ignored: true, reason: 'already_attributed' };
    }

    if (existing) {
      const updated = await client.query(
        `
        UPDATE referral_histories
        SET referral_code = $2,
            referred_email = $3,
            plan = $4,
            status = $5,
            credit_units = $6,
            comissao_percent = $7,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          existing.id,
          normalizedCode,
          referralDetails.email,
          plan,
          status,
          creditUnits,
          comissaoPercent,
        ]
      );

      await client.query('COMMIT');
      return { success: true, record: updated.rows[0], created: false };
    }

    const inserted = await client.query(
      `
      INSERT INTO referral_histories (
        referrer_user_id,
        referred_user_id,
        referral_code,
        referred_email,
        plan,
        status,
        credit_units,
        comissao_percent,
        provider,
        event_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'app_session', $9)
      RETURNING *
      `,
      [
        referrerUserId,
        normalizedUserId,
        normalizedCode,
        referralDetails.email,
        plan,
        status,
        creditUnits,
        comissaoPercent,
        `claim:${normalizedUserId}`,
      ]
    );

    await client.query('COMMIT');
    return { success: true, record: inserted.rows[0], created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function upsertReferralHistoryViaSupabase({ referralCode, referredUserId, referredEmail }) {
  const normalizedCode = normalizeReferralCode(referralCode);
  const normalizedUserId = String(referredUserId || '').trim();
  const normalizedEmail = String(referredEmail || '').trim().toLowerCase() || null;

  if (!normalizedCode || !normalizedUserId) {
    return { success: false, reason: 'invalid_payload' };
  }

  const codeResponse = await supabaseAdminClient
    .from('referral_codes')
    .select('user_id, code')
    .eq('code', normalizedCode)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (codeResponse.error) {
    throw createSupabaseFallbackError(codeResponse.error, 'Erro ao validar código de indicação');
  }

  const referrerUserId = String(codeResponse.data?.user_id || '').trim();
  if (!referrerUserId) {
    return { success: false, reason: 'code_not_found' };
  }

  if (referrerUserId === normalizedUserId) {
    return { success: true, ignored: true, reason: 'self_referral' };
  }

  const referralDetails = await getReferralUserDetailsViaSupabase(normalizedUserId, normalizedEmail);
  const status = isConfirmedReferralStatus(referralDetails.status) ? 'confirmado' : 'pendente';
  const plan = referralDetails.plan;
  const creditUnits = getReferralCreditUnits(referralDetails.status);
  const comissaoPercent = getReferralCommissionPercent(referralDetails.status);

  const existingResponse = await supabaseAdminClient
    .from('referral_histories')
    .select('id, referrer_user_id')
    .eq('referred_user_id', normalizedUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingResponse.error) {
    throw createSupabaseFallbackError(existingResponse.error, 'Erro ao consultar histórico de indicação');
  }

  const existing = existingResponse.data || null;
  if (existing && String(existing.referrer_user_id || '').trim() !== referrerUserId) {
    return { success: true, ignored: true, reason: 'already_attributed' };
  }

  if (existing?.id) {
    const updatedResponse = await supabaseAdminClient
      .from('referral_histories')
      .update({
        referral_code: normalizedCode,
        referred_email: referralDetails.email,
        plan,
        status,
        credit_units: creditUnits,
        comissao_percent: comissaoPercent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (updatedResponse.error) {
      throw createSupabaseFallbackError(updatedResponse.error, 'Erro ao atualizar histórico de indicação');
    }

    return { success: true, record: updatedResponse.data, created: false };
  }

  const insertedResponse = await supabaseAdminClient
    .from('referral_histories')
    .insert([{
      referrer_user_id: referrerUserId,
      referred_user_id: normalizedUserId,
      referral_code: normalizedCode,
      referred_email: referralDetails.email,
      plan,
      status,
      credit_units: creditUnits,
      comissao_percent: comissaoPercent,
      provider: 'app_session',
      event_id: `claim:${normalizedUserId}`,
    }])
    .select('*')
    .maybeSingle();

  if (insertedResponse.error) {
    throw createSupabaseFallbackError(insertedResponse.error, 'Erro ao registrar histórico de indicação');
  }

  return { success: true, record: insertedResponse.data, created: true };
}

async function ensureReferralSchema() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_histories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id TEXT NOT NULL,
      referred_user_id TEXT,
      referral_code TEXT NOT NULL,
      referred_email TEXT,
      plan TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      credit_units INTEGER NOT NULL DEFAULT 0,
      valor_compra NUMERIC(12,2) NOT NULL DEFAULT 0,
      comissao_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
      comissao_valor NUMERIC(12,2) NOT NULL DEFAULT 0,
      provider TEXT,
      event_id TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS referral_histories_referrer_user_id_idx
    ON referral_histories (referrer_user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS referral_histories_referred_user_id_idx
    ON referral_histories (referred_user_id)
  `);
}

async function ensureReferralCodeForUser(userId) {
  const existing = await pool.query(
    'SELECT code FROM referral_codes WHERE user_id = $1 LIMIT 1',
    [userId]
  );

  if (existing.rows[0]?.code) {
    return existing.rows[0].code;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const generated = makeReferralCode(userId);
    const inserted = await pool.query(
      `INSERT INTO referral_codes (user_id, code, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
       RETURNING code`,
      [userId, generated]
    );
    if (inserted.rows[0]?.code) {
      return inserted.rows[0].code;
    }
  }

  const fallback = await pool.query('SELECT code FROM referral_codes WHERE user_id = $1 LIMIT 1', [userId]);
  return fallback.rows[0]?.code || makeReferralCode(userId);
}

async function ensureReferralCodeForUserViaSupabase(userId) {
  const existing = await supabaseAdminClient
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw createSupabaseFallbackError(existing.error, 'Erro ao consultar código de indicação');
  }

  if (existing.data?.code) {
    return existing.data.code;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generated = makeReferralCode(userId);
    const inserted = await supabaseAdminClient
      .from('referral_codes')
      .insert([{ user_id: userId, code: generated, is_active: true }])
      .select('code')
      .maybeSingle();

    if (!inserted.error && inserted.data?.code) {
      return inserted.data.code;
    }

    if (inserted.error && /duplicate key value/i.test(inserted.error.message || '')) {
      continue;
    }

    if (inserted.error) {
      throw createSupabaseFallbackError(inserted.error, 'Erro ao criar código de indicação');
    }
  }

  return makeReferralCode(userId);
}

async function buildReferralResponseViaSupabase(userId, req) {
  const code = await ensureReferralCodeForUserViaSupabase(userId);

  const historyResponse = await supabaseAdminClient
    .from('referral_histories')
    .select('id, referral_code, referred_user_id, referred_email, plan, status, credit_units, valor_compra, comissao_percent, comissao_valor, created_at')
    .eq('referrer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (historyResponse.error) {
    throw createSupabaseFallbackError(historyResponse.error, 'Erro ao carregar histórico de indicações');
  }

  const historyRows = historyResponse.data || [];
  const referredUserIds = [...new Set(historyRows.map((row) => String(row.referred_user_id || '').trim()).filter(Boolean))];

  let usersById = new Map();
  if (referredUserIds.length > 0) {
    const usersResponse = await supabaseAdminClient
      .from('usuarios')
      .select('user_id, nome_completo, email')
      .in('user_id', referredUserIds);

    if (usersResponse.error) {
      throw createSupabaseFallbackError(usersResponse.error, 'Erro ao carregar usuários indicados');
    }

    usersById = new Map((usersResponse.data || []).map((row) => [String(row.user_id || '').trim(), row]));
  }

  const summary = historyRows.reduce((acc, row) => {
    if (String(row.status || '').trim() !== 'confirmado') {
      return acc;
    }

    acc.total_indicacoes += 1;
    acc.total_creditos += Number(row.credit_units || 0);
    acc.total_comissao = Number((acc.total_comissao + toMoneyNumber(row.comissao_valor)).toFixed(2));
    return acc;
  }, {
    total_indicacoes: 0,
    total_creditos: 0,
    total_comissao: 0,
  });

  const appUrl = resolvePublicAppBaseUrl(req);

  return {
    code,
    referral_url: `${appUrl}/?ref=${encodeURIComponent(code)}`,
    summary,
    history: historyRows.map((row) => {
      const referredUserId = String(row.referred_user_id || '').trim();
      const user = usersById.get(referredUserId) || {};
      return {
        ...row,
        indicado_nome: String(user.nome_completo || user.email || row.referred_email || 'Usuário indicado').trim() || 'Usuário indicado',
      };
    }),
  };
}

async function listNotificationsViaSupabase() {
  const response = await supabaseAdminClient
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao carregar notificações');
  }

  return response.data || [];
}

async function createNotificationViaSupabase(title, message) {
  const response = await supabaseAdminClient
    .from('notifications')
    .insert([{ title, message }])
    .select('*')
    .single();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao criar notificação');
  }

  return response.data;
}

app.get('/api/referrals/me', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || '').trim();
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const payload = await withDatabaseFallback(
      'GET /api/referrals/me',
      async () => {
        await ensureReferralSchema();
        const code = await ensureReferralCodeForUser(userId);
        await refreshReferralHistoriesForReferrer(userId);

        const summaryResult = await pool.query(
          `
          SELECT
            COUNT(*)::int AS total_indicacoes,
            COALESCE(SUM(credit_units), 0)::int AS total_creditos,
            COALESCE(SUM(comissao_valor), 0)::numeric(12,2) AS total_comissao
          FROM referral_histories
          WHERE referrer_user_id = $1
            AND status = 'confirmado'
          `,
          [userId]
        );

        const historyResult = await pool.query(
          `
          SELECT
            rh.id,
            rh.referral_code,
            rh.referred_user_id,
            rh.referred_email,
            rh.plan,
            rh.status,
            rh.credit_units,
            rh.valor_compra,
            rh.comissao_percent,
            rh.comissao_valor,
            rh.created_at,
            COALESCE(NULLIF(u.nome_completo, ''), NULLIF(u.email, ''), rh.referred_email, 'Usuário indicado') AS indicado_nome
          FROM referral_histories rh
          LEFT JOIN usuarios u ON u.user_id = rh.referred_user_id
          WHERE rh.referrer_user_id = $1
          ORDER BY rh.created_at DESC
          LIMIT 200
          `,
          [userId]
        );

        const appUrl = resolvePublicAppBaseUrl(req);

        return {
          code,
          referral_url: `${appUrl}/?ref=${encodeURIComponent(code)}`,
          summary: summaryResult.rows[0] || {
            total_indicacoes: 0,
            total_creditos: 0,
            total_comissao: 0,
          },
          history: historyResult.rows || [],
        };
      },
      () => buildReferralResponseViaSupabase(userId, req)
    );

    return res.json(payload);
  } catch (error) {
    console.error('[REFERRALS] /api/referrals/me error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao carregar indicações' });
  }
});

app.post('/api/referrals/claim', async (req, res) => {
  try {
    const userId = String(req.header('x-user-id') || req.body?.user_id || '').trim();
    const referralCode = String(req.body?.referral_code || req.body?.codigo_indicacao || req.body?.ref || '').trim();
    const referredEmail = String(req.body?.email || '').trim();

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!referralCode) {
      return res.status(400).json({ error: 'Código de indicação é obrigatório' });
    }

    const result = await withDatabaseFallback(
      'POST /api/referrals/claim',
      async () => {
        await ensureReferralSchema();
        return upsertReferralHistory({
          referralCode,
          referredUserId: userId,
          referredEmail,
        });
      },
      () => upsertReferralHistoryViaSupabase({
        referralCode,
        referredUserId: userId,
        referredEmail,
      })
    );

    if (!result.success && result.reason === 'code_not_found') {
      return res.status(404).json({ error: 'Código de indicação não encontrado' });
    }

    return res.json({
      success: true,
      ignored: Boolean(result.ignored),
      reason: result.reason || null,
      created: Boolean(result.created),
      record: result.record || null,
    });
  } catch (error) {
    console.error('[REFERRALS] /api/referrals/claim error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao registrar indicação' });
  }
});

app.get('/api/agents', async (req, res) => {
  try {
    const rows = await withDatabaseFallback(
      'GET /api/agents',
      async () => {
        const result = await pool.query('SELECT id, title, description, link, category_ids, created_at, icon, user_id FROM "agents" ORDER BY created_at DESC');
        return result.rows || [];
      },
      () => listAgentsViaSupabase()
    );

    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agents/:id', async (req, res) => {
  try {
    const agent = await withDatabaseFallback(
      'GET /api/agents/:id',
      async () => {
        const result = await pool.query('SELECT * FROM "agents" WHERE id = $1', [req.params.id]);
        return result.rows?.[0] || null;
      },
      () => getAgentViaSupabase(req.params.id)
    );

    if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });
    res.json(agent);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { name, description, instructions } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = await pool.query('INSERT INTO "agents" (name, description, instructions) VALUES ($1, $2, $3) RETURNING *', [name, description || '', instructions || '']);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const { name, description, instructions } = req.body;
    const result = await pool.query('UPDATE "agents" SET name = COALESCE($1, name), description = COALESCE($2, description), instructions = COALESCE($3, instructions) WHERE id = $4 RETURNING *', [name || null, description || null, instructions || null, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agente não encontrado' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM "agents" WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agente não encontrado' });
    res.json({ success: true, message: 'Agente deletado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/debug/chunks', async (req, res) => {
  try {
    const result = await pool.query(`SELECT agent_id, document_id, left(content, 80) as preview, chunk_index, created_at FROM document_chunks ORDER BY created_at DESC LIMIT 10`);
    res.json({ total: result.rows.length, chunks: result.rows });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/db', async (req, res) => {
  const { table, operation, columns, insertData, updateData, filters, orderColumn, orderAsc, limit, countExact, maybeOne } = req.body;
  const allowedTables = ['categories', 'agents', 'custom_links'];
  if (!allowedTables.includes(table)) return res.status(403).json({ data: null, error: { message: 'Tabela não permitida' } });

  try {
    if (operation === 'SELECT') {
      let query = `SELECT ${columns || '*'} FROM "${table}"`;
      const params = [];
      let paramIndex = 1;
      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f) => { params.push(f.value); return `"${f.column}" = $${paramIndex++}`; }).join(' AND ');
      }
      if (orderColumn) query += ` ORDER BY "${orderColumn}" ${orderAsc ? 'ASC' : 'DESC'}`;
      if (limit) query += ` LIMIT ${limit}`;
      const result = await pool.query(query, params);
      if (countExact) return res.json({ data: result.rows || [], error: null, count: result.rows?.length || 0 });
      return res.json({ data: result.rows || [], error: null });
    } else if (operation === 'INSERT') {
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
      const result = await pool.query(query, values);
      return res.json({ data: result.rows || [], error: null });
    } else if (operation === 'UPDATE') {
      const updateColumns = Object.keys(updateData);
      const updateValues = Object.values(updateData);
      let paramIndex = updateValues.length + 1;
      let query = `UPDATE "${table}" SET ${updateColumns.map((col, i) => `"${col}" = $${i + 1}`).join(', ')}`;
      const params = [...updateValues];
      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f) => { params.push(f.value); return `"${f.column}" = $${paramIndex++}`; }).join(' AND ');
      }
      query += ' RETURNING *';
      const result = await pool.query(query, params);
      return res.json({ data: result.rows || [], error: null });
    } else if (operation === 'DELETE') {
      let query = `DELETE FROM "${table}"`;
      const params = [];
      let paramIndex = 1;
      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f) => { params.push(f.value); return `"${f.column}" = $${paramIndex++}`; }).join(' AND ');
      }
      query += ' RETURNING *';
      const result = await pool.query(query, params);
      return res.json({ data: result.rows || [], error: null });
    }
  } catch (error) {
    return res.status(500).json({ data: null, error: { message: error.message || 'Erro na query' } });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "categories" ORDER BY name ASC');
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = await pool.query('INSERT INTO "categories" (name, description) VALUES ($1, $2) RETURNING *', [name, description || '']);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "custom_links" ORDER BY title ASC');
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/links', async (req, res) => {
  try {
    const { title, url } = req.body;
    if (!title || !url) return res.status(400).json({ error: 'Título e URL são obrigatórios' });
    const result = await pool.query('INSERT INTO "custom_links" (title, url) VALUES ($1, $2) RETURNING *', [title, url]);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Servir frontend ---
if (isProduction) {
  // PRODUÇÃO: servir arquivos estáticos do build
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  // SPA fallback: qualquer rota não-api retorna index.html
  app.get('/{*splat}', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Endpoint não encontrado' });
    }
  });
} else {
  // DESENVOLVIMENTO: usar Vite dev server com HMR
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.use('/', async (req, res) => {
    try {
      let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      res.status(500).end(e.message);
    }
  });
}

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server on http://localhost:${PORT} (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'})`);
  console.log(`🧠 RAG OTIMIZADO (Chunk: 4000 | Overlap: 1000 | Top-K: 12 | Sim >= 0.40)`);
});

// ✅ CORREÇÃO 3: Aumentar timeout para processar PDFs pesados (10 minutos)
server.timeout = 600000;
