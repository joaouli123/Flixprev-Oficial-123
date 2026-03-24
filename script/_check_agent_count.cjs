const { Pool } = require('pg');
require('dotenv').config();

const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const term = process.argv[2] || 'Regras de Transição';
  const r = await p.query(
    `SELECT a.title, (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id=a.id) AS chunks
     FROM agents a
     WHERE a.user_id IS NULL AND a.title ILIKE $1`,
    [`%${term}%`]
  );
  for (const row of r.rows) {
    console.log(`[${row.chunks}] ${row.title}`);
  }
  await p.end();
}

run().catch(async (e) => { console.error(e.message); await p.end(); process.exit(1); });
