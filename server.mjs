import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dns from 'dns/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pkg from 'pg';
import OpenAI from 'openai';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
const { Pool } = pkg;
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const allowDevAdminLogin = !isProduction && String(process.env.ALLOW_DEV_ADMIN_LOGIN || '').trim().toLowerCase() === 'true';
const app = express();

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

function getAiRuntimeConfig() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const useGemini = Boolean(process.env.GEMINI_API_KEY);
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || (useGemini ? GEMINI_OPENAI_BASE_URL : undefined);

  return {
    apiKey,
    baseURL,
    useGemini,
    chatModel: process.env.CHAT_MODEL || (useGemini ? 'gemini-2.5-flash' : 'gpt-4o'),
    fastChatModel: process.env.FAST_CHAT_MODEL || (useGemini ? 'gemini-2.5-flash' : 'gpt-4o-mini'),
    embeddingModel: process.env.EMBEDDING_MODEL || (useGemini ? 'gemini-embedding-001' : 'text-embedding-3-large')
  };
}

function createAiClient() {
  const cfg = getAiRuntimeConfig();
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
  });
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
      String(params.userId || '').trim() || null,
      Number.isFinite(params.conversationId) ? params.conversationId : null,
      String(params.requestType || 'chat_completion').trim(),
      String(params.model || '').trim() || null,
      String(params.status || 'success').trim(),
      Math.max(0, Math.floor(Number(params.promptTokens || 0))),
      Math.max(0, Math.floor(Number(params.completionTokens || 0))),
      Math.max(0, Math.floor(Number(params.totalTokens || 0))),
      Number(params.costUsd || 0),
      String(params.errorMessage || '').trim() || null,
    ]
  );
}

function logAiUsageSafe(params = {}) {
  void logAiUsage(params).catch((error) => {
    console.warn('[AI USAGE] Falha ao registrar uso:', error?.message || error);
  });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseAuth = Boolean(supabaseUrl && supabaseAnonKey);
const hasSupabaseAdmin = Boolean(supabaseUrl && supabaseServiceRoleKey);

const supabaseAuthClient = hasSupabaseAuth
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const supabaseAdminClient = hasSupabaseAdmin
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

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

const memoryChatStore = {
  nextConversationId: 1,
  nextMessageId: 1,
  conversations: [],
  messages: []
};

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
    'ECONNRESET'
  ].includes(code) || [
    'ENETUNREACH',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'FAILED TO FETCH',
    'TIMEOUT EXPIRED',
    'CONNECT'
  ].some((token) => message.includes(token));
}

function createSupabaseFallbackError(error, message) {
  const fallbackError = new Error(message || error?.message || 'Falha ao consultar o Supabase');
  fallbackError.cause = error;
  return fallbackError;
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

    console.warn(`[DB-FALLBACK] ${label}: usando Supabase REST devido a falha no Postgres`, error?.message || error);
    return fallback(error);
  }
}

const TUTORIAL_ADMIN_USER_ID = '07d16581-fca5-4709-b0d3-e09859dbb286';

// ============================================
// 🧠 FUNÇÕES RAG PROFISSIONAL
// ============================================

// 1️⃣ Extrair e Limpar PDF (CORRIGIDO COM LIMPEZA DE BUFFER AVANÇADA)
async function extractPdfText(filePath) {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    
    // ✅ LIMPEZA DE BUFFER: Forçamos pdf-parse ser resiliente
    const data = await pdfParse(fileBuffer, {
      // Esta função de pagerender tenta ignorar erros de cada página
      pagerender: function(pageData) {
        return pageData.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false
        }).then(function(textContent) {
          return textContent.items.map(item => item.str).join(' ');
        });
      }
    });

    let text = data.text || '';

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
    text = text.replace(/\s+/g, ' ').trim(); 

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

    // Fallback com Gemini para PDFs escaneados/imagem quando extração local falhar
    if (text.length < 300) {
      try {
        const geminiKey = process.env.GEMINI_API_KEY;
        const geminiModel = process.env.FAST_CHAT_MODEL || 'gemini-2.5-flash';

        if (geminiKey) {
          const maxBytes = 18 * 1024 * 1024;
          if (fileBuffer.length <= maxBytes) {
            const base64Pdf = fileBuffer.toString('base64');

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
                        { text: 'Extraia o máximo de texto útil deste PDF em português, preservando títulos e seções. Retorne apenas texto.' },
                        { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }
                      ]
                    }
                  ],
                  generationConfig: { temperature: 0 }
                })
              }
            );

            if (geminiResp.ok) {
              const geminiData = await geminiResp.json();
              const parts = geminiData?.candidates?.[0]?.content?.parts || [];
              const geminiText = parts.map(p => p?.text || '').join('\n').trim();

              if (geminiText.length > text.length) {
                console.log(`[PDF][GEMINI_FALLBACK] Texto extraído via Gemini: ${geminiText.length} chars`);
                text = geminiText;
              }
            } else {
              const errBody = await geminiResp.text();
              console.warn('[PDF][GEMINI_FALLBACK] Falha na API Gemini:', errBody?.slice(0, 300));
            }
          } else {
            console.warn('[PDF][GEMINI_FALLBACK] PDF muito grande para fallback inline.');
          }
        }
      } catch (fallbackErr) {
        console.warn('[PDF][GEMINI_FALLBACK] Erro no fallback:', fallbackErr?.message || fallbackErr);
      }
    }

    return text;
  } catch (e) {
    console.error('[PDF] Erro ao extrair:', e.message);
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
    const openai = createAiClient();

    const imageBuffer = await fs.promises.readFile(filePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(fileName || filePath).replace('.', '').toLowerCase() || 'png';

    const response = await openai.chat.completions.create({
      model: cfg.fastChatModel,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extraia todo o texto visível desta imagem em português e, ao final, forneça um resumo curto do conteúdo principal. Retorne apenas texto puro.'
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
    });

    const content = (response.choices?.[0]?.message?.content || '').trim();
    const promptTokens = estimateTokens('ocr-image');
    const completionTokens = estimateTokens(content);
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
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function extractPrimaryHtmlContent(html = '') {
  const source = String(html || '');
  const mainCandidates = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<section[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/section>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
    /<body[^>]*>([\s\S]*?)<\/body>/i,
  ];

  for (const pattern of mainCandidates) {
    const match = source.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length > 800) {
      return candidate;
    }
  }

  return source;
}

function htmlToPlainText(html = '') {
  return decodeHtmlEntities(
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
      .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6)>/gi, '\n')
      .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, ' $2 ($1) ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
  ).trim();
}

async function fetchLinkKnowledgeSource(rawUrl) {
  const response = await fetch(rawUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (FlixPrev Link Ingestion/1.0)',
      Accept: 'text/html,application/pdf,text/plain,application/xhtml+xml,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Falha ao acessar ${rawUrl}: ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const finalUrl = response.url || rawUrl;
  const isPdf = contentType.includes('application/pdf') || /\.pdf([?#].*)?$/i.test(finalUrl);

  if (isPdf) {
    const fileBuffer = Buffer.from(await response.arrayBuffer());
    return {
      extension: 'pdf',
      buffer: fileBuffer,
      title: '',
      finalUrl,
    };
  }

  const bodyText = await response.text();
  const pageTitle = bodyText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  const metaDescription = bodyText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i)?.[1]?.trim() || '';
  const extractedText = contentType.includes('text/html')
    ? htmlToPlainText(bodyText)
    : bodyText.trim();

  const normalizedText = [
    `FONTE: ${finalUrl}`,
    pageTitle ? `TITULO: ${decodeHtmlEntities(pageTitle)}` : '',
    metaDescription ? `DESCRICAO: ${decodeHtmlEntities(metaDescription)}` : '',
    extractedText,
  ].filter(Boolean).join('\n\n').trim();

  return {
    extension: 'txt',
    buffer: Buffer.from(normalizedText, 'utf-8'),
    title: decodeHtmlEntities(pageTitle),
    finalUrl,
  };
}

async function askGeminiDirectlyFromPdf(fullPath, fileName, question, agentInstructions = '', logContext = {}) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return '';

    const model = process.env.FAST_CHAT_MODEL || process.env.CHAT_MODEL || 'gemini-2.5-flash';
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
      model: process.env.FAST_CHAT_MODEL || process.env.CHAT_MODEL || 'gemini-2.5-flash',
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

// 2️⃣ Chunking Inteligente - CONFIGURAÇÃO NUCLEAR (4000/1000)
function chunkText(text, size = 4000, overlap = 1000) {
  if (!text || text.trim().length === 0) {
    console.warn('[CHUNK] Texto vazio, nenhum chunk criado.');
    return [];
  }

  // Normalizar espaços em branco
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let start = 0;

  while (start < cleanText.length) {
    let end = start + size;

    // Se não estamos no final do texto, tentar recuar até o último ponto final
    if (end < cleanText.length) {
      const lastPeriod = cleanText.lastIndexOf('.', end);
      const lastSpace = cleanText.lastIndexOf(' ', end);

      if (lastPeriod > start + (size * 0.8)) {
        end = lastPeriod + 1; // Inclui o ponto
      } else if (lastSpace > start + (size * 0.5)) {
        end = lastSpace; // Corta no espaço
      }
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Avança para o próximo, considerando o overlap GIGANTE de 1000
    start = end - overlap;

    // Proteção contra loop infinito
    if (start >= end) start = end;
  }

  console.log(`[CHUNK NUCLEAR] Gerados ${chunks.length} chunks de aprox ${size} chars.`);
  return chunks;
}

// 3️⃣ Gerar embeddings (OpenAI/Gemini)
async function generateEmbeddings(chunks, logContext = {}) {
  const cfg = getAiRuntimeConfig();
  const openai = createAiClient();

  const embeddings = [];
  console.log(`[EMB] Gerando embeddings para ${chunks.length} chunks...`);

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await openai.embeddings.create({
        model: cfg.embeddingModel,
        input: chunks[i]
      });
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

// 4️⃣ Busca semântica com pgvector - CONFIGURAÇÃO NUCLEAR (Limit 25)
async function searchSimilarChunks(queryEmbedding, agentId, limit = 25, queryText = '') {
  try {
    return await withDatabaseFallback(
      'searchSimilarChunks',
      async () => {
        const embeddingString = '[' + queryEmbedding.join(',') + ']';

        const result = await pool.query(`
          SELECT content, chunk_index, 1 - (embedding <=> $2::vector) as similarity
          FROM document_chunks
          WHERE agent_id = $1
          ORDER BY embedding <=> $2::vector
          LIMIT $3
        `, [agentId, embeddingString, limit]);

        console.log('--- TESTE DE RECUPERAÇÃO (RAG NUCLEAR) ---');
        console.log(`Agente: ${agentId}`);
        console.log(`Chunks encontrados: ${result.rows.length}/${limit}`);

        if (result.rows.length > 0) {
          result.rows.slice(0, 3).forEach((r, i) => {
            console.log(`Chunk ${i + 1} (Sim: ${r.similarity.toFixed(3)}): ${r.content.substring(0, 60)}...`);
          });
        }
        console.log('----------------------------------');

        const bestSimilarity = result.rows?.[0]?.similarity ?? 0;
        if (bestSimilarity < 0.35) {
          console.log(`[SEARCH] Similaridade baixa (${bestSimilarity.toFixed(3)}). Ignorando contexto documental nesta pergunta.`);
          return '';
        }

        return result.rows.map(r => `[Trecho ID: ${r.chunk_index}]\n${r.content}`).join('\n\n---\n\n');
      },
      () => searchSimilarChunksViaSupabase(queryText, agentId, limit)
    );
  } catch (e) {
    console.error('[SEARCH] Erro fatal na busca vetorial:', e.message);
    return '';
  }
}

// 4B️⃣ Busca por palavra-chave (fallback)
async function searchKeywordChunks(keyword, agentId, limit = 5) {
  try {
    return await withDatabaseFallback(
      'searchKeywordChunks',
      async () => {
        const result = await pool.query(`
          SELECT content
          FROM document_chunks
          WHERE agent_id = $1 AND content ILIKE $2
          LIMIT $3
        `, [agentId, '%' + keyword + '%', limit]);

        console.log(`[KEYWORD_SEARCH] Encontrados ${result.rows.length} chunks com palavra-chave: "${keyword}"`);
        return result.rows.map(r => r.content).join('\n\n---\n\n');
      },
      () => searchKeywordChunksViaSupabase(keyword, agentId, limit)
    );
  } catch (e) {
    console.error('[KEYWORD_SEARCH] Erro:', e.message);
    return '';
  }
}

// 4C️⃣ Busca por ordem cronológica
async function getFirstChunks(agentId, limit = 3) {
  try {
    return await withDatabaseFallback(
      'getFirstChunks',
      async () => {
        const result = await pool.query(`
          SELECT content
          FROM document_chunks
          WHERE agent_id = $1
          ORDER BY chunk_index ASC
          LIMIT $2
        `, [agentId, limit]);

        console.log(`[ORDER_SEARCH] Recuperados os primeiros ${result.rows.length} chunks.`);
        return result.rows.map(r => r.content).join('\n\n---\n\n');
      },
      () => getFirstChunksViaSupabase(agentId, limit)
    );
  } catch (e) {
    console.error('[ORDER_SEARCH] Erro:', e.message);
    return '';
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

async function reindexAgentAttachments(agentId, attachments = []) {
  const validAttachments = Array.isArray(attachments) ? attachments : [];
  return withDatabaseFallback(
    'reindexAgentAttachments',
    async () => {
      await pool.query('DELETE FROM documents WHERE agent_id = $1', [agentId]);

      let processedCount = 0;
      let skippedCount = 0;
      let totalChunks = 0;

      for (const attachment of validAttachments) {
        try {
          const filePath = attachment.startsWith('/') ? attachment : `/${attachment}`;
          const fileName = attachment.split('/').pop() || attachment;
          const fullPath = path.join(process.cwd(), 'public', filePath);

          if (!fs.existsSync(fullPath)) {
            skippedCount += 1;
            continue;
          }

          const text = await extractAttachmentText(fullPath, fileName);
          if (!text || text.trim().length < 50) {
            skippedCount += 1;
            continue;
          }

          const docResult = await pool.query(
            'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
            [agentId, fileName]
          );
          const documentId = docResult.rows[0].id;

          const chunks = chunkText(text, 4000, 1000);
          if (chunks.length === 0) {
            skippedCount += 1;
            continue;
          }

          const embeddings = await generateEmbeddings(chunks);

          for (let index = 0; index < chunks.length; index += 1) {
            const embeddingString = '[' + embeddings[index].join(',') + ']';
            await pool.query(
              `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
               VALUES ($1, $2, $3, $4::vector, $5)`,
              [agentId, documentId, chunks[index], embeddingString, index]
            );
          }

          processedCount += 1;
          totalChunks += chunks.length;
        } catch (error) {
          skippedCount += 1;
          console.error('[REINDEX] Erro ao processar attachment:', attachment, error?.message || error);
        }
      }

      return {
        processedCount,
        skippedCount,
        totalChunks,
      };
    },
    () => reindexAgentAttachmentsViaSupabase(agentId, validAttachments)
  );
}

// ============================================
// 1️⃣ RESPONSE ORCHESTRATOR
// ============================================

function orchestrateResponse(rawResponse, questionType, hasContext = true) {
  // Se não tiver resposta alguma, devolve fallback amigável
  if (!rawResponse || rawResponse.trim().length === 0) {
    return hasContext
      ? "Não encontrei essa informação no documento analisado. Se preferir, posso buscar por termos relacionados."
      : "Não consegui gerar uma resposta agora. Pode reformular sua pergunta?";
  }

  let formattedResponse = rawResponse;

  // Remover IDs internos de chunk
  formattedResponse = formattedResponse.replace(/\[\s*Trecho\s*ID\s*:\s*\d+\s*\]/gi, '').trim();

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

// 5️⃣ Prompt GLOBAL DEFINITIVO (Ajustado para Visão Panorâmica)
function buildPrompt(context, agentInstructions, question, toneStyle = 'chatgpt', conversationContext = '') {
  const hasContext = Boolean(context && context.trim().length > 0);
  const hasConversationContext = Boolean(conversationContext && conversationContext.trim().length > 0);
  const conversationBlock = hasConversationContext
    ? `\nCONTEXTO RECENTE DA CONVERSA:\n${conversationContext}\n`
    : '';

  if (!hasContext) {
    return `🎯 PERSONA: CONSULTOR SÊNIOR
Você é um especialista direto, elegante e organizado.

INSTRUÇÕES DO AGENTE:
${agentInstructions || "Atue como um assistente técnico."}

REGRAS:
1. Responda com clareza e objetividade.
2. Se a pergunta for sobre o tema principal do agente, responda normalmente com base nas instruções acima.
3. Se não souber, seja transparente e peça mais contexto.
4. Considere o histórico recente da conversa para não repetir perguntas já respondidas.
5. Se o usuário estiver retomando um assunto anterior, continue do ponto em que a conversa parou.

${conversationBlock}
PERGUNTA DO USUÁRIO:
${question}

RESPONDA AGORA:`;
  }

  const contextBlock = (context && context.trim().length > 0)
    ? `[INÍCIO DO CONTEXTO EXTENDIDO]\n${context}\n[FIM DO CONTEXTO EXTENDIDO]`
    : '';

  return `🎯 PERSONA: CONSULTOR SÊNIOR
Você é um especialista direto, elegante e organizado.

### REGRAS CRÍTICAS (MODO VISÃO PANORÂMICA):
1. **LEITURA COMPLETA**: Você recebeu um volume GRANDE de contexto (aprox. 25 trechos). Você DEVE ler e considerar TODOS os fragmentos antes de responder. A resposta pode estar no fragmento 1 ou no fragmento 25.
2. **SÍNTESE OBRIGATÓRIA**: Informações complexas podem estar divididas entre vários trechos. Una os pontos.
3. **FIDELIDADE**: Priorize os trechos abaixo quando a pergunta estiver relacionada aos anexos, URLs e documentos.
4. **LIMPEZA**: Não mencione [Trecho ID] na resposta.
5. **BUSCA PROFUNDA**: Se o usuário perguntar por um detalhe específico, vasculhe cada linha do contexto fornecido. Se estiver lá, você deve encontrar.
6. **MODO HÍBRIDO**: Se a pergunta não estiver relacionada ao conteúdo dos anexos, responda normalmente seguindo as instruções do agente.
7. **MEMÓRIA DE CONVERSA**: Use o histórico recente para manter continuidade, não repetir respostas e não pedir novamente informações que já foram dadas.

FONTE DE VERDADE:
Responda baseando-se no [CONTEXTO] abaixo. Use as informações fornecidas para construir uma resposta útil e completa.

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
      return "Não encontrei essa informação no documento. Posso ajudar com outro tópico?";
    }
  }

  finalResponse = orchestrateResponse(finalResponse, questionType, hasContext);
  return finalResponse;
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

async function ensureAccountProfileSchema() {
  await pool.query(`
    ALTER TABLE IF EXISTS public.usuarios
      ADD COLUMN IF NOT EXISTS nome_completo text,
      ADD COLUMN IF NOT EXISTS documento text,
      ADD COLUMN IF NOT EXISTS telefone text,
      ADD COLUMN IF NOT EXISTS ramos_atuacao text[] DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS cep text,
      ADD COLUMN IF NOT EXISTS logradouro text,
      ADD COLUMN IF NOT EXISTS bairro text,
      ADD COLUMN IF NOT EXISTS cidade text,
      ADD COLUMN IF NOT EXISTS estado text,
      ADD COLUMN IF NOT EXISTS regiao text,
      ADD COLUMN IF NOT EXISTS sexo text,
      ADD COLUMN IF NOT EXISTS idade integer,
      ADD COLUMN IF NOT EXISTS data_nascimento date,
      ADD COLUMN IF NOT EXISTS origem_cadastro text,
      ADD COLUMN IF NOT EXISTS cadastro_finalizado_em timestamptz;
  `);
}

function normalizeAccountTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function normalizeAccountAge(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

async function readAccountProfileViaSupabase(userId) {
  const [profileResponse, userResponse] = await Promise.all([
    supabaseAdminClient
      .from('profiles')
      .select('id, first_name, last_name, avatar_url, role, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    supabaseAdminClient
      .from('usuarios')
      .select('user_id, nome_completo, email, documento, telefone, ramos_atuacao, cep, logradouro, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em, status_da_assinatura, updated_at, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (profileResponse.error) {
    throw createSupabaseFallbackError(profileResponse.error, 'Erro ao carregar perfil em profiles');
  }

  if (userResponse.error) {
    throw createSupabaseFallbackError(userResponse.error, 'Erro ao carregar perfil em usuarios');
  }

  const profileRow = profileResponse.data || {};
  const userRow = userResponse.data || {};
  const fullName = String(userRow.nome_completo || '').trim();
  const splitName = splitAccountFullName(fullName);

  return {
    id: String(profileRow.id || userId),
    first_name: profileRow.first_name || splitName.firstName,
    last_name: profileRow.last_name || splitName.lastName,
    avatar_url: profileRow.avatar_url || null,
    role: String(profileRow.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
    updated_at: profileRow.updated_at || userRow.updated_at || null,
    nome_completo: fullName || null,
    email: String(userRow.email || '').trim() || null,
    documento: String(userRow.documento || '').trim() || null,
    telefone: String(userRow.telefone || '').trim() || null,
    ramos_atuacao: Array.isArray(userRow.ramos_atuacao) ? userRow.ramos_atuacao : [],
    cep: String(userRow.cep || '').trim() || null,
    logradouro: String(userRow.logradouro || '').trim() || null,
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

async function saveAccountProfileViaSupabase(userId, payload = {}) {
  const normalizedFullName = String(payload.full_name || payload.nome_completo || '').trim();
  const normalizedEmail = String(payload.email || '').trim().toLowerCase();
  const normalizedDocumento = String(payload.documento || '').trim();
  const normalizedTelefone = String(payload.telefone || '').trim();
  const normalizedPracticeAreas = normalizeAccountTextArray(payload.practice_areas || payload.ramos_atuacao);
  const normalizedCep = String(payload.cep || '').trim();
  const normalizedLogradouro = String(payload.logradouro || '').trim();
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

  const usuarioResponse = await supabaseAdminClient
    .from('usuarios')
    .upsert(
      [{
        user_id: userId,
        nome_completo: normalizedFullName || null,
        email: normalizedEmail || null,
        documento: normalizedDocumento || null,
        telefone: normalizedTelefone || null,
        ramos_atuacao: normalizedPracticeAreas,
        cep: normalizedCep || null,
        logradouro: normalizedLogradouro || null,
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
      }],
      { onConflict: 'user_id' }
    );

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
      await ensureAccountProfileSchema();

      const [profileResult, userResult] = await Promise.all([
        pool.query(
          `
          SELECT id, first_name, last_name, avatar_url, role, updated_at
          FROM public.profiles
          WHERE id = $1
          LIMIT 1
          `,
          [userId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `
          SELECT user_id, nome_completo, email, documento, telefone, status_da_assinatura, updated_at, created_at
          , ramos_atuacao, cep, logradouro, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em
          FROM public.usuarios
          WHERE user_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          `,
          [userId]
        ).catch(() => ({ rows: [] }))
      ]);

      const profileRow = profileResult.rows?.[0] || {};
      const userRow = userResult.rows?.[0] || {};
      const fullName = String(userRow.nome_completo || '').trim();
      const splitName = splitAccountFullName(fullName);

      return {
        id: String(profileRow.id || userId),
        first_name: profileRow.first_name || splitName.firstName,
        last_name: profileRow.last_name || splitName.lastName,
        avatar_url: profileRow.avatar_url || null,
        role: String(profileRow.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
        updated_at: profileRow.updated_at || userRow.updated_at || null,
        nome_completo: fullName || null,
        email: String(userRow.email || '').trim() || null,
        documento: String(userRow.documento || '').trim() || null,
        telefone: String(userRow.telefone || '').trim() || null,
        ramos_atuacao: Array.isArray(userRow.ramos_atuacao) ? userRow.ramos_atuacao : [],
        cep: String(userRow.cep || '').trim() || null,
        logradouro: String(userRow.logradouro || '').trim() || null,
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
    },
    () => readAccountProfileViaSupabase(userId)
  );
}

async function saveAccountProfile(userId, payload = {}) {
  return withDatabaseFallback(
    'saveAccountProfile',
    async () => {
      await ensureAccountProfileSchema();

      const normalizedFullName = String(payload.full_name || payload.nome_completo || '').trim();
      const normalizedEmail = String(payload.email || '').trim().toLowerCase();
      const normalizedDocumento = String(payload.documento || '').trim();
      const normalizedTelefone = String(payload.telefone || '').trim();
      const normalizedPracticeAreas = normalizeAccountTextArray(payload.practice_areas || payload.ramos_atuacao);
      const normalizedCep = String(payload.cep || '').trim();
      const normalizedLogradouro = String(payload.logradouro || '').trim();
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
            bairro = $9,
            cidade = $10,
            estado = $11,
            regiao = $12,
            sexo = $13,
            idade = $14,
            data_nascimento = $15,
            origem_cadastro = COALESCE(NULLIF($16, ''), origem_cadastro),
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
          normalizedPracticeAreas,
          normalizedCep || null,
          normalizedLogradouro || null,
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
          INSERT INTO public.usuarios (user_id, nome_completo, email, documento, telefone, ramos_atuacao, cep, logradouro, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
          `,
          [
            userId,
            normalizedFullName || null,
            normalizedEmail || null,
            normalizedDocumento || null,
            normalizedTelefone || null,
            normalizedPracticeAreas,
            normalizedCep || null,
            normalizedLogradouro || null,
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

function buildSubscriptionResponse(subscriptionRow, userRow, eventRows = []) {
  const details = readSubscriptionDetails(subscriptionRow?.metadata || {});
  const current = subscriptionRow
    ? {
        id: String(subscriptionRow.id || ''),
        status: asCleanString(subscriptionRow.status),
        user_status: asCleanString(userRow?.status_da_assinatura),
        plan_type: asCleanString(subscriptionRow.plan_type),
        provider: asCleanString(subscriptionRow.provider) || 'manual',
        starts_at: asIsoDate(subscriptionRow.starts_at),
        expires_at: asIsoDate(subscriptionRow.expires_at) || details.expires_at,
        updated_at: asIsoDate(subscriptionRow.updated_at),
        updated_by_webhook_at: asIsoDate(subscriptionRow.updated_by_webhook_at),
        external_customer_id: asCleanString(subscriptionRow.external_customer_id),
        external_subscription_id: asCleanString(subscriptionRow.external_subscription_id) || details.external_subscription_id,
        product_name: details.product_name,
        offer_name: details.offer_name,
        amount: details.amount,
        currency: details.currency,
        payment_method: details.payment_method,
        purchase_date: details.purchase_date,
        due_date: details.due_date,
        next_charge_at: details.next_charge_at,
        subscription_period: details.subscription_period,
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

  return {
    current,
    history,
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
        ).catch(() => ({ rows: [] })),
        pool.query(
          `
          SELECT user_id, status_da_assinatura, email, updated_at, created_at
          FROM public.usuarios
          WHERE user_id = $1
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
          LIMIT 1
          `,
          [userId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `
          SELECT id, provider, event_id, event_type, payload, processing_status, created_at, processed_at
          FROM public.subscription_webhook_events
          WHERE matched_user_id = $1
          ORDER BY created_at DESC NULLS LAST
          LIMIT 20
          `,
          [userId]
        ).catch(() => ({ rows: [] }))
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

function formatManagedAddress(logradouro, numero, complemento) {
  return [
    String(logradouro || '').trim(),
    String(numero || '').trim() ? `, ${String(numero || '').trim()}` : '',
    String(complemento || '').trim() ? ` - ${String(complemento || '').trim()}` : '',
  ].join('').trim() || null;
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
  const authUsers = [];
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

  const [profilesResponse, subscriptionsResponse, usuariosPrimaryResponse] = await Promise.all([
    client.from('profiles').select('id, first_name, last_name, avatar_url, role, updated_at'),
    client.from('subscriptions').select('user_id, plan_type, expires_at'),
    client.from('usuarios').select('user_id, status_da_assinatura, documento, telefone, nome_completo, email, ramos_atuacao, cep, logradouro, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em')
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

  return authUsers
    .map((authUser) => {
      const userId = String(authUser.id || '').trim();
      const profile = profilesById.get(userId) || {};
      const usuario = usuariosById.get(userId) || {};
      const subscription = subscriptionsById.get(userId) || {};
      const userMetadata = authUser.user_metadata || {};

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
        ramos_atuacao: Array.isArray(usuario.ramos_atuacao) ? usuario.ramos_atuacao : null,
        cep: usuario.cep || null,
        logradouro: usuario.logradouro || null,
        numero: null,
        complemento: null,
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
        subscription_expires_at: subscription.expires_at || null,
        nome_completo: usuario.nome_completo || userMetadata.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null,
      };
    })
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

async function createAdminUserViaSupabase(payload = {}) {
  const client = ensureSupabaseAdminAvailable();

  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.full_name || payload.fullName || '').trim();
  const role = String(payload.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  const password = String(payload.password || '');
  const documento = String(payload.documento || '').trim() || null;
  const telefone = String(payload.telefone || '').trim() || null;
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
  const logradouroCompleto = formatManagedAddress(logradouro, numero, complemento);

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
    user_metadata: { first_name: firstName, last_name: lastName, role, full_name: fullName },
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
    .update({ first_name: firstName, last_name: lastName, role })
    .eq('id', userId)
    .select('id, first_name, last_name, role')
    .single();

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
      ramos_atuacao: ramosAtuacao,
      cep,
      logradouro: logradouroCompleto || logradouro,
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

async function updateAgentKnowledgeViaSupabase(agentId, attachments = [], extraLinks = []) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('agents')
    .update({
      attachments: Array.isArray(attachments) ? attachments : [],
      extra_links: Array.isArray(extraLinks) ? extraLinks : [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentId)
    .select('*')
    .maybeSingle();

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao atualizar base de conhecimento do agente');
  }

  return response.data || null;
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

  const rows = chunks.map((content, index) => ({
    agent_id: agentId,
    document_id: documentId,
    content,
    chunk_index: index,
    embedding: null,
  }));

  const response = await client.from('document_chunks').insert(rows);
  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao salvar chunks do agente');
  }

  return rows.length;
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

  return Number(response.count || 0);
}

async function getFirstChunksViaSupabase(agentId, limit = 3) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('document_chunks')
    .select('content, chunk_index')
    .eq('agent_id', agentId)
    .order('chunk_index', { ascending: true })
    .limit(limit);

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao carregar primeiros chunks do agente');
  }

  return (response.data || []).map((row) => row.content).join('\n\n---\n\n');
}

async function searchKeywordChunksViaSupabase(keyword, agentId, limit = 3) {
  const client = ensureSupabaseAdminAvailable();
  const normalizedKeyword = String(keyword || '').trim();
  if (!normalizedKeyword) {
    return '';
  }

  const response = await client
    .from('document_chunks')
    .select('content, chunk_index')
    .eq('agent_id', agentId)
    .ilike('content', `%${normalizedKeyword}%`)
    .order('chunk_index', { ascending: true })
    .limit(limit);

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao buscar chunks por palavra-chave');
  }

  return (response.data || []).map((row) => row.content).join('\n\n---\n\n');
}

function scoreChunkAgainstQuery(content = '', queryText = '') {
  const normalizedContent = String(content || '').toLowerCase();
  const tokens = Array.from(new Set(String(queryText || '').toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || []));
  if (!normalizedContent || tokens.length === 0) {
    return 0;
  }

  return tokens.reduce((score, token) => score + (normalizedContent.includes(token) ? token.length : 0), 0);
}

async function searchSimilarChunksViaSupabase(queryText, agentId, limit = 25) {
  const client = ensureSupabaseAdminAvailable();
  const response = await client
    .from('document_chunks')
    .select('content, chunk_index')
    .eq('agent_id', agentId)
    .order('chunk_index', { ascending: true })
    .limit(Math.max(limit * 4, 80));

  if (response.error) {
    throw createSupabaseFallbackError(response.error, 'Erro ao recuperar chunks do agente');
  }

  return (response.data || [])
    .map((row) => ({
      content: row.content,
      chunk_index: row.chunk_index,
      score: scoreChunkAgainstQuery(row.content, queryText),
    }))
    .sort((a, b) => (b.score - a.score) || (a.chunk_index - b.chunk_index))
    .slice(0, limit)
    .map((row) => row.content)
    .join('\n\n---\n\n');
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

async function indexAgentAttachmentContent(agentId, title, text) {
  const normalizedText = String(text || '').trim();
  if (!agentId || normalizedText.length <= 50) {
    return { chunksCount: 0 };
  }

  return withDatabaseFallback(
    'indexAgentAttachmentContent',
    async () => {
      const docResult = await pool.query(
        'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
        [agentId, title]
      );
      const documentId = docResult.rows[0].id;

      const chunks = chunkText(normalizedText, 4000, 1000);
      const embeddings = await generateEmbeddings(chunks);

      for (let index = 0; index < chunks.length; index += 1) {
        const embeddingString = '[' + embeddings[index].join(',') + ']';
        await pool.query(
          `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
           VALUES ($1, $2, $3, $4::vector, $5)`,
          [agentId, documentId, chunks[index], embeddingString, index]
        );
      }

      return { chunksCount: chunks.length };
    },
    async () => {
      const documentId = await insertAgentDocumentViaSupabase(agentId, title);
      const chunks = chunkText(normalizedText, 4000, 1000);
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
      const filePath = attachment.startsWith('/') ? attachment : `/${attachment}`;
      const fileName = attachment.split('/').pop() || attachment;
      const fullPath = path.join(process.cwd(), 'public', filePath);

      if (!fs.existsSync(fullPath)) {
        skippedCount += 1;
        continue;
      }

      const text = await extractAttachmentText(fullPath, fileName);
      if (!text || text.trim().length < 50) {
        skippedCount += 1;
        continue;
      }

      const documentId = await insertAgentDocumentViaSupabase(agentId, fileName);
      const chunks = chunkText(text, 4000, 1000);
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

  let prompt = buildPrompt(attachmentContext || '', '', userText || 'Analise o anexo enviado.', 'chatgpt', conversationContext);
  if (effectiveAgentId) {
    try {
      const agent = await getAgentViaSupabase(effectiveAgentId);
      if (agent) {
        const agentInstructions = agent.instructions || agent.description || '';
        prompt = buildPrompt(attachmentContext || '', agentInstructions, userText || 'Analise o anexo enviado.', 'chatgpt', conversationContext);
      }
    } catch (error) {
      console.warn('[CHAT][SUPABASE-FALLBACK] Falha ao carregar agente:', error?.message || error);
    }
  }

  let assistantText = directPdfAnswer && directPdfAnswer.trim().length > 0 ? directPdfAnswer : '';

  if (!assistantText) {
    const aiCfg = getAiRuntimeConfig();
    const openai = createAiClient();
    const msgs = [
      { role: 'system', content: prompt },
      ...historyRows.slice(-10).map((message) => ({ role: message.role, content: message.content })),
    ];

    const stream = await openai.chat.completions.create({
      model: aiCfg.chatModel,
      messages: msgs,
      stream: true,
      temperature: 0,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        assistantText += delta;
      }
    }

    const promptTokens = estimateTokens(JSON.stringify(msgs));
    const completionTokens = estimateTokens(assistantText);
    logAiUsageSafe({
      userId,
      conversationId: cid,
      requestType: 'chat_completion_supabase_fallback',
      model: aiCfg.chatModel,
      status: 'success',
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: estimateCompletionCostUsd(promptTokens, completionTokens),
    });
  }

  const finalAssistantText = assistantText.trim() || 'Não consegui gerar uma resposta agora.';
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

    const filePath = `/agent-attachments/${req.file.filename}`;
    const originalname = req.file.originalname;
    const fullPath = path.join(process.cwd(), 'public', filePath);

    let text = await extractAttachmentText(fullPath, originalname);
    let indexingError = null;

    if (agentId && text.length > 500) {
      try {
        await indexAgentAttachmentContent(agentId, originalname, text);
        console.log(`[UPLOAD] ✅ RAG NUCLEAR processado para agente ${agentId}`);
      } catch (e) {
        console.error('[UPLOAD] Erro no pipeline RAG:', e.message);
        indexingError = e;
      }
    }

    if (indexingError) {
      return res.status(500).json({ error: indexingError.message || 'Falha ao indexar anexo do agente.' });
    }

    res.json({ success: true, path: filePath, filename: originalname });
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
    const rawLinks = Array.isArray(req.body?.links) ? req.body.links : [];
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

// 💬 CHAT com RAG NUCLEAR (Top-K 25)
app.post("/api/conversations/:id/messages", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const cid = parseInt(req.params.id);
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

          if (/\.pdf$/i.test(attachmentFileName || normalizedPath)) {
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
        const hasAIKey = Boolean(aiCfg.apiKey);
        if (hasAIKey && (attachmentContext || userText)) {
          const localPrompt = buildPrompt(
            attachmentContext || '',
            'Você está no modo local sem banco de dados. Analise anexos quando enviados e responda com clareza.',
            userText || 'Analise o anexo enviado pelo usuário.'
          );

          const openai = createAiClient();

          const completion = await openai.chat.completions.create({
            model: aiCfg.fastChatModel,
            messages: [{ role: 'system', content: localPrompt }],
            temperature: 0,
          });

          const generated = completion.choices?.[0]?.message?.content?.trim();
          if (generated) {
            localResponse = generated;
          }

          const promptTokens = estimateTokens(localPrompt);
          const completionTokens = estimateTokens(generated || localResponse);
          logAiUsageSafe({
            userId,
            conversationId: cid,
            requestType: 'chat_local_fallback',
            model: aiCfg.fastChatModel,
            status: 'success',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            costUsd: estimateCompletionCostUsd(promptTokens, completionTokens),
          });
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

    let prompt = "Você é um assistente prestativo.";
    let hasContext = false;
    let questionType = 'general';
    let contextSize = 0;
    let chunksUsed = 0;
    let relevantContext = "";

    if (effectiveAgentId) {
      try {
        const agentData = await withDatabaseFallback(
          'chat:getAgent',
          async () => {
            const agent = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [effectiveAgentId]);
            return agent.rows?.[0] || null;
          },
          () => getAgentViaSupabase(effectiveAgentId)
        );
        if (agentData) {
          const agentInstructions = agentData.instructions || agentData.description || "";
          questionType = detectQuestionType(userText);

          const hasChunks = (await countAgentChunks(effectiveAgentId)) > 0;

          if (hasChunks) {
            try {
              const isLookingForBeginning = userText.match(/primeira frase|título|inicio|começo|autor/i);

              if (isLookingForBeginning) {
                relevantContext = await getFirstChunks(effectiveAgentId, 5);
              } else {
                const aiCfg = getAiRuntimeConfig();
                const openai = createAiClient();

                const queryEmbedding = await openai.embeddings.create({
                  model: aiCfg.embeddingModel,
                  input: retrievalQuery || userText
                });

                const embeddingTokens = estimateTokens(retrievalQuery || userText);
                logAiUsageSafe({
                  userId,
                  conversationId: cid,
                  requestType: 'chat_embedding_query',
                  model: aiCfg.embeddingModel,
                  status: 'success',
                  promptTokens: embeddingTokens,
                  completionTokens: 0,
                  totalTokens: embeddingTokens,
                  costUsd: estimateEmbeddingCostUsd(embeddingTokens),
                });

                // 🔥 BUSCA NUCLEAR: TOP-K 25
                relevantContext = await searchSimilarChunks(
                  queryEmbedding.data[0].embedding,
                  effectiveAgentId,
                  25,
                  retrievalQuery || userText
                );

                // Busca híbrida (keyword)
                const keywords = userText.match(/[A-ZÁÉÍÓÚ][a-zàéíóúç]+/g) || [];
                if (keywords.length > 0) {
                  const keywordContext = await searchKeywordChunks(keywords[0], effectiveAgentId, 3);
                  if (keywordContext) {
                    relevantContext = keywordContext + "\n\n---\n\n" + relevantContext;
                  }
                }
              }

              if (relevantContext) {
                relevantContext = relevantContext.replace(/\[Trecho ID: \d+\]\n?/g, '').trim();
              }

              const mergedContext = [attachmentContext, relevantContext].filter(Boolean).join('\n\n---\n\n');
              prompt = buildPrompt(mergedContext || '', agentInstructions, userText || 'Analise o anexo enviado.', 'chatgpt', conversationContext);
              hasContext = mergedContext && mergedContext.trim().length > 0;
              contextSize = mergedContext ? mergedContext.length : 0;
              chunksUsed = mergedContext ? mergedContext.split('\n\n---\n\n').length : 0;

            } catch (e) {
              console.error('[CHAT] Erro ao buscar contexto:', e.message);
            }
          } else {
            prompt = buildPrompt(attachmentContext || '', agentInstructions, userText || 'Analise o anexo enviado.', 'chatgpt', conversationContext);
            hasContext = Boolean(attachmentContext);
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
    const openai = createAiClient();

    const stream = await openai.chat.completions.create({
      model: aiCfg.chatModel,
      messages: msgs,
      stream: true,
      temperature: 0
    });

    let fullResp = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullResp += delta;
      }
    }

    const cleanedFullResp = fullResp.replace(/\[\s*Trecho\s*ID\s*:\s*\d+\s*\]/gi, '').trim();
    const promptTokens = estimateTokens(JSON.stringify(msgs));
    const completionTokens = estimateTokens(cleanedFullResp);
    logAiUsageSafe({
      userId,
      conversationId: cid,
      requestType: attachment ? 'chat_completion_with_attachment' : 'chat_completion',
      model: aiCfg.chatModel,
      status: 'success',
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: estimateCompletionCostUsd(promptTokens, completionTokens),
    });

    const chunkSize = 50;
    for (let i = 0; i < cleanedFullResp.length; i += chunkSize) {
      const chunk = cleanedFullResp.substring(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    const validatedResp = validateOutput(fullResp, hasContext, userText, questionType, contextSize, chunksUsed, (typeof relevantContext !== 'undefined' ? relevantContext : ''));

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
  if (req.path.startsWith('/api/')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
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

    if (!hasDatabaseUrl) {
      return res.json({
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
      });
    }

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

    return res.json({
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
    });
  } catch (error) {
    console.error('[AI USAGE] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar consumo de IA' });
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
          SELECT
            u.id,
            u.user_id,
            u.nome_completo,
            u.email,
            u.status_da_assinatura,
            u.updated_at,
            COALESCE(s.plan_type, 'basic') AS plan_type
          FROM usuarios u
          LEFT JOIN subscriptions s ON s.user_id = u.user_id
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
            .select('user_id, plan_type')
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
            subscriptionsByUser.set(key, String(subscription.plan_type || 'basic').trim() || 'basic');
          }
        }

        return (usuariosResponse.data || []).map((usuario) => ({
          ...usuario,
          plan_type: subscriptionsByUser.get(String(usuario.user_id || '').trim()) || 'basic',
        }));
      }
    );

    return res.json({ rows });
  } catch (error) {
    console.error('[FINANCEIRO] Error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao carregar dados financeiros' });
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
}

function isConfirmedReferralStatus(raw) {
  return hasActiveSubscriptionAccess(raw);
}

function normalizePlanName(raw) {
  const value = String(raw || '').trim();
  return value || null;
}

function getReferralCreditUnits(status) {
  return isConfirmedReferralStatus(status) ? 1 : 0;
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
    const result = await pool.query('SELECT id, title, description, link, category_ids, created_at, icon, user_id FROM "agents" ORDER BY created_at DESC');
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agents/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "agents" WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agente não encontrado' });
    res.json(result.rows[0]);
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
  console.log(`🧠 RAG NUCLEAR ATIVADO (Chunk: 4000 | Overlap: 1000 | Top-K: 25)`);
});

// ✅ CORREÇÃO 3: Aumentar timeout para processar PDFs pesados (10 minutos)
server.timeout = 600000;