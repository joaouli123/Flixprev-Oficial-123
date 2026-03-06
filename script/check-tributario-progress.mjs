import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const lockKey = 90612031;

const lockQ = `
  SELECT l.pid, a.state, a.query_start, a.state_change, left(a.query, 120) as query
  FROM pg_locks l
  JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE l.locktype = 'advisory' AND l.classid = 0 AND l.objid = $1 AND l.granted = true
`;

const progressQ = `
  SELECT a.title,
         COUNT(DISTINCT d.id)::int AS docs,
         COUNT(dc.id)::int AS chunks,
         MAX(dc.created_at) AS last_chunk_at
  FROM agents a
  LEFT JOIN documents d ON d.agent_id = a.id
  LEFT JOIN document_chunks dc ON dc.agent_id = a.id
  WHERE a.user_id IS NULL
    AND a.title IN ('DTrib', 'CTN Expert', 'REFIS-IA', 'TAX-Rend', 'FedTax')
  GROUP BY a.title
  ORDER BY a.title
`;

const lock = await pool.query(lockQ, [lockKey]);
const progress = await pool.query(progressQ);

console.log('LOCK:', JSON.stringify(lock.rows, null, 2));
console.log('PROGRESS:', JSON.stringify(progress.rows, null, 2));

await pool.end();
