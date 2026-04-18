const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  // Get one previdenciário agent instructions as reference
  const r = await p.query(`
    SELECT title, length(instructions) AS len, instructions
    FROM agents
    WHERE user_id IS NULL AND title ILIKE '%Car%ncia%'
    LIMIT 1
  `);
  if (r.rows[0]) {
    console.log(`=== ${r.rows[0].title} (${r.rows[0].len} chars) ===`);
    console.log(r.rows[0].instructions);
  }
  await p.end();
})();
