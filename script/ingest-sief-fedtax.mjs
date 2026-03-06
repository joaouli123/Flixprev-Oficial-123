import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const SOURCE_URL = 'https://siefreceitas.receita.economia.gov.br/codigos-de-receita-de-tributos-e-contribuicoes-darf-e-dje';
const API_URL = 'https://siefreceitas.receita.economia.gov.br/api/receitas';
const ATTACHMENTS_DIR = path.join(process.cwd(), 'public', 'agent-attachments', 'direito-tributario', 'fedtax');

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

async function fetchJsonWithRetry(url, tries = 4) {
  let lastError = null;

  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (FlixPrev SIEF Ingestion/1.0)',
          Accept: 'application/json,text/plain,*/*',
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, i * 600));
    }
  }

  throw lastError;
}

function formatSiefRecords(records) {
  const lines = [];
  lines.push('FONTE: SIEF Receita Federal - Códigos de Receita');
  lines.push(`TOTAL_REGISTROS: ${records.length}`);
  lines.push('CAMPOS: codigo | denominacao | inicio_vigencia | fim_vigencia | fundamentos');
  lines.push('');

  for (const item of records) {
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
            const extras = [orgaos ? `órgão: ${orgaos}` : '', texto ? `texto: ${texto}` : ''].filter(Boolean).join(' | ');
            return [base, extras].filter(Boolean).join(' | ');
          })
          .filter(Boolean)
      : [];

    lines.push(`${codigo} | ${nome} | ${inicio} | ${fim} | ${fundamentos.join(' || ') || 'sem fundamento informado'}`);
  }

  return lines.join('\n');
}

async function generateEmbedding(inputText) {
  const tries = 3;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await Promise.race([
        openai.embeddings.create({
          model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
          input: inputText,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('embedding-timeout')), 45000)),
      ]);

      return response.data?.[0]?.embedding || null;
    } catch (error) {
      if (attempt === tries) return null;
      await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }
  return null;
}

async function main() {
  const agentRes = await pool.query(
    "SELECT id, attachments FROM agents WHERE lower(title)=lower('FedTax') AND user_id IS NULL LIMIT 1"
  );

  if (agentRes.rowCount === 0) {
    throw new Error('Agente FedTax global não encontrado.');
  }

  const agentId = agentRes.rows[0].id;

  const records = await fetchJsonWithRetry(API_URL);
  const text = formatSiefRecords(records);
  const chunks = chunkText(text, 4000, 1000);

  await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
  const fileName = `sief-receitas-${Date.now()}.txt`;
  const relPath = `/agent-attachments/direito-tributario/fedtax/${fileName}`;
  await fs.writeFile(path.join(ATTACHMENTS_DIR, fileName), `FONTE: ${SOURCE_URL}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${text}`, 'utf8');

  const existingAttachments = Array.isArray(agentRes.rows[0].attachments) ? agentRes.rows[0].attachments : [];
  const nextAttachments = [...existingAttachments.filter((a) => !String(a).includes('/direito-tributario/fedtax/sief-receitas-')), relPath];
  await pool.query('UPDATE agents SET attachments = $1 WHERE id = $2', [nextAttachments, agentId]);

  await pool.query('DELETE FROM document_chunks WHERE agent_id = $1 AND document_id IN (SELECT id FROM documents WHERE agent_id = $1 AND title = $2)', [agentId, SOURCE_URL]);
  await pool.query('DELETE FROM documents WHERE agent_id = $1 AND title = $2', [agentId, SOURCE_URL]);

  const docId = crypto.randomUUID();
  await pool.query('INSERT INTO documents (id, agent_id, title) VALUES ($1, $2, $3)', [docId, agentId, SOURCE_URL]);

  let inserted = 0;
  for (let i = 0; i < chunks.length; i++) {
    const emb = await generateEmbedding(chunks[i]);
    if (!emb) continue;

    await pool.query(
      `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [agentId, docId, chunks[i], `[${emb.join(',')}]`, i]
    );

    inserted += 1;
    if (i === 0 || (i + 1) % 10 === 0 || i === chunks.length - 1) {
      console.log(`[SIEF] chunk ${i + 1}/${chunks.length} (embeddings salvos: ${inserted})`);
    }
  }

  console.log(JSON.stringify({
    agentId,
    registros: records.length,
    chars: text.length,
    chunksTotal: chunks.length,
    chunksInseridos: inserted,
    docId,
    source: SOURCE_URL,
  }, null, 2));
}

await main().finally(async () => {
  await pool.end();
});
