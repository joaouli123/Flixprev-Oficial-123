// _check_damaged.cjs — Lista agentes com menos chunks que o esperado
const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const cat = await p.query("SELECT id FROM categories WHERE lower(name)='previdenciário' AND user_id IS NULL LIMIT 1");
  if (!cat.rowCount) { console.log('Categoria não encontrada'); return; }
  const catId = cat.rows[0].id;

  const r = await p.query(`
    SELECT a.id, a.title, array_length(a.attachments,1) as n_urls,
           (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id=a.id)::int as chunks
    FROM agents a
    WHERE a.user_id IS NULL
      AND a.category_ids::text[] @> ARRAY[$1::text]
    ORDER BY chunks ASC
  `, [catId]);

  console.log('\n=== AGENTES POR CHUNKS (ASC) ===\n');
  let damaged = 0;
  for (const row of r.rows) {
    const flag = row.chunks < 400 ? ' ❌ DANIFICADO' : (row.chunks < 800 ? ' ⚠️ PARCIAL' : '');
    console.log(`  [${String(row.chunks).padStart(5)} chunks, ${String(row.n_urls||0).padStart(2)} urls] ${row.title}${flag}`);
    if (row.chunks < 800 && (row.n_urls || 0) > 10) damaged++;
  }
  console.log(`\nAgentes que precisam reparo: ${damaged}`);
  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
