// Recoverably replaces only URL-backed indexed documents with broken encoding.
// Dry-run is the default. --commit stores full old rows under --backup-dir first.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchLinkKnowledgeSource } from './lib/link-content-utils.mjs';

const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const commit = process.argv.includes('--commit');
const agentArg = process.argv.indexOf('--agent-id');
const agentId = agentArg >= 0 ? process.argv[agentArg + 1] : '';
const documentArg = process.argv.indexOf('--document-id');
const documentId = documentArg >= 0 ? process.argv[documentArg + 1] : '';
const limitArg = process.argv.indexOf('--limit');
const limit = Math.max(1, Number(limitArg >= 0 ? process.argv[limitArg + 1] : 5) || 5);
const backupArg = process.argv.indexOf('--backup-dir');
const backupDir = backupArg >= 0 ? path.resolve(process.argv[backupArg + 1]) : '';
if (commit && !backupDir) throw new Error('--backup-dir is required with --commit');

async function rest(table, params, options = {}) {
  const url = `${baseUrl}/rest/v1/${table}${params ? `?${new URLSearchParams(params)}` : ''}`;
  const { headers: extraHeaders = {}, ...requestOptions } = options;
  const response = await fetch(url, { ...requestOptions, headers: { ...headers, ...extraHeaders } });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${table} HTTP ${response.status}: ${raw.slice(0, 400)}`);
  return { data: raw ? JSON.parse(raw) : null, count: Number(response.headers.get('content-range')?.split('/')[1] || 0) };
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

async function getAllOldChunks(documentId) {
  const rows = [];
  for (let offset = 0;; offset += 500) {
    const page = await rest('document_chunks', {
      select: 'id,agent_id,document_id,content,chunk_index,embedding',
      document_id: `eq.${documentId}`, order: 'chunk_index.asc', offset: String(offset), limit: '500',
    });
    rows.push(...page.data);
    if (page.data.length < 500) break;
  }
  return rows;
}

function sourceAllowed(url) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) && [
      'planalto.gov.br', 'in.gov.br', 'camara.leg.br', 'trt2.jus.br', 'normaslegais.com.br',
    ].some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

const agents = agentId
  ? [{ id: agentId }]
  : (await rest('agents', { select: 'id', limit: '100' })).data;
const sourceCache = new Map();
let processed = 0;
for (const agent of agents) {
  if (processed >= limit) break;
  const docs = (await rest('documents', { select: 'id,agent_id,title', agent_id: `eq.${agent.id}`, limit: '1000' })).data;
  for (const doc of docs) {
    if (processed >= limit) break;
    if (documentId && doc.id !== documentId) continue;
    const damaged = await rest('document_chunks', { select: 'id', document_id: `eq.${doc.id}`, content: 'ilike.*�*', limit: '1' }, { headers: { Prefer: 'count=exact' } });
    if (!damaged.count || !sourceAllowed(doc.title)) continue;
    processed += 1;
    const result = { agentId: agent.id, documentId: doc.id, source: doc.title, damagedChunks: damaged.count, committed: false };
    try {
      const oldChunks = await getAllOldChunks(doc.id);
      let source = sourceCache.get(doc.title);
      if (!source) {
        source = await fetchLinkKnowledgeSource(doc.title, { signal: AbortSignal.timeout(25000) });
        sourceCache.set(doc.title, source);
      }
      if (!sourceAllowed(source.finalUrl || doc.title)) throw new Error('Source redirected outside approved domains');
      const text = source.savedText || source.text || '';
      const newChunks = chunkText(text);
      result.oldChunks = oldChunks.length;
      result.newChunks = newChunks.length;
      result.newLength = text.length;
      result.newReplacementChars = (text.match(/�/g) || []).length;
      if (newChunks.length < Math.max(1, oldChunks.length * 0.4)
        || text.length < 1000 || result.newReplacementChars > 0) {
        result.skipped = 'New source failed content/encoding coverage checks';
      } else if (commit) {
        await fs.mkdir(backupDir, { recursive: true });
        const backupPath = path.join(backupDir, `${doc.id}.json`);
        try {
          await fs.writeFile(backupPath, JSON.stringify({ document: doc, chunks: oldChunks }), { flag: 'wx' });
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
        result.backupPath = backupPath;
        const inserted = await rest('documents', 'select=id', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ agent_id: agent.id, title: doc.title }),
        });
        const newDocumentId = inserted.data?.[0]?.id;
        if (!newDocumentId) throw new Error('Replacement document ID missing');
        result.replacementDocumentId = newDocumentId;
        for (let start = 0; start < newChunks.length; start += 20) {
          await rest('document_chunks', '', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(newChunks.slice(start, start + 20).map((content, offset) => ({
              agent_id: agent.id, document_id: newDocumentId, content, chunk_index: start + offset,
            }))),
          });
        }
        const replacement = await rest('document_chunks', { select: 'id', document_id: `eq.${newDocumentId}`, limit: '1' }, { headers: { Prefer: 'count=exact' } });
        if (replacement.count !== newChunks.length) throw new Error(`Replacement count mismatch: ${replacement.count}/${newChunks.length}`);
        await rest('document_chunks', { document_id: `eq.${doc.id}` }, { method: 'DELETE' });
        await rest('documents', { id: `eq.${doc.id}` }, { method: 'DELETE' });
        result.committed = true;
      }
    } catch (error) {
      result.error = error?.message || String(error);
    }
    console.log(JSON.stringify(result));
  }
}
console.log(JSON.stringify({ processed, commit, backupDir: commit ? backupDir : undefined }));
