/**
 * _test_humano_previd.cjs
 *
 * Teste de perguntas humanas (basico, medio, avancado)
 * para validar qualidade de resposta dos agentes previdenciarios.
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TOP_K = 25;
const SIM_THRESHOLD = 0.35;

const TESTS = [
  {
    agentLike: 'Processo Administrativo Previdenci',
    label: 'PAP',
    questions: [
      { level: 'Basico', q: 'Meu pedido foi negado e eu nao entendi nada. O que eu faco primeiro?' },
      { level: 'Basico', q: 'Recebi exigencia no Meu INSS. Isso quer dizer que ja foi indeferido?' },
      { level: 'Medio', q: 'Qual a diferenca pratica entre exigencia mal feita e exigencia bem feita no processo administrativo?' },
      { level: 'Medio', q: 'Posso juntar documento novo no recurso administrativo ou perdi a chance?' },
      { level: 'Avancado', q: 'Como estruturar um recurso administrativo tecnico para atacar os fundamentos do indeferimento?' },
      { level: 'Avancado', q: 'No PAP, como evitar decisao surpresa e garantir contraditorio efetivo?' },
    ]
  },
  {
    agentLike: 'Manutenção de Benefícios',
    label: 'Manutencao',
    questions: [
      { level: 'Basico', q: 'Meu beneficio foi suspenso. Isso e a mesma coisa que cancelado?' },
      { level: 'Basico', q: 'Minha mae e acamada. Como eu consigo resolver com procuracao ou curatela?' },
      { level: 'Medio', q: 'Como funciona reativacao de beneficio suspenso na pratica?' },
      { level: 'Medio', q: 'Descobri desconto estranho no beneficio. Qual caminho administrativo certo?' },
      { level: 'Avancado', q: 'Quais erros administrativos mais comuns em manutencao geram indeferimento indevido?' },
    ]
  },
  {
    agentLike: 'Cadastro Nacional de Informações Sociais',
    label: 'CNIS',
    questions: [
      { level: 'Basico', q: 'No meu CNIS apareceu pendencia. Isso quer dizer que perdi meu direito?' },
      { level: 'Medio', q: 'Qual a diferenca entre indicador de pendencia, alerta e acerto no CNIS?' },
      { level: 'Avancado', q: 'Como tratar contribuicao abaixo do minimo depois da EC 103 sem perder carencia?' },
    ]
  }
];

async function getEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] }
      })
    }
  );
  const data = await resp.json();
  return data.embedding.values;
}

async function askAgent(agent, question) {
  const apiKey = process.env.GEMINI_API_KEY;
  const emb = await getEmbedding(question);
  const vec = `[${emb.join(',')}]`;

  const sr = await pool.query(
    `SELECT content, 1-(embedding <=> $1::vector) AS similarity
     FROM document_chunks WHERE agent_id = $2
     ORDER BY embedding <=> $1::vector LIMIT $3`,
    [vec, agent.id, TOP_K]
  );

  const best = sr.rows.length ? Number(sr.rows[0].similarity) : 0;
  if (best < SIM_THRESHOLD) {
    return { best, answer: 'Nao localizei essa informacao na base normativa deste agente.' };
  }

  const context = sr.rows.map(r => r.content).join('\n\n---\n\n');
  const prompt = `Voce e um assistente juridico previdenciario especialista no tema: ${agent.title}.\n\n` +
    `${agent.instructions || ''}\n\n` +
    `Responda em linguagem humana e clara, sem perder precisao tecnica.\n` +
    `Use apenas o contexto abaixo. Se faltar dado, diga que nao encontrou.\n\n` +
    `CONTEXTO:\n${context}\n\nPERGUNTA: ${question}`;

  const chatResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 512 }
      }),
      signal: AbortSignal.timeout(120000)
    }
  );
  const chatData = await chatResp.json();
  const answer = chatData?.candidates?.[0]?.content?.parts?.[0]?.text ||
    `ERRO: ${JSON.stringify(chatData).slice(0, 300)}`;

  return { best, answer };
}

async function main() {
  console.log('==============================================');
  console.log(' TESTE HUMANO PREVIDENCIARIO (B/M/A)');
  console.log('==============================================\n');

  for (const suite of TESTS) {
    const ar = await pool.query(
      'SELECT id, title, instructions FROM agents WHERE user_id IS NULL AND lower(title) LIKE lower($1) LIMIT 1',
      [`%${suite.agentLike}%`]
    );
    if (!ar.rowCount) {
      console.log(`\n[${suite.label}] Agente nao encontrado\n`);
      continue;
    }
    const agent = ar.rows[0];

    console.log(`\n##################################################`);
    console.log(`[${suite.label}] ${agent.title}`);
    console.log('##################################################');

    for (const item of suite.questions) {
      const r = await askAgent(agent, item.q);
      console.log(`\n[${item.level}] Pergunta: ${item.q}`);
      console.log(`Similaridade: ${r.best.toFixed(4)}`);
      console.log(`Resposta: ${String(r.answer).replace(/\s+/g, ' ').trim().slice(0, 900)}`);
    }
  }

  await pool.end();
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  pool.end();
  process.exit(1);
});
