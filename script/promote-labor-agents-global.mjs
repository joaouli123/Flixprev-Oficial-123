import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const categoryName = 'Direito Trabalhista';
const targetAgents = [
  'Agente DirTrab',
  'Agente AcordCore',
  'Agente AtosTr',
  'Agente JurisPrud',
  'Agente NR.sPro',
  'Agente SúmulasTr',
  'Agente JurisPrud 2',
  'Agente PrecedentX',
  'Agente SúmulasCore'
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const catUpdate = await client.query(
      'UPDATE categories SET user_id = NULL WHERE lower(name) = lower($1)',
      [categoryName]
    );

    const agentUpdate = await client.query(
      'UPDATE agents SET user_id = NULL WHERE lower(title) = ANY($1)',
      [targetAgents.map((a) => a.toLowerCase())]
    );

    await client.query('COMMIT');

    const summary = await client.query(
      `SELECT
        (SELECT COUNT(*)::int FROM categories WHERE lower(name) = lower($1) AND user_id IS NULL) AS global_categories,
        (SELECT COUNT(*)::int FROM agents WHERE lower(title) = ANY($2) AND user_id IS NULL) AS global_agents`,
      [categoryName, targetAgents.map((a) => a.toLowerCase())]
    );

    console.log(
      JSON.stringify(
        {
          success: true,
          updatedCategories: catUpdate.rowCount || 0,
          updatedAgents: agentUpdate.rowCount || 0,
          ...summary.rows[0],
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('PROMOTE_GLOBAL_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
