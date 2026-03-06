import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const INPUT = path.join(process.cwd(), 'attached_assets', 'agent-list-extracted.json');
const OUT = path.join(process.cwd(), 'attached_assets', 'agent-list-bulk-process-result.json');
const CATEGORY = 'Previdenciário';
const LOCK_KEY = 90612052;
const ATTACH_BASE = path.join(process.cwd(), 'public', 'agent-attachments', 'previdenciario');

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TRANSIENT_DB_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '53300']);

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl).trim());
    if (parsed.protocol === 'file:') return parsed.toString();
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    removeParams.forEach((p) => parsed.searchParams.delete(p));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function toSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function mapAgentTitle(raw) {
  const label = String(raw || '').trim();
  if (!label) return 'Previdenciário - Complementares';

  const lower = label.toLowerCase();
  if (lower.startsWith('agentes ') || lower.includes('escritos em vermelho') || lower.includes('link 1') || label.includes('%')) {
    return 'Previdenciário - Complementares';
  }

  if (/^[A-Z]{2,10}\s*-/.test(label)) {
    return label.split('-')[0].trim();
  }

  if (/^[A-Z]{2,10}$/.test(label)) return label;

  if (label.endsWith('-')) return label.slice(0, -1).trim();
  if (label.length > 80) return label.slice(0, 80).trim();

  return label;
}

function dedupe(arr) {
  return [...new Set(arr)];
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

async function dbQuery(sql, params = [], tries = 4) {
  let lastError = null;
  for (let i = 1; i <= tries; i++) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || i === tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  throw lastError;
}

async function fetchWithRetry(url, tries = 3) {
  let last = null;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (FlixPrev PDF Bulk Ingestion/1.0)',
          Accept: 'text/html,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*;q=0.8',
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      last = e;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  throw last;
}

function htmlToText(html) {
  return String(html || '')
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
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractText(url) {
  if (url.startsWith('file://')) {
    const filePath = decodeURIComponent(new URL(url).pathname).replace(/^\/+([A-Za-z]:)/, '$1');
    const buf = await fs.readFile(filePath);
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const parsed = await pdfParse(buf);
      return String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
    }
    return `FONTE_ARQUIVO_LOCAL: ${url}\nTIPO: ${path.extname(filePath)}`;
  }

  const res = await fetchWithRetry(url, 3);
  const ct = String(res.headers.get('content-type') || '').toLowerCase();

  if (ct.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const ab = await res.arrayBuffer();
    const parsed = await pdfParse(Buffer.from(ab));
    return String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  }

  if (!ct.includes('text/html') && !ct.includes('text/plain')) {
    return `FONTE_DOWNLOAD: ${url}\nCONTENT_TYPE: ${ct || 'desconhecido'}\nOBS: link preservado para download direto.`;
  }

  const html = await res.text();
  return htmlToText(html);
}

function chunkText(text, size = 4000, overlap = 1000) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
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
    if (piece) out.push(piece);
    const next = end - overlap;
    start = next > start ? next : end;
  }

  return out;
}

async function embed(input) {
  for (let i = 1; i <= 3; i++) {
    try {
      const response = await Promise.race([
        openai.embeddings.create({ model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001', input }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('embedding-timeout')), 45000)),
      ]);
      return response.data?.[0]?.embedding || null;
    } catch {
      if (i === 3) return null;
      await new Promise((resolve) => setTimeout(resolve, i * 600));
    }
  }
  return null;
}

async function ensureCategory(name) {
  const existing = await dbQuery('SELECT id FROM categories WHERE lower(name)=lower($1) AND user_id IS NULL LIMIT 1', [name]);
  if (existing.rowCount > 0) return existing.rows[0].id;
  const inserted = await dbQuery('INSERT INTO categories (id,name,user_id) VALUES ($1,$2,NULL) RETURNING id', [crypto.randomUUID(), name]);
  return inserted.rows[0].id;
}

async function ensureAgent(title, categoryId) {
  const existing = await dbQuery('SELECT id, attachments FROM agents WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1', [title]);
  const strict = 'Sempre priorize base normativa e, quando houver anexo/download, informe link direto ao usuário quando solicitado.';

  if (existing.rowCount > 0) {
    await dbQuery(
      `UPDATE agents SET user_id=NULL, category_ids=$1, instructions=COALESCE(instructions,'') || E'\\n\\n' || $2 WHERE id=$3`,
      [[categoryId], strict, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }

  const inserted = await dbQuery(
    `INSERT INTO agents (id,user_id,title,role,description,instructions,icon,category_ids,shortcuts,attachments)
     VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      crypto.randomUUID(),
      title,
      'Previdenciário',
      `Agente ${title} (gerado a partir do PDF mestre de agentes).`,
      strict,
      'ShieldCheck',
      [categoryId],
      ['Resumo', 'Base legal', 'Downloads'],
      [],
    ]
  );

  return inserted.rows[0].id;
}

async function main() {
  const src = JSON.parse(await fs.readFile(INPUT, 'utf8'));

  const lock = await dbQuery('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
  if (!lock.rows?.[0]?.locked) throw new Error('Já existe processamento em lote do PDF em execução.');

  const result = {
    startedAt: new Date().toISOString(),
    source: INPUT,
    createdAgents: [],
    updatedAgents: [],
    skippedUrls: [],
    failedUrls: [],
    processedUrls: [],
  };

  try {
    await fs.mkdir(ATTACH_BASE, { recursive: true });

    const categoryId = await ensureCategory(CATEGORY);
    const existingDocs = await dbQuery('SELECT title, agent_id FROM documents');
    const existingUrlSet = new Set(existingDocs.rows.map((r) => normalizeUrl(r.title)).filter(Boolean));

    const grouped = new Map();
    for (const item of src.agents || []) {
      const urls = dedupe((item.urls || []).map(normalizeUrl).filter(Boolean));
      if (urls.length === 0) continue;
      const title = mapAgentTitle(item.agent);
      if (!grouped.has(title)) grouped.set(title, new Set());
      urls.forEach((u) => grouped.get(title).add(u));
    }

    for (const [agentTitle, urlSet] of grouped.entries()) {
      const agentId = await ensureAgent(agentTitle, categoryId);
      const folder = path.join(ATTACH_BASE, toSlug(agentTitle));
      await fs.mkdir(folder, { recursive: true });

      const attachmentsRes = await dbQuery('SELECT attachments FROM agents WHERE id=$1', [agentId]);
      const currentAttachments = Array.isArray(attachmentsRes.rows?.[0]?.attachments) ? attachmentsRes.rows[0].attachments : [];
      const nextAttachments = [...currentAttachments];

      for (const url of [...urlSet]) {
        if (existingUrlSet.has(url)) {
          result.skippedUrls.push({ agentTitle, url, reason: 'already-ingested' });
          continue;
        }

        try {
          const text = await extractText(url);
          if (!text || text.length < 80) {
            result.skippedUrls.push({ agentTitle, url, reason: 'insufficient-content' });
            continue;
          }

          const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
          const fileName = `${hash}.txt`;
          const relPath = `/agent-attachments/previdenciario/${toSlug(agentTitle)}/${fileName}`;
          await fs.writeFile(path.join(folder, fileName), `FONTE: ${url}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${text}`, 'utf8');
          if (!nextAttachments.includes(relPath)) nextAttachments.push(relPath);

          const docId = crypto.randomUUID();
          const docTitle = url.length > 255 ? url.slice(0, 255) : url;
          await dbQuery('INSERT INTO documents (id, agent_id, title) VALUES ($1, $2, $3)', [docId, agentId, docTitle]);

          const chunks = chunkText(text, 4000, 1000);
          let insertedChunks = 0;
          for (let i = 0; i < chunks.length; i++) {
            const vec = await embed(chunks[i]);
            if (!vec) continue;
            await dbQuery(
              `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
               VALUES ($1, $2, $3, $4::vector, $5)`,
              [agentId, docId, chunks[i], `[${vec.join(',')}]`, i]
            );
            insertedChunks += 1;
          }

          existingUrlSet.add(url);
          result.processedUrls.push({ agentTitle, agentId, url, chunks: insertedChunks });
          console.log(`[OK] ${agentTitle} -> ${url} (${insertedChunks} chunks)`);
        } catch (error) {
          result.failedUrls.push({ agentTitle, url, error: error.message });
          console.log(`[ERRO] ${agentTitle} -> ${url} :: ${error.message}`);
        }
      }

      await dbQuery('UPDATE agents SET attachments=$1 WHERE id=$2', [nextAttachments, agentId]);
    }
  } finally {
    await dbQuery('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    result.finishedAt = new Date().toISOString();
    result.summary = {
      processed: result.processedUrls.length,
      skipped: result.skippedUrls.length,
      failed: result.failedUrls.length,
    };
    await fs.writeFile(OUT, JSON.stringify(result, null, 2), 'utf8');
    await pool.end();
    console.log(JSON.stringify({ out: OUT, summary: result.summary }, null, 2));
  }
}

await main();
