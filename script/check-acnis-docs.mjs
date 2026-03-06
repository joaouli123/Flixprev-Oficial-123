import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const q = await pool.query(`
  SELECT d.title, COUNT(dc.id)::int AS chunks
  FROM documents d
  JOIN agents a ON a.id = d.agent_id
  LEFT JOIN document_chunks dc ON dc.document_id = d.id
  WHERE a.title = 'ACNIS' AND a.user_id IS NULL
  GROUP BY d.id, d.title
  ORDER BY d.created_at DESC
`);

console.log(JSON.stringify(q.rows, null, 2));
await pool.end();
