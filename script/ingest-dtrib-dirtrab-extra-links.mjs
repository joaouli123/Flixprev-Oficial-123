import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const ROOT = process.cwd();
const ATTACH_BASE = path.join(ROOT, 'public', 'agent-attachments', 'extra-links');

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const LINKS_BY_AGENT = {
  DTrib: [
    'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
    'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm',
    'https://www.planalto.gov.br/ccivil_03/leis/l6830.htm',
    'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/decreto/d9580.htm',
    'https://www.planalto.gov.br/ccivil_03/leis/2002/l10637.htm',
    'https://www.planalto.gov.br/ccivil_03/leis/LCP/Lcp214.htm#art507',
    'https://www.planalto.gov.br/ccivil_03/leis/LCP/Lcp214.htm#art496',
    'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.833.htm',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp227.htm#art169',
    'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
    'https://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm',
    'https://www.planalto.gov.br/ccivil_03/_Ato2015-2018/2015/Lei/L13135.htm#art6',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm',
    'https://www.al.sp.gov.br/repositorio/legislacao/decreto/2000/decreto-45490-30.11.2000.html',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm',
    'https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm',
    'https://www.in.gov.br/en/web/dou/-/instrucao-normativa-rfb-n-2.121-de-15-de-dezembro-de-2022-452045866',
  ],
  'Agente DirTrab': [
    'https://www.cnj.jus.br/poder-judiciario/governanca-de-gestao-de-pessoas/contatos-de-gestao-de-pessoas-do-poder-judiciario/tribunais-regionais-do-trabalho/',
  ],
};

function toSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function dedupe(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const cleaned = String(raw || '').trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
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

async function fetchWithRetry(url, tries = 3) {
  let last = null;
  const fetchUrl = String(url).split('#')[0];
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (FlixPrev Extra Links Ingestion/1.0)',
          Accept: 'text/html,application/pdf,*/*;q=0.8',
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  throw last;
}

async function extractText(url) {
  const response = await fetchWithRetry(url, 4);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdfParse(Buffer.from(await response.arrayBuffer()));
    return String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  }
  const html = await response.text();
  return htmlToText(html);
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
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  return null;
}

async function findAgentId(title) {
  const options = [title];
  if (title === 'Agente DirTrab') options.push('DirTrab');

  const result = await pool.query(
    'SELECT id, title FROM agents WHERE lower(title) = ANY($1) ORDER BY CASE WHEN user_id IS NULL THEN 0 ELSE 1 END, created_at DESC LIMIT 1',
    [options.map((s) => s.toLowerCase())]
  );

  if (result.rowCount === 0) return null;
  return result.rows[0];
}

async function processAgent(agentKey, links) {
  const agent = await findAgentId(agentKey);
  if (!agent) {
    return { agent: agentKey, error: 'AGENTE_NAO_ENCONTRADO', results: [] };
  }

  const folder = path.join(ATTACH_BASE, toSlug(agent.title));
  await fs.mkdir(folder, { recursive: true });

  const existingDocs = await pool.query('SELECT title FROM documents WHERE agent_id = $1', [agent.id]);
  const existingSet = new Set(existingDocs.rows.map((r) => String(r.title || '').trim()));

  const results = [];
  const uniqueLinks = dedupe(links);

  for (let index = 0; index < uniqueLinks.length; index++) {
    const url = uniqueLinks[index];

    if (existingSet.has(url)) {
      results.push({ url, status: 'already_exists', docs: 0, chunks: 0 });
      continue;
    }

    try {
      const text = await extractText(url);
      if (!text || text.length < 120) {
        results.push({ url, status: 'skipped_low_content', docs: 0, chunks: 0 });
        continue;
      }

      const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
      const fileName = `${String(index + 1).padStart(4, '0')}-${hash}.txt`;
      const relPath = `/agent-attachments/extra-links/${toSlug(agent.title)}/${fileName}`;
      const fullPath = path.join(folder, fileName);
      await fs.writeFile(fullPath, `FONTE: ${url}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${text}`, 'utf8');

      const attachmentsQuery = await pool.query('SELECT attachments FROM agents WHERE id = $1', [agent.id]);
      const currentAttachments = Array.isArray(attachmentsQuery.rows?.[0]?.attachments) ? attachmentsQuery.rows[0].attachments : [];
      if (!currentAttachments.includes(relPath)) {
        await pool.query('UPDATE agents SET attachments = $1 WHERE id = $2', [[...currentAttachments, relPath], agent.id]);
      }

      const docId = crypto.randomUUID();
      await pool.query('INSERT INTO documents (id, agent_id, title) VALUES ($1, $2, $3)', [docId, agent.id, url]);

      const chunks = chunkText(text, 4000, 1000);
      let inserted = 0;
      for (let i = 0; i < chunks.length; i++) {
        const vec = await embed(chunks[i]);
        if (!vec) continue;
        await pool.query(
          'INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index) VALUES ($1, $2, $3, $4::vector, $5)',
          [agent.id, docId, chunks[i], `[${vec.join(',')}]`, i]
        );
        inserted += 1;
      }

      results.push({ url, status: 'processed', docs: 1, chunks: inserted });
    } catch (error) {
      results.push({ url, status: 'failed', error: error?.message || String(error), docs: 0, chunks: 0 });
    }
  }

  return { agent: agent.title, agentId: agent.id, results };
}

async function main() {
  await fs.mkdir(ATTACH_BASE, { recursive: true });
  const reports = [];

  for (const [agentKey, links] of Object.entries(LINKS_BY_AGENT)) {
    reports.push(await processAgent(agentKey, links));
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
}

await main().finally(async () => {
  await pool.end();
});
