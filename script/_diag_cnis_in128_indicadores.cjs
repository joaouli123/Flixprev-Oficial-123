const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // 1) Buscar na IN 128 qualquer menção a indicadores de pendência
  const q1 = await p.query(
    `SELECT dc.chunk_index, LEFT(dc.content, 800) as preview
     FROM document_chunks dc
     JOIN documents d ON dc.document_id = d.id
     WHERE d.title ILIKE '%instrucao-normativa%128%'
       AND (dc.content ILIKE '%indicador%' OR dc.content ILIKE '%PNIM%' OR dc.content ILIKE '%PNIS%'
            OR dc.content ILIKE '%AEIT%' OR dc.content ILIKE '%IREC%' OR dc.content ILIKE '%extemporâneo%'
            OR dc.content ILIKE '%extemporaneo%' OR dc.content ILIKE '%pendência%cnis%'
            OR dc.content ILIKE '%cnis%pendência%')
     ORDER BY dc.chunk_index
     LIMIT 15`
  );
  console.log('=== IN 128 - chunks com indicadores/pendência CNIS:', q1.rowCount, '===\n');
  for (const r of q1.rows) {
    console.log('--- chunk', r.chunk_index, '---');
    console.log(r.preview);
    console.log();
  }

  // 2) Verificar o conteúdo real da Portaria 990 (o 1 chunk existente)
  const q2 = await p.query(
    `SELECT dc.content FROM document_chunks dc
     JOIN documents d ON dc.document_id = d.id
     WHERE d.title ILIKE '%portaria990%'`
  );
  console.log('\n=== CONTEÚDO COMPLETO da Portaria 990 (único chunk) ===\n');
  for (const r of q2.rows) {
    console.log(r.content);
  }

  // 3) Verificar conteúdo de portalin.inss.gov.br/anexos
  const q3 = await p.query(
    `SELECT dc.content FROM document_chunks dc
     JOIN documents d ON dc.document_id = d.id
     WHERE d.title ILIKE '%portalin%anexos%'`
  );
  console.log('\n=== CONTEÚDO COMPLETO de /anexos (único chunk) ===\n');
  for (const r of q3.rows) {
    console.log(r.content);
  }

  // 4) Buscar no Decreto 3048 algo sobre indicadores CNIS
  const q4 = await p.query(
    `SELECT dc.chunk_index, LEFT(dc.content, 600) as preview
     FROM document_chunks dc
     JOIN documents d ON dc.document_id = d.id
     WHERE d.title ILIKE '%d3048%'
       AND (dc.content ILIKE '%indicador%' OR dc.content ILIKE '%PNIM%' OR dc.content ILIKE '%PNIS%')
     ORDER BY dc.chunk_index
     LIMIT 5`
  );
  console.log('\n=== Decreto 3048 - indicadores:', q4.rowCount, '===\n');
  for (const r of q4.rows) {
    console.log('--- chunk', r.chunk_index, '---');
    console.log(r.preview);
    console.log();
  }

  await p.end();
}

run().catch(async (e) => { console.error(e.message); await p.end(); process.exit(1); });
