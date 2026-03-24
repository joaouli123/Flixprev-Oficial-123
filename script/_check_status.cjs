const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  // Listar agentes previdenciários
  const agents = await p.query(`
    SELECT a.id, a.title, 
           (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id) as chunks,
           (SELECT count(*) FROM documents d WHERE d.agent_id = a.id) as docs
    FROM agents a 
    WHERE a.user_id IS NULL
      AND a.category_ids::text[] && (SELECT ARRAY[id::text] FROM categories WHERE lower(name) = 'previdenciário' LIMIT 1)
    ORDER BY a.title
  `);
  
  console.log(`\n=== AGENTES PREVIDENCIÁRIOS (${agents.rowCount}) ===\n`);
  for (const row of agents.rows) {
    console.log(`  [${row.chunks} chunks, ${row.docs} docs] ${row.title}`);
  }
  
  // Total de chunks
  const total = await p.query(`
    SELECT count(*) as total FROM document_chunks dc 
    JOIN agents a ON a.id = dc.agent_id
    WHERE a.category_ids::text[] && (SELECT ARRAY[id::text] FROM categories WHERE lower(name) = 'previdenciário' LIMIT 1)
      AND a.user_id IS NULL
  `);
  console.log(`\nTotal chunks previdenciário: ${total.rows[0].total}`);
  
  // Verificar lock
  const lock = await p.query("SELECT objid, granted FROM pg_locks WHERE locktype='advisory'");
  if (lock.rowCount > 0) {
    console.log('\nAdvisory locks ativos:', lock.rows);
  } else {
    console.log('\nNenhum advisory lock ativo.');
  }
  
  await p.end();
}

check().catch(e => { console.error(e.message); p.end(); });
