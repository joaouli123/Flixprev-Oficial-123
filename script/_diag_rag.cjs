/**
 * Diagnostic: test RAG retrieval for failing agents
 * Checks similarity scores and context returned for real queries
 */
const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const TEST_QUERIES = [
  { agentTitle: 'Salário-Maternidade', query: 'o que é salário maternidade' },
  { agentTitle: 'Salário-Maternidade', query: 'quanto tempo de contribuição preciso para receber salário maternidade' },
  { agentTitle: 'Processo Administrativo Previdenciário', query: 'quais são as fases do processo administrativo previdenciário' },
  { agentTitle: 'Ações Civis Públicas INSS', query: 'lista completa das ações civis públicas' },
];

async function diagnose() {
  for (const test of TEST_QUERIES) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`AGENTE: ${test.agentTitle}`);
    console.log(`QUERY:  ${test.query}`);
    console.log('='.repeat(80));

    // 1. Find agent
    const agentRes = await pool.query(
      "SELECT id, title, length(instructions) as instr_len FROM agents WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1",
      [test.agentTitle]
    );
    if (!agentRes.rowCount) { console.log('  [ERRO] Agente não encontrado!'); continue; }
    const agent = agentRes.rows[0];
    console.log(`  Agent ID: ${agent.id}`);
    console.log(`  Instructions length: ${agent.instr_len} chars`);

    // 2. Count chunks
    const chunkCount = await pool.query(
      "SELECT count(*) as n FROM document_chunks WHERE agent_id = $1",
      [agent.id]
    );
    console.log(`  Total chunks: ${chunkCount.rows[0].n}`);

    // 3. Generate query embedding
    const embRes = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
      input: test.query,
    });
    const queryVec = embRes.data[0].embedding;
    console.log(`  Query embedding dim: ${queryVec.length}`);

    // 4. Vector search - top 5 with similarity scores
    const searchRes = await pool.query(
      `SELECT content, chunk_index, 1 - (embedding <=> $2::vector) as similarity
       FROM document_chunks WHERE agent_id = $1
       ORDER BY embedding <=> $2::vector LIMIT 5`,
      [agent.id, JSON.stringify(queryVec)]
    );

    console.log(`\n  TOP 5 CHUNKS (similarity scores):`);
    for (const row of searchRes.rows) {
      const preview = row.content.substring(0, 150).replace(/\n/g, ' ');
      console.log(`    [sim=${row.similarity.toFixed(4)}] ${preview}...`);
    }

    // 5. Check if best similarity passes threshold (0.35)
    const bestSim = searchRes.rows[0]?.similarity ?? 0;
    if (bestSim < 0.35) {
      console.log(`\n  ⚠️  BEST SIMILARITY ${bestSim.toFixed(4)} < 0.35 THRESHOLD → CONTEXT WILL BE EMPTY!`);
    } else {
      console.log(`\n  ✓  Best similarity ${bestSim.toFixed(4)} >= 0.35 → context will be used`);
    }

    // 6. Check keyword fallback
    const keywords = test.query.match(/[A-ZÁÉÍÓÚ][a-zàéíóúç]+/g) || [];
    if (keywords.length > 0) {
      const kwRes = await pool.query(
        "SELECT count(*) as n FROM document_chunks WHERE agent_id = $1 AND content ILIKE $2",
        [agent.id, `%${keywords[0]}%`]
      );
      console.log(`  Keyword fallback "${keywords[0]}": ${kwRes.rows[0].n} matching chunks`);
    }

    // 7. Check if chunk has [AGENTE:] prefix
    const prefixCheck = await pool.query(
      "SELECT content FROM document_chunks WHERE agent_id = $1 LIMIT 1",
      [agent.id]
    );
    const hasPrefix = prefixCheck.rows[0]?.content?.startsWith('[AGENTE:');
    console.log(`  Chunks have [AGENTE:] prefix: ${hasPrefix}`);
  }

  await pool.end();
}

diagnose().catch(e => { console.error(e); pool.end(); });
