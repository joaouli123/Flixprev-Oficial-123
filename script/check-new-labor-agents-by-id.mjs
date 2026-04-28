import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TARGET_TITLES = [
  'Agente DirTrab',
  'Agente AtosTr',
  'Agente NR.sPro',
  'Agente SúmulasCore',
  'Agente PrecedentX',
  'Agente JurisPrud',
  'SúmulasCore',
  'PrecedenteX',
  'JurisPrd',
];

const q = await pool.query(`
  SELECT
    a.id,
    a.title,
    COUNT(DISTINCT d.id)::int AS docs,
    COUNT(dc.id)::int AS chunks,
    MAX(dc.created_at) AS last_chunk_at
  FROM agents a
  LEFT JOIN documents d ON d.agent_id = a.id
  LEFT JOIN document_chunks dc ON dc.document_id = d.id
  WHERE a.title = ANY($1) AND a.user_id IS NULL
  GROUP BY a.id, a.title
  ORDER BY a.title, last_chunk_at DESC NULLS LAST
`, [TARGET_TITLES]);

console.log(JSON.stringify(q.rows, null, 2));
await pool.end();
