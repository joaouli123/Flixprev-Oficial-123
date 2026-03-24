const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // 1) Buscar chunks que mencionam indicadores de pendência
  const r = await p.query(
    `SELECT dc.id, LEFT(dc.content, 600) as preview
     FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais'
       AND a.user_id IS NULL
       AND (dc.content ILIKE '%indicador%pend%'
         OR dc.content ILIKE '%pend%indicador%'
         OR dc.content ILIKE '%indicadores%')
     ORDER BY dc.id
     LIMIT 30`
  );

  console.log('\n=== CHUNKS COM "indicador" NO CNIS:', r.rowCount, '===\n');
  for (const row of r.rows) {
    console.log('[id=' + row.id + ']');
    console.log('PREVIEW:', row.preview, '\n');
  }

  // 2) Total de chunks do CNIS
  const total = await p.query(
    `SELECT COUNT(*)::int as cnt
     FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais'
       AND a.user_id IS NULL`
  );
  console.log('\n=== TOTAL CHUNKS CNIS:', total.rows[0].cnt, '===\n');

  // 3) Buscar chunks com "pendência"
  const pend = await p.query(
    `SELECT dc.id, LEFT(dc.content, 500) as preview
     FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais'
       AND a.user_id IS NULL
       AND dc.content ILIKE '%pend_ncia%'
     ORDER BY dc.id
     LIMIT 20`
  );

  console.log('\n=== CHUNKS COM "pendência" NO CNIS:', pend.rowCount, '===\n');
  for (const row of pend.rows) {
    console.log('[id=' + row.id + ']');
    console.log('PREVIEW:', row.preview, '\n');
  }

  await p.end();
}

run().catch(async (e) => { console.error(e.message); await p.end(); process.exit(1); });
