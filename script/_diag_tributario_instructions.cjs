const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const agents = await pool.query(`
    SELECT a.id, a.title, a.role, a.instructions, a.description
    FROM agents a
    WHERE a.user_id IS NULL
      AND a.title IN ('DTrib','CTN Expert','REFIS-IA','TAX-Rend','FedTax')
    ORDER BY a.title
  `);

  for (const ag of agents.rows) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`AGENTE: ${ag.title} | ${ag.role}`);
    console.log(`DESC: ${ag.description}`);
    console.log(`INSTRUCTIONS (${ag.instructions?.length || 0} chars):`);
    console.log(ag.instructions || '(vazio)');
  }

  await pool.end();
}

run().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
