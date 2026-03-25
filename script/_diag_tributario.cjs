const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // 1. Agent overview
  const agents = await pool.query(`
    SELECT a.id, a.title, a.role,
      (SELECT count(*)::int FROM documents d WHERE d.agent_id = a.id) AS docs,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id = a.id) AS chunks
    FROM agents a
    WHERE a.user_id IS NULL
      AND a.title IN ('DTrib','CTN Expert','REFIS-IA','TAX-Rend','FedTax')
    ORDER BY a.title
  `);
  console.log('\n=== AGENTES TRIBUTÁRIOS ===');
  console.table(agents.rows);

  // 2. Documents per agent with content sizes
  for (const ag of agents.rows) {
    const docs = await pool.query(`
      SELECT d.id, d.title,
        (SELECT count(*)::int FROM document_chunks dc WHERE dc.document_id = d.id) AS chunks,
        (SELECT sum(length(dc.content))::int FROM document_chunks dc WHERE dc.document_id = d.id) AS total_chars
      FROM documents d
      WHERE d.agent_id = $1
      ORDER BY d.title
    `, [ag.id]);
    console.log(`\n--- ${ag.title} (${ag.role}) | ${ag.chunks} chunks ---`);
    for (const d of docs.rows) {
      console.log(`  [${d.chunks} chunks, ${d.total_chars || 0} chars] ${d.title}`);
    }
  }

  // 3. Sample chunks - check for empty/placeholder content
  for (const ag of agents.rows) {
    const samples = await pool.query(`
      SELECT dc.content, length(dc.content) AS len
      FROM document_chunks dc
      WHERE dc.agent_id = $1
      ORDER BY length(dc.content) ASC
      LIMIT 3
    `, [ag.id]);
    console.log(`\n--- ${ag.title}: 3 SMALLEST chunks ---`);
    for (const s of samples.rows) {
      console.log(`  [${s.len} chars] ${s.content.substring(0, 120)}...`);
    }
  }

  // 4. Check for docs with very few or 0 chunks
  const emptyDocs = await pool.query(`
    SELECT a.title AS agent, d.title AS doc_title,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.document_id = d.id) AS chunks
    FROM documents d
    JOIN agents a ON a.id = d.agent_id
    WHERE a.user_id IS NULL
      AND a.title IN ('DTrib','CTN Expert','REFIS-IA','TAX-Rend','FedTax')
      AND (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id) <= 2
    ORDER BY a.title, d.title
  `);
  if (emptyDocs.rows.length > 0) {
    console.log('\n=== DOCS COM POUCOS CHUNKS (<=2) ===');
    console.table(emptyDocs.rows);
  }

  await pool.end();
}

run().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
