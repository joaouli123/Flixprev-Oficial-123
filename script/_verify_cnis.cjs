// Quick verification: does the CNIS agent find indicator content?
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const ar = await pool.query("SELECT id FROM agents WHERE lower(title) LIKE '%cadastro nacional%' AND user_id IS NULL LIMIT 1");
  const aid = ar.rows[0].id;

  const apiKey = process.env.GEMINI_API_KEY;
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: 'me mostre quais são os indicadores de pendências, e seus significados' }] }
      })
    }
  );
  const d = await resp.json();
  const vec = '[' + d.embedding.values.join(',') + ']';

  const sr = await pool.query(
    'SELECT content, 1-(embedding <=> $1::vector) as sim FROM document_chunks WHERE agent_id=$2 ORDER BY embedding <=> $1::vector LIMIT 5',
    [vec, aid]
  );
  for (const r of sr.rows) {
    console.log(`--- sim=${Number(r.sim).toFixed(4)} ---`);
    console.log(r.content.slice(0, 400));
    console.log();
  }
  await pool.end();
})();
