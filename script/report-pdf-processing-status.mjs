import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const IN_FILE = path.join(process.cwd(), 'attached_assets', 'agent-list-extracted.json');
const OUT_JSON = path.join(process.cwd(), 'attached_assets', 'agent-list-processing-report.json');
const OUT_MD = path.join(process.cwd(), 'attached_assets', 'agent-list-processing-report.md');

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl).trim());
    if (parsed.protocol === 'file:') return parsed.toString();
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    removeParams.forEach((p) => parsed.searchParams.delete(p));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

const data = JSON.parse(await fs.readFile(IN_FILE, 'utf8'));

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const dbDocs = await pool.query(`
  SELECT a.title AS agent_title, d.title AS doc_title
  FROM documents d
  JOIN agents a ON a.id = d.agent_id
`);
await pool.end();

const normalizedDocUrls = new Map();
const truncatedDocTitles = new Map();
for (const row of dbDocs.rows) {
  const normalized = normalizeUrl(row.doc_title);
  if (!normalized) continue;
  if (!normalizedDocUrls.has(normalized)) normalizedDocUrls.set(normalized, new Set());
  normalizedDocUrls.get(normalized).add(row.agent_title);

  const truncatedKey = String(row.doc_title || '').slice(0, 255);
  if (truncatedKey) {
    if (!truncatedDocTitles.has(truncatedKey)) truncatedDocTitles.set(truncatedKey, new Set());
    truncatedDocTitles.get(truncatedKey).add(row.agent_title);
  }
}

const urls = [...new Set((data.urls || []).map(normalizeUrl).filter(Boolean))];

const processed = [];
const pendingWeb = [];
const pendingLocal = [];

for (const url of urls) {
  let owners = normalizedDocUrls.get(url);
  if ((!owners || owners.size === 0) && url.length > 255) {
    owners = truncatedDocTitles.get(url.slice(0, 255));
  }
  if (owners && owners.size > 0) {
    processed.push({ url, agents: [...owners] });
    continue;
  }

  if (url.startsWith('file://')) {
    pendingLocal.push(url);
  } else {
    pendingWeb.push(url);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  source: IN_FILE,
  totals: {
    pdfAgentsDetected: data.agentsCount || 0,
    pdfUniqueUrls: urls.length,
    processedUrls: processed.length,
    pendingWebUrls: pendingWeb.length,
    pendingLocalFileUrls: pendingLocal.length,
  },
  processed,
  pendingWeb,
  pendingLocal,
};

await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

const lines = [];
lines.push('# Relatório de Processamento - PDF Lista de Agentes');
lines.push('');
lines.push(`- Gerado em: ${report.generatedAt}`);
lines.push(`- Agentes detectados no PDF: ${report.totals.pdfAgentsDetected}`);
lines.push(`- URLs únicas no PDF: ${report.totals.pdfUniqueUrls}`);
lines.push(`- URLs já processadas no banco: ${report.totals.processedUrls}`);
lines.push(`- URLs web pendentes: ${report.totals.pendingWebUrls}`);
lines.push(`- URLs locais pendentes (file://): ${report.totals.pendingLocalFileUrls}`);
lines.push('');
lines.push('## URLs web pendentes');
for (const url of pendingWeb) lines.push(`- ${url}`);
lines.push('');
lines.push('## URLs locais pendentes');
for (const url of pendingLocal) lines.push(`- ${url}`);

await fs.writeFile(OUT_MD, lines.join('\n'), 'utf8');

console.log(JSON.stringify({ outJson: OUT_JSON, outMd: OUT_MD, totals: report.totals }, null, 2));
