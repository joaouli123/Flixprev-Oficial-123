// Preenche embeddings que faltam em document_chunks usando o Gemini Agent
// Platform (mesma CHAT_API_KEY do chat, modelo gemini-embedding-001; grava os 512 primeiros valores como halfvec(512)).
//
// Por padrao so SIMULA (nao grava). Para gravar: --apply
//
//   node script/backfill-chunk-embeddings.mjs                       # resumo do que falta
//   node script/backfill-chunk-embeddings.mjs --agent "Aposentadoria por Idade" --limit 20 --apply
//   node script/backfill-chunk-embeddings.mjs --apply --concurrency 6
//
// Env: DATABASE_URL, CHAT_API_KEY, CHAT_BASE_URL (aiplatform), EMBEDDING_MODEL.
// So atualiza linhas com embedding NULL; pode parar e rodar de novo.
import 'dotenv/config';
import pg from 'pg';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const apply = flag('apply');
const agentFilter = option('agent', '');
const limit = Number(option('limit', '0')) || 0;
const concurrency = Math.max(1, Math.min(16, Number(option('concurrency', '4')) || 4));
const model = String(process.env.EMBEDDING_MODEL || 'gemini-embedding-001').trim();
const apiKey = String(process.env.CHAT_API_KEY || '').trim();
const baseURL = String(process.env.CHAT_BASE_URL || 'https://aiplatform.googleapis.com/v1').trim().replace(/\/+$/, '');
const API_DIMS = 3072;
const STORED_DIMS = 512; // document_chunks.embedding e halfvec(512) (truncagem MRL)
const MAX_CHARS = 8000; // gemini-embedding-001 aceita ~2048 tokens por entrada

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL nao configurada.');
if (apply && !apiKey) throw new Error('CHAT_API_KEY nao configurada.');
if (apply && !baseURL.includes('aiplatform.googleapis.com')) throw new Error('CHAT_BASE_URL precisa ser o Agent Platform.');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: concurrency + 1 });

async function embed(text) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${baseURL}/publishers/google/models/${encodeURIComponent(model)}:predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ instances: [{ content: text.slice(0, MAX_CHARS) }] }),
      signal: AbortSignal.timeout(30000),
    }).catch((error) => ({ ok: false, status: 0, text: async () => error.message }));
    if (response.ok) {
      const values = (await response.json())?.predictions?.[0]?.embeddings?.values || [];
      if (values.length !== API_DIMS) throw new Error(`embedding com ${values.length} dimensoes`);
      return values.slice(0, STORED_DIMS);
    }
    const body = await response.text();
    if (![0, 429, 500, 502, 503, 504].includes(response.status)) throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
  }
  throw new Error('limite de tentativas');
}

const where = ['dc.embedding IS NULL', "length(trim(dc.content)) > 0"];
const params = [];
if (agentFilter) {
  params.push(agentFilter);
  where.push(`(a.id::text = $${params.length} OR a.title ILIKE $${params.length})`);
}
const fromSql = `FROM document_chunks dc LEFT JOIN agents a ON a.id = dc.agent_id WHERE ${where.join(' AND ')}`;

const summary = await pool.query(
  `SELECT coalesce(a.title, '(sem agente)') AS agent, count(*)::int AS missing, sum(length(dc.content))::bigint AS chars ${fromSql} GROUP BY 1 ORDER BY 2 DESC`,
  params,
);
const totalMissing = summary.rows.reduce((sum, row) => sum + row.missing, 0);
const totalChars = summary.rows.reduce((sum, row) => sum + Number(row.chars), 0);
console.log(`Faltando embedding: ${totalMissing} trechos (~${Math.round(totalChars / 4 / 1e6)} mi tokens).`);
for (const row of summary.rows.slice(0, 40)) console.log(`  ${String(row.missing).padStart(6)}  ${row.agent}`);

if (!apply) {
  console.log('\nSimulacao: nada foi gravado. Use --apply para preencher.');
  await pool.end();
  process.exit(0);
}

let done = 0;
let failed = 0;
const startedAt = Date.now();
const batchSize = 200;
let remaining = limit || Infinity;

while (remaining > 0) {
  const take = Math.min(batchSize, remaining);
  const { rows } = await pool.query(`SELECT dc.id, dc.content ${fromSql} ORDER BY dc.created_at LIMIT ${take}`, params);
  if (!rows.length) break;

  let cursor = 0;
  let progressInBatch = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      try {
        const vector = await embed(String(row.content));
        await pool.query('UPDATE document_chunks SET embedding = $1::halfvec WHERE id = $2 AND embedding IS NULL', [`[${vector.join(',')}]`, row.id]);
        done++;
        progressInBatch++;
      } catch (error) {
        failed++;
        console.error(`[falha] ${row.id}: ${error.message}`);
        if (failed > 50 && failed > done) throw new Error('Muitas falhas seguidas; parando.');
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  remaining -= rows.length;
  const minutes = (Date.now() - startedAt) / 60000;
  console.log(`[progresso] ${done} gravados, ${failed} falhas, ${(done / Math.max(minutes, 0.01)).toFixed(0)}/min`);
  if (!progressInBatch) break; // so falhas neste lote: evita loop infinito
}

console.log(`Fim: ${done} gravados, ${failed} falhas.`);
await pool.end();
