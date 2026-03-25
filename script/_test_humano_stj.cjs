// _test_humano_stj.cjs - Teste humano do agente STJSum
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const EMBED_DELAY_MS = 3000;
const TOP_K = 25;
const SIM_THRESHOLD = 0.35;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const TESTS = [
  { level: 'basico',   q: 'O que diz a Sumula 7 do STJ?' },
  { level: 'basico',   q: 'Pessoa juridica pode sofrer dano moral segundo o STJ?' },
  { level: 'medio',    q: 'Qual a sumula do STJ sobre aplicacao do CDC a instituicoes financeiras?' },
  { level: 'medio',    q: 'Inqueritos policiais em curso podem ser usados para agravar a pena-base?' },
  { level: 'avancado', q: 'Qual a diferenca entre sumula do STJ e sumula vinculante do STF?' },
  { level: 'avancado', q: 'O que diz a Sumula 435 do STJ sobre dissolucao irregular de empresa e execucao fiscal?' },
];

async function embed(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{ model: 'models/gemini-embedding-001', content: { parts: [{ text }] } }]
          }),
          signal: AbortSignal.timeout(30000),
        }
      );
      if (resp.status === 429) { await sleep(attempt * 10000); continue; }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      return data.embeddings[0].values;
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(attempt * 3000);
    }
  }
}

async function askAgent(question) {
  const agRow = await pool.query(
    "SELECT id, title, instructions FROM agents WHERE user_id IS NULL AND title = 'STJSum'"
  );
  if (!agRow.rows.length) return { answer: '[AGENTE NAO ENCONTRADO]', chunks: 0 };
  const agent = agRow.rows[0];

  const qEmb = await embed(question);
  await sleep(EMBED_DELAY_MS);

  const searchRes = await pool.query(`
    SELECT content, 1 - (embedding <=> $1::vector) AS similarity
    FROM document_chunks
    WHERE agent_id = $2 AND 1 - (embedding <=> $1::vector) > $3
    ORDER BY similarity DESC
    LIMIT $4
  `, [JSON.stringify(qEmb), agent.id, SIM_THRESHOLD, TOP_K]);

  const context = searchRes.rows.map(r => r.content).join('\n\n');
  const systemPrompt = (agent.instructions || '') + '\n\nCONTEXTO DA BASE:\n' + context;
  const apiKey = process.env.GEMINI_API_KEY;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!resp.ok) return { answer: '[HTTP ' + resp.status + ']', chunks: searchRes.rows.length };
  const data = await resp.json();
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '[SEM RESPOSTA]';
  return { answer, chunks: searchRes.rows.length };
}

async function main() {
  console.log('\n' + '='.repeat(55));
  console.log('  TESTE HUMANO - AGENTE STJSum (6 perguntas)');
  console.log('='.repeat(55) + '\n');

  let pass = 0, fail = 0;

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    console.log(`[${i + 1}/${TESTS.length}] ${t.level} | ${t.q}`);
    try {
      const { answer, chunks } = await askAgent(t.q);
      const short = answer.replace(/\n/g, ' ').slice(0, 200);
      const hasFora = /fora do (meu )?escopo/i.test(answer);
      const hasNaoLoc = /n[aã]o localizei/i.test(answer);
      const ok = !hasFora && !hasNaoLoc && answer.length > 50;
      if (ok) { pass++; console.log(`  PASS (${chunks} chunks) -> ${short}...`); }
      else { fail++; console.log(`  FAIL (${chunks} chunks) -> ${short}...`); }
    } catch (e) {
      fail++;
      console.log(`  ERROR -> ${e.message.slice(0, 100)}`);
    }
    console.log('');
    await sleep(2000);
  }

  console.log('='.repeat(55));
  console.log(`  RESULTADO: ${pass}/${TESTS.length} PASS | ${fail} FAIL`);
  console.log('='.repeat(55) + '\n');
  await pool.end();
}

main().catch(async e => { console.error(e); await pool.end(); process.exit(1); });
