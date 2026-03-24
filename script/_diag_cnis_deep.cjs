const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // 1) Total chunks do CNIS
  const tot = await p.query(
    `SELECT COUNT(*)::int as cnt FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais' AND a.user_id IS NULL`
  );
  console.log('TOTAL CHUNKS CNIS:', tot.rows[0].cnt);

  // 2) Listar documents vinculados ao CNIS
  const docs = await p.query(
    `SELECT d.id, d.title, 
       (SELECT COUNT(*)::int FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
     FROM documents d
     JOIN agents a ON d.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais' AND a.user_id IS NULL
     ORDER BY d.title`
  );
  console.log('\n=== DOCUMENTOS INGERIDOS (tabela documents):', docs.rowCount, '===\n');
  for (const d of docs.rows) {
    console.log('  [' + d.chunk_count + ' chunks] ' + d.title);
  }

  // 3) Amostrar chunks por palavra-chave para cada URL esperada
  const expectedUrls = [
    'planalto.gov.br/ccivil_03/leis/l8213',
    'planalto.gov.br/ccivil_03/decreto/d3048',
    'instrucao-normativa-pres/inss-n-128',
    'portalin.inss.gov.br/portaria990',
    'portaria-dirben/inss-n-1.326',
    'legisweb.com.br/legislacao',
    'portaria-dirben/inss-n-1.251',
    'portalin.inss.gov.br/anexos',
    'portaria-dirben/inss-n-1.321',
    'portaria-dirben/inss-n-1.323',
    'portalin.inss.gov.br/portaria993',
    'PortariaConjuntaMPSINSSn3',
  ];

  console.log('\n=== BUSCA POR CONTEÚDO DE CADA URL ===\n');
  for (const urlPart of expectedUrls) {
    // Buscar no título dos documents
    const r = await p.query(
      `SELECT COUNT(*)::int as cnt FROM documents d
       JOIN agents a ON d.agent_id = a.id
       WHERE a.title = 'Cadastro Nacional de Informações Sociais' AND a.user_id IS NULL
         AND d.title ILIKE $1`,
      ['%' + urlPart + '%']
    );
    const emoji = r.rows[0].cnt > 0 ? '✅' : '❌';
    console.log('  ' + emoji + ' [' + r.rows[0].cnt + ' docs] ' + urlPart);
  }

  // 4) Buscar especificamente "indicador" + "pendência" nos chunks
  const indic = await p.query(
    `SELECT LEFT(dc.content, 600) as preview FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais' AND a.user_id IS NULL
       AND dc.content ILIKE '%indicador%' AND dc.content ILIKE '%pend%'
     LIMIT 5`
  );
  console.log('\n=== INDICADORES + PENDÊNCIA:', indic.rowCount, 'chunks ===\n');
  for (const row of indic.rows) {
    console.log('---\n' + row.preview + '\n');
  }

  // 5) Buscar "Art. 17" na IN 128
  const art17 = await p.query(
    `SELECT LEFT(dc.content, 600) as preview FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais' AND a.user_id IS NULL
       AND dc.content ILIKE '%Art. 17%'
     LIMIT 5`
  );
  console.log('\n=== Art. 17 (onde indicadores são definidos):', art17.rowCount, 'chunks ===\n');
  for (const row of art17.rows) {
    console.log('---\n' + row.preview + '\n');
  }

  // 6) Buscar "Portaria 990" nos chunks (ver se conteúdo real existe)
  const p990 = await p.query(
    `SELECT LEFT(dc.content, 400) as preview FROM document_chunks dc
     JOIN agents a ON dc.agent_id = a.id
     WHERE a.title = 'Cadastro Nacional de Informações Sociais' AND a.user_id IS NULL
       AND dc.content ILIKE '%Portaria%990%'
     LIMIT 3`
  );
  console.log('\n=== Portaria 990 nos chunks:', p990.rowCount, '===\n');
  for (const row of p990.rows) {
    console.log('---\n' + row.preview + '\n');
  }

  await p.end();
}

run().catch(async (e) => { console.error(e.message); await p.end(); process.exit(1); });
