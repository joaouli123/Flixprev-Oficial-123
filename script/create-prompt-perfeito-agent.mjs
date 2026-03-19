import 'dotenv/config';
import crypto from 'node:crypto';
import pg from 'pg';

const CATEGORY_NAME = 'Agente Perfeito';
const AGENT_TITLE = 'O Prompt Perfeito';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureCategory() {
  const existing = await client.query(
    `select id::text, name from categories where lower(name) = lower($1) limit 1`,
    [CATEGORY_NAME]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await client.query(
    `insert into categories (id, name, user_id, created_at)
     values ($1, $2, null, now())
     returning id::text, name`,
    [crypto.randomUUID(), CATEGORY_NAME]
  );

  return created.rows[0];
}

async function ensureAgent(categoryId) {
  const existing = await client.query(
    `select id::text, title from agents where lower(title) = lower($1) limit 1`,
    [AGENT_TITLE]
  );

  if (existing.rows[0]) {
    return { agent: existing.rows[0], created: false };
  }

  const agentId = crypto.randomUUID();
  const insert = await client.query(
    `insert into agents (
      id,
      title,
      role,
      description,
      icon,
      background_icon,
      category_ids,
      link,
      user_id,
      shortcuts,
      instructions,
      attachments,
      extra_links,
      created_at
    ) values (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7::uuid[],
      $8,
      null,
      $9::text[],
      $10,
      $11::text[],
      $12::jsonb,
      now()
    )
    returning id::text, title`,
    [
      agentId,
      AGENT_TITLE,
      'Agente Perfeito',
      'Especialista em construção de prompts de alta performance, engenharia de instruções e estruturação de pedidos com clareza e precisão.',
      'Sparkles',
      'BrainCircuit',
      [categoryId],
      null,
      ['Estruturar prompt', 'Refinar instrução', 'Melhorar contexto', 'Aumentar precisão'],
      'Este agente foi criado como base para o conteúdo do PDF Ebook-PCTFV - O Prompt Perfeito. A base documental principal ainda precisa ser anexada para ingestão completa do conhecimento.',
      [],
      JSON.stringify([]),
    ]
  );

  return { agent: insert.rows[0], created: true };
}

async function main() {
  await client.connect();

  try {
    const category = await ensureCategory();
    const { agent, created } = await ensureAgent(category.id);

    console.log(JSON.stringify({
      category,
      agent,
      created,
      note: 'O PDF ainda nao foi anexado automaticamente ao agente.',
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});