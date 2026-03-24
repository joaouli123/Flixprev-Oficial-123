const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const locks = await p.query("SELECT objid, granted FROM pg_locks WHERE locktype = 'advisory'");
  if (locks.rows.length > 0) {
    console.log('Lock ativo:', locks.rows);
    await p.query('SELECT pg_advisory_unlock(90612099)');
    console.log('Lock liberado.');
  } else {
    console.log('Sem lock ativo - OK para rodar o script.');
  }
  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
