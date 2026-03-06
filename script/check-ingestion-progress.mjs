import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const userId = '07d16581-fca5-4709-b0d3-e09859dbb286';
const targets = ['Agente DirTrab', 'Agente AtosTr', 'Agente NR.sPro'];

async function main() {
  const agents = await pool.query(
    'SELECT id, title, attachments FROM agents WHERE user_id = $1 AND title = ANY($2)',
    [userId, targets]
  );

  for (const a of agents.rows) {
    const d = await pool.query('SELECT COUNT(*)::int AS c FROM documents WHERE agent_id = $1', [a.id]);
    const c = await pool.query('SELECT COUNT(*)::int AS c FROM document_chunks WHERE agent_id = $1', [a.id]);
    console.log(JSON.stringify({
      title: a.title,
      attachments: Array.isArray(a.attachments) ? a.attachments.length : 0,
      documents: d.rows[0].c,
      chunks: c.rows[0].c,
    }));
  }

  await pool.end();
}

await main();
