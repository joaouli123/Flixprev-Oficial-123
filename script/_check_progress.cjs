const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Check lock
  const locks = await p.query("SELECT objid, granted FROM pg_locks WHERE locktype = 'advisory'");
  console.log(locks.rows.length > 0 ? `Lock ATIVO: ${JSON.stringify(locks.rows)}` : 'Lock INATIVO');

  // Check PAP chunks specifically
  const pap = await p.query(`
    SELECT count(*) as chunks, 
           (SELECT count(*) FROM documents d WHERE d.agent_id = a.id) as docs
    FROM document_chunks dc
    JOIN agents a ON a.id = dc.agent_id
    WHERE a.title = 'Processo Administrativo Previdenciário' AND a.user_id IS NULL
    GROUP BY a.id
  `);
  if (pap.rows.length > 0) {
    console.log(`PAP: ${pap.rows[0].chunks} chunks, ${pap.rows[0].docs} docs`);
  } else {
    console.log('PAP: sem chunks ainda (aguardando processamento)');
  }

  // Check total agent count with chunks > 0
  const processed = await p.query(`
    SELECT count(DISTINCT a.id) as agents
    FROM agents a
    JOIN document_chunks dc ON dc.agent_id = a.id
    WHERE a.user_id IS NULL
      AND a.category_ids::text[] && (SELECT ARRAY[id::text] FROM categories WHERE lower(name) = 'previdenciário' LIMIT 1)
  `);
  console.log(`Agentes com chunks: ${processed.rows[0].agents}/28`);

  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
