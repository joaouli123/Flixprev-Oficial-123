const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await p.query(`
    SELECT a.title, a.role,
      CASE WHEN a.user_id IS NULL THEN 'GLOBAL' ELSE 'USER' END AS scope,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id=a.id) AS chunks
    FROM agents a
    WHERE a.title ILIKE '%sumula%' OR a.title ILIKE '%precedent%'
       OR a.title ILIKE '%juris%' OR a.title ILIKE '%acord%'
       OR a.title ILIKE '%dirtrab%' OR a.title ILIKE '%atost%'
       OR a.title ILIKE '%nr.s%'
    ORDER BY a.title
  `);
  console.table(r.rows);
  await p.end();
})();
