import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const ROOT = process.cwd();
const USER_ID = '07d16581-fca5-4709-b0d3-e09859dbb286';

const TARGET_AGENTS = [
  'Agente DirTrab',
  'Agente AtosTr',
  'Agente NR.sPro',
  'Agente AcordCore',
  'Agente JurisPrud',
  'Agente SúmulasTr',
  'Agente JurisPrud 2',
  'Agente PrecedentX',
  'Agente SúmulasCore'
];

const RETRIEVAL_QUERIES = {
  'Agente DirTrab': ['CLT', 'Constituição Federal trabalho', 'FGTS', 'Lei 13.467'],
  'Agente AtosTr': ['Ato Conjunto TST', 'Instrução Normativa TST', 'Gabinete da Presidência TST'],
  'Agente NR.sPro': ['NR-12', 'NR-35', 'NR-17', 'segurança e saúde no trabalho']
};

const aiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
const aiApiKey = process.env.GEMINI_API_KEY;
const embeddingModel = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const openai = aiApiKey
  ? new OpenAI({ apiKey: aiApiKey, baseURL: aiBaseURL })
  : null;

function round(n, p = 3) {
  const m = 10 ** p;
  return Math.round(n * m) / m;
}

async function ensureFileExists(relPath) {
  const absolute = path.join(ROOT, 'public', relPath.replace(/^\//, ''));
  try {
    await fs.access(absolute);
    return { exists: true, absolute };
  } catch {
    return { exists: false, absolute };
  }
}

async function inspectAttachmentFile(relPath) {
  const { exists, absolute } = await ensureFileExists(relPath);
  if (!exists) {
    return { exists: false, sourceUrl: null, charLength: 0, lowText: true };
  }

  const body = await fs.readFile(absolute, 'utf8');
  const sourceMatch = body.match(/^FONTE:\s*(https?:\/\/\S+)/m);
  const sourceUrl = sourceMatch?.[1] || null;
  const charLength = body.length;

  return {
    exists: true,
    sourceUrl,
    charLength,
    lowText: charLength < 1200,
  };
}

async function runRetrievalCheck(agentId, queryText) {
  if (!openai) {
    return { query: queryText, ok: false, reason: 'SEM_API_KEY' };
  }

  try {
    const emb = await openai.embeddings.create({
      model: embeddingModel,
      input: queryText,
    });

    const v = emb.data?.[0]?.embedding;
    if (!v || !Array.isArray(v) || v.length === 0) {
      return { query: queryText, ok: false, reason: 'EMBEDDING_VAZIO' };
    }

    const vectorString = `[${v.join(',')}]`;

    const result = await pool.query(
      `SELECT document_id, chunk_index, 1 - (embedding <=> $2::vector) AS similarity,
              left(content, 180) AS preview
       FROM document_chunks
       WHERE agent_id = $1
       ORDER BY embedding <=> $2::vector
       LIMIT 3`,
      [agentId, vectorString]
    );

    const top = result.rows?.[0];
    const topSim = Number(top?.similarity || 0);
    return {
      query: queryText,
      ok: topSim >= 0.35,
      topSimilarity: round(topSim),
      topPreview: top?.preview || null,
      hits: result.rows.length,
    };
  } catch (error) {
    return {
      query: queryText,
      ok: false,
      reason: error.message,
    };
  }
}

async function validateAgent(agent) {
  const report = {
    id: agent.id,
    title: agent.title,
    hasStrictInstructions: /REGRAS DE FIDELIDADE JURÍDICA/i.test(String(agent.instructions || '')),
    counts: {
      attachments: Array.isArray(agent.attachments) ? agent.attachments.length : 0,
      documents: 0,
      chunks: 0,
      docsWithoutChunks: 0,
      duplicateDocumentTitles: 0,
      orphanChunks: 0,
    },
    chunkStats: {
      min: 0,
      max: 0,
      avg: 0,
    },
    attachmentsAudit: {
      filesMissing: 0,
      filesLowText: 0,
      filesWithoutSourceMarker: 0,
    },
    retrievalChecks: [],
    status: 'ok',
    notes: [],
  };

  const docs = await pool.query(
    'SELECT id, title FROM documents WHERE agent_id = $1',
    [agent.id]
  );
  report.counts.documents = docs.rowCount;

  const chunks = await pool.query(
    'SELECT id, document_id, length(content) AS len FROM document_chunks WHERE agent_id = $1',
    [agent.id]
  );
  report.counts.chunks = chunks.rowCount;

  const orphan = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM document_chunks dc
     LEFT JOIN documents d ON d.id = dc.document_id
     WHERE dc.agent_id = $1 AND d.id IS NULL`,
    [agent.id]
  );
  report.counts.orphanChunks = orphan.rows[0].c;

  const dupTitles = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM (
       SELECT title
       FROM documents
       WHERE agent_id = $1
       GROUP BY title
       HAVING COUNT(*) > 1
     ) t`,
    [agent.id]
  );
  report.counts.duplicateDocumentTitles = dupTitles.rows[0].c;

  const docsWithoutChunks = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM documents d
     WHERE d.agent_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM document_chunks dc WHERE dc.document_id = d.id
       )`,
    [agent.id]
  );
  report.counts.docsWithoutChunks = docsWithoutChunks.rows[0].c;

  if (chunks.rowCount > 0) {
    const lengths = chunks.rows.map((r) => Number(r.len || 0)).filter((n) => n > 0);
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    report.chunkStats = {
      min,
      max,
      avg: round(avg, 1),
    };
  }

  if (Array.isArray(agent.attachments) && agent.attachments.length > 0) {
    for (const relPath of agent.attachments) {
      const audit = await inspectAttachmentFile(relPath);
      if (!audit.exists) report.attachmentsAudit.filesMissing += 1;
      if (audit.lowText) report.attachmentsAudit.filesLowText += 1;
      if (!audit.sourceUrl) report.attachmentsAudit.filesWithoutSourceMarker += 1;
    }
  }

  const checks = RETRIEVAL_QUERIES[agent.title] || [];
  for (const q of checks) {
    const result = await runRetrievalCheck(agent.id, q);
    report.retrievalChecks.push(result);
  }

  if (report.counts.attachments > 0 && report.counts.documents === 0) {
    report.status = 'critical';
    report.notes.push('Tem attachments, mas nenhum documento indexado.');
  }

  if (report.counts.docsWithoutChunks > 0) {
    report.status = report.status === 'critical' ? 'critical' : 'warning';
    report.notes.push(`${report.counts.docsWithoutChunks} documento(s) sem chunks.`);
  }

  if (report.attachmentsAudit.filesMissing > 0) {
    report.status = 'critical';
    report.notes.push(`${report.attachmentsAudit.filesMissing} attachment(s) ausentes em disco.`);
  }

  if (report.counts.chunks === 0 && report.counts.documents > 0) {
    report.status = 'critical';
    report.notes.push('Há documentos sem qualquer chunk vetorizado.');
  }

  if (!report.hasStrictInstructions && report.counts.documents > 0) {
    report.status = report.status === 'critical' ? 'critical' : 'warning';
    report.notes.push('Instrução estrita de fidelidade não detectada.');
  }

  const failedRetrieval = report.retrievalChecks.filter((r) => r.ok === false).length;
  if (failedRetrieval > 0 && report.retrievalChecks.length > 0) {
    report.status = report.status === 'critical' ? 'critical' : 'warning';
    report.notes.push(`${failedRetrieval}/${report.retrievalChecks.length} teste(s) de recuperação com baixa similaridade ou erro.`);
  }

  return report;
}

async function main() {
  const agentsResult = await pool.query(
    'SELECT id, title, attachments, instructions FROM agents WHERE user_id = $1 AND title = ANY($2) ORDER BY title ASC',
    [USER_ID, TARGET_AGENTS]
  );

  const reports = [];
  for (const agent of agentsResult.rows) {
    const a = {
      ...agent,
      attachments: Array.isArray(agent.attachments) ? agent.attachments : [],
    };

    const rep = await validateAgent(a);
    reports.push(rep);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totalAgentsChecked: reports.length,
    ok: reports.filter((r) => r.status === 'ok').length,
    warning: reports.filter((r) => r.status === 'warning').length,
    critical: reports.filter((r) => r.status === 'critical').length,
  };

  const out = { summary, reports };
  const outPath = path.join(ROOT, 'attached_assets', `legal-ingestion-audit-${Date.now()}.json`);
  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log(JSON.stringify(out, null, 2));
  console.log(`\nAUDIT_FILE=${outPath}`);

  await pool.end();
}

await main();
