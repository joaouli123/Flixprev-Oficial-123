const pkg = require('pg');
require('dotenv').config();
const pool = new pkg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  // Check PAP docs
  const pap = await pool.query("SELECT id FROM agents WHERE title LIKE '%Processo Administrativo%' LIMIT 1");
  const papId = pap.rows[0].id;
  const docs = await pool.query('SELECT title FROM documents WHERE agent_id = $1 ORDER BY title', [papId]);
  console.log('=== PAP DOCS ===');
  docs.rows.forEach(d => console.log('  ' + d.title));

  // Check portalin URLs across all agents
  console.log('\n=== PORTALIN DOCS EM TODOS OS AGENTES ===');
  const portalinDocs = await pool.query(`
    SELECT d.title, a.title as agent, 
      (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id)::int as chunks 
    FROM documents d JOIN agents a ON d.agent_id = a.id 
    WHERE d.title LIKE '%portalin%' ORDER BY d.title
  `);
  if (portalinDocs.rows.length === 0) {
    console.log('  NENHUM documento portalin encontrado no banco!');
  } else {
    portalinDocs.rows.forEach(d => console.log('  [' + d.agent + '] ' + d.title + ' (' + d.chunks + ' chunks)'));
  }

  // Check Manutenção docs
  console.log('\n=== MANUTENÇÃO DOCS ===');
  const manut = await pool.query("SELECT id FROM agents WHERE title LIKE '%Manutenção%' LIMIT 1");
  if (manut.rows.length) {
    const manutDocs = await pool.query('SELECT title FROM documents WHERE agent_id = $1 ORDER BY title', [manut.rows[0].id]);
    manutDocs.rows.forEach(d => console.log('  ' + d.title));
  }

  // Count how many common URL agents (2-18) have the 5 portalin common URLs
  console.log('\n=== PORTALIN URLs MISSING FROM COMMON-URL AGENTS ===');
  const portalinCommon = [
    'portaria990', 'portaria991', 'portaria993', 'portaria994'
  ];
  const commonAgents = await pool.query(`
    SELECT a.id, a.title FROM agents a WHERE a.user_id IS NULL 
    AND a.title NOT LIKE '%CNIS%' AND a.title NOT LIKE '%Cadastro%'
    ORDER BY a.title
  `);
  
  for (const url of portalinCommon) {
    const count = await pool.query(
      "SELECT count(DISTINCT d.agent_id)::int as c FROM documents d WHERE d.title LIKE $1",
      ['%' + url + '%']
    );
    console.log('  ' + url + ': exists in ' + count.rows[0].c + ' agents');
  }

  await pool.end();
})();
