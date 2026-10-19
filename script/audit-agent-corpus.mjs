// Read-only inventory of the knowledge actually indexed for each agent.
// Supply SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY through the process environment.
const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !key) throw new Error('Supabase audit environment is missing');

const headers = { apikey: key, Authorization: `Bearer ${key}` };
async function get(table, params, count = false) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${new URLSearchParams(params)}`, {
    method: 'GET',
    headers: { ...headers, ...(count ? { Prefer: 'count=exact' } : {}) },
  });
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status} ${await response.text()}`);
  return { rows: await response.json(), count: Number(response.headers.get('content-range')?.split('/')[1] || 0) };
}

const { rows: agents } = await get('agents', { select: 'id,title,attachments,instructions', limit: '100' });
const results = [];
for (const agent of agents) {
  const [documents, chunks, damaged] = await Promise.all([
    get('documents', { select: 'id,title', agent_id: `eq.${agent.id}`, limit: '1000' }, true),
    get('document_chunks', { select: 'id', agent_id: `eq.${agent.id}`, limit: '1' }, true),
    get('document_chunks', { select: 'id', agent_id: `eq.${agent.id}`, content: 'ilike.*�*', limit: '1' }, true),
  ]);
  results.push({
    id: agent.id,
    title: agent.title,
    attachments: Array.isArray(agent.attachments) ? agent.attachments.length : 0,
    documents: documents.count,
    chunks: chunks.count,
    damagedEncodingChunks: damaged.count,
    missingContent: chunks.count === 0,
  });
  console.log(JSON.stringify(results.at(-1)));
  if (process.argv.includes('--documents') && damaged.count > 0) {
    const documentChecks = await Promise.all(documents.rows.map(async (document) => {
      const damagedDocument = await get('document_chunks', {
        select: 'id', document_id: `eq.${document.id}`, content: 'ilike.*�*', limit: '1',
      }, true);
      return { id: document.id, title: document.title, damagedChunks: damagedDocument.count };
    }));
    for (const document of documentChecks.filter((item) => item.damagedChunks > 0)) {
      console.log(JSON.stringify({ agent: agent.title, ...document }));
    }
  }
}
console.log(JSON.stringify({ totalAgents: results.length, totalChunks: results.reduce((sum, row) => sum + row.chunks, 0), emptyAgents: results.filter((row) => row.missingContent).length, damagedAgents: results.filter((row) => row.damagedEncodingChunks > 0).length }));
