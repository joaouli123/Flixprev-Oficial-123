/**
 * _test_humano_tributario.cjs
 *
 * Bateria de testes humanos para os 5 agentes tributários.
 * Nível: Básico / Médio / Avançado
 *
 * Uso:
 *   node script/_test_humano_tributario.cjs
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TOP_K = 25;
const SIM_THRESHOLD = 0.35;

const TESTS = [
  // ─── DTrib ───
  { agent: 'DTrib', level: 'BÁSICO',   q: 'Qual a diferença entre imposto e taxa?' },
  { agent: 'DTrib', level: 'MÉDIO',    q: 'O que são as imunidades tributárias previstas na Constituição?' },
  { agent: 'DTrib', level: 'AVANÇADO', q: 'Como funciona a execução fiscal pela Lei 6.830?' },

  // ─── CTN Expert ───
  { agent: 'CTN Expert', level: 'BÁSICO',   q: 'O que é lançamento tributário?' },
  { agent: 'CTN Expert', level: 'MÉDIO',    q: 'Quais são as causas de suspensão do crédito tributário?' },
  { agent: 'CTN Expert', level: 'AVANÇADO', q: 'Qual a diferença entre decadência e prescrição tributária e quais os prazos do CTN?' },

  // ─── REFIS-IA ───
  { agent: 'REFIS-IA', level: 'BÁSICO',   q: 'O que é o IBS e o que ele substitui?' },
  { agent: 'REFIS-IA', level: 'MÉDIO',    q: 'Como funciona o cronograma de transição da reforma tributária?' },
  { agent: 'REFIS-IA', level: 'AVANÇADO', q: 'O que é o split payment e o cashback tributário na reforma?' },

  // ─── TAX-Rend ───
  { agent: 'TAX-Rend', level: 'BÁSICO',   q: 'Quem ganha até R$ 5.000 por mês está isento de IR?' },
  { agent: 'TAX-Rend', level: 'MÉDIO',    q: 'Qual a diferença entre Lucro Real e Lucro Presumido no IRPJ?' },
  { agent: 'TAX-Rend', level: 'AVANÇADO', q: 'Quais deduções são permitidas na declaração anual do IRPF e quais seus limites?' },

  // ─── FedTax ───
  { agent: 'FedTax', level: 'BÁSICO',   q: 'Qual o código DARF para reter PIS/Cofins/CSLL na fonte?' },
  { agent: 'FedTax', level: 'MÉDIO',    q: 'Qual a diferença entre PIS cumulativo e não cumulativo?' },
  { agent: 'FedTax', level: 'AVANÇADO', q: 'Quais são os prazos de recolhimento dos principais tributos federais?' },
];

async function generateEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text }] }
        }]
      }),
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!resp.ok) throw new Error(`Embed HTTP ${resp.status}`);
  const data = await resp.json();
  return data.embeddings?.[0]?.values || null;
}

async function searchChunks(agentId, embedding) {
  const r = await pool.query(
    `SELECT content, 1 - (embedding <=> $1::vector) AS similarity
     FROM document_chunks
     WHERE agent_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(embedding), agentId, TOP_K]
  );
  return r.rows.filter(row => row.similarity >= SIM_THRESHOLD);
}

async function askGemini(systemPrompt, userQuestion, context) {
  const apiKey = process.env.GEMINI_API_KEY;
  const prompt = `${systemPrompt}\n\n--- DOCUMENTOS ENCONTRADOS ---\n${context}\n--- FIM DOS DOCUMENTOS ---\n\nPergunta do usuário: ${userQuestion}`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '(sem resposta)';
}

async function askAgent(agentTitle, question) {
  // Buscar agente
  const ag = await pool.query(
    `SELECT id, instructions FROM agents WHERE user_id IS NULL AND title = $1`,
    [agentTitle]
  );
  if (!ag.rows.length) return { answer: '(agente não encontrado)', chunks: 0 };

  const { id: agentId, instructions } = ag.rows[0];

  // Embed pergunta
  const emb = await generateEmbedding(question);
  if (!emb) return { answer: '(embedding falhou)', chunks: 0 };

  // Buscar chunks
  const results = await searchChunks(agentId, emb);
  if (!results.length) return { answer: '(0 chunks relevantes)', chunks: 0 };

  // Montar contexto (top 8 para não explodir token)
  const context = results.slice(0, 8).map((r, i) =>
    `[Doc ${i + 1}, sim=${r.similarity.toFixed(3)}]\n${r.content.substring(0, 800)}`
  ).join('\n\n');

  // Gerar resposta
  const answer = await askGemini(instructions, question, context);
  return { answer, chunks: results.length, topSim: results[0]?.similarity };
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' TESTE HUMANO – AGENTES TRIBUTÁRIOS (B / M / A)');
  console.log('══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const t of TESTS) {
    console.log(`\n─── [${t.level}] ${t.agent} ───`);
    console.log(`  Q: ${t.q}`);

    try {
      const { answer, chunks, topSim } = await askAgent(t.agent, t.q);
      const shortAnswer = answer.substring(0, 400);
      const isNaoLocalizei = /n.o (localizei|encontrei)/i.test(answer);

      console.log(`  Chunks: ${chunks} | Top sim: ${topSim?.toFixed(3) || 'N/A'}`);
      console.log(`  A: ${shortAnswer}${answer.length > 400 ? '...' : ''}`);

      if (isNaoLocalizei) {
        console.log(`  ⚠️  FALHA: resposta "não localizei"`);
        failed++;
      } else {
        console.log(`  ✅ OK`);
        passed++;
      }
    } catch (err) {
      console.log(`  ❌ ERRO: ${err.message.substring(0, 120)}`);
      failed++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 2500));
  }

  console.log(`\n═══ RESULTADO: ${passed}/${TESTS.length} passaram | ${failed} falharam ═══\n`);
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
