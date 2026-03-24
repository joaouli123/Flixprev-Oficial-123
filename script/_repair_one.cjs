/**
 * _repair_one.cjs — Repara UM agente de cada vez com rate limiting agressivo.
 * 
 * Usage:  node script/_repair_one.cjs "Nome do Agente"
 *         node script/_repair_one.cjs --auto   (pega o mais danificado)
 */
const crypto = require('crypto');
const { Buffer } = require('node:buffer');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const EMBED_DELAY_MS = 3000;      // 3s entre batches (era 800ms)
const EMBED_BATCH_SIZE = 25;       // batches menores (era 50)
const MAX_RETRIES = 7;
const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 1000;

// ---- Utilities ----

async function fetchWithRetry(url, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (FlixPrev/1.0)', Accept: 'text/html,application/pdf,*/*;q=0.8' },
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) { last = e; await sleep(i * 1000); }
  }
  throw last;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function detectCharset(ct, bytes) {
  const hm = String(ct || '').match(/charset\s*=\s*([\w-]+)/i);
  if (hm) return hm[1].toLowerCase();
  const head = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, 4096));
  const mm = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i) || head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i);
  if (mm) return mm[1].toLowerCase();
  const sample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 8192));
  if ((sample.match(/\uFFFD/g) || []).length > 5) return 'iso-8859-1';
  return 'utf-8';
}

function decodeBytes(bytes, ct) {
  const cs = detectCharset(ct, bytes).replace('iso-8859-1', 'latin1').replace('windows-1252', 'latin1');
  try { return new TextDecoder(cs, { fatal: false }).decode(bytes); } catch { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }
}

const textCache = new Map();
async function fetchText(url) {
  if (textCache.has(url)) return textCache.get(url);
  const r = await fetchWithRetry(url);
  const ct = String(r.headers.get('content-type') || '').toLowerCase();
  const raw = Buffer.from(await r.arrayBuffer());
  let text;
  if (ct.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    text = String((await pdfParse(raw)).text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  } else {
    text = htmlToText(decodeBytes(raw, ct));
  }
  if (!text || text.length < 80) text = `FONTE: ${url}\nOBS: conteúdo textual reduzido.`;
  textCache.set(url, text);
  return text;
}

function chunkText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = start + CHUNK_SIZE;
    if (end < clean.length) {
      const p = clean.lastIndexOf('.', end);
      const s = clean.lastIndexOf(' ', end);
      if (p > start + CHUNK_SIZE * 0.8) end = p + 1;
      else if (s > start + CHUNK_SIZE * 0.5) end = s;
    }
    const c = clean.slice(start, end).trim();
    if (c) chunks.push(c);
    const next = end - CHUNK_OVERLAP;
    start = next > start ? next : end;
  }
  return chunks;
}

async function embedBatch(texts) {
  if (!texts.length) return [];
  const results = new Array(texts.length).fill(null);
  const apiKey = process.env.GEMINI_API_KEY;

  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    if (start > 0) {
      console.log(`      💤 aguardando ${EMBED_DELAY_MS/1000}s (rate limit)...`);
      await sleep(EMBED_DELAY_MS);
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Use direct Gemini API (not OpenAI compat) for more control
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: batch.map(t => ({
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text: t }] }
              }))
            }),
            signal: AbortSignal.timeout(120000),
          }
        );

        if (resp.status === 429) {
          const wait = Math.min(attempt * 10000, 60000); // 10s, 20s, 30s... up to 60s
          console.log(`      ⏳ [${attempt}/${MAX_RETRIES}] 429 rate limit — esperando ${wait/1000}s...`);
          await sleep(wait);
          continue;
        }

        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);

        const data = await resp.json();
        if (data.embeddings) {
          for (let i = 0; i < data.embeddings.length; i++) {
            results[start + i] = data.embeddings[i].values;
          }
        }
        console.log(`      ✓ batch ${start}-${start + batch.length} OK (${data.embeddings?.length || 0} embeddings)`);
        break;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.log(`      ✗ batch ${start}-${start + batch.length} FALHOU após ${MAX_RETRIES} tentativas`);
        } else {
          const wait = attempt * 5000;
          console.log(`      ⚠ [${attempt}/${MAX_RETRIES}] ${err.message.slice(0, 80)} — retry em ${wait/1000}s`);
          await sleep(wait);
        }
      }
    }
  }
  return results;
}

// ---- MAIN ----
async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Uso: node script/_repair_one.cjs "Nome do Agente"');
    console.log('     node script/_repair_one.cjs --auto');
    process.exit(1);
  }

  const cat = await pool.query("SELECT id FROM categories WHERE lower(name)='previdenciário' AND user_id IS NULL LIMIT 1");
  if (!cat.rowCount) { console.log('Categoria não encontrada'); return; }
  const catId = cat.rows[0].id;

  // Find agent
  let agent;
  if (arg === '--auto') {
    const r = await pool.query(`
      SELECT a.id, a.title, a.attachments,
             (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id)::int as chunks
      FROM agents a WHERE a.user_id IS NULL AND a.category_ids::text[] @> ARRAY[$1::text]
      ORDER BY (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id) ASC
      LIMIT 1
    `, [catId]);
    agent = r.rows[0];
  } else {
    const r = await pool.query(`
      SELECT a.id, a.title, a.attachments,
             (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id)::int as chunks
      FROM agents a WHERE a.user_id IS NULL AND a.category_ids::text[] @> ARRAY[$1::text]
        AND lower(a.title) LIKE $2
      LIMIT 1
    `, [catId, '%' + arg.toLowerCase() + '%']);
    agent = r.rows[0];
  }

  if (!agent) { console.log('Agente não encontrado:', arg); return; }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  REPARANDO: ${agent.title}`);
  console.log(`  Chunks atuais: ${agent.chunks}`);
  console.log(`  URLs: ${(agent.attachments || []).length}`);
  console.log(`═══════════════════════════════════════════════════\n`);

  const urls = agent.attachments || [];
  if (!urls.length) { console.log('Sem URLs!'); return; }

  // Step 1: Fetch all URLs
  console.log('📥 Baixando URLs...\n');
  for (let i = 0; i < urls.length; i++) {
    try {
      await fetchText(urls[i]);
      console.log(`  [${i+1}/${urls.length}] ✓ ${urls[i].slice(0, 80)}`);
    } catch (e) {
      console.log(`  [${i+1}/${urls.length}] ✗ ${urls[i].slice(0, 60)} → ${e.message}`);
    }
  }

  // Step 2: Chunk + Embed each URL
  console.log('\n🔢 Gerando embeddings (batches de ' + EMBED_BATCH_SIZE + ', delay ' + EMBED_DELAY_MS/1000 + 's)...\n');
  const allPayloads = [];
  let totalChunks = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const text = textCache.get(url);
      if (!text) { console.log(`  [${i+1}] Skip (fetch falhou): ${url.slice(0, 60)}`); continue; }

      const chunks = chunkText(text);
      if (!chunks.length) { console.log(`  [${i+1}] Skip (sem texto): ${url.slice(0, 60)}`); continue; }

      console.log(`  [${i+1}/${urls.length}] ${url.slice(0, 60)}... (${chunks.length} chunks)`);
      const vectors = await embedBatch(chunks);
      
      const payload = [];
      let lost = 0;
      for (let j = 0; j < chunks.length; j++) {
        if (vectors[j]) {
          payload.push({ chunk_index: j, content: chunks[j], embedding: `[${vectors[j].join(',')}]` });
        } else {
          lost++;
        }
      }
      if (lost) console.log(`      ⚠ ${lost} chunks perdidos (embedding falhou)`);
      
      allPayloads.push({ url, chunks: payload });
      totalChunks += payload.length;
      console.log(`      Total acumulado: ${totalChunks} chunks\n`);
    } catch (e) {
      console.log(`  [${i+1}] ERRO: ${e.message}`);
    }
  }

  // Step 3: Safety check
  const oldChunks = parseInt(agent.chunks);
  console.log(`\n📊 Resultado: ${totalChunks} novos chunks (tinha ${oldChunks})`);

  if (totalChunks < oldChunks * 0.8 && totalChunks < oldChunks) {
    console.log(`⚠️  SKIP: novos (${totalChunks}) < 80% dos antigos (${oldChunks}). Dados preservados.`);
    return;
  }

  // Step 4: Atomic swap in transaction
  console.log('\n💾 Substituindo no banco (transação atômica)...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM documents WHERE agent_id=$1', [agent.id]);

    let inserted = 0;
    for (const p of allPayloads) {
      if (!p.chunks.length) continue;
      const docId = crypto.randomUUID();
      const title = p.url.length > 255 ? p.url.slice(0, 255) : p.url;
      await client.query('INSERT INTO documents (id, agent_id, title) VALUES ($1,$2,$3)', [docId, agent.id, title]);
      for (const row of p.chunks) {
        await client.query(
          'INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index) VALUES ($1,$2,$3,$4::vector,$5)',
          [agent.id, docId, row.content, row.embedding, row.chunk_index]
        );
        inserted++;
      }
    }
    
    await client.query('COMMIT');
    console.log(`\n✅ ${agent.title}: ${inserted} chunks inseridos de ${allPayloads.filter(p => p.chunks.length > 0).length} documentos`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.log(`\n❌ ROLLBACK — ${e.message}. Dados antigos preservados.`);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch(e => { console.error('[FATAL]', e.message); pool.end(); process.exit(1); });
