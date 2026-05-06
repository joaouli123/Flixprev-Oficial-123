import 'dotenv/config';
import pg from 'pg';

function parseArgs(argv = []) {
  const options = {
    agentId: '',
    attachments: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--agent-id' && next) {
      options.agentId = String(next).trim();
      index += 1;
      continue;
    }
    if (token === '--attachment' && next) {
      options.attachments.push(String(next).trim());
      index += 1;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL é obrigatório.');
  }
  if (!options.agentId) {
    throw new Error('Use --agent-id <uuid>.');
  }
  if (options.attachments.length === 0) {
    throw new Error('Use ao menos um --attachment <path>.');
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const before = await pool.query(
      'SELECT id::text, title, attachments, python_collection_id FROM agents WHERE id = $1',
      [options.agentId]
    );
    console.log('===BEFORE===');
    console.log(JSON.stringify(before.rows[0] || null, null, 2));

    const updated = await pool.query(
      'UPDATE agents SET attachments = $1::text[], updated_at = now() WHERE id = $2 RETURNING id::text, title, attachments, python_collection_id',
      [options.attachments, options.agentId]
    );
    console.log('===AFTER===');
    console.log(JSON.stringify(updated.rows[0] || null, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
