import pg from 'pg';
const c = new pg.Client('postgresql://postgres:JEQhzbSS76UKBUoF@db.gyqsvfwwgiarmhibdjyp.supabase.co:5432/postgres');
await c.connect();
const r = await c.query(`
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'document_chunks'::regclass AND contype='f'
`);
console.log('=== FK constraints on document_chunks ===');
for (const row of r.rows) console.log(row.conname, '→', row.pg_get_constraintdef);

// Check if lock is free
const lock = await c.query('SELECT pg_try_advisory_lock(90612099) as locked');
console.log('\nAdvisory lock available:', lock.rows[0].locked);
if (lock.rows[0].locked) await c.query('SELECT pg_advisory_unlock(90612099)');

// Check current agent count
const agents = await c.query(`
  SELECT count(*)::int as total FROM agents
  WHERE category_ids @> ARRAY[(SELECT id FROM categories WHERE slug='previdenciario')]
`);
console.log('Previdenciário agents:', agents.rows[0].total);

await c.end();
