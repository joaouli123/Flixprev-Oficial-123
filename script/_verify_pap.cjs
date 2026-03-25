require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const aid = 'f0524fea-e2bf-49fb-b4ce-8c672050ed04';

  const docs = await pool.query('SELECT id, title FROM documents WHERE agent_id = $1', [aid]);
  console.log('Docs:', docs.rows.length);
  docs.rows.forEach(d => console.log('  ', d.title));

  const chunks = await pool.query('SELECT count(*) FROM document_chunks WHERE agent_id = $1', [aid]);
  console.log('Chunks:', chunks.rows[0].count);

  const inst = await pool.query('SELECT length(instructions) as len FROM agents WHERE id = $1', [aid]);
  console.log('Instructions:', inst.rows[0].len, 'chars');

  // Check a sample chunk content (first 150 chars)
  const sample = await pool.query('SELECT content FROM document_chunks WHERE agent_id = $1 ORDER BY chunk_index LIMIT 1', [aid]);
  if (sample.rows.length) {
    console.log('Sample chunk:', sample.rows[0].content.substring(0, 150));
  }

  await pool.end();
})();
