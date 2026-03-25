// _test_humano_trabalhista.cjs - Teste humano dos 6 agentes trabalhistas
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const EMBED_DELAY_MS = 3000;
const TOP_K = 25;
const SIM_THRESHOLD = 0.35;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const TESTS = [
  // DirTrab (3)
  { agent: 'Agente DirTrab', level: 'basico', q: 'Qual o prazo maximo do aviso previo proporcional?' },
  { agent: 'Agente DirTrab', level: 'medio', q: 'Quais as diferencas entre rescisao por acordo mutuo e pedido de demissao apos a Reforma Trabalhista?' },
  { agent: 'Agente DirTrab', level: 'avancado', q: 'Como funciona o banco de horas individual e coletivo segundo a CLT reformada?' },

  // AtosTr (3)
  { agent: 'Agente AtosTr', level: 'basico', q: 'O que e a Instrucao Normativa 39 do TST?' },
  { agent: 'Agente AtosTr', level: 'medio', q: 'Qual a diferenca entre ato da presidencia e ato regimental do TST?' },
  { agent: 'Agente AtosTr', level: 'avancado', q: 'O que regulamenta a IN 41/2018 do TST sobre a Reforma Trabalhista?' },

  // NR.sPro (3)
  { agent: 'Agente NR.sPro', level: 'basico', q: 'O que e o PGR e qual NR o regulamenta?' },
  { agent: 'Agente NR.sPro', level: 'medio', q: 'Qual a diferenca entre adicional de insalubridade e periculosidade?' },
  { agent: 'Agente NR.sPro', level: 'avancado', q: 'A partir de quantos metros se configura trabalho em altura e quais os requisitos da NR-35?' },

  // PrecedentX (3)
  { agent: 'Agente PrecedentX', level: 'basico', q: 'Qual o indice de correcao monetaria dos creditos trabalhistas fixado pelo STF?' },
  { agent: 'Agente PrecedentX', level: 'medio', q: 'A Administracao Publica responde subsidiariamente por debitos trabalhistas de terceirizados?' },
  { agent: 'Agente PrecedentX', level: 'avancado', q: 'Os dias parados em greve podem ser descontados do salario segundo o STF?' },

  // JurisPrud (3)
  { agent: 'Agente JurisPrud', level: 'basico', q: 'Motorista de aplicativo tem vinculo de emprego segundo a jurisprudencia?' },
  { agent: 'Agente JurisPrud', level: 'medio', q: 'Qual o entendimento jurisprudencial sobre assedio moral e indenizacao?' },
  { agent: 'Agente JurisPrud', level: 'avancado', q: 'A dispensa coletiva exige negociacao sindical previa segundo o STF?' },

  // SúmulasCore (3) - use LIKE for title match
  { agent: '%mulasCore%', level: 'basico', q: 'Qual a sumula do TST sobre estabilidade da gestante?' },
  { agent: '%mulasCore%', level: 'medio', q: 'A Sumula 331 do TST ainda e aplicavel apos a liberacao da terceirizacao?' },
  { agent: '%mulasCore%', level: 'avancado', q: 'Qual o prazo de prescricao do FGTS segundo a Sumula 461 do TST?' },
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

async function askAgent(agentTitle, question) {
  // Get agent
  const isLike = agentTitle.includes('%');
  const agRow = isLike
    ? await pool.query("SELECT id, title, instructions FROM agents WHERE user_id IS NULL AND title LIKE $1", [agentTitle])
    : await pool.query("SELECT id, title, instructions FROM agents WHERE user_id IS NULL AND title = $1", [agentTitle]);

  if (!agRow.rows.length) return { answer: '[AGENTE NAO ENCONTRADO]', chunks: 0 };
  const agent = agRow.rows[0];

  // Embed question
  const qEmb = await embed(question);
  await sleep(EMBED_DELAY_MS);

  // Vector search
  const searchRes = await pool.query(`
    SELECT content, 1 - (embedding <=> $1::vector) AS similarity
    FROM document_chunks
    WHERE agent_id = $2 AND 1 - (embedding <=> $1::vector) > $3
    ORDER BY similarity DESC
    LIMIT $4
  `, [JSON.stringify(qEmb), agent.id, SIM_THRESHOLD, TOP_K]);

  const context = searchRes.rows.map(r => r.content).join('\n\n');

  // Build prompt
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
  console.log('\n' + '='.repeat(60));
  console.log('  TESTE HUMANO - 6 AGENTES TRABALHISTAS (18 perguntas)');
  console.log('='.repeat(60) + '\n');

  let pass = 0;
  let fail = 0;

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    console.log(`[${i + 1}/${TESTS.length}] ${t.agent} | ${t.level} | ${t.q}`);
    try {
      const { answer, chunks } = await askAgent(t.agent, t.q);
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

  console.log('='.repeat(60));
  console.log(`  RESULTADO: ${pass}/${TESTS.length} PASS | ${fail} FAIL`);
  console.log('='.repeat(60) + '\n');

  await pool.end();
}

main().catch(async e => { console.error(e); await pool.end(); process.exit(1); });
