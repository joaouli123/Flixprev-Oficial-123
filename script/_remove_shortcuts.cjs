const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const r = await p.query(
    "UPDATE agents SET shortcuts = '{}' WHERE user_id IS NULL AND shortcuts IS NOT NULL AND array_length(shortcuts, 1) > 0 RETURNING title"
  );
  console.log(`Shortcuts removidos de ${r.rowCount} agentes:`);
  for (const row of r.rows) console.log(`  - ${row.title}`);
  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
