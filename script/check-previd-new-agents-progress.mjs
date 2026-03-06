import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TITLES = ['CQS', 'AMB', 'ASoc', 'BPC', 'CRPS', 'ReVB', 'RPPS', 'ACPIN', 'RTNU', 'SúmFed'];

const AGENTS_SQL = `
  SELECT id, title
  FROM agents
  WHERE user_id IS NULL AND title = ANY($1)
`;

const PROGRESS_SQL = `
  SELECT
    a.title,
    COUNT(DISTINCT d.id)::int AS docs,
    COUNT(dc.id)::int AS chunks,
    MAX(dc.created_at) AS last_chunk_at
  FROM agents a
  LEFT JOIN documents d ON d.agent_id = a.id
  LEFT JOIN document_chunks dc ON dc.document_id = d.id
  WHERE a.user_id IS NULL AND a.title = ANY($1)
  GROUP BY a.title
  ORDER BY a.title
`;

async function main() {
  const [agents, progress] = await Promise.all([
    pool.query(AGENTS_SQL, [TITLES]),
    pool.query(PROGRESS_SQL, [TITLES]),
  ]);

  const createdTitles = new Set(agents.rows.map((r) => r.title));
  const missingAgents = TITLES.filter((title) => !createdTitles.has(title));

  console.log(JSON.stringify({
    requestedAgents: TITLES.length,
    createdAgents: agents.rowCount,
    missingAgents,
    progress: progress.rows,
  }, null, 2));
}

await main()
  .catch((error) => {
    console.error('[FATAL] check-previd-new-agents-progress falhou.');
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
