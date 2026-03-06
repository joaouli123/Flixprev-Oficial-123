import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const CATEGORY_NAME = 'Dir. Trabalhista';
const ATTACH_BASE = path.join(process.cwd(), 'public', 'agent-attachments', 'trabalhista-novos-agentes');
const LOCK_KEY = 90612061;

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const AGENTS = [
  {
    title: 'SúmulasCore',
    role: 'Súmulas e Precedentes Trabalhistas',
    description:
      'Agente central de consulta e organização das súmulas trabalhistas, ativas e canceladas, com status, histórico e aplicabilidade.',
    instructions:
      'Entregue base técnica sobre súmulas trabalhistas (TST e TRTs), indicando status, histórico e aplicabilidade conforme conteúdo indexado.',
    urls: [
      'https://www.tst.jus.br/cancelamento-de-sumulas-ojs-e-precedentes-normativos',
      'https://www.tst.jus.br/documents/d/guest/livrointernet-12-pdf',
      'https://jurisprudencia.tst.jus.br/?tipoJuris=SUM&orgao=TST&pesquisar=1',
      'https://www.trt4.jus.br/portais/trt4/sumulas',
      'https://trt1.jus.br/documents/22365/3111637/S%C3%BAmulas+arquivo+completo+26.9.2023.pdf/7cbb62d6-020e-b1ac-bb7f-7160a4aa491b',
      'https://trt1.jus.br/documents/22365/3111637/TESES+JUR%C3%8DDICAS+PREVALECENTES+-+26.9.2023.pdf/1849a028-ac7d-b435-2a34-5bdb42a2be7a',
      'https://www.trt2.jus.br/geral/tribunal2/SUM_TRT2/Sumulas_trt02.html',
      'https://portal.trt3.jus.br/internet/jurisprudencia/uniformizacao-de-jurisprudencia/sumulas',
      'https://www.trt4.jus.br/portais/trt4/sumulas',
      'https://www.trt5.jus.br/sumulas/todas',
      'https://www.trt6.jus.br/portal/jurisprudencia/sumulas-trt6',
      'https://www.trt7.jus.br/index.php/jurisprudencia/jurisprudencia-consolidada-trt7/sumulas-do-trt7',
      'https://www.trt8.jus.br/jurisprudencia/sumulas-em-lista',
      'https://www.trt8.jus.br/jurisprudencia/sumulas',
      'https://www.trt9.jus.br/bancojurisprudencia/publico/listagemPorCategoria_visualizadorHtml.xhtml',
      'https://vlex.com.br/vid/sumulas-do-trt-10-567352362',
      'https://portal.trt11.jus.br/index.php/main/11-servicos/15-sumulas',
      'https://portal.trt12.jus.br/uniformiza%C3%A7%C3%A3odejurisprud%C3%AAncias%C3%BAmulastrtsc',
      'https://www.trt13.jus.br/institucional/nugep/sumulas',
      'https://portal.trt14.jus.br/portal/sumulas',
      'https://trt15.jus.br/sites/portal/files/roles/servicos/atas-julgamento/s%C3%BAmulas/versao-compilada_SUMULAS_13-02-2026.pdf',
      'https://trt15.jus.br/sites/portal/files/roles/servicos/atas-julgamento/s%C3%BAmulas/versao-completa_SUMULAS_13-02-2026.pdf',
      'https://www.trt16.jus.br/sites/portal/files/roles/jurisprudencia/S%C3%BAmulas%20do%20TRT16.pdf',
      'https://www.trt17.jus.br/w/sumulas',
      'https://www.trt18.jus.br/portal/jurisprudencia/sumula-trt18/',
      'https://site.trt19.jus.br/sumulastrt19',
      'https://www.trt20.jus.br/jurisprudencia/sumulas-do-trt-20-regiao?view=article&id=9330:integra-sumulas&catid=2',
      'https://www.trt21.jus.br/jurisprudencia/sumulas',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=0',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=1',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=2',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=3',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=4',
      'https://portal.trt23.jus.br/portal/sumulas',
      'https://www.trt24.jus.br/documents/20182/1472434/S%C3%9AMULAS+DO+TRT+DA+24%C2%AA+REGI%C3%83O+-+atualiza%C3%A7%C3%A3o+Julho+2025',
    ],
  },
  {
    title: 'PrecedenteX',
    role: 'Precedentes Vinculantes e Repetitivos',
    description:
      'Destaca decisões vinculantes, repetitivas e entendimentos com força persuasiva relevante para fundamentações consistentes.',
    instructions:
      'Priorize precedentes vinculantes e repetitivos com foco estratégico para fundamentação trabalhista.',
    urls: ['https://www.tst.jus.br/nugep-sp/recursos-repetitivos/precedentes-vinculantes'],
  },
  {
    title: 'JurisPrd',
    role: 'Inteligência de Jurisprudência Trabalhista',
    description:
      'Núcleo de inteligência em jurisprudência trabalhista para identificar precedentes dominantes, entendimentos consolidados e divergências.',
    instructions:
      'Quando a pergunta exigir pesquisa viva de jurisprudência, indique explicitamente os links oficiais de pesquisa indexados neste agente.',
    urls: ['https://jurisprudencia.jt.jus.br', 'https://jurisprudencia.tst.jus.br/'],
  },
];

const TRANSIENT_DB_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '53300']);

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl).trim());
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
    const normalized = normalizeUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
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
      const period = clean.lastIndexOf('.', end);
      const space = clean.lastIndexOf(' ', end);
      if (period > start + size * 0.8) end = period + 1;
      else if (space > start + size * 0.5) end = space;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) out.push(chunk);
    const next = end - overlap;
    start = next > start ? next : end;
  }

  return out;
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
          'User-Agent': 'Mozilla/5.0 (FlixPrev Trabalhista Novos Agentes/1.0)',
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

async function extractText(url, agentTitle) {
  const response = await fetchWithRetry(url, 3);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdfParse(Buffer.from(await response.arrayBuffer()));
    const text = String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 120) return text;
  }

  if (contentType.includes('text/html') || contentType.includes('text/plain') || !contentType) {
    const html = await response.text();
    const text = htmlToText(html);
    if (text.length > 120) return text;
  }

  if (agentTitle === 'JurisPrd') {
    return [
      `FONTE_OFICIAL_DE_PESQUISA: ${url}`,
      'OBS: esta fonte é portal de pesquisa jurisprudencial. Quando a pergunta demandar busca dinâmica, orientar consulta direta neste link.',
      'USO_RECOMENDADO: indicar caminho de pesquisa e filtros de tribunal/tema/período.',
    ].join('\n');
  }

  return [
    `FONTE: ${url}`,
    `CONTENT_TYPE: ${contentType || 'desconhecido'}`,
    'OBS: conteúdo textual direto limitado; link preservado para consulta oficial.',
  ].join('\n');
}

async function embed(text) {
  const tries = 3;
  for (let i = 1; i <= tries; i++) {
    try {
      const response = await Promise.race([
        openai.embeddings.create({ model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001', input: text }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('embedding-timeout')), 45000)),
      ]);
      return response.data?.[0]?.embedding || null;
    } catch {
      if (i === tries) return null;
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
    '1) Responda somente com base no conteúdo indexado.',
    '2) Não invente súmulas, precedentes ou números.',
    '3) Se não encontrar no conteúdo indexado, informe explicitamente.',
    '4) No JurisPrd, quando apropriado, indique os links oficiais de pesquisa.',
  ].join('\n');

  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await dbQuery(
      `UPDATE agents
       SET role=$1, description=$2, instructions=$3, user_id=NULL, category_ids=$4, icon=COALESCE(icon, $5)
       WHERE id=$6`,
      [agent.role, agent.description, `${agent.instructions}\n\n${strict}`, [categoryId], 'Scale', id]
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
      agent.role,
      agent.description,
      `${agent.instructions}\n\n${strict}`,
      'Scale',
      [categoryId],
      ['Resumo', 'Base legal', 'Pesquisa'],
      [],
    ]
  );

  return created.rows[0].id;
}

async function ingestAgent(agentId, agent) {
  const urls = dedupe(agent.urls);
  const folder = path.join(ATTACH_BASE, toSlug(agent.title));
  await fs.mkdir(folder, { recursive: true });

  const harvested = [];
  const attachments = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const text = await extractText(url, agent.title);
      if (!text || text.length < 80) {
        console.log(`[SKIP] ${agent.title} ${i + 1}/${urls.length}: conteúdo insuficiente ${url}`);
        continue;
      }

      const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
      const fileName = `${String(i + 1).padStart(4, '0')}-${hash}.txt`;
      const relPath = `/agent-attachments/trabalhista-novos-agentes/${toSlug(agent.title)}/${fileName}`;
      await fs.writeFile(path.join(folder, fileName), `FONTE: ${url}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${text}`, 'utf8');

      harvested.push({ url, text });
      attachments.push(relPath);
      console.log(`[OK] ${agent.title} ${i + 1}/${urls.length} (${Math.round(text.length / 1000)}k chars)`);
    } catch (error) {
      console.log(`[ERRO] ${agent.title} ${i + 1}/${urls.length}: ${url} -> ${error.message}`);
    }
  }

  await dbQuery('UPDATE agents SET attachments=$1 WHERE id=$2', [attachments, agentId]);
  await dbQuery('DELETE FROM documents WHERE agent_id=$1', [agentId]);

  let docs = 0;
  let chunksInserted = 0;

  for (const item of harvested) {
    const docId = crypto.randomUUID();
    const docTitle = item.url.length > 255 ? item.url.slice(0, 255) : item.url;

    await dbQuery('INSERT INTO documents (id, agent_id, title) VALUES ($1,$2,$3)', [docId, agentId, docTitle]);
    docs += 1;

    const chunks = chunkText(item.text, 4000, 1000);
    for (let idx = 0; idx < chunks.length; idx++) {
      const vector = await embed(chunks[idx]);
      if (!vector) continue;

      await dbQuery(
        `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
         VALUES ($1,$2,$3,$4::vector,$5)`,
        [agentId, docId, chunks[idx], `[${vector.join(',')}]`, idx]
      );
      chunksInserted += 1;
    }
  }

  return { links: urls.length, harvested: harvested.length, docs, chunksInserted };
}

async function main() {
  await fs.mkdir(ATTACH_BASE, { recursive: true });

  const lock = await dbQuery('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
  if (!lock.rows?.[0]?.locked) {
    throw new Error('Já existe processamento desses agentes trabalhistas em execução.');
  }

  const summary = [];
  try {
    const categoryId = await ensureCategory();

    for (const agent of AGENTS) {
      console.log(`\n=== ${agent.title} ===`);
      const agentId = await ensureAgent(agent, categoryId);
      const ingest = await ingestAgent(agentId, agent);
      summary.push({ title: agent.title, agentId, ...ingest });
    }

    console.log('\n===== RESUMO NOVOS AGENTES TRABALHISTAS =====');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await dbQuery('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    await pool.end();
  }
}

await main().catch((error) => {
  console.error('\n[FATAL] setup-trabalhista-new-agents-and-ingest falhou.');
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
