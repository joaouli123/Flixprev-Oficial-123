const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // All agents that might be trabalhista (global or user-scoped)
  const agents = await pool.query(`
    SELECT a.id, a.title, a.role, length(a.instructions) AS instr_len,
      (SELECT count(*)::int FROM documents d WHERE d.agent_id = a.id) AS docs,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id = a.id) AS chunks,
      CASE WHEN a.user_id IS NULL THEN 'GLOBAL' ELSE 'USER' END AS scope
    FROM agents a
    WHERE a.title IN (
      'Agente DirTrab','Agente AcordCore','Agente AtosTr','Agente JurisPrud',
      'Agente NR.sPro','Agente SúmulasTr','Agente JurisPrud 2','Agente PrecedentX',
      'Agente SúmulasCore','SúmulasCore','PrecedenteX','JurisPrd'
    )
    ORDER BY scope, a.title
  `);
  console.log('\n=== TODOS OS AGENTES TRABALHISTAS ===');
  console.table(agents.rows);

  // Instructions detail
  for (const ag of agents.rows) {
    const r = await pool.query(`SELECT instructions FROM agents WHERE id = $1`, [ag.id]);
    console.log(`\n--- ${ag.title} (${ag.scope}, ${ag.chunks} chunks, instr: ${ag.instr_len} chars) ---`);
    console.log(r.rows[0]?.instructions?.substring(0, 400) || '(vazio)');
  }

  // Check for small/empty docs
  const emptyDocs = await pool.query(`
    SELECT a.title AS agent, d.title AS doc_title,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.document_id = d.id) AS chunks
    FROM documents d
    JOIN agents a ON a.id = d.agent_id
    WHERE a.title IN (
      'Agente DirTrab','Agente AcordCore','Agente AtosTr','Agente JurisPrud',
      'Agente NR.sPro','Agente SúmulasTr','Agente JurisPrud 2','Agente PrecedentX',
      'Agente SúmulasCore','SúmulasCore','PrecedenteX','JurisPrd'
    )
    AND (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id) <= 1
    ORDER BY a.title, d.title
  `);
  if (emptyDocs.rows.length > 0) {
    console.log(`\n=== DOCS COM 0-1 CHUNKS (${emptyDocs.rows.length} total) ===`);
    for (const d of emptyDocs.rows) {
      console.log(`  [${d.chunks}] ${d.agent} → ${d.doc_title.substring(0, 80)}`);
    }
  }

  await pool.end();
}

run().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
