import crypto from 'crypto';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import pkg from 'pg';

dotenv.config();

const CATEGORY_NAME = 'Previdenciário';
const LOCK_KEY = 90612071;

const COMMON_URLS_RAW = [
  'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
  'http://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm',
  'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
  'https://www.planalto.gov.br/ccivil_03/decreto/d3048.htm',
  'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/decreto/d10410.htm',
  'https://portalin.inss.gov.br/in',
  'https://portalin.inss.gov.br/portaria990',
  'https://portalin.inss.gov.br/portaria991',
  'https://portalin.inss.gov.br/portaria993',
  'https://portalin.inss.gov.br/portaria994',
  'https://www.in.gov.br/web/dou/-/instrucao-normativa-pres/inss/n-200-de-12-de-fevereiro-de-2026-687366848',
  'https://www.gov.br/inss/pt-br/centrais-de-conteudo/legislacao/portarias/2026',
  'https://www.gov.br/inss/pt-br/centrais-de-conteudo/legislacao/portarias/2025',
  'https://www.gov.br/inss/pt-br/centrais-de-conteudo/legislacao/portarias-conjuntas/2025',
  'https://www.in.gov.br/web/dou/-/portaria-pres/inss-n-1.919-de-12-de-janeiro-de-2026-*-681141683',
  'https://www.in.gov.br/web/dou/-/portaria-conjunta-dirben/dti/inss-n-13-de-23-de-maio-de-2025-631933663',
  'https://www.in.gov.br/web/dou/-/portaria-conjunta-dirben/dti-inss-n-22-de-23-de-setembro-de-2025-658090051',
  'https://www.in.gov.br/web/dou/-/portaria-conjunta-dirben-inss/dpmf-mps-n-4-de-4-de-dezembro-de-2025-673663306',
  'https://www.in.gov.br/web/dou/-/portaria-conjunta-mps/inss-n-83-de-4-de-dezembro-de-2025-673690090',
  'https://www.in.gov.br/web/dou/-/portaria-conjunta-dirben/dti/pfe-inss-n-26-de-20-de-outubro-de-2025-667430319',
  'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15157.htm',
  'https://www.in.gov.br/en/web/dou/-/portaria-conjunta-mps/inss-n-72-de-16-de-outubro-de-2025-663094301',
  'https://www.in.gov.br/en/web/dou/-/portaria-conjunta-mps/inss-n-60-de-17-de-junho-de-2025-636848467',
  'https://www.in.gov.br/web/dou/-/portaria-pres/inss-n-1.630-de-17-de-novembro-de-2023-524262179',
];

const ACNIS_EXTRA_URLS = [
  'https://www.in.gov.br/web/dou/-/portaria-dirben/inss-n-1.326-de-13-de-janeiro-de-2026-681141180',
];

const TARGET_AGENTS = [
  { title: 'A.pré103', role: 'Aposentadoria Pré EC103', highlight: false },
  { title: 'Apiurb', role: 'Aposentadoria Idade Urbana', highlight: false },
  { title: 'AIP', role: 'Aposentadoria Incapacidade Permanente', highlight: false },
  { title: 'AEsp', role: 'Aposentadoria Especial', highlight: false },
  { title: 'ARur', role: 'Aposentadoria Rural', highlight: false },
  { title: 'AIT', role: 'Incapacidade Temporária', highlight: false },
  { title: 'AA', role: 'Auxílio-Acidente', highlight: false },
  { title: 'Rec', role: 'Auxílio-Reclusão', highlight: false },
  { title: 'SMar', role: 'Salário-Maternidade', highlight: false },
  { title: 'SFam', role: 'Salário-Família', highlight: false },
  { title: 'PMor', role: 'Pensão por Morte', highlight: false },
  { title: 'RTransiç', role: 'Regras de Transição', highlight: false },
  { title: 'RMI', role: 'Cálculo de RMI', highlight: false },
  { title: 'ProcAdm', role: 'Processo Administrativo Previdenciário', highlight: true },
  { title: 'AVJud', role: 'Viabilidade Judicial por Incapacidade', highlight: false },
  { title: '25AIP', role: '25% de Acréscimo na Aposentadoria por Incapacidade', highlight: false },
  { title: 'APCD', role: 'Aposentadoria PCD', highlight: false },
  { title: 'ACNIS', role: 'Agente CNIS', highlight: false },
];

const TRANSIENT_DB_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '53300']);

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function normalizeUrl(rawUrl) {
  try {
    const cleaned = String(rawUrl || '').trim().replace(/\*+/g, '');
    const parsed = new URL(cleaned);
    if (parsed.protocol === 'file:') return parsed.toString();
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    removeParams.forEach((p) => parsed.searchParams.delete(p));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupe(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    const n = normalizeUrl(url);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
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
    if (chunk) chunks.push(chunk);
    const next = end - overlap;
    start = next > start ? next : end;
  }

  return chunks;
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
  let last = null;
  for (let i = 1; i <= tries; i++) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      last = error;
      if (!isTransientDbError(error) || i === tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  throw last;
}

async function fetchWithRetry(url, tries = 3) {
  let last = null;
  for (let i = 1; i <= tries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (FlixPrev Previdenciario Common Ingestion/1.0)',
          Accept: 'text/html,application/pdf,*/*;q=0.8',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  throw last;
}

async function embed(text) {
  for (let i = 1; i <= 3; i++) {
    try {
      const response = await Promise.race([
        openai.embeddings.create({ model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001', input: text }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('embedding-timeout')), 45000)),
      ]);
      return response.data?.[0]?.embedding || null;
    } catch {
      if (i === 3) return null;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  return null;
}

async function ensureCategory() {
  const existing = await dbQuery('SELECT id FROM categories WHERE lower(name)=lower($1) AND user_id IS NULL LIMIT 1', [CATEGORY_NAME]);
  if (existing.rowCount > 0) return existing.rows[0].id;

  const created = await dbQuery('INSERT INTO categories (id,name,user_id) VALUES ($1,$2,NULL) RETURNING id', [crypto.randomUUID(), CATEGORY_NAME]);
  return created.rows[0].id;
}

async function ensureAgent(agent, categoryId) {
  const existing = await dbQuery('SELECT id FROM agents WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1', [agent.title]);
  const strict = [
    'REGRAS DE FIDELIDADE:',
    '1) Use somente conteúdo indexado.',
    '2) Não invente base legal.',
    '3) Se não houver base indexada para a pergunta, informe claramente.',
  ].join('\n');

  const role = agent.highlight ? `⭐ ${agent.role}` : agent.role;
  const description = agent.highlight
    ? `${agent.role}. Este agente é prioritário para consultas de processo administrativo previdenciário.`
    : `Agente especializado em ${agent.role}.`;

  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await dbQuery(
      `UPDATE agents
       SET user_id=NULL, role=$1, description=$2, instructions=$3, category_ids=$4, icon=COALESCE(icon,$5)
       WHERE id=$6`,
      [role, description, `${agent.role}.\n\n${strict}`, [categoryId], agent.highlight ? 'Star' : 'ShieldCheck', id]
    );
    return id;
  }

  const created = await dbQuery(
    `INSERT INTO agents (id,user_id,title,role,description,instructions,icon,category_ids,shortcuts,attachments)
     VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      crypto.randomUUID(),
      agent.title,
      role,
      description,
      `${agent.role}.\n\n${strict}`,
      agent.highlight ? 'Star' : 'ShieldCheck',
      [categoryId],
      agent.highlight
        ? ['Destaque', 'Base legal', 'Checklist', 'Fluxo processual']
        : ['Resumo', 'Base legal', 'Checklist', 'Prazos'],
      [],
    ]
  );

  return created.rows[0].id;
}

async function tryReuseFromDb(url) {
  const query = await dbQuery(
    `SELECT d.id AS document_id, d.title AS document_title, dc.content, dc.embedding::text AS embedding, dc.chunk_index
     FROM documents d
     JOIN document_chunks dc ON dc.document_id = d.id
     WHERE d.title = $1
     ORDER BY dc.chunk_index ASC`,
    [url]
  );

  if (query.rowCount === 0) return null;

  const chunks = query.rows
    .map((row) => ({
      chunk_index: row.chunk_index,
      content: row.content,
      embedding: row.embedding,
    }))
    .filter((row) => row.content && row.embedding);

  if (chunks.length === 0) return null;

  return { url, chunks, from: 'db-reuse' };
}

async function buildSourcePayload(url) {
  const reused = await tryReuseFromDb(url);
  if (reused) return reused;

  const response = await fetchWithRetry(url, 3);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  let text = '';
  if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdfParse(Buffer.from(await response.arrayBuffer()));
    text = String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  } else {
    text = htmlToText(await response.text());
  }

  if (!text || text.length < 80) {
    text = [
      `FONTE: ${url}`,
      `CONTENT_TYPE: ${contentType || 'desconhecido'}`,
      'OBS: conteúdo textual reduzido; link preservado para consulta normativa oficial.',
    ].join('\n');
  }

  const chunksRaw = chunkText(text, 4000, 1000);
  const chunks = [];

  for (let i = 0; i < chunksRaw.length; i++) {
    const vector = await embed(chunksRaw[i]);
    if (!vector) continue;
    chunks.push({ chunk_index: i, content: chunksRaw[i], embedding: `[${vector.join(',')}]` });
  }

  return { url, chunks, from: 'fresh-fetch' };
}

async function main() {
  const lock = await dbQuery('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
  if (!lock.rows?.[0]?.locked) throw new Error('Já existe processamento previdenciário comum em execução.');

  try {
    const categoryId = await ensureCategory();

    const commonUrls = dedupe(COMMON_URLS_RAW);
    const acnisExtra = dedupe(ACNIS_EXTRA_URLS);

    const payloads = [];
    for (let i = 0; i < commonUrls.length; i++) {
      const url = commonUrls[i];
      try {
        const payload = await buildSourcePayload(url);
        payloads.push(payload);
        console.log(`[OK] fonte comum ${i + 1}/${commonUrls.length}: ${url} (${payload.chunks.length} chunks, ${payload.from})`);
      } catch (error) {
        console.log(`[ERRO] fonte comum ${i + 1}/${commonUrls.length}: ${url} -> ${error.message}`);
      }
    }

    for (let i = 0; i < acnisExtra.length; i++) {
      const url = acnisExtra[i];
      if (payloads.some((p) => p.url === url)) continue;
      try {
        const payload = await buildSourcePayload(url);
        payloads.push(payload);
        console.log(`[OK] fonte extra ACNIS ${i + 1}/${acnisExtra.length}: ${url} (${payload.chunks.length} chunks, ${payload.from})`);
      } catch (error) {
        console.log(`[ERRO] fonte extra ACNIS ${i + 1}/${acnisExtra.length}: ${url} -> ${error.message}`);
      }
    }

    const summary = [];

    for (const agent of TARGET_AGENTS) {
      const agentId = await ensureAgent(agent, categoryId);
      const urlsForAgent = agent.title === 'ACNIS' ? dedupe([...commonUrls, ...acnisExtra]) : commonUrls;
      const payloadsForAgent = payloads.filter((p) => urlsForAgent.includes(p.url));

      await dbQuery('UPDATE agents SET attachments=$1 WHERE id=$2', [urlsForAgent, agentId]);
      await dbQuery('DELETE FROM documents WHERE agent_id=$1', [agentId]);

      let docs = 0;
      let chunks = 0;

      for (const payload of payloadsForAgent) {
        const docId = crypto.randomUUID();
        const title = payload.url.length > 255 ? payload.url.slice(0, 255) : payload.url;

        await dbQuery('INSERT INTO documents (id, agent_id, title) VALUES ($1,$2,$3)', [docId, agentId, title]);
        docs += 1;

        for (const row of payload.chunks) {
          await dbQuery(
            `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
             VALUES ($1,$2,$3,$4::vector,$5)`,
            [agentId, docId, row.content, row.embedding, row.chunk_index]
          );
          chunks += 1;
        }
      }

      summary.push({ title: agent.title, agentId, links: urlsForAgent.length, docs, chunks });
      console.log(`[AGENTE] ${agent.title}: ${docs} docs, ${chunks} chunks`);
    }

    console.log('\n===== RESUMO PREVIDENCIÁRIO COMUM =====');
    console.log(JSON.stringify({
      commonUrls: commonUrls.length,
      acnisExtra: acnisExtra.length,
      payloadsBuilt: payloads.length,
      agents: summary,
    }, null, 2));
  } finally {
    await dbQuery('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    await pool.end();
  }
}

await main().catch((error) => {
  console.error('\n[FATAL] setup-previdenciario-common-agents falhou.');
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
