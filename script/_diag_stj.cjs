// _diag_stj.cjs - Quick audit of Agente STJSum
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // Find the agent
  const agents = await pool.query(`
    SELECT a.id, a.title, a.role, length(a.instructions) AS instr_len,
      left(a.instructions, 600) AS instr_preview,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id = a.id) AS chunks,
      (SELECT count(*)::int FROM documents d WHERE d.agent_id = a.id) AS docs
    FROM agents a
    WHERE a.user_id IS NULL AND a.title ILIKE '%STJ%'
    ORDER BY a.title
  `);
  console.log('=== Agentes com STJ no nome ===');
  for (const a of agents.rows) {
    console.log(`\nTitle: ${a.title}`);
    console.log(`ID: ${a.id}`);
    console.log(`Role: ${a.role}`);
    console.log(`Instructions: ${a.instr_len} chars`);
    console.log(`Docs: ${a.docs} | Chunks: ${a.chunks}`);
    console.log(`Instructions preview:\n${a.instr_preview}\n---`);
  }

  // List documents
  if (agents.rows.length) {
    const agentId = agents.rows[0].id;
    const docs = await pool.query(
      'SELECT id, title, created_at FROM documents WHERE agent_id = $1 ORDER BY created_at',
      [agentId]
    );
    console.log('\n=== Documents ===');
    console.table(docs.rows.map(d => ({ title: d.title, created: d.created_at })));

    // Sample chunks
    const sample = await pool.query(
      'SELECT left(content, 150) AS preview, chunk_index FROM document_chunks WHERE agent_id = $1 ORDER BY random() LIMIT 5',
      [agentId]
    );
    console.log('\n=== Sample Chunks ===');
    for (const c of sample.rows) {
      console.log(`[${c.chunk_index}] ${c.preview}...`);
    }
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
