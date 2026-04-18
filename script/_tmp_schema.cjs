const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await p.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='documents' ORDER BY ordinal_position`);
  console.table(r.rows);
  const r2 = await p.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='document_chunks' ORDER BY ordinal_position`);
  console.table(r2.rows);
  await p.end();
})();
