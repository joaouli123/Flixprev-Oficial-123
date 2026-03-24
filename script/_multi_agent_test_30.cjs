const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

/* ─── 30 perguntas distribuídas entre agentes-chave ─── */
const TESTS = [
  // Regime Próprio de Previdência Social (reparado)
  { agent: 'Regime Próprio de Previdência Social', q: 'Quais são as principais diferenças entre o RGPS e o RPPS?' },
  { agent: 'Regime Próprio de Previdência Social', q: 'Quais servidores têm direito ao RPPS conforme a Constituição?' },
  { agent: 'Regime Próprio de Previdência Social', q: 'Como funciona a aposentadoria compulsória no RPPS?' },
  { agent: 'Regime Próprio de Previdência Social', q: 'Quais são as regras de transição da EC 103/2019 para servidores do RPPS?' },
  { agent: 'Regime Próprio de Previdência Social', q: 'Como é calculada a pensão por morte no RPPS após a reforma?' },

  // Carência e Qualidade de Segurado (reparado)
  { agent: 'Carência e Qualidade de Segurado', q: 'Qual o período de carência para aposentadoria por idade?' },
  { agent: 'Carência e Qualidade de Segurado', q: 'Como funciona o período de graça do segurado desempregado?' },
  { agent: 'Carência e Qualidade de Segurado', q: 'Quais benefícios não exigem carência?' },
  { agent: 'Carência e Qualidade de Segurado', q: 'Como é feita a contagem de carência por meses de contribuição efetivos?' },
  { agent: 'Carência e Qualidade de Segurado', q: 'Quando se perde a qualidade de segurado e quais as consequências?' },

  // BPC (reparado)
  { agent: 'Benefício de Prestação Continuada - Idoso e Pessoa com Deficiência', q: 'Qual a renda per capita máxima para concessão do BPC-LOAS?' },
  { agent: 'Benefício de Prestação Continuada - Idoso e Pessoa com Deficiência', q: 'Como é feita a avaliação da deficiência para fins de BPC?' },
  { agent: 'Benefício de Prestação Continuada - Idoso e Pessoa com Deficiência', q: 'O BPC pode ser acumulado com outro benefício previdenciário?' },

  // Assistência Social (reparado)
  { agent: 'Assistência Social', q: 'Quais são os benefícios eventuais da assistência social?' },
  { agent: 'Assistência Social', q: 'Qual a diferença entre o BPC e os programas de transferência de renda?' },

  // CNIS (reparado)
  { agent: 'Cadastro Nacional de Informações Sociais', q: 'Como retificar informações incorretas no CNIS?' },
  { agent: 'Cadastro Nacional de Informações Sociais', q: 'Quais informações constam no CNIS do segurado?' },
  { agent: 'Cadastro Nacional de Informações Sociais', q: 'Qual o valor probatório do CNIS para contagem de tempo?' },

  // Revisão de Benefícios
  { agent: 'Revisão de Benefícios', q: 'Qual o prazo decadencial para pedir revisão de benefício previdenciário?' },
  { agent: 'Revisão de Benefícios', q: 'O que é a revisão da vida toda e qual seu fundamento legal?' },
  { agent: 'Revisão de Benefícios', q: 'Quando cabe revisão do ato de concessão pelo INSS de ofício?' },

  // Conselho de Recursos da Previdência Social (parcial)
  { agent: 'Conselho de Recursos da Previdência Social', q: 'Qual a composição e competência do CRPS?' },
  { agent: 'Conselho de Recursos da Previdência Social', q: 'Como funciona o rito do recurso ordinário no CRPS?' },

  // Aposentadoria Especial
  { agent: 'Aposentadoria Especial', q: 'Quais agentes nocivos dão direito à aposentadoria especial de 15 anos?' },
  { agent: 'Aposentadoria Especial', q: 'Como comprovar exposição a agentes nocivos para aposentadoria especial?' },

  // Pensão por Morte
  { agent: 'Pensão por Morte', q: 'Quais dependentes têm direito à pensão por morte e em que ordem?' },
  { agent: 'Pensão por Morte', q: 'Qual a duração da pensão por morte para o cônjuge após a Lei 13.135/2015?' },

  // Aposentadoria por Incapacidade Permanente
  { agent: 'Aposentadoria por Incapacidade Permanente', q: 'Quais os requisitos para aposentadoria por incapacidade permanente?' },
  { agent: 'Aposentadoria por Incapacidade Permanente', q: 'Pode haver reavaliação periódica na aposentadoria por invalidez?' },

  // Auxílio por Incapacidade Temporária
  { agent: 'Auxílio por Incapacidade Temporária', q: 'Qual a carência e requisitos para o auxílio por incapacidade temporária?' },
];

const SIM_THRESHOLD = 0.35;

async function retry(fn, retries = 3, delay = 12000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries - 1) throw e;
      console.log(`   ⏳ retry ${i + 1}/${retries} após erro: ${e.message?.slice(0, 60)}...`);
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`  TESTE MULTI-AGENTE — ${TESTS.length} perguntas`);
  console.log(`════════════════════════════════════════════════════\n`);

  for (let i = 0; i < TESTS.length; i++) {
    const { agent: agentName, q } = TESTS[i];

    // buscar agente
    const agentRes = await pool.query(
      `SELECT id, title, instructions FROM agents
       WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1`,
      [agentName]
    );

    if (!agentRes.rowCount) {
      console.log(`[${i + 1}/${TESTS.length}] ❌ Agente não encontrado: ${agentName}\n`);
      failed++;
      results.push({ i: i + 1, agent: agentName, q, sim: 0, ok: false, reason: 'NOT_FOUND' });
      continue;
    }
    const agent = agentRes.rows[0];

    // gerar embedding da pergunta
    const emb = await retry(() => openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
      input: q,
    }));
    const vec = emb.data[0].embedding;

    // buscar contexto similar
    const search = await pool.query(
      `SELECT content, 1 - (embedding <=> $2::vector) as sim
       FROM document_chunks
       WHERE agent_id = $1
       ORDER BY embedding <=> $2::vector
       LIMIT 10`,
      [agent.id, JSON.stringify(vec)]
    );

    const best = Number(search.rows[0]?.sim || 0);
    const hasContext = best >= SIM_THRESHOLD;

    if (hasContext) passed++; else failed++;

    const context = hasContext
      ? search.rows.map(r => r.content).join('\n\n---\n\n').slice(0, 12000)
      : '';

    // gerar resposta
    let answer = '';
    if (hasContext) {
      const sys = [
        `Voce e um especialista em ${agentName}.`,
        'Responda somente com base no contexto documental fornecido.',
        'Se faltar base no contexto, diga claramente que nao localizou na base.',
        'Se houver base, cite fundamentos normativos de forma objetiva.',
        agent.instructions || ''
      ].join('\n\n');

      const chat = await retry(() => openai.chat.completions.create({
        model: process.env.CHAT_MODEL || 'gemini-2.5-flash',
        temperature: 0.2,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: `PERGUNTA:\n${q}\n\nCONTEXTO:\n${context}` },
        ],
      }));
      answer = (chat.choices?.[0]?.message?.content || '').replace(/\s+/g, ' ').trim();
    } else {
      answer = 'Não localizei essa informação na base normativa deste agente.';
    }

    const emoji = hasContext ? '✅' : '❌';
    console.log(`[${i + 1}/${TESTS.length}] ${emoji} sim=${best.toFixed(3)} | ${agentName}`);
    console.log(`   Q: ${q}`);
    console.log(`   A: ${answer.slice(0, 300)}${answer.length > 300 ? '...' : ''}\n`);

    results.push({ i: i + 1, agent: agentName, q, sim: best, ok: hasContext });

    // delay entre perguntas (evitar rate limit)
    await new Promise(r => setTimeout(r, 3000));
  }

  // ─── RESUMO POR AGENTE ───
  console.log('\n════════════════════════════════════════════════════');
  console.log('  RESUMO POR AGENTE');
  console.log('════════════════════════════════════════════════════\n');

  const byAgent = {};
  for (const r of results) {
    if (!byAgent[r.agent]) byAgent[r.agent] = { ok: 0, fail: 0, sims: [] };
    byAgent[r.agent].sims.push(r.sim);
    if (r.ok) byAgent[r.agent].ok++; else byAgent[r.agent].fail++;
  }

  for (const [name, d] of Object.entries(byAgent).sort((a, b) => a[1].ok / (a[1].ok + a[1].fail) - b[1].ok / (b[1].ok + b[1].fail))) {
    const avg = (d.sims.reduce((a, b) => a + b, 0) / d.sims.length).toFixed(3);
    const total = d.ok + d.fail;
    const pct = ((d.ok / total) * 100).toFixed(0);
    const bar = d.fail > 0 ? '❌' : '✅';
    console.log(`  ${bar} ${name}: ${d.ok}/${total} (${pct}%) avg_sim=${avg}`);
  }

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`  TOTAL: ${passed}/${TESTS.length} com contexto (${(passed / TESTS.length * 100).toFixed(1)}%)`);
  console.log(`  FALHAS: ${failed}/${TESTS.length}`);
  console.log(`════════════════════════════════════════════════════\n`);

  // listar perguntas que falharam
  const fails = results.filter(r => !r.ok);
  if (fails.length) {
    console.log('PERGUNTAS SEM CONTEXTO:');
    for (const f of fails) {
      console.log(`  [${f.i}] (sim=${f.sim.toFixed(3)}) ${f.agent}: ${f.q}`);
    }
  }

  await pool.end();
}

run().catch(async (e) => {
  console.error(e.message);
  await pool.end();
  process.exit(1);
});
