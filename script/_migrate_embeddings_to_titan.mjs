/**
 * Migra embeddings de document_chunks para Amazon Titan Embed Text v2 (1024d)
 * sem reprocessar URLs/chunking.
 *
 * Vantagens:
 * - Mais rapido (usa content ja salvo no banco)
 * - Sem perda de qualidade textual (chunks permanecem identicos)
 * - Resumivel (pode parar e continuar)
 * - Swap atomico no final
 *
 * Uso:
 *   node script/_migrate_embeddings_to_titan.mjs --prepare
 *   node script/_migrate_embeddings_to_titan.mjs --backfill
 *   node script/_migrate_embeddings_to_titan.mjs --verify
 *   node script/_migrate_embeddings_to_titan.mjs --swap
 *   node script/_migrate_embeddings_to_titan.mjs --all
 */

import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const region = process.env.AWS_BEDROCK_REGION || 'us-east-1';
const bearer = process.env.AWS_BEARER_TOKEN_BEDROCK;
const titanUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/amazon.titan-embed-text-v2:0/invoke`;

const SELECT_BATCH = Number(process.env.TITAN_SELECT_BATCH || 120);
const EMBED_CONCURRENCY = Number(process.env.TITAN_EMBED_CONCURRENCY || 12);
const MAX_RETRIES = Number(process.env.TITAN_MAX_RETRIES || 5);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function titanEmbed(text) {
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const resp = await fetch(titanUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputText: String(text || '').slice(0, 50000),
          dimensions: 1024,
          normalize: true,
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (resp.status === 429 || resp.status >= 500) {
        const waitMs = Math.min(3000 * attempt, 20000);
        await sleep(waitMs);
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${body.slice(0, 300)}`);
      }

      const data = await resp.json();
      const embedding = data?.embedding;
      if (!Array.isArray(embedding) || embedding.length !== 1024) {
        throw new Error(`embedding invalido (len=${Array.isArray(embedding) ? embedding.length : 'n/a'})`);
      }

      return embedding;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * attempt);
      }
    }
  }

  throw lastErr || new Error('falha ao gerar embedding Titan');
}

async function prepare() {
  console.log('\n[PREPARE] garantindo coluna e indice temporario...');

  await pool.query(`
    ALTER TABLE document_chunks
    ADD COLUMN IF NOT EXISTS embedding_titan vector(1024)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_titan
    ON document_chunks USING hnsw (embedding_titan vector_cosine_ops)
  `);

  console.log('[PREPARE] OK');
}

async function getBackfillStats() {
  const total = await pool.query('SELECT count(*)::int AS n FROM document_chunks');
  const done = await pool.query('SELECT count(*)::int AS n FROM document_chunks WHERE embedding_titan IS NOT NULL');
  const pending = await pool.query('SELECT count(*)::int AS n FROM document_chunks WHERE embedding_titan IS NULL');

  return {
    total: total.rows[0].n,
    done: done.rows[0].n,
    pending: pending.rows[0].n,
  };
}

async function processOneRow(row) {
  const embedding = await titanEmbed(row.content);
  const embeddingStr = `[${embedding.join(',')}]`;
  return { id: row.id, embedding: embeddingStr };
}

async function bulkUpdateEmbeddings(updates) {
  if (!updates.length) return;

  const values = [];
  const placeholders = [];
  for (let i = 0; i < updates.length; i += 1) {
    const p1 = i * 2 + 1;
    const p2 = i * 2 + 2;
    placeholders.push(`($${p1}::uuid, $${p2}::text)`);
    values.push(updates[i].id, updates[i].embedding);
  }

  await pool.query(
    `
      UPDATE document_chunks dc
      SET embedding_titan = v.embedding::vector
      FROM (VALUES ${placeholders.join(',')}) AS v(id, embedding)
      WHERE dc.id = v.id
    `,
    values,
  );
}

async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;
  const errors = [];

  async function loop() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      try {
        await worker(items[idx], idx);
      } catch (err) {
        errors.push({ item: items[idx], err });
      }
    }
  }

  const runners = Array.from({ length: Math.max(1, concurrency) }, () => loop());
  await Promise.all(runners);
  return errors;
}

async function backfill() {
  if (!bearer) {
    throw new Error('AWS_BEARER_TOKEN_BEDROCK nao definido no .env');
  }

  console.log(`\n[BACKFILL] iniciando com batch=${SELECT_BATCH}, concurrency=${EMBED_CONCURRENCY}`);

  let loop = 0;
  while (true) {
    loop += 1;

    const rowsResult = await pool.query(
      `SELECT id, content
       FROM document_chunks
       WHERE embedding_titan IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [SELECT_BATCH],
    );

    const rows = rowsResult.rows;
    if (!rows.length) {
      console.log('[BACKFILL] concluido: sem pendencias');
      break;
    }

    console.log(`\n[BACKFILL] ciclo ${loop}: processando ${rows.length} chunks...`);

    const started = Date.now();
    const okResults = [];
    const errors = await runWithConcurrency(rows, EMBED_CONCURRENCY, async (row) => {
      const result = await processOneRow(row);
      okResults.push(result);
    });

    // Atualiza no banco em batches maiores para reduzir overhead de round-trips.
    const updateBatch = 100;
    for (let i = 0; i < okResults.length; i += updateBatch) {
      await bulkUpdateEmbeddings(okResults.slice(i, i + updateBatch));
    }

    const ms = Date.now() - started;

    if (errors.length) {
      console.log(`[BACKFILL] ${errors.length} erros neste ciclo (serao tentados novamente nos proximos ciclos).`);
      for (const e of errors.slice(0, 3)) {
        console.log(`  - id=${e.item?.id}: ${e.err?.message || e.err}`);
      }
    }

    console.log(`[BACKFILL] ciclo ${loop}: sucesso=${okResults.length} falhas=${errors.length}`);

    const stats = await getBackfillStats();
    const pct = stats.total ? ((stats.done / stats.total) * 100).toFixed(2) : '0.00';
    console.log(`[BACKFILL] progresso: ${stats.done}/${stats.total} (${pct}%) | pendentes=${stats.pending} | ciclo=${ms}ms`);
  }
}

async function verify() {
  console.log('\n[VERIFY] conferindo consistencia...');
  const stats = await getBackfillStats();
  const sample = await pool.query(`
    SELECT
      id,
      array_length(string_to_array(trim(both '[]' from embedding_titan::text), ','), 1) AS dims
    FROM document_chunks
    WHERE embedding_titan IS NOT NULL
    LIMIT 3
  `);

  console.log(`[VERIFY] total=${stats.total} done=${stats.done} pending=${stats.pending}`);
  for (const r of sample.rows) {
    console.log(`[VERIFY] sample id=${r.id} dims=${r.dims}`);
  }

  if (stats.pending > 0) {
    console.log('[VERIFY] ainda existem pendencias; rode --backfill novamente.');
  } else {
    console.log('[VERIFY] pronto para swap.');
  }
}

async function swapColumns() {
  console.log('\n[SWAP] iniciando swap atomico...');

  const stats = await getBackfillStats();
  if (stats.pending > 0) {
    throw new Error(`nao pode fazer swap com pendencias (${stats.pending}). Rode --backfill ate zerar.`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DROP INDEX IF EXISTS idx_document_chunks_embedding');

    await client.query('ALTER TABLE document_chunks DROP COLUMN embedding');
    await client.query('ALTER TABLE document_chunks RENAME COLUMN embedding_titan TO embedding');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
      ON document_chunks USING hnsw (embedding vector_cosine_ops)
    `);

    await client.query('DROP INDEX IF EXISTS idx_document_chunks_embedding_titan');

    await client.query('COMMIT');
    console.log('[SWAP] concluido com sucesso. document_chunks.embedding agora e vector(1024).');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function run() {
  const mode = process.argv[2] || '--all';

  if (!['--prepare', '--backfill', '--verify', '--swap', '--all'].includes(mode)) {
    throw new Error(`modo invalido: ${mode}`);
  }

  if (mode === '--prepare') {
    await prepare();
  } else if (mode === '--backfill') {
    await backfill();
  } else if (mode === '--verify') {
    await verify();
  } else if (mode === '--swap') {
    await swapColumns();
  } else {
    await prepare();
    await backfill();
    await verify();
    await swapColumns();
    await verify();
  }

  await pool.end();
}

run().catch(async (err) => {
  console.error('\n[FATAL]', err?.message || err);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
