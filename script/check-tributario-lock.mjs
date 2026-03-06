import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const key = 90612031;

const q = `
  SELECT l.pid, a.usename, a.application_name, a.client_addr, a.state, a.query_start, a.state_change, a.query
  FROM pg_locks l
  JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE l.locktype = 'advisory' AND l.classid = 0 AND l.objid = $1 AND l.granted = true
`;

const r = await pool.query(q, [key]);
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();
