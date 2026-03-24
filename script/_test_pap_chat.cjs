/**
 * _test_pap_chat.cjs — Testa pergunta do PAP que falhou
 * "quantos artigos a in128 possui?"
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const QUESTIONS = [
  'quantos artigos a in128 possui?',
];

const TOP_K = 25;
const SIM_THRESHOLD = 0.35;

async function testQuestion(question, agent) {
  console.log(`\n❓ Pergunta: "${question}"\n`);

  const apiKey = process.env.GEMINI_API_KEY;
  const embResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: question }] }
      })
    }
  );
  const embData = await embResp.json();
  const vec = '[' + embData.embedding.values.join(',') + ']';

  // Search
  const sr = await pool.query(
    `SELECT content, 1-(embedding <=> $1::vector) as similarity
     FROM document_chunks WHERE agent_id=$2
     ORDER BY embedding <=> $1::vector LIMIT $3`,
    [vec, agent.id, TOP_K]
  );

  const bestSim = sr.rows.length ? Number(sr.rows[0].similarity) : 0;
  console.log(`📊 Melhor similaridade: ${bestSim.toFixed(4)} (threshold: ${SIM_THRESHOLD})`);
  console.log(`📊 Chunks retornados: ${sr.rows.length}`);

  // Show top 5 chunks
  console.log('\n📋 Top 5 chunks:');
  for (let i = 0; i < Math.min(5, sr.rows.length); i++) {
    const r = sr.rows[i];
    console.log(`   ${i+1}. sim=${Number(r.similarity).toFixed(4)} — "${r.content.slice(0, 150)}..."`);
  }

  if (bestSim < SIM_THRESHOLD) {
    console.log('\n❌ Similaridade abaixo do threshold — agente diria "Não encontrei"');
    return;
  }

  // Check if any chunks mention article numbers or IN 128
  let in128Chunks = 0;
  let artChunks = 0;
  let maxArt = 0;
  for (const r of sr.rows) {
    if (/in\s*128|in128|instru..o\s*normativa\s*(?:pres\/inss\s*)?(?:n.?\s*)?128/i.test(r.content)) in128Chunks++;
    const artMatches = r.content.match(/Art\.\s*(\d+)/gi);
    if (artMatches) {
      artChunks++;
      for (const m of artMatches) {
        const num = parseInt(m.match(/\d+/)[0]);
        if (num > maxArt) maxArt = num;
      }
    }
  }
  console.log(`\n📊 Chunks mencionando IN 128: ${in128Chunks}`);
  console.log(`📊 Chunks com referência a artigos: ${artChunks}`);
  console.log(`📊 Maior número de artigo encontrado nos top-25: Art. ${maxArt}`);

  // Build context and call LLM
  const relevantContext = sr.rows.map(r => r.content).join('\n\n---\n\n');
  
  const systemPrompt = `Você é um assistente jurídico especialista em Direito Previdenciário Brasileiro, especificamente sobre o tema: ${agent.title}.

${agent.instructions || ''}

Use EXCLUSIVAMENTE o contexto documental abaixo para responder. Se a informação não estiver no contexto, diga que não encontrou na base.

CONTEXTO DOCUMENTAL:
${relevantContext}`;

  console.log(`\n📝 Prompt total: ${systemPrompt.length} chars`);
  console.log('🧠 Chamando Gemini...\n');

  const chatResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\nPERGUNTA DO USUÁRIO: ' + question }] }
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 }
      }),
      signal: AbortSignal.timeout(120000),
    }
  );

  const chatData = await chatResp.json();
  if (chatData.candidates && chatData.candidates[0]) {
    const answer = chatData.candidates[0].content.parts[0].text;
    console.log('═══════════════════════════════════════════════════');
    console.log('  💬 RESPOSTA:');
    console.log('═══════════════════════════════════════════════════\n');
    console.log(answer.slice(0, 2000));
    console.log('\n═══════════════════════════════════════════════════');
  } else {
    console.log('❌ Erro:', JSON.stringify(chatData).slice(0, 500));
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  TESTE PAP — Processo Administrativo Previdenciário');
  console.log('═══════════════════════════════════════════════════');

  // Find PAP agent
  const ar = await pool.query(
    "SELECT id, title, instructions FROM agents WHERE lower(title) LIKE '%processo administrativo previd%' AND user_id IS NULL LIMIT 1"
  );
  if (!ar.rowCount) { console.log('❌ Agente PAP não encontrado'); await pool.end(); return; }
  const agent = ar.rows[0];
  console.log(`\n🤖 Agente: ${agent.title}`);

  // Count chunks
  const cc = await pool.query('SELECT count(*) as c FROM document_chunks WHERE agent_id=$1', [agent.id]);
  console.log(`📊 Total chunks: ${cc.rows[0].c}`);

  // Count documents
  const dc = await pool.query(
    `SELECT d.title, (SELECT count(*) FROM document_chunks dc WHERE dc.document_id=d.id)::int as chunks
     FROM documents d WHERE d.agent_id=$1 ORDER BY d.title`, [agent.id]
  );
  console.log(`📊 Documentos: ${dc.rowCount}`);
  for (const d of dc.rows) {
    const isIN128 = /in128|in\s*128|instru.*128/i.test(d.title) ? ' ← IN128' : '';
    console.log(`   • ${d.title} (${d.chunks} chunks)${isIN128}`);
  }

  // Check: what's the highest article number in IN128 chunks?
  const in128Check = await pool.query(
    `SELECT dc.content FROM document_chunks dc
     JOIN documents d ON dc.document_id = d.id
     WHERE d.agent_id=$1 AND (lower(d.title) LIKE '%in128%' OR lower(d.title) LIKE '%128%')
     ORDER BY dc.chunk_index DESC LIMIT 3`, [agent.id]
  );
  if (in128Check.rowCount) {
    console.log('\n📋 Últimos chunks da IN128 (onde deveria estar o artigo mais alto):');
    for (const r of in128Check.rows) {
      const arts = r.content.match(/Art\.\s*(\d+)/gi) || [];
      const nums = arts.map(a => parseInt(a.match(/\d+/)[0]));
      const max = nums.length ? Math.max(...nums) : 0;
      console.log(`   Artigos encontrados: ${arts.slice(-5).join(', ')} (max: ${max})`);
      console.log(`   Trecho final: "...${r.content.slice(-200)}"\n`);
    }
  }

  for (const q of QUESTIONS) {
    await testQuestion(q, agent);
  }

  await pool.end();
}

main().catch(e => { console.error('[FATAL]', e.message); pool.end(); process.exit(1); });
