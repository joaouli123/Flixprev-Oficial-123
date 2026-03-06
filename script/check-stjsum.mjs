import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const q = await pool.query(`
  SELECT
    c.name AS category,
    a.title AS agent,
    d.title AS doc_title,
    COUNT(dc.id)::int AS chunks
  FROM agents a
  LEFT JOIN categories c ON c.id::text = ANY(a.category_ids)
  LEFT JOIN documents d ON d.agent_id = a.id
  LEFT JOIN document_chunks dc ON dc.document_id = d.id
  WHERE a.title = 'STJSum' AND a.user_id IS NULL
  GROUP BY c.name, a.title, d.title
`);

console.log(JSON.stringify(q.rows, null, 2));
await pool.end();
