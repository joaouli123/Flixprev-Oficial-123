/**
 * _test_cnis_chat.cjs — Simula o fluxo real de chat do agente CNIS
 * Embed query → search top-K chunks → build prompt → call Gemini → print response
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const QUESTION = 'me mostre quais são os indicadores de pendencias, e seus significados';
const TOP_K = 25;
const SIM_THRESHOLD = 0.35;

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TESTE CHAT — Cadastro Nacional de Informações Sociais');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n❓ Pergunta: "${QUESTION}"\n`);

  // 1) Find agent
  const ar = await pool.query(
    "SELECT id, title, instructions FROM agents WHERE lower(title) LIKE '%cadastro nacional de informa%' AND user_id IS NULL LIMIT 1"
  );
  if (!ar.rowCount) { console.log('❌ Agente não encontrado'); return; }
  const agent = ar.rows[0];
  console.log(`🤖 Agente: ${agent.title}\n`);

  // 2) Embed query via Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  const embResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: QUESTION }] }
      })
    }
  );
  const embData = await embResp.json();
  const vec = '[' + embData.embedding.values.join(',') + ']';

  // 3) Search similar chunks (same as server searchSimilarChunks)
  const sr = await pool.query(
    `SELECT content, 1-(embedding <=> $1::vector) as similarity
     FROM document_chunks WHERE agent_id=$2
     ORDER BY embedding <=> $1::vector LIMIT $3`,
    [vec, agent.id, TOP_K]
  );

  const bestSim = sr.rows.length ? Number(sr.rows[0].similarity) : 0;
  console.log(`📊 Melhor similaridade: ${bestSim.toFixed(4)} (threshold: ${SIM_THRESHOLD})`);
  console.log(`📊 Chunks retornados: ${sr.rows.length}\n`);

  if (bestSim < SIM_THRESHOLD) {
    console.log('❌ Similaridade abaixo do threshold — o agente responderia "Não encontrei essa informação na base"');
    await pool.end();
    return;
  }

  // Show top 5 chunks similarity
  console.log('📋 Top 5 chunks:');
  for (let i = 0; i < Math.min(5, sr.rows.length); i++) {
    const r = sr.rows[i];
    console.log(`   ${i+1}. sim=${Number(r.similarity).toFixed(4)} — "${r.content.slice(0, 120)}..."`);
  }

  // 4) Build context (same as server mergedContext)
  const relevantContext = sr.rows.map(r => r.content).join('\n\n---\n\n');

  // 5) Build prompt (simplified version of buildPrompt)
  const systemPrompt = `Você é um assistente jurídico especialista em Direito Previdenciário Brasileiro, especificamente sobre o tema: ${agent.title}.

${agent.instructions || ''}

Use EXCLUSIVAMENTE o contexto documental abaixo para responder. Se a informação não estiver no contexto, diga que não encontrou na base.

CONTEXTO DOCUMENTAL:
${relevantContext}`;

  console.log(`\n📝 Prompt total: ${systemPrompt.length} chars`);
  console.log(`   Contexto: ${relevantContext.length} chars (${sr.rows.length} chunks)\n`);

  // 6) Call Gemini chat
  console.log('🧠 Chamando Gemini...\n');

  const chatResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\nPERGUNTA DO USUÁRIO: ' + QUESTION }] }
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 }
      }),
      signal: AbortSignal.timeout(120000),
    }
  );

  const chatData = await chatResp.json();

  if (chatData.candidates && chatData.candidates[0]) {
    const answer = chatData.candidates[0].content.parts[0].text;
    console.log('═══════════════════════════════════════════════════');
    console.log('  💬 RESPOSTA DO AGENTE:');
    console.log('═══════════════════════════════════════════════════\n');
    console.log(answer);
    console.log('\n═══════════════════════════════════════════════════');
  } else {
    console.log('❌ Erro na resposta do Gemini:', JSON.stringify(chatData).slice(0, 500));
  }

  await pool.end();
}

main().catch(e => { console.error('[FATAL]', e.message); pool.end(); process.exit(1); });
