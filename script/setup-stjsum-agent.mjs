import crypto from 'crypto';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const CATEGORY_NAME = 'Superior Tribunal de Justiça';
const AGENT = {
  title: 'STJSum',
  role: 'Súmulas do STJ',
  description: 'Consulta e síntese de súmulas do Superior Tribunal de Justiça com base no conteúdo indexado.',
  instructions:
    'Especialista em súmulas do STJ. Responda com base no conteúdo indexado deste agente e, quando possível, cite o enunciado/súmula correspondente.',
  sourceUrl: 'https://www.trt2.jus.br/geral/tribunal2/Trib_Sup/STJ/SUM_STJ.html',
};

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function stripHtml(html) {
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

function chunkText(text, size = 3500, overlap = 800) {
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

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    const next = end - overlap;
    start = next > start ? next : end;
  }

  return chunks;
}

async function embed(text) {
  try {
    const response = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
      input: text,
    });
    return response.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

async function ensureCategory() {
  const existing = await pool.query(
    'SELECT id FROM categories WHERE lower(name)=lower($1) AND user_id IS NULL LIMIT 1',
    [CATEGORY_NAME]
  );

  if (existing.rowCount > 0) return existing.rows[0].id;

  const created = await pool.query(
    'INSERT INTO categories (id, name, user_id) VALUES ($1, $2, NULL) RETURNING id',
    [crypto.randomUUID(), CATEGORY_NAME]
  );

  return created.rows[0].id;
}

async function ensureAgent(categoryId) {
  const existing = await pool.query(
    'SELECT id, attachments FROM agents WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1',
    [AGENT.title]
  );

  const strict =
    'REGRAS DE FIDELIDADE:\n1) Use somente conteúdo indexado deste agente.\n2) Não invente súmulas ou enunciados.\n3) Se não encontrar no conteúdo, diga explicitamente que não encontrou.';

  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await pool.query(
      `UPDATE agents
       SET role=$1, description=$2, instructions=$3, user_id=NULL, category_ids=$4, icon=COALESCE(icon, $5)
       WHERE id=$6`,
      [AGENT.role, AGENT.description, `${AGENT.instructions}\n\n${strict}`, [categoryId], 'BookOpen', id]
    );
    return id;
  }

  const created = await pool.query(
    `INSERT INTO agents (id, user_id, title, role, description, instructions, icon, category_ids, shortcuts, attachments)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      crypto.randomUUID(),
      AGENT.title,
      AGENT.role,
      AGENT.description,
      `${AGENT.instructions}\n\n${strict}`,
      'BookOpen',
      [categoryId],
      ['Resumo', 'Súmulas', 'Base legal'],
      [],
    ]
  );

  return created.rows[0].id;
}

async function ingest(agentId) {
  const response = await fetch(AGENT.sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (FlixPrev STJ Ingestion/1.0)', Accept: 'text/html,*/*' },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} ao buscar ${AGENT.sourceUrl}`);
  const html = await response.text();
  const text = stripHtml(html);

  await pool.query('UPDATE agents SET attachments=$1 WHERE id=$2', [[AGENT.sourceUrl], agentId]);
  await pool.query('DELETE FROM documents WHERE agent_id=$1', [agentId]);

  const docId = crypto.randomUUID();
  await pool.query('INSERT INTO documents (id, agent_id, title) VALUES ($1, $2, $3)', [docId, agentId, AGENT.sourceUrl]);

  const chunks = chunkText(text, 3500, 800);
  let inserted = 0;

  for (let i = 0; i < chunks.length; i++) {
    const vector = await embed(chunks[i]);
    if (!vector) continue;

    await pool.query(
      `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [agentId, docId, chunks[i], `[${vector.join(',')}]`, i]
    );
    inserted += 1;
  }

  return { chunksTotal: chunks.length, chunksInserted: inserted };
}

async function main() {
  try {
    const categoryId = await ensureCategory();
    const agentId = await ensureAgent(categoryId);
    const ingestResult = await ingest(agentId);

    console.log(
      JSON.stringify(
        {
          category: CATEGORY_NAME,
          agent: AGENT.title,
          source: AGENT.sourceUrl,
          categoryId,
          agentId,
          ...ingestResult,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

await main();
