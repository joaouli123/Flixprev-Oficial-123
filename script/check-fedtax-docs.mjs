import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const q = await pool.query(`
  SELECT d.title, d.created_at
  FROM documents d
  JOIN agents a ON a.id = d.agent_id
  WHERE a.title = 'FedTax'
  ORDER BY d.created_at DESC
`);

console.log(JSON.stringify(q.rows, null, 2));
await pool.end();
