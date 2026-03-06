import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const ROOT = process.cwd();
const CATEGORY_NAME = 'Previdenciário';
const ATTACHMENTS_BASE_DIR = path.join(ROOT, 'public', 'agent-attachments', 'previdenciario');
const INGEST_LOCK_KEY = 90612041;

const aiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
const aiApiKey = process.env.GEMINI_API_KEY;
const embeddingModel = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';

if (!aiApiKey) {
  throw new Error('GEMINI_API_KEY não configurada.');
}

const openai = new OpenAI({ apiKey: aiApiKey, baseURL: aiBaseURL });

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const AGENT = {
  title: 'ACNIS',
  role: 'Agente CNIS',
  description:
    'Disciplina regras, procedimentos e rotinas para aplicação das normas de direito previdenciário com foco em CNIS e processo administrativo previdenciário.',
  instructions:
    'Especialista em CNIS e normas previdenciárias do INSS. Sempre priorize base normativa e, quando relevante, cite links de anexos/downloads disponíveis.',
  urls: [
    'http://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm',
    'https://www.planalto.gov.br/ccivil_03/decreto/d3048.htm',
    'https://portalin.inss.gov.br/in',
    'https://portalin.inss.gov.br/portaria990',
    'https://www.in.gov.br/web/dou/-/portaria-dirben/inss-n-1.326-de-13-de-janeiro-de-2026-681141180',
    'https://www.legisweb.com.br/legislacao/?id=467234',
    'https://www.in.gov.br/web/dou/-/portaria-dirben/inss-n-1.251-de-2-de-janeiro-de-2025-605404637',
    'https://portalin.inss.gov.br/anexos',
    'https://www.in.gov.br/web/dou/-/portaria-dirben/inss-n-1.321-de-2-de-janeiro-de-2026-679342881',
    'https://www.in.gov.br/web/dou/-/portaria-dirben/inss-n-1.323-de-8-de-janeiro-de-2026-680679249',
    'file:///C:/Users/Admin/Desktop/pt1326DIRBEN-INSSanexoI.pdf',
    'https://portalin.inss.gov.br/portaria993',
    'file:///G:/DIREITO/MBI-%20MASTER%20INCAPACIDADE/NORMAS-%20ASSISTENTES/ASSISTENTE%20FLIX%20PREV/CNIS-%20Opera%C3%A7%C3%A3o%20Pelo%20INSS-%20Port.%20Conjunta%20N%C2%BA%203.pdf',
    'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/portarias/portarias_todas/PortariaConjuntaMPSINSSn3de16jan2024.pdf',
  ],
};

const DOWNLOAD_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.odt', '.rtf', '.zip'];
const TRANSIENT_DB_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '53300']);

function toSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl).trim());
    if (parsed.protocol === 'file:') return parsed.toString();

    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    removeParams.forEach((param) => parsed.searchParams.delete(param));
    parsed.hash = '';

    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupeUrls(urls) {
  const seen = new Set();
  const out = [];

  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function decodeHtmlEntities(input) {
  return String(input || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function htmlToStructuredText(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<\/?li[^>]*>/gi, '\n- ')
      .replace(/<\/?h[1-6][^>]*>/gi, '\n')
      .replace(/<\/?table[^>]*>/gi, '\n[TABELA]\n')
      .replace(/<tr[^>]*>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<th[^>]*>/gi, '')
      .replace(/<td[^>]*>/gi, '')
      .replace(/<\/th>/gi, ' | ')
      .replace(/<\/td>/gi, ' | ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+\|/g, ' |')
    .replace(/\|[ \t]+/g, '| ')
    .replace(/\|\s*\|+/g, ' | ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function looksLikeDownload(url) {
  const lower = String(url || '').toLowerCase();
  return DOWNLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext)) || lower.includes('/download');
}

async function fetchWithRetry(url, tries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (FlixPrev Previdenciario Ingestion/1.0)',
          Accept: 'text/html,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*;q=0.8',
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }

  throw lastError;
}

async function collectPortalinAnexosLinks(pageUrl) {
  const response = await fetchWithRetry(pageUrl, 3);
  const html = await response.text();

  const matches = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const resolved = [];

  for (const href of matches) {
    try {
      const abs = new URL(href, pageUrl).toString();
      const normalized = normalizeUrl(abs);
      if (!normalized) continue;
      if (looksLikeDownload(normalized)) resolved.push(normalized);
    } catch {
    }
  }

  return dedupeUrls(resolved);
}

async function expandSpecialUrls(inputUrls) {
  const out = [];

  for (const url of inputUrls) {
    out.push(url);

    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'portalin.inss.gov.br' && parsed.pathname === '/anexos') {
        const links = await collectPortalinAnexosLinks(url);
        if (links.length > 0) {
          console.log(`[ANEXOS] ${links.length} links de download descobertos em ${url}`);
          out.push(...links);
        }
      }
    } catch {
    }
  }

  return dedupeUrls(out);
}

async function extractTextFromUrl(url) {
  if (String(url).startsWith('file://')) {
    const filePath = decodeURIComponent(new URL(url).pathname).replace(/^\/+([A-Za-z]:)/, '$1');
    const buf = await fs.readFile(filePath);
    const lower = filePath.toLowerCase();

    if (lower.endsWith('.pdf')) {
      const parsed = await pdfParse(buf);
      return String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
    }

    return [
      `FONTE_ARQUIVO_LOCAL: ${url}`,
      `TIPO_ARQUIVO: ${path.extname(filePath) || 'desconhecido'}`,
      'OBS: arquivo não-PDF local detectado. Link preservado para referência e download pelo usuário quando necessário.',
      'CONTEUDO_EXTRAIVEL: não disponível automaticamente para este formato nesta rotina.',
    ].join('\n');
  }

  const response = await fetchWithRetry(url, 3);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const arrayBuffer = await response.arrayBuffer();
    const parsed = await pdfParse(Buffer.from(arrayBuffer));
    return String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  }

  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    return [
      `FONTE_DOWNLOAD: ${url}`,
      `CONTENT_TYPE: ${contentType || 'desconhecido'}`,
      'OBS: arquivo de download detectado (ex.: DOCX/XLS/ZIP). Link preservado para consulta e disponibilização ao usuário.',
      'CONTEUDO_TEXTO: não extraído automaticamente para este formato.',
      'ORIENTACAO: se a pergunta exigir detalhes desse anexo, fornecer o link de download correspondente.',
    ].join('\n');
  }

  const html = await response.text();
  const structured = htmlToStructuredText(html);
  return structured;
}

function chunkText(text, size = 4000, overlap = 1000) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = start + size;

    if (end < clean.length) {
      const lastPeriod = clean.lastIndexOf('.', end);
      const lastSpace = clean.lastIndexOf(' ', end);
      if (lastPeriod > start + size * 0.8) end = lastPeriod + 1;
      else if (lastSpace > start + size * 0.5) end = lastSpace;
    }

    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    const next = end - overlap;
    start = next > start ? next : end;
  }

  return chunks;
}

async function generateEmbedding(inputText) {
  const tries = 3;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await Promise.race([
        openai.embeddings.create({
          model: embeddingModel,
          input: inputText,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('embedding-timeout')), 45000)),
      ]);

      return response.data?.[0]?.embedding || null;
    } catch (error) {
      if (attempt === tries) {
        console.warn(`[EMB-FAIL] ${error.message}`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }

  return null;
}

function isTransientDbError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    TRANSIENT_DB_CODES.has(error?.code) ||
    msg.includes('connection terminated') ||
    msg.includes('connection reset') ||
    msg.includes('timeout') ||
    msg.includes('server closed the connection')
  );
}

async function dbQuery(db, sql, params = [], tries = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await db.query(sql, params);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }

  throw lastError;
}

async function acquireIngestLock(db) {
  const lock = await dbQuery(db, 'SELECT pg_try_advisory_lock($1) AS locked', [INGEST_LOCK_KEY]);
  return Boolean(lock.rows?.[0]?.locked);
}

async function releaseIngestLock(db) {
  try {
    await dbQuery(db, 'SELECT pg_advisory_unlock($1)', [INGEST_LOCK_KEY]);
  } catch {
  }
}

async function ensureGlobalCategory(db, categoryName) {
  const existing = await dbQuery(db, 'SELECT id FROM categories WHERE lower(name)=lower($1) AND user_id IS NULL LIMIT 1', [categoryName]);
  if (existing.rowCount > 0) return existing.rows[0].id;

  const created = await dbQuery(db, 'INSERT INTO categories (id, name, user_id) VALUES ($1, $2, NULL) RETURNING id', [crypto.randomUUID(), categoryName]);
  return created.rows[0].id;
}

async function ensureAgent(db, categoryId, cfg) {
  const existing = await dbQuery(db, 'SELECT id FROM agents WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1', [cfg.title]);

  const strict = [
    'REGRAS DE FIDELIDADE JURÍDICA:',
    '1) Responda SOMENTE com base nos documentos indexados deste agente.',
    '2) Não invente artigo, número de processo, portaria ou data.',
    '3) Se a informação não estiver no conteúdo indexado, diga claramente que não encontrou nos documentos.',
    '4) Quando o tema envolver anexos do INSS, priorize informar também o link de download correspondente quando disponível no índice.',
  ].join('\n');

  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await dbQuery(
      db,
      `UPDATE agents
       SET role = $1,
           description = $2,
           instructions = $3,
           icon = COALESCE(icon, $4),
           category_ids = $5,
           user_id = NULL
       WHERE id = $6`,
      [cfg.role, cfg.description, `${cfg.instructions}\n\n${strict}`, 'ShieldCheck', [categoryId], id]
    );
    return id;
  }

  const inserted = await dbQuery(
    db,
    `INSERT INTO agents (id, user_id, title, role, description, instructions, icon, category_ids, shortcuts, attachments)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      crypto.randomUUID(),
      cfg.title,
      cfg.role,
      cfg.description,
      `${cfg.instructions}\n\n${strict}`,
      'ShieldCheck',
      [categoryId],
      ['Resumo normativo', 'Base legal', 'Anexos e downloads', 'Checklist CNIS'],
      [],
    ]
  );

  return inserted.rows[0].id;
}

async function ingestAgentSources(db, agentId, cfg) {
  const expandedUrls = await expandSpecialUrls(cfg.urls);
  const urls = dedupeUrls(expandedUrls);

  const folder = path.join(ATTACHMENTS_BASE_DIR, toSlug(cfg.title));
  await fs.mkdir(folder, { recursive: true });

  const attachmentPaths = [];
  const harvested = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const text = await extractTextFromUrl(url);
      if (!text || text.length < 120) {
        console.log(`[SKIP] ${cfg.title} ${i + 1}/${urls.length} conteúdo insuficiente: ${url}`);
        continue;
      }

      const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
      const fileName = `${String(i + 1).padStart(4, '0')}-${hash}.txt`;
      const relPath = `/agent-attachments/previdenciario/${toSlug(cfg.title)}/${fileName}`;

      const payload = `FONTE: ${url}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${text}`;
      await fs.writeFile(path.join(folder, fileName), payload, 'utf8');

      attachmentPaths.push(relPath);
      harvested.push({ url, text });
      console.log(`[OK] ${cfg.title} ${i + 1}/${urls.length} (${Math.round(text.length / 1000)}k chars)`);
    } catch (error) {
      console.log(`[ERRO] ${cfg.title} ${i + 1}/${urls.length}: ${url} -> ${error.message}`);
    }
  }

  await dbQuery(db, 'UPDATE agents SET attachments = $1 WHERE id = $2', [attachmentPaths, agentId]);
  await dbQuery(db, 'DELETE FROM documents WHERE agent_id = $1', [agentId]);

  let savedDocs = 0;
  let savedChunks = 0;

  for (const item of harvested) {
    const title = item.url.length > 255 ? item.url.slice(0, 255) : item.url;
    const docId = crypto.randomUUID();

    await dbQuery(db, 'INSERT INTO documents (id, agent_id, title) VALUES ($1, $2, $3)', [docId, agentId, title]);
    savedDocs += 1;

    const chunks = chunkText(item.text, 4000, 1000);
    console.log(`[DOC] ${cfg.title} doc ${savedDocs}/${harvested.length} com ${chunks.length} chunks`);

    for (let idx = 0; idx < chunks.length; idx++) {
      if (idx === 0 || (idx + 1) % 20 === 0 || idx === chunks.length - 1) {
        console.log(`[EMB] ${cfg.title} doc ${savedDocs}/${harvested.length} chunk ${idx + 1}/${chunks.length}`);
      }

      const emb = await generateEmbedding(chunks[idx]);
      if (!emb) continue;

      await dbQuery(
        db,
        `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
         VALUES ($1, $2, $3, $4::vector, $5)`,
        [agentId, docId, chunks[idx], `[${emb.join(',')}]`, idx]
      );

      savedChunks += 1;
    }
  }

  return {
    links: urls.length,
    harvested: harvested.length,
    savedDocs,
    savedChunks,
  };
}

async function main() {
  await fs.mkdir(ATTACHMENTS_BASE_DIR, { recursive: true });
  let hasLock = false;

  try {
    hasLock = await acquireIngestLock(pool);
    if (!hasLock) throw new Error('Já existe ingestão previdenciária em execução. Aguarde finalizar.');

    const categoryId = await ensureGlobalCategory(pool, CATEGORY_NAME);
    const agentId = await ensureAgent(pool, categoryId, AGENT);

    console.log(`\n=== Preparando agente: ${AGENT.title} ===`);
    const ingest = await ingestAgentSources(pool, agentId, AGENT);

    const summary = [{ title: AGENT.title, agentId, ...ingest }];

    console.log('\n===== RESUMO PREVIDENCIÁRIO =====');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (hasLock) await releaseIngestLock(pool);
    await pool.end();
  }
}

await main().catch((error) => {
  console.error('\n[FATAL] setup-previdenciario-acnis-and-ingest falhou.');
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
