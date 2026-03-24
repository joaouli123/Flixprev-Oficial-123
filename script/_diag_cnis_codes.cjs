const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Buscar códigos conhecidos de indicadores de pendência do CNIS
  const codes = ['PNIM', 'PNIS', 'AIT', 'AEIT', 'CCO', 'IREC', 'PDC', 'PRC', 'PREC', 'EXT-IN', 'IEAN', 'VNP', 'VTN', 'PADM', 'ACERT'];
  
  for (const code of codes) {
    const r = await p.query(
      `SELECT COUNT(*)::int as cnt
       FROM document_chunks dc
       JOIN agents a ON dc.agent_id = a.id
       WHERE a.title = 'Cadastro Nacional de Informações Sociais'
         AND a.user_id IS NULL
         AND dc.content ILIKE $1`,
      ['%' + code + '%']
    );
    if (r.rows[0].cnt > 0) {
      console.log(`  ✅ ${code}: ${r.rows[0].cnt} chunks`);
    } else {
      console.log(`  ❌ ${code}: NOT FOUND`);
    }
  }

  // Buscar trechos que falem de "indicador" e "pendência" juntos
  const r2 = await p.query(
    `SELECT LEFT(dc.content, 800) as preview
     FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais'
       AND a.user_id IS NULL
       AND dc.content ILIKE '%indicador%'
       AND dc.content ILIKE '%pend%'
     LIMIT 10`
  );
  console.log('\n=== Chunks com INDICADOR + PEND:', r2.rowCount, '===');
  for (const row of r2.rows) {
    console.log('\n---\n', row.preview);
  }

  // Buscar IN 128 Art. 17 (mencionado na resposta do agente)
  const r3 = await p.query(
    `SELECT LEFT(dc.content, 800) as preview
     FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais'
       AND a.user_id IS NULL
       AND dc.content ILIKE '%Art. 17%'
       AND dc.content ILIKE '%indicador%'
     LIMIT 5`
  );
  console.log('\n=== Chunks com Art. 17 + indicador:', r3.rowCount, '===');
  for (const row of r3.rows) {
    console.log('\n---\n', row.preview);
  }

  // Buscar Art. 18 ou Art. 19 (onde geralmente ficam os indicadores)
  const r4 = await p.query(
    `SELECT LEFT(dc.content, 800) as preview
     FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais'
       AND a.user_id IS NULL
       AND (dc.content ILIKE '%Art. 18%' OR dc.content ILIKE '%Art. 19%')
       AND dc.content ILIKE '%pend%'
     LIMIT 5`
  );
  console.log('\n=== Chunks com Art.18-19 + pend:', r4.rowCount, '===');
  for (const row of r4.rows) {
    console.log('\n---\n', row.preview);
  }

  await p.end();
}

run().catch(async (e) => { console.error(e.message); await p.end(); process.exit(1); });
