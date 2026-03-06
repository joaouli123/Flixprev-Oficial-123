import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const lockKey = 90612071;

const lockQ = await pool.query(
  `SELECT l.pid, a.state, a.query_start, a.state_change, left(a.query, 120) as query
   FROM pg_locks l
   JOIN pg_stat_activity a ON a.pid = l.pid
   WHERE l.locktype='advisory' AND l.classid=0 AND l.objid=$1 AND l.granted=true`,
  [lockKey]
);

const progressQ = await pool.query(`
  SELECT a.title, COUNT(DISTINCT d.id)::int AS docs, COUNT(dc.id)::int AS chunks, MAX(dc.created_at) AS last_chunk_at
  FROM agents a
  LEFT JOIN documents d ON d.agent_id = a.id
  LEFT JOIN document_chunks dc ON dc.document_id = d.id
  WHERE a.user_id IS NULL
    AND a.title IN ('A.pré103','Apiurb','AIP','AEsp','ARur','AIT','AA','Rec','SMar','SFam','PMor','RTransiç','RMI','ProcAdm','AVJud','25AIP','APCD','ACNIS')
  GROUP BY a.title
  ORDER BY a.title
`);

console.log('LOCK', JSON.stringify(lockQ.rows, null, 2));
console.log('PROGRESS', JSON.stringify(progressQ.rows, null, 2));

await pool.end();
