import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const q = await pool.query(`
  SELECT id, title, role, user_id
  FROM agents
  WHERE lower(title) LIKE '%dirtrab%'
     OR lower(title) LIKE '%trab%'
     OR lower(coalesce(role,'')) LIKE '%trabalh%'
  ORDER BY title
`);

console.log(JSON.stringify(q.rows, null, 2));
await pool.end();
