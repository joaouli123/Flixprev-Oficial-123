import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const ROOT = process.cwd();
const USER_ID = '07d16581-fca5-4709-b0d3-e09859dbb286';
const CATEGORY_NAME = 'Dir. Tributários';
const ATTACHMENTS_BASE_DIR = path.join(ROOT, 'public', 'agent-attachments', 'direito-tributario');

const aiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
const aiApiKey = process.env.GEMINI_API_KEY;
const embeddingModel = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';

if (!aiApiKey) {
  throw new Error('GEMINI_API_KEY não configurada.');
}

const openai = new OpenAI({
  apiKey: aiApiKey,
  baseURL: aiBaseURL,
});

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (error) => {
  if (isTransientDbError(error)) {
    console.warn(`[DB-POOL] erro transitório em cliente ocioso: ${error.message}`);
    return;
  }
  console.error(`[DB-POOL] erro inesperado: ${error?.stack || error?.message || error}`);
});

const AGENTS = [
  {
    title: 'DTrib',
    role: 'Direito Tributário',
    description:
      'Base central de Direito Tributário com apoio em compilados normativos e legislação estruturante.',
    instructions:
      'Especialista em Direito Tributário com foco em interpretação sistemática da legislação e aplicação prática.',
    urls: [
      'file:///G:/DIREITO/MBI-%20MASTER%20INCAPACIDADE/NORMAS-%20ASSISTENTES/ASSISTENTE%20TRIBUT%C3%81RIO/L5172COMPILADO.pdf',
    ],
  },
  {
    title: 'CTN Expert',
    role: 'Interpretação Tributária',
    description:
      'Explica conceitos de lançamento, tributos, obrigações acessórias, garantias e penalidades.',
    instructions:
      'Especialista em interpretação tributária com foco no CTN, Constituição e normas complementares. Responda com rigor técnico, citando base legal.',
    urls: [
      'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp104.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/decreto/d70235cons.htm',
      'https://www.normaslegais.com.br/legislacao/instrucao-normativa-rfb-1700-2017.htm',
      'https://www.normaslegais.com.br/legislacao/instrucao-normativa-rfb-2201-2024.htm',
      'https://portal.stf.jus.br/',
      'https://www.stj.jus.br/sites/portalp/Inicio',
      'https://www2.camara.leg.br/legin/fed/leicom/2025/leicomplementar-214-16-janeiro-2025-796905-publicacaooriginal-174141-pl.html',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp227.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
      'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/81268',
    ],
  },
  {
    title: 'REFIS-IA',
    role: 'Reforma Tributária Atual',
    description:
      'Monitora e interpreta mudanças da Reforma Tributária e impactos na transição para IBS/CBS/IS.',
    instructions:
      'Especialista em reforma tributária (LC 214/2025 e correlatas), com foco em transição de tributos e impactos setoriais.',
    urls: [
      'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp104.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/decreto/d70235cons.htm',
      'https://www.normaslegais.com.br/legislacao/instrucao-normativa-rfb-1700-2017.htm',
      'https://www.normaslegais.com.br/legislacao/instrucao-normativa-rfb-2201-2024.htm',
      'https://portal.stf.jus.br/',
      'https://www.stj.jus.br/sites/portalp/Inicio',
      'https://www2.camara.leg.br/legin/fed/leicom/2025/leicomplementar-214-16-janeiro-2025-796905-publicacaooriginal-174141-pl.html',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp227.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
      'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/81268',
    ],
  },
  {
    title: 'TAX-Rend',
    role: 'Simulador de Renda',
    description:
      'Simula cálculos, deduções, retenções e alíquotas de tributos sobre renda (PF/PJ).',
    instructions:
      'Especialista em tributação da renda (PF/PJ), deduções, retenções e alíquotas conforme legislação vigente e alterações recentes.',
    urls: [
      'https://www.planalto.gov.br/ccivil_03/leis/l7713.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/leis/l8981.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l9430.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/decreto/d9580.htm',
      'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/52928',
      'https://www.planalto.gov.br/ccivil_03/leis/l9249.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/leis/l9718.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12973.htm',
      'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/81268',
      'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm#:~:text=L15270&text=Altera%20a%20Lei%20n%C2%BA%209.250,rendas%3B%20e%20d%C3%A1%20outras%20provid%C3%AAncias.',
    ],
  },
  {
    title: 'FedTax',
    role: 'Tributos Federais RFB',
    description:
      'Guia de obrigações, prazos, DARF, retenções e impactos de reformas em tributos federais.',
    instructions:
      'Especialista em tributos federais administrados pela RFB (IRRF, IOF, CSLL, Cofins e correlatos), com foco em obrigações e prazos.',
    urls: [
      'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/decreto/d7212.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l4502.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/2002/l10637.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.833.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l9718.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l7689.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
      'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/117257',
      'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/82195',
      'https://siefreceitas.receita.economia.gov.br/codigos-de-receita-de-tributos-e-contribuicoes-darf-e-dje',
      'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action?facetsExistentes=&orgaosSelecionados=Codac&tiposAtosSelecionados=&ordemColuna=&ordemDirecao=&tipoAtoFacet=&siglaOrgaoFacet=&anoAtoFacet=&termoBusca=&numero_at',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp227.htm',
    ],
  },
];

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl).trim());

    if (parsed.protocol === 'file:') {
      return parsed.toString();
    }

    const keepHashHosts = new Set(['normasinternet2.receita.fazenda.gov.br']);
    if (!keepHashHosts.has(parsed.hostname)) {
      parsed.hash = '';
    }

    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    removeParams.forEach((p) => parsed.searchParams.delete(p));

    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupeUrls(urls) {
  const seen = new Set();
  const out = [];

  for (const url of urls) {
    const n = normalizeUrl(url);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
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

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToStructuredText(html) {
  const src = String(html || '');

  const structured = src
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<\/?li[^>]*>/gi, '\n- ')
    .replace(/<\/?h[1-6][^>]*>/gi, '\n')
    .replace(/<\/?thead[^>]*>/gi, '\n')
    .replace(/<\/?tbody[^>]*>/gi, '\n')
    .replace(/<\/?table[^>]*>/gi, '\n[TABELA]\n')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<th[^>]*>/gi, '')
    .replace(/<td[^>]*>/gi, '')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(structured)
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

function chunkText(text, size = 4000, overlap = 1000) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleanText) return [];

  const chunks = [];
  let start = 0;

  while (start < cleanText.length) {
    let end = start + size;

    if (end < cleanText.length) {
      const lastPeriod = cleanText.lastIndexOf('.', end);
      const lastSpace = cleanText.lastIndexOf(' ', end);

      if (lastPeriod > start + size * 0.8) end = lastPeriod + 1;
      else if (lastSpace > start + size * 0.5) end = lastSpace;
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    const nextStart = end - overlap;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
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

async function fetchWithRetry(url, tries = 3) {
  let lastError = null;

  for (let i = 1; i <= tries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (FlixPrev Tributario Ingestion/1.0)',
          Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, i * 800));
    }
  }

  throw lastError;
}

async function fetchSiefReceitasAsText() {
  const apiUrl = 'https://siefreceitas.receita.economia.gov.br/api/receitas';
  const response = await fetchWithRetry(apiUrl, 4);
  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const lines = [];
  lines.push('FONTE: SIEF Receita Federal - Códigos de Receita');
  lines.push(`TOTAL_REGISTROS: ${data.length}`);
  lines.push('CAMPOS: codigo | denominacao | inicio_vigencia | fim_vigencia | fundamentos');
  lines.push('');

  for (const item of data) {
    const codigo = item?.recCd ?? '';
    const nome = String(item?.recNm || '').replace(/\s+/g, ' ').trim();
    const inicio = item?.dtInicioVigencia || '';
    const fim = item?.dtFimVigencia || '';

    const fundamentos = Array.isArray(item?.fundamentos)
      ? item.fundamentos
          .map((f) => {
            const tipo = f?.tpAto?.descricao || '';
            const numero = f?.numero != null ? String(f.numero) : '';
            const dataAto = f?.data || '';
            const orgaos = Array.isArray(f?.orgaos)
              ? f.orgaos.map((o) => o?.nome).filter(Boolean).join(', ')
              : '';
            const texto = String(f?.texto || '').replace(/\s+/g, ' ').trim();

            const base = [tipo, numero ? `nº ${numero}` : '', dataAto].filter(Boolean).join(' ');
            const extras = [orgaos ? `órgão: ${orgaos}` : '', texto ? `texto: ${texto}` : '']
              .filter(Boolean)
              .join(' | ');

            return [base, extras].filter(Boolean).join(' | ');
          })
          .filter(Boolean)
      : [];

    const fundamentosTxt = fundamentos.length > 0 ? fundamentos.join(' || ') : 'sem fundamento informado';
    lines.push(`${codigo} | ${nome} | ${inicio} | ${fim} | ${fundamentosTxt}`);
  }

  return lines.join('\n');
}

async function extractTextFromUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (
      parsed.hostname === 'siefreceitas.receita.economia.gov.br' &&
      parsed.pathname.includes('codigos-de-receita-de-tributos-e-contribuicoes-darf-e-dje')
    ) {
      const siefText = await fetchSiefReceitasAsText();
      if (siefText.length >= 180) {
        return siefText;
      }
    }
  } catch {
  }

  if (String(url).startsWith('file://')) {
    const filePath = decodeURIComponent(new URL(url).pathname).replace(/^\/+([A-Za-z]:)/, '$1');
    const buf = await fs.readFile(filePath);
    const isPdf = filePath.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      const parsed = await pdfParse(buf);
      return String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
    }

    return String(buf.toString('utf8') || '').replace(/\s+/g, ' ').trim();
  }

  const response = await fetchWithRetry(url);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isPdf = contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const arrayBuffer = await response.arrayBuffer();
    const parsed = await pdfParse(Buffer.from(arrayBuffer));
    return String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  }

  const html = await response.text();
  const structured = htmlToStructuredText(html);

  if (structured.length >= 180) {
    return structured;
  }

  return stripHtml(html);
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
        console.warn(`[EMB-FAIL] falhou após ${tries} tentativas: ${error.message}`);
        return null;
      }
      const waitMs = attempt * 700;
      console.warn(`[EMB-RETRY] tentativa ${attempt}/${tries} em ${waitMs}ms: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  return null;
}

const TRANSIENT_DB_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '53300']);
const INGEST_LOCK_KEY = 90612031;

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
      if (!isTransientDbError(error) || attempt === tries) {
        throw error;
      }
      const waitMs = attempt * 800;
      console.warn(`[DB-RETRY] tentativa ${attempt}/${tries} em ${waitMs}ms: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
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
  const existing = await dbQuery(
    db,
    'SELECT id FROM categories WHERE lower(name) = lower($1) AND user_id IS NULL LIMIT 1',
    [categoryName]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0].id;
  }

  const created = await dbQuery(
    db,
    'INSERT INTO categories (id, name, user_id) VALUES ($1, $2, NULL) RETURNING id',
    [crypto.randomUUID(), categoryName]
  );

  return created.rows[0].id;
}

async function ensureAgent(db, categoryId, agentCfg) {
  const existing = await dbQuery(
    db,
    'SELECT id, title, instructions FROM agents WHERE lower(title) = lower($1) AND user_id IS NULL LIMIT 1',
    [agentCfg.title]
  );

  const strict =
    'REGRAS DE FIDELIDADE JURÍDICA:\n1) Responda SOMENTE com base nos documentos indexados deste agente.\n2) Não invente artigo, súmula, precedente, número de processo ou data.\n3) Se a informação não estiver no conteúdo indexado, responda: "Não encontrei essa informação nos documentos deste agente."\n4) Em temas de lei e legislação, prefira citar literalmente trechos encontrados.';

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
      [
        agentCfg.role,
        agentCfg.description,
        `${agentCfg.instructions}\n\n${strict}`,
        'Scale',
        [categoryId],
        id,
      ]
    );

    return id;
  }

  const inserted = await dbQuery(
    db,
    `INSERT INTO agents (
      id, user_id, title, role, description, instructions, icon,
      category_ids, shortcuts, attachments
    ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`,
    [
      crypto.randomUUID(),
      agentCfg.title,
      agentCfg.role,
      agentCfg.description,
      `${agentCfg.instructions}\n\n${strict}`,
      'Scale',
      [categoryId],
      ['Resumo', 'Base legal', 'Checklist', 'Prazos'],
      [],
    ]
  );

  return inserted.rows[0].id;
}

async function ingestAgentSources(db, agentId, agentTitle, rawUrls) {
  const urls = dedupeUrls(rawUrls);
  const folder = path.join(ATTACHMENTS_BASE_DIR, toSlug(agentTitle));
  await fs.mkdir(folder, { recursive: true });

  const attachmentPaths = [];
  const harvested = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const text = await extractTextFromUrl(url);
      if (!text || text.length < 180) {
        console.log(`[SKIP] ${agentTitle} ${i + 1}/${urls.length} conteúdo insuficiente: ${url}`);
        continue;
      }

      const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
      const fileName = `${String(i + 1).padStart(4, '0')}-${hash}.txt`;
      const fullFile = path.join(folder, fileName);
      const relPath = `/agent-attachments/direito-tributario/${toSlug(agentTitle)}/${fileName}`;

      const payload = `FONTE: ${url}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${text}`;
      await fs.writeFile(fullFile, payload, 'utf8');

      attachmentPaths.push(relPath);
      harvested.push({ url, text });

      console.log(`[OK] ${agentTitle} ${i + 1}/${urls.length} (${Math.round(text.length / 1000)}k chars)`);
    } catch (error) {
      console.log(`[ERRO] ${agentTitle} ${i + 1}/${urls.length}: ${url} -> ${error.message}`);
    }
  }

  await dbQuery(db, 'UPDATE agents SET attachments = $1 WHERE id = $2', [attachmentPaths, agentId]);

  await dbQuery(db, 'DELETE FROM documents WHERE agent_id = $1', [agentId]);

  let savedDocs = 0;
  let savedChunks = 0;

  for (const item of harvested) {
    const docTitle = item.url.length > 255 ? item.url.slice(0, 255) : item.url;
    const newDocId = crypto.randomUUID();
    const doc = await dbQuery(
      db,
      'INSERT INTO documents (id, agent_id, title) VALUES ($1, $2, $3) RETURNING id',
      [newDocId, agentId, docTitle]
    );

    const docId = doc.rows?.[0]?.id;
    if (!docId) {
      console.warn(`[SKIP] ${agentTitle} documento sem id retornado para fonte ${item.url}`);
      continue;
    }
    savedDocs += 1;

    const chunks = chunkText(item.text, 4000, 1000);
    console.log(`[DOC] ${agentTitle} doc ${savedDocs}/${harvested.length} com ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
      if (i === 0 || (i + 1) % 20 === 0 || i === chunks.length - 1) {
        console.log(`[EMB] ${agentTitle} doc ${savedDocs}/${harvested.length} chunk ${i + 1}/${chunks.length}`);
      }

      const emb = await generateEmbedding(chunks[i]);
      if (!emb) continue;

      const embStr = `[${emb.join(',')}]`;
      try {
        await dbQuery(
          db,
          `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
           VALUES ($1, $2, $3, $4::vector, $5)`,
          [agentId, docId, chunks[i], embStr, i]
        );
      } catch (error) {
        if (error?.code === '23503' && String(error?.constraint || '').includes('document_chunks_document_id_fkey')) {
          console.warn(`[DOC-RESTORE] ${agentTitle} docId ${docId} ausente; recriando e repetindo chunk ${i + 1}`);
          await dbQuery(
            db,
            'INSERT INTO documents (id, agent_id, title) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
            [docId, agentId, docTitle]
          );

          await dbQuery(
            db,
            `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
             VALUES ($1, $2, $3, $4::vector, $5)`,
            [agentId, docId, chunks[i], embStr, i]
          );
        } else {
          throw error;
        }
      }
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
    if (!hasLock) {
      throw new Error('Já existe outra ingestão tributária em execução. Aguarde finalizar e tente novamente.');
    }

    const categoryId = await ensureGlobalCategory(pool, CATEGORY_NAME);
    const summary = [];

    for (const agentCfg of AGENTS) {
      console.log(`\n=== Preparando agente: ${agentCfg.title} ===`);
      const agentId = await ensureAgent(pool, categoryId, agentCfg);
      const ingest = await ingestAgentSources(pool, agentId, agentCfg.title, agentCfg.urls);

      summary.push({
        title: agentCfg.title,
        agentId,
        ...ingest,
      });
    }

    console.log('\n===== RESUMO DIREITO TRIBUTÁRIO =====');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (hasLock) {
      await releaseIngestLock(pool);
    }
    await pool.end();
  }
}

await main().catch((error) => {
  console.error('\n[FATAL] setup-tributario-agents-and-ingest falhou.');
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
