const pkg = require('pg');
require('dotenv').config();
const pool = new pkg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const { rows } = await pool.query(`
    SELECT a.title, a.id,
      (SELECT count(*) FROM documents d WHERE d.agent_id = a.id)::int AS docs,
      (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id)::int AS chunks
    FROM agents a
    WHERE a.user_id IS NULL
    ORDER BY a.title
  `);
  console.log('=== ESTADO ATUAL DE TODOS OS AGENTES PREVIDENCIÁRIOS ===');
  let total_docs = 0, total_chunks = 0;
  for (const r of rows) {
    const flag = parseInt(r.chunks) < 50 ? ' ⚠️ POUCOS CHUNKS' : '';
    console.log(r.title.padEnd(55) + ' docs=' + String(r.docs).padStart(3) + '  chunks=' + String(r.chunks).padStart(5) + flag);
    total_docs += parseInt(r.docs);
    total_chunks += parseInt(r.chunks);
  }
  console.log('---');
  console.log('Total agentes:', rows.length);
  console.log('Total docs:', total_docs, '  Total chunks:', total_chunks);

  // Check PAP agent specifically - list its documents
  console.log('\n=== PAP - DOCUMENTOS ===');
  const pap = rows.find(r => r.title.includes('Processo Administrativo'));
  if (pap) {
    const { rows: papDocs } = await pool.query(`
      SELECT d.id, d.title, 
        (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id) AS chunks
      FROM documents d WHERE d.agent_id = $1 ORDER BY d.title
    `, [pap.id]);
    for (const d of papDocs) {
      console.log('  ' + String(d.chunks).padStart(4) + ' chunks  ' + d.title.substring(0, 100));
    }
  }

  // Check low-chunk agents
  console.log('\n=== AGENTES COM POUCOS CHUNKS - DETALHES ===');
  const lowChunkAgents = rows.filter(r => parseInt(r.chunks) < 50);
  for (const agent of lowChunkAgents) {
    console.log('\n--- ' + agent.title + ' (chunks=' + agent.chunks + ') ---');
    const { rows: docs } = await pool.query(`
      SELECT d.id, d.title,
        (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id) AS chunks
      FROM documents d WHERE d.agent_id = $1 ORDER BY d.title
    `, [agent.id]);
    for (const d of docs) {
      console.log('  ' + String(d.chunks).padStart(4) + ' chunks  ' + d.title.substring(0, 120));
    }
  }

  await pool.end();
})();
