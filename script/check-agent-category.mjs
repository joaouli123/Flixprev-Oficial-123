import 'dotenv/config';
import pg from 'pg';

const categoryName = process.argv[2] || 'Agente Perfeito';
const agentTitle = process.argv[3] || 'O Prompt Perfeito';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  try {
    const categoryResult = await client.query(
      `
      select id::text, name
      from categories
      where lower(name) = lower($1)
      order by name asc
      `,
      [categoryName]
    );

    const agentResult = await client.query(
      `
      select id::text, title, category_ids
      from agents
      where lower(title) = lower($1)
      order by title asc
      `,
      [agentTitle]
    );

    console.log(JSON.stringify({
      categoryName,
      agentTitle,
      categories: categoryResult.rows,
      agents: agentResult.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});