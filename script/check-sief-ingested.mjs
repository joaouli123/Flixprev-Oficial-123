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
    a.title AS agent,
    d.id AS doc_id,
    d.title AS doc_title,
    COUNT(dc.id)::int AS chunks,
    MAX(dc.created_at) AS last_chunk_at,
    MAX(CASE WHEN dc.content ILIKE 'TOTAL_REGISTROS:%' OR dc.content ILIKE '%TOTAL_REGISTROS: 1126%' THEN 1 ELSE 0 END) AS has_total_marker
  FROM documents d
  JOIN agents a ON a.id = d.agent_id
  LEFT JOIN document_chunks dc ON dc.document_id = d.id
  WHERE d.title ILIKE '%siefreceitas.receita.economia.gov.br%'
  GROUP BY a.title, d.id, d.title
  ORDER BY last_chunk_at DESC NULLS LAST
`);

console.log(JSON.stringify(q.rows, null, 2));
await pool.end();
