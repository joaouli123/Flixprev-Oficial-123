const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Get PAP agent id
  const agent = await p.query(`
    SELECT a.id, a.title FROM agents a 
    WHERE a.title = 'Processo Administrativo Previdenciário' AND a.user_id IS NULL
  `);
  if (agent.rows.length === 0) { console.log('PAP not found'); return; }
  const agentId = agent.rows[0].id;
  console.log(`PAP agent ID: ${agentId}`);

  // List all documents for PAP
  const docs = await p.query(`
    SELECT d.id, d.title, 
           (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunks
    FROM documents d 
    WHERE d.agent_id = $1
    ORDER BY d.created_at
  `, [agentId]);
  
  console.log(`\nDocumentos do PAP (${docs.rowCount}):`);
  for (const d of docs.rows) {
    console.log(`  [${d.chunks} chunks] ${d.title}`);
  }

  // Check first chunk content
  const sample = await p.query(`
    SELECT LEFT(content, 200) as preview FROM document_chunks 
    WHERE agent_id = $1 
    ORDER BY chunk_index
    LIMIT 3
  `, [agentId]);
  console.log('\nPrimeiros chunks:');
  for (const c of sample.rows) {
    console.log(`  "${c.preview}..."`);
  }

  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
