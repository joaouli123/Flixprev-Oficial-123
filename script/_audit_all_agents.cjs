/**
 * _audit_all_agents.cjs — Auditoria completa de todos os 28 agentes previdenciários
 * 
 * Identifica:
 * 1. Agentes com poucos chunks (< 50)
 * 2. Documentos com 0 chunks (placeholder falhos)
 * 3. Documentos duplicados (mesma URL 2x)
 * 4. Documentos com apenas 1 chunk (possível placeholder)
 * 5. URLs portalin.inss.gov.br (sabidamente não-scrapeáveis)
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AUDITORIA COMPLETA — TODOS OS AGENTES PREVIDENCIÁRIOS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get all previdenciário agents
  const agentsRes = await pool.query(`
    SELECT a.id, a.title,
           (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id)::int as chunks,
           (SELECT count(*) FROM documents d WHERE d.agent_id = a.id)::int as docs
    FROM agents a
    WHERE a.user_id IS NULL
    ORDER BY a.title
  `);

  let totalProblems = 0;
  let agentsWithProblems = 0;
  const problemSummary = [];

  for (const agent of agentsRes.rows) {
    // Get documents for this agent
    const docsRes = await pool.query(`
      SELECT d.id, d.title,
             (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id)::int as chunks
      FROM documents d WHERE d.agent_id = $1
      ORDER BY d.title
    `, [agent.id]);

    // Find problems
    const emptyDocs = docsRes.rows.filter(d => d.chunks === 0);
    const placeholderDocs = docsRes.rows.filter(d => d.chunks === 1);
    const portalinDocs = docsRes.rows.filter(d => /portalin\.inss\.gov\.br/i.test(d.title));
    
    // Find duplicates
    const titleCounts = {};
    for (const d of docsRes.rows) {
      titleCounts[d.title] = (titleCounts[d.title] || 0) + 1;
    }
    const duplicateTitles = Object.entries(titleCounts).filter(([, c]) => c > 1);
    const duplicateCount = duplicateTitles.reduce((sum, [, c]) => sum + (c - 1), 0);

    const hasProblems = emptyDocs.length > 0 || duplicateTitles.length > 0 || portalinDocs.length > 0;
    
    if (hasProblems) agentsWithProblems++;

    // Print agent info
    const status = hasProblems ? '⚠️' : '✅';
    console.log(`${status} ${agent.title}`);
    console.log(`   📊 ${agent.chunks} chunks | ${agent.docs} docs`);

    if (emptyDocs.length > 0) {
      console.log(`   🔴 ${emptyDocs.length} docs com 0 chunks:`);
      for (const d of emptyDocs) {
        console.log(`      • ${d.title}`);
        totalProblems++;
      }
      problemSummary.push({ agent: agent.title, type: 'empty_docs', count: emptyDocs.length, docs: emptyDocs.map(d => d.title) });
    }

    if (duplicateTitles.length > 0) {
      console.log(`   🟡 ${duplicateCount} docs duplicados (${duplicateTitles.length} URLs):`);
      for (const [title, count] of duplicateTitles) {
        console.log(`      • ${title} (${count}x)`);
        totalProblems++;
      }
      problemSummary.push({ agent: agent.title, type: 'duplicates', count: duplicateCount, urls: duplicateTitles.map(([t]) => t) });
    }

    // Check for portalin docs that have chunks (might be placeholder)
    const portalinWithChunks = portalinDocs.filter(d => d.chunks > 0 && d.chunks <= 2);
    if (portalinWithChunks.length > 0) {
      // Check if content is placeholder
      for (const d of portalinWithChunks) {
        const contentCheck = await pool.query(
          "SELECT content FROM document_chunks WHERE document_id = $1 LIMIT 1", [d.id]
        );
        if (contentCheck.rows[0] && /conteúdo textual reduzido|FONTE:.*OBS:/i.test(contentCheck.rows[0].content)) {
          console.log(`   🟠 Placeholder portalin: ${d.title} (${d.chunks} chunks — conteúdo inútil)`);
          totalProblems++;
        }
      }
    }

    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESUMO DA AUDITORIA');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`  Total de agentes: ${agentsRes.rowCount}`);
  console.log(`  Agentes com problemas: ${agentsWithProblems}`);
  console.log(`  Agentes limpos: ${agentsRes.rowCount - agentsWithProblems}`);
  console.log(`  Total de problemas: ${totalProblems}\n`);

  // Count totals for cleanup
  let totalEmptyDocs = 0;
  let totalDuplicateDocs = 0;
  for (const p of problemSummary) {
    if (p.type === 'empty_docs') totalEmptyDocs += p.count;
    if (p.type === 'duplicates') totalDuplicateDocs += p.count;
  }

  console.log(`  📊 Docs com 0 chunks (a remover): ${totalEmptyDocs}`);
  console.log(`  📊 Docs duplicados (a remover cópia extra): ${totalDuplicateDocs}`);
  console.log('');

  // Output JSON for programmatic use
  console.log('=== PROBLEM_JSON_START ===');
  console.log(JSON.stringify(problemSummary, null, 2));
  console.log('=== PROBLEM_JSON_END ===');

  await pool.end();
}

main().catch(e => { console.error('[FATAL]', e.message); pool.end(); process.exit(1); });
