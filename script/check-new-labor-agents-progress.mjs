import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const q = await pool.query(`
  SELECT a.title, COUNT(DISTINCT d.id)::int AS docs, COUNT(dc.id)::int AS chunks, MAX(dc.created_at) AS last_chunk_at
  FROM agents a
  LEFT JOIN documents d ON d.agent_id = a.id
  LEFT JOIN document_chunks dc ON dc.agent_id = a.id
  WHERE a.title IN ('SúmulasCore','PrecedenteX','JurisPrd') AND a.user_id IS NULL
  GROUP BY a.title
  ORDER BY a.title
`);

console.log(JSON.stringify(q.rows, null, 2));
await pool.end();
