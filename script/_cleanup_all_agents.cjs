/**
 * _cleanup_all_agents.cjs — Limpeza em massa de todos os agentes
 * 
 * Executa:
 * 1. Remove documentos com 0 chunks (portalin vazios)
 * 2. Remove documentos placeholder portalin com 1 chunk inútil
 * 3. Remove documentos duplicados (mantém o que tem mais chunks)
 * 
 * Usage: node script/_cleanup_all_agents.cjs
 * Dry-run: node script/_cleanup_all_agents.cjs --dry
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const DRY_RUN = process.argv.includes('--dry');

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  LIMPEZA DE AGENTES ${DRY_RUN ? '(DRY RUN — sem alterações)' : '(EXECUÇÃO REAL)'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get all agents
  const agentsRes = await pool.query(`
    SELECT a.id, a.title,
           (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id)::int as chunks
    FROM agents a WHERE a.user_id IS NULL ORDER BY a.title
  `);

  let totalEmptyRemoved = 0;
  let totalPlaceholderRemoved = 0;
  let totalDuplicateRemoved = 0;
  let totalChunksRemoved = 0;

  for (const agent of agentsRes.rows) {
    const docsRes = await pool.query(`
      SELECT d.id, d.title,
             (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id)::int as chunks
      FROM documents d WHERE d.agent_id = $1
      ORDER BY d.title, d.created_at
    `, [agent.id]);

    if (!docsRes.rowCount) continue;

    let agentProblems = 0;

    // ─── 1) Remove docs with 0 chunks ───
    const emptyDocs = docsRes.rows.filter(d => d.chunks === 0);
    if (emptyDocs.length > 0) {
      for (const d of emptyDocs) {
        if (!DRY_RUN) {
          await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [d.id]);
          await pool.query('DELETE FROM documents WHERE id = $1', [d.id]);
        }
        totalEmptyRemoved++;
        agentProblems++;
      }
    }

    // ─── 2) Remove portalin placeholder docs (1 chunk with useless content) ───
    const portalinDocs = docsRes.rows.filter(d =>
      /portalin\.inss\.gov\.br/i.test(d.title) && d.chunks > 0 && d.chunks <= 2
    );
    for (const d of portalinDocs) {
      const contentCheck = await pool.query(
        "SELECT content FROM document_chunks WHERE document_id = $1 LIMIT 1", [d.id]
      );
      if (contentCheck.rows[0] && /conteúdo textual reduzido|FONTE:.*OBS:/i.test(contentCheck.rows[0].content)) {
        if (!DRY_RUN) {
          await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [d.id]);
          await pool.query('DELETE FROM documents WHERE id = $1', [d.id]);
        }
        totalPlaceholderRemoved++;
        totalChunksRemoved += d.chunks;
        agentProblems++;
      }
    }

    // ─── 3) Remove duplicate documents (keep the one with the most chunks, or first created) ───
    const remaining = docsRes.rows.filter(d => {
      // exclude already deleted
      const wasEmpty = emptyDocs.some(e => e.id === d.id);
      const wasPlaceholder = portalinDocs.some(p => p.id === d.id);
      return !wasEmpty && !wasPlaceholder;
    });

    const titleMap = {};
    for (const d of remaining) {
      if (!titleMap[d.title]) {
        titleMap[d.title] = [];
      }
      titleMap[d.title].push(d);
    }

    for (const [title, docs] of Object.entries(titleMap)) {
      if (docs.length <= 1) continue;
      
      // Sort: most chunks first, then by id (keep the first one)
      docs.sort((a, b) => b.chunks - a.chunks);
      const keep = docs[0];
      
      for (let i = 1; i < docs.length; i++) {
        const dup = docs[i];
        if (!DRY_RUN) {
          await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [dup.id]);
          await pool.query('DELETE FROM documents WHERE id = $1', [dup.id]);
        }
        totalDuplicateRemoved++;
        totalChunksRemoved += dup.chunks;
        agentProblems++;
      }
    }

    if (agentProblems > 0) {
      console.log(`  🧹 ${agent.title}: ${agentProblems} problems fixed`);
    }
  }

  // Final summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  LIMPEZA CONCLUÍDA ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`  Documentos vazios removidos:      ${totalEmptyRemoved}`);
  console.log(`  Placeholders portalin removidos:   ${totalPlaceholderRemoved}`);
  console.log(`  Documentos duplicados removidos:   ${totalDuplicateRemoved}`);
  console.log(`  Total chunks removidos:            ${totalChunksRemoved}`);
  console.log(`  Total documentos removidos:        ${totalEmptyRemoved + totalPlaceholderRemoved + totalDuplicateRemoved}\n`);

  // Post-cleanup verification
  if (!DRY_RUN) {
    console.log('📊 Estado pós-limpeza:\n');
    const postRes = await pool.query(`
      SELECT a.title,
             (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id)::int as chunks,
             (SELECT count(*) FROM documents d WHERE d.agent_id = a.id)::int as docs
      FROM agents a WHERE a.user_id IS NULL ORDER BY a.title
    `);
    for (const a of postRes.rows) {
      const warn = a.chunks < 50 ? ' ⚠️ POUCOS CHUNKS' : '';
      console.log(`   ${a.title}: ${a.chunks} chunks, ${a.docs} docs${warn}`);
    }
  }

  await pool.end();
}

main().catch(e => { console.error('[FATAL]', e.message); pool.end(); process.exit(1); });
