import fs from 'fs/promises';
import crypto from 'crypto';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import pkg from 'pg';

dotenv.config();

const CATEGORY_NAME = 'Previdenciário';
const LOCK_KEY = 90612073;

const TRANSIENT_DB_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '53300']);

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
    title: 'CQS',
    role: 'Agente Carência & Qualidade de Segurado',
    description: 'Especialista em carência, qualidade de segurado e regras de reconhecimento no RGPS.',
    instructions:
      'Responda com base nas normas indexadas sobre carência e qualidade de segurado, destacando requisitos legais, manutenção e perda da qualidade.',
    urls: [
      'https://www.in.gov.br/web/dou/-/portaria-conjunta-dirben/pfe/inss-n-17-de-14-de-agosto-de-2025-650801735',
      'https://portalin.inss.gov.br/in',
      'https://portalin.inss.gov.br/portaria991',
      'http://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm',
      'https://www.planalto.gov.br/ccivil_03/decreto/d3048.htm',
    ],
  },
  {
    title: 'AMB',
    role: 'Agente Manutenção de Benefícios',
    description: 'Especialista em manutenção administrativa de benefícios e serviços no INSS.',
    instructions:
      'Aplique as normas procedimentais de manutenção de benefícios (procuração, tutela, curatela, descontos, suspensão, cessação e reativação).',
    urls: [
      'https://www.in.gov.br/web/dou/-/portaria-conjunta-dirben/dti/inss-n-13-de-23-de-maio-de-2025-631933663',
      'https://portalin.inss.gov.br/in',
      'https://portalin.inss.gov.br/portaria992',
    ],
  },
  {
    title: 'ASoc',
    role: 'Agente Assistência Social',
    description: 'Especialista em serviço social previdenciário e normas assistenciais aplicáveis.',
    instructions:
      'Fundamente respostas em normas de assistência social, direitos fundamentais e procedimentos de serviço social no INSS.',
    urls: [
      'https://portalin.inss.gov.br/portaria1208',
      'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12435.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14176.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/decreto/d11016.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/decreto/d8805.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l13982.htm',
      'https://portalin.inss.gov.br/in',
      'https://www.in.gov.br/web/dou/-/portaria-dirben/inss-n-1.333-de-9-de-fevereiro-de-2026-687364747',
    ],
  },
  {
    title: 'BPC',
    role: 'Agente BPC Idoso/PCD',
    description: 'Especialista no Benefício de Prestação Continuada para idoso e pessoa com deficiência.',
    instructions:
      'Oriente com base normativa completa do BPC, critérios de elegibilidade, cadastro e fluxo procedimental.',
    urls: [
      'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l8742.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6214.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12534.htm?utm_source=chatgpt.com',
      'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l13982.htm',
      'https://www.in.gov.br/en/web/dou/-/portaria-conjunta-mds/inss-n-34-de-9-de-outubro-de-2025-661903103',
      'https://aplicacoes.mds.gov.br/snas/regulacao/visualizar.php?codigo=5255',
      'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/decreto/d11016.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/decreto/d8805.htm',
      'https://portalin.inss.gov.br/in',
      'https://www.in.gov.br/en/web/dou/-/portaria-dirben/inss-n-1.249-de-26-de-dezembro-de-2024-604469231',
      'https://www.in.gov.br/en/web/dou/-/portaria-dirben/inss-n-1.260-de-27-de-janeiro-de-2025-609661711',
      'https://www.legisweb.com.br/legislacao/?id=489712',
      'https://www.in.gov.br/web/dou/-/portaria-conjunta-mds/inss-n-36-de-10-de-fevereiro-de-2026-686545425',
    ],
  },
  {
    title: 'CRPS',
    role: 'Conselho de Recursos da Previdência Social',
    description: 'Especialista em processo recursal administrativo previdenciário perante o CRPS.',
    instructions:
      'Aplique normas de recurso administrativo previdenciário, regimento do CRPS e processo administrativo no INSS.',
    urls: [
      'https://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm?utm_source=chatgpt.com',
      'https://www.gov.br/previdencia/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/conselho-de-recursos-da-previdencia-social/regimento-interno-instrucao-normativa-portarias/portaria-mps-no-125-de-26-de-janeiro-de-2026-regimento-interno-do-crps-compilada-ate-04-02-2026.pdf',
      'https://www.gov.br/inss/pt-br/direitos-e-deveres/recurso/recurso-administrativo-de-beneficio-previdenciario',
      'https://www.gov.br/previdencia/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/conselho-de-recursos-da-previdencia-social/regimento-interno-instrucao-normativa-portarias',
      'https://portalin.inss.gov.br/in',
      'https://portalin.inss.gov.br/portaria993',
    ],
  },
  {
    title: 'ReVB',
    role: 'Revisão de Benefícios',
    description: 'Especialista em revisão, acúmulo, recurso e retificação de benefícios previdenciários.',
    instructions:
      'Oriente revisão de benefícios com base nas normas de cadastro, concessão, processo administrativo, revisão e recurso.',
    urls: [
      'http://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
      'https://www.planalto.gov.br/ccivil_03/decreto/d3048.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/decreto/d10410.htm',
      'https://www.in.gov.br/web/dou/-/portaria-dirben/inss-n-1.329-de-21-de-janeiro-de-2026-682790501',
      'https://portalin.inss.gov.br/in',
      'https://portalin.inss.gov.br/portaria990',
      'https://portalin.inss.gov.br/portaria991',
      'https://portalin.inss.gov.br/portaria993',
      'https://portalin.inss.gov.br/portaria994',
      'https://portalin.inss.gov.br/portaria997',
      'https://portalin.inss.gov.br/portaria996',
      'file:///G:/DIREITO/MBI-%20MASTER%20INCAPACIDADE/NORMAS-%20ASSISTENTES/ASSISTENTE%20FLIX%20PREV/Revis%C3%A3o%20Artigo%2029-%20ofcirc6DIRBEN-INSS.pdf',
    ],
  },
  {
    title: 'RPPS',
    role: 'Agente Regime Próprio de Previdência Social',
    description: 'Especialista em RPPS, compensação previdenciária e arcabouço legal correlato.',
    instructions:
      'Fundamente em Constituição, leis, decretos, portarias e atos normativos de RPPS e compensação previdenciária.',
    urls: [
      'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
      'http://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
      'https://www.planalto.gov.br/ccivil_03/decreto/d3048.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l9717.htm',
      'https://portalin.inss.gov.br/portaria998',
      'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp226.htm',
      'file:///C:/Users/Admin/Desktop/DOC_PARTICIPANTE_EVT_6237_1571141126767_KComissaoPermanenteCDH20191015EXT115_parte11782_RESULTADO_1571141126767.pdf',
      'https://portal.stf.jus.br/constituicao-supremo/artigo.asp?abrirArtigo=40&abrirBase=CF&utm_source=chatgpt.com',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/NotaTcnicaSEIn1852022MTP.pdf?utm_source=chatgpt.com',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/leis-1/copy4_of_27CONSOLIDAOLEGISLAORPPSatualizadaatde29dedezembrode2025.pdf',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/portarias/portarias_todas/12PortariaMTPn1.467de02jun2022Atualizadaat29dez2025.pdf',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/Decreton10.620de05fev2021.pdf',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/portarias/arquivos/2020/decreto-no-10-418_de_7_-de_-julho_-de_-2020_.pdf',
      'https://www.gov.br/previdencia/pt-br/outros/imagens/2016/06/Decreton3.788de11abr2001-1.pdf',
      'https://www.gov.br/previdencia/pt-br/outros/imagens/2016/06/Decreton3.112de06jul1999atualizadoate16jul2009-1.pdf',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/emenda-constitucional-rpps',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/orientacao-normativa-rpps',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/leis',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/medida-provisoria',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/portarias_secao',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/recomedacao/recomendacoes',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/resolucoes',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/legislacao-dos-rpps/oficios-circulares-conjuntos-cvm-sprev',
      'https://www.gov.br/previdencia/pt-br/assuntos/rpps/comunicados/comunicados',
      'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/l13954.htm',
      'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/decreto/D10418.htm',
    ],
  },
  {
    title: 'ACPIN',
    role: 'Ações Civis Públicas no Processo Administrativo Previdenciário',
    description: 'Especialista em efeitos de ações civis públicas no processo administrativo previdenciário.',
    instructions:
      'Responda com foco na aplicação administrativa de ações civis públicas e integração com normas DIRBEN/PFE.',
    urls: [
      'https://portalin.inss.gov.br/portaria94',
      'https://www.in.gov.br/web/dou/-/portaria-conjunta-dirben/pfe/inss-n-17-de-14-de-agosto-de-2025-650801735',
    ],
  },
  {
    title: 'RTNU',
    role: 'Agente TNU - Turma Nacional de Uniformização',
    description: 'Especialista em rotinas e materiais de apoio ligados à TNU e cálculos correlatos.',
    instructions:
      'Use os materiais indexados para orientar temas de uniformização nacional e apoio técnico em cálculos.',
    urls: [
      'https://www.cjf.jus.br/phpdoc/virtus/',
      'https://sicom.cjf.jus.br/arquivos/pdf/manual_de_calculos_2025_vf.pdf',
      'https://www.cjf.jus.br/publico/rpvs_precatorios/cartilha-precatorios-2024.pdf',
    ],
  },
  {
    title: 'SúmFed',
    role: 'Súmulas Federais (TRFs e CJF)',
    description: 'Especialista em súmulas federais do CJF e TRFs.',
    instructions:
      'Consolide entendimento sumular federal por tribunal, distinguindo origem e aplicabilidade conforme as fontes indexadas.',
    urls: [
      'https://www.trt2.jus.br/geral/tribunal2/Trib_Sup/STJ/SUM_CJF.html',
      'https://www.trf1.jus.br/sjba/conteudo/files/SumulasTurec0110.pdf',
      'https://www.trf2.jus.br/trf2/consultas-e-servicos/sumulas-do-trf2',
      'https://www.trf3.jus.br/diretoria-geral/biblioteca/setor-de-apoio-a-jurisprudencia/sumulas-do-trf3',
      'https://www.trf4.jus.br/trf4/controlador.php?acao=sumulas_trf4&seq=194%7C967',
      'https://www.trf5.jus.br/index.php/institucional/181-legislacao/legislacao-trf5/sumulas/281-sumulas-artigo',
    ],
  },
];

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return null;
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
  for (const u of urls) {
    const n = normalizeUrl(u);
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
          'User-Agent': 'Mozilla/5.0 (FlixPrev Previdenciario New Agents/1.0)',
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
  const strict = [
    'REGRAS DE FIDELIDADE:',
    '1) Use somente conteúdo indexado.',
    '2) Não invente base legal.',
    '3) Se não houver base indexada para a pergunta, informe com transparência.',
  ].join('\n');

  const existing = await dbQuery('SELECT id FROM agents WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1', [agent.title]);
  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await dbQuery(
      `UPDATE agents
       SET user_id=NULL,
           role=$1,
           description=$2,
           instructions=$3,
           category_ids=$4,
           icon=COALESCE(icon,$5)
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
      ['Resumo', 'Base legal', 'Checklist', 'Jurisprudência'],
      [],
    ]
  );

  return created.rows[0].id;
}

function vectorText(raw) {
  if (Array.isArray(raw)) return `[${raw.join(',')}]`;
  return String(raw || '');
}

async function tryReuseFromDb(url) {
  const query = await dbQuery(
    `SELECT d.id AS document_id, dc.content, dc.embedding::text AS embedding, dc.chunk_index
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
      embedding: vectorText(row.embedding),
    }))
    .filter((row) => row.content && row.embedding && row.embedding.startsWith('['));

  if (chunks.length === 0) return null;
  return { url, chunks, from: 'db-reuse' };
}

async function tryReadLocalFile(fileUrl) {
  try {
    const parsed = new URL(fileUrl);
    let filePath = decodeURIComponent(parsed.pathname || '');
    if (/^\/[a-zA-Z]:\//.test(filePath)) filePath = filePath.slice(1);
    filePath = filePath.replace(/\//g, '\\');

    const buffer = await fs.readFile(filePath);
    const isPdf = filePath.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const parsedPdf = await pdfParse(buffer);
      const text = String(parsedPdf.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
      if (text.length > 120) return text;
    }

    const text = buffer.toString('utf-8');
    const cleaned = htmlToText(text);
    if (cleaned.length > 80) return cleaned;

    return [
      `FONTE_LOCAL: ${fileUrl}`,
      'OBS: arquivo local foi lido, mas o conteúdo textual extraído foi reduzido.',
    ].join('\n');
  } catch (error) {
    return [
      `FONTE_LOCAL: ${fileUrl}`,
      'OBS: arquivo local não acessível neste ambiente de execução.',
      `DETALHE: ${error?.message || 'erro de leitura local'}`,
    ].join('\n');
  }
}

async function buildSourcePayload(url) {
  const reused = await tryReuseFromDb(url);
  if (reused) return reused;

  let text = '';
  let contentType = '';

  if (url.startsWith('file://')) {
    text = await tryReadLocalFile(url);
  } else {
    const response = await fetchWithRetry(url, 3);
    contentType = String(response.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      const parsed = await pdfParse(Buffer.from(await response.arrayBuffer()));
      text = String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
    } else {
      text = htmlToText(await response.text());
    }
  }

  if (!text || text.length < 80) {
    text = [
      `FONTE: ${url}`,
      `CONTENT_TYPE: ${contentType || 'desconhecido'}`,
      'OBS: conteúdo textual direto reduzido; link preservado para consulta oficial.',
    ].join('\n');
  }

  const rawChunks = chunkText(text, 4000, 1000);
  const chunks = [];

  for (let i = 0; i < rawChunks.length; i++) {
    const vec = await embed(rawChunks[i]);
    if (!vec) continue;
    chunks.push({ chunk_index: i, content: rawChunks[i], embedding: `[${vec.join(',')}]` });
  }

  return { url, chunks, from: 'fresh-fetch' };
}

async function main() {
  const lock = await dbQuery('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
  if (!lock.rows?.[0]?.locked) throw new Error('Já existe ingestão dos novos agentes previdenciários em execução.');

  try {
    const categoryId = await ensureCategory();

    const allUrls = dedupe(AGENTS.flatMap((a) => a.urls));
    const payloadMap = new Map();

    for (let i = 0; i < allUrls.length; i++) {
      const url = allUrls[i];
      try {
        const payload = await buildSourcePayload(url);
        payloadMap.set(url, payload);
        console.log(`[OK] fonte ${i + 1}/${allUrls.length}: ${url} (${payload.chunks.length} chunks, ${payload.from})`);
      } catch (error) {
        console.log(`[ERRO] fonte ${i + 1}/${allUrls.length}: ${url} -> ${error.message}`);
      }
    }

    const summary = [];

    for (const spec of AGENTS) {
      const agentId = await ensureAgent(spec, categoryId);
      const agentUrls = dedupe(spec.urls);

      await dbQuery('UPDATE agents SET attachments=$1 WHERE id=$2', [agentUrls, agentId]);
      await dbQuery('DELETE FROM documents WHERE agent_id=$1', [agentId]);

      let docs = 0;
      let chunks = 0;

      for (const url of agentUrls) {
        const payload = payloadMap.get(url);
        if (!payload || !payload.chunks?.length) continue;

        const docId = crypto.randomUUID();
        const title = url.length > 255 ? url.slice(0, 255) : url;
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

      summary.push({ title: spec.title, agentId, links: agentUrls.length, docs, chunks });
      console.log(`[AGENTE] ${spec.title}: ${docs} docs, ${chunks} chunks`);
    }

    console.log('\n===== RESUMO PREVIDENCIÁRIO NOVOS AGENTES =====');
    console.log(
      JSON.stringify(
        {
          category: CATEGORY_NAME,
          sourcesDistinct: allUrls.length,
          sourcesPrepared: payloadMap.size,
          agents: summary,
        },
        null,
        2
      )
    );
  } finally {
    await dbQuery('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    await pool.end();
  }
}

await main().catch((error) => {
  console.error('\n[FATAL] setup-previdenciario-new-agents-and-ingest falhou.');
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
