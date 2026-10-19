// Add one verified official URL to an agent without altering existing sources.
// Dry-run unless --commit is supplied. Requires service-role credentials in env.
import { fetchLinkKnowledgeSource } from './lib/link-content-utils.mjs';

const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const agentId = process.argv[2];
const sourceUrl = process.argv[3];
const commit = process.argv.includes('--commit');
if (!baseUrl || !key || !agentId || !sourceUrl) {
  throw new Error('Usage: node add-authoritative-agent-source.mjs <agent-id> <url> [--commit]');
}
const parsedUrl = new URL(sourceUrl);
if (parsedUrl.protocol !== 'https:' || !['planalto.gov.br', 'www.planalto.gov.br'].includes(parsedUrl.hostname)) {
  throw new Error('Only HTTPS Planalto sources are accepted');
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
async function rest(table, params, options = {}) {
  const { headers: extraHeaders = {}, ...requestOptions } = options;
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${new URLSearchParams(params)}`, {
    ...requestOptions, headers: { ...headers, ...extraHeaders },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${table} HTTP ${response.status}: ${raw.slice(0, 300)}`);
  return raw ? JSON.parse(raw) : null;
}
function chunkText(value, size = 4000, overlap = 1000) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let start = 0; start < clean.length;) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const period = clean.lastIndexOf('.', end);
      const space = clean.lastIndexOf(' ', end);
      if (period > start + size * 0.8) end = period + 1;
      else if (space > start + size * 0.5) end = space;
    }
    chunks.push(clean.slice(start, end).trim());
    start = end - overlap > start ? end - overlap : end;
  }
  return chunks.filter(Boolean);
}

const agent = await rest('agents', { select: 'id,title', id: `eq.${agentId}`, limit: '1' });
if (agent.length !== 1) throw new Error('Agent not found');
const existing = await rest('documents', { select: 'id,title', agent_id: `eq.${agentId}`, title: `eq.${sourceUrl}`, limit: '10' });
if (existing.length > 0) {
  console.log(JSON.stringify({ agent: agent[0].title, sourceUrl, existingDocumentId: existing[0].id, skipped: 'already indexed' }));
  process.exit(0);
}
const source = await fetchLinkKnowledgeSource(sourceUrl, { signal: AbortSignal.timeout(30000) });
if (source.finalUrl && !['planalto.gov.br', 'www.planalto.gov.br'].includes(new URL(source.finalUrl).hostname)) {
  throw new Error('Unexpected source redirect');
}
const content = source.savedText || source.text || '';
const chunks = chunkText(content);
if (content.length < 1000 || content.includes('�') || chunks.length < 2) throw new Error('Official source failed content validation');
const result = { agent: agent[0].title, sourceUrl, contentLength: content.length, chunks: chunks.length, committed: false };
if (commit) {
  const inserted = await rest('documents', { select: 'id' }, {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ agent_id: agentId, title: sourceUrl }),
  });
  const documentId = inserted[0]?.id;
  if (!documentId) throw new Error('New document ID missing');
  result.documentId = documentId;
  try {
    for (let start = 0; start < chunks.length; start += 20) {
      await rest('document_chunks', {}, {
        method: 'POST', body: JSON.stringify(chunks.slice(start, start + 20).map((text, offset) => ({
          agent_id: agentId, document_id: documentId, content: text, chunk_index: start + offset,
        }))),
      });
    }
    const verify = await rest('document_chunks', { select: 'id', document_id: `eq.${documentId}`, limit: String(chunks.length + 1) });
    if (verify.length !== chunks.length) throw new Error(`Indexed ${verify.length}/${chunks.length} chunks`);
    result.committed = true;
  } catch (error) {
    result.error = error?.message || String(error);
    // Keep the partial document for manual inspection; never hide a failed write.
    console.log(JSON.stringify(result));
    process.exitCode = 1;
  }
}
console.log(JSON.stringify(result));
