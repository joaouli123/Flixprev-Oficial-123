import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const agentId = process.argv[2];
const pdfPath = process.argv[3];
const apiBaseUrl = String(process.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

if (!agentId || !pdfPath) {
  console.error('Uso: node script/ingest-agent-pdf.mjs <agentId> <pdfPath>');
  process.exit(1);
}

if (!apiBaseUrl) {
  console.error('VITE_API_BASE_URL não configurada no ambiente.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function uploadPdf() {
  const absolutePath = path.resolve(pdfPath);
  const fileBuffer = await fs.readFile(absolutePath);
  const fileName = path.basename(absolutePath);

  const formData = new FormData();
  formData.append('agentId', agentId);
  formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), fileName);

  const response = await fetch(`${apiBaseUrl}/api/agents/upload`, {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Falha no upload (${response.status})`);
  }

  return payload;
}

async function reprocessAgent() {
  const response = await fetch(`${apiBaseUrl}/api/admin/reprocess-agent-attachments/${agentId}`, {
    method: 'POST',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Falha no reprocessamento (${response.status})`);
  }

  return payload;
}

async function verify() {
  await client.connect();

  try {
    const agentResult = await client.query(
      `select id::text, title, attachments from agents where id = $1 limit 1`,
      [agentId]
    );

    const chunksResult = await client.query(
      `select count(*)::int as total from document_chunks where agent_id = $1`,
      [agentId]
    );

    return {
      agent: agentResult.rows[0] || null,
      chunks: chunksResult.rows[0]?.total || 0,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const upload = await uploadPdf();
  const reprocess = await reprocessAgent();
  const verification = await verify();

  console.log(JSON.stringify({ upload, reprocess, verification }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});