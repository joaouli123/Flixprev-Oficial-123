/**
 * _repair_agents.mjs — Script de reparação para agentes com dados parciais.
 * 
 * Diferenças do script principal:
 * - Processa APENAS agentes com chunks abaixo do esperado
 * - SAFE: cria novos docs ANTES de deletar antigos (via tag no title)
 * - Reutiliza o rawTextCache e todas as utilities do setup principal
 * 
 * Usage:  node script/_repair_agents.mjs
 */
import crypto from 'crypto';
import { Buffer } from 'node:buffer';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import pkg from 'pg';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ---- Target: agents with fewer chunks than expected ----
const MIN_EXPECTED_CHUNKS = 700; // agents with common URLs should have ~1072

// ---------------------------------------------------------------------------
// Utility functions (copied from main script)
// ---------------------------------------------------------------------------

const TRANSIENT_DB_CODES = new Set(['57P01','57P02','57P03','08000','08003','08006','08001','53300']);

function isTransientDbError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return TRANSIENT_DB_CODES.has(error?.code) || msg.includes('connection terminated') || msg.includes('timeout') || msg.includes('server closed');
}

async function dbQuery(sql, params = [], tries = 4) {
  let last = null;
  for (let i = 1; i <= tries; i++) {
    try { return await pool.query(sql, params); } catch (error) {
      last = error;
      if (!isTransientDbError(error) || i === tries) throw error;
      await new Promise(r => setTimeout(r, i * 700));
    }
  }
  throw last;
}

async function fetchWithRetry(url, tries = 3) {
  let last = null;
  for (let i = 1; i <= tries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (FlixPrev Repair/1.0)', Accept: 'text/html,application/pdf,*/*;q=0.8' },
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) { last = error; await new Promise(r => setTimeout(r, i * 1000)); }
  }
  throw last;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function detectCharset(contentType, htmlBytes) {
  const headerMatch = String(contentType || '').match(/charset\s*=\s*([\w-]+)/i);
  if (headerMatch) return headerMatch[1].toLowerCase();
  const head = new TextDecoder('ascii', { fatal: false }).decode(htmlBytes.slice(0, 4096));
  const metaMatch = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i) || head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i);
  if (metaMatch) return metaMatch[1].toLowerCase();
  const sample = new TextDecoder('utf-8', { fatal: false }).decode(htmlBytes.slice(0, 8192));
  if ((sample.match(/\uFFFD/g) || []).length > 5) return 'iso-8859-1';
  return 'utf-8';
}

function decodeHtmlBytes(bytes, contentType) {
  const charset = detectCharset(contentType, bytes);
  const label = charset.replace('iso-8859-1', 'latin1').replace('windows-1252', 'latin1');
  try { return new TextDecoder(label, { fatal: false }).decode(bytes); } catch { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }
}

const rawTextCache = new Map();

async function fetchRawText(url) {
  if (rawTextCache.has(url)) return rawTextCache.get(url);
  const response = await fetchWithRetry(url, 3);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const rawBytes = Buffer.from(await response.arrayBuffer());
  let text = '';
  if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdfParse(rawBytes);
    text = String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  } else {
    text = htmlToText(decodeHtmlBytes(rawBytes, contentType));
  }
  if (!text || text.length < 80) {
    text = [`FONTE: ${url}`, `CONTENT_TYPE: ${contentType || 'desconhecido'}`, 'OBS: conteúdo textual reduzido.'].join('\n');
  }
  rawTextCache.set(url, text);
  return text;
}

function chunkText(text, agentTitle, size = 4000, overlap = 1000) {
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
    if (chunk) chunks.push(chunk);
    const next = end - overlap;
    start = next > start ? next : end;
  }
  return chunks;
}

const EMBED_BATCH_SIZE = 50;
async function embedBatch(texts) {
  if (!texts.length) return [];
  const results = new Array(texts.length).fill(null);
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    if (start > 0) await new Promise(r => setTimeout(r, 800)); // rate limit
    for (let attempt = 1; attempt <= 5; attempt++) { // 5 attempts instead of 3
      try {
        const response = await Promise.race([
          openai.embeddings.create({ model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001', input: batch }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('embedding-batch-timeout')), 120000)),
        ]);
        for (const item of (response.data || [])) { results[start + item.index] = item.embedding; }
        break;
      } catch (err) {
        console.log(`    [RETRY ${attempt}/5] embedding batch ${start}-${start + batch.length}: ${err.message}`);
        if (attempt === 5) { console.log(`    [FAIL] batch ${start}-${start + batch.length} lost`); }
        else { await new Promise(r => setTimeout(r, attempt * 2000)); } // longer backoff
      }
    }
  }
  return results;
}

async function buildChunksForAgent(url, agentTitle) {
  const text = await fetchRawText(url);
  const chunksRaw = chunkText(text, agentTitle, 4000, 1000);
  if (!chunksRaw.length) return { url, chunks: [] };
  const vectors = await embedBatch(chunksRaw);
  const chunks = [];
  for (let i = 0; i < chunksRaw.length; i++) {
    if (!vectors[i]) continue;
    chunks.push({ chunk_index: i, content: chunksRaw[i], embedding: `[${vectors[i].join(',')}]` });
  }
  return { url, chunks };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  REPAIR SCRIPT — Reparando agentes danificados');
  console.log('═══════════════════════════════════════════════════\n');

  // Find category
  const catRow = await dbQuery("SELECT id FROM categories WHERE lower(name)='previdenciário' AND user_id IS NULL LIMIT 1");
  if (!catRow.rowCount) { console.log('Categoria previdenciário não encontrada!'); return; }
  const categoryId = catRow.rows[0].id;

  // Find damaged agents
  const agents = await dbQuery(`
    SELECT a.id, a.title, a.attachments,
           (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id) as chunks
    FROM agents a
    WHERE a.user_id IS NULL
      AND a.category_ids::text[] && ARRAY[$1::text]
    ORDER BY a.title
  `, [categoryId]);

  const damaged = agents.rows.filter(a => {
    const c = parseInt(a.chunks);
    // Agents that should have ~1072 chunks (common URL agents) but have fewer
    // Also include dedicated agents that have significantly fewer than expected
    return c < MIN_EXPECTED_CHUNKS;
  });

  if (!damaged.length) {
    console.log('Nenhum agente danificado encontrado (todos ≥ ' + MIN_EXPECTED_CHUNKS + ' chunks).');
    await pool.end();
    return;
  }

  console.log(`Agentes danificados (< ${MIN_EXPECTED_CHUNKS} chunks):\n`);
  for (const a of damaged) {
    console.log(`  [${a.chunks} chunks] ${a.title}`);
  }
  console.log('');

  // Pre-fetch all URLs that these agents need (from their attachments)
  const allUrlsSet = new Set();
  for (const a of damaged) {
    const urls = a.attachments || [];
    for (const u of urls) allUrlsSet.add(u);
  }
  const allUrls = [...allUrlsSet];
  console.log(`Pre-fetching ${allUrls.length} URLs...\n`);

  for (let i = 0; i < allUrls.length; i++) {
    try {
      await fetchRawText(allUrls[i]);
      console.log(`  [OK] ${i + 1}/${allUrls.length}: ${allUrls[i].slice(0, 80)}...`);
    } catch (error) {
      console.log(`  [ERRO] ${i + 1}/${allUrls.length}: ${allUrls[i]} -> ${error.message}`);
    }
  }

  // Process each damaged agent
  for (const agent of damaged) {
    console.log(`\n━━━ Processando: ${agent.title} (${agent.chunks} chunks atuais) ━━━\n`);
    const urls = agent.attachments || [];
    if (!urls.length) { console.log('  Sem URLs — pulando.'); continue; }

    // Step 1: Build ALL chunks for ALL URLs BEFORE deleting anything
    const allPayloads = [];
    let totalNewChunks = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const payload = await buildChunksForAgent(url, agent.title);
        allPayloads.push(payload);
        totalNewChunks += payload.chunks.length;
        if ((i + 1) % 5 === 0 || i === urls.length - 1) {
          console.log(`  [${agent.title}] ${i + 1}/${urls.length} URLs processadas (${totalNewChunks} chunks acumulados)`);
        }
      } catch (error) {
        console.log(`  [ERRO] ${url} -> ${error.message}`);
      }
    }

    // Step 2: SAFETY CHECK — only replace if we have meaningful data
    const oldChunks = parseInt(agent.chunks);
    if (totalNewChunks < oldChunks * 0.8 && totalNewChunks < oldChunks) {
      console.log(`  ⚠️  SKIP: novos chunks (${totalNewChunks}) abaixo de 80% dos antigos (${oldChunks}). Mantendo dados existentes.`);
      continue;
    }

    // Step 3: Delete old docs and insert new ones IN A TRANSACTION
    console.log(`  Substituindo: ${oldChunks} chunks antigos → ${totalNewChunks} novos`);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM documents WHERE agent_id=$1', [agent.id]);

      let inserted = 0;
      for (const payload of allPayloads) {
        if (!payload.chunks.length) continue;
        const docId = crypto.randomUUID();
        const title = payload.url.length > 255 ? payload.url.slice(0, 255) : payload.url;
        await client.query('INSERT INTO documents (id, agent_id, title) VALUES ($1,$2,$3)', [docId, agent.id, title]);
        for (const row of payload.chunks) {
          await client.query(
            'INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index) VALUES ($1,$2,$3,$4::vector,$5)',
            [agent.id, docId, row.content, row.embedding, row.chunk_index]
          );
          inserted++;
        }
      }
      
      await client.query('COMMIT');
      console.log(`  ✓ ${agent.title}: ${inserted} chunks inseridos de ${allPayloads.filter(p => p.chunks.length > 0).length} docs`);
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.log(`  ✗ ${agent.title}: ROLLBACK — ${txErr.message}. Dados antigos preservados.`);
    } finally {
      client.release();
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  REPARAÇÃO CONCLUÍDA');
  console.log('═══════════════════════════════════════════════════\n');
  await pool.end();
}

main().catch(err => {
  console.error('\n[FATAL]', err?.stack || err?.message || err);
  process.exitCode = 1;
  pool.end();
});
