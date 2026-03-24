const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const QUESTIONS = [
  'Quais sao as fases do processo administrativo previdenciario no INSS?',
  'Qual o prazo para interpor recurso administrativo no INSS?',
  'Quando cabe pedido de reconsideracao no processo administrativo previdenciario?',
  'Qual a diferenca entre recurso ordinario e pedido de revisao no CRPS?',
  'Quais principios da Lei 9.784/99 se aplicam ao PAP?',
  'Como funciona o contraditorio e a ampla defesa no processo administrativo do INSS?',
  'O segurado tem direito a vista e copia dos autos? Em que base legal?',
  'Quais hipoteses de nulidade no processo administrativo previdenciario?',
  'Como e feita a intimacao do interessado no PAP?',
  'Quais sao os efeitos de recurso administrativo sem efeito suspensivo?',
  'Em quais casos o recurso administrativo tem efeito suspensivo no INSS?',
  'Qual o papel do CRPS no contencioso administrativo previdenciario?',
  'Quando cabe revisao de oficio de ato administrativo previdenciario?',
  'Qual o prazo decadencial para a administracao anular ato favoravel?',
  'Como funciona a motivacao dos atos no processo administrativo previdenciario?',
  'A administracao pode decidir sem ouvir o interessado? Quando?',
  'O que e preclusao administrativa no contexto do INSS?',
  'Quais documentos minimos para instruir recurso de beneficio indeferido?',
  'Como e contada a tempestividade de recurso no PAP?',
  'Quais sao as competencias das Juntas de Recursos e Camaras no CRPS?',
  'Qual o procedimento em caso de erro material em decisao administrativa?',
  'Como pedir producao de prova no processo administrativo previdenciario?',
  'A prova emprestada e admitida no PAP?',
  'Como funciona a prioridade de tramitacao para idosos e PCD no PAP?',
  'O INSS pode deixar de analisar argumento relevante do segurado?',
  'Quais fundamentos para alegar cerceamento de defesa no PAP?',
  'O que acontece se a decisao nao enfrentar todos os pedidos?',
  'Quais sao os limites da autotutela administrativa no INSS?',
  'Como articular Lei 9.784/99 com IN 128/2022 no processo administrativo?',
  'Monte um checklist pratico para protocolar recurso administrativo previdenciario forte.'
];

async function run() {
  const agentRes = await pool.query(
    `SELECT id, title, instructions FROM agents
     WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1`,
    ['Processo Administrativo Previdenciário']
  );
  if (!agentRes.rowCount) throw new Error('Agente PAP nao encontrado');
  const agent = agentRes.rows[0];

  let passed = 0;
  let failed = 0;

  console.log(`Agente: ${agent.title} (${agent.id})`);
  console.log(`Perguntas: ${QUESTIONS.length}\n`);

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const emb = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
      input: q,
    });
    const vec = emb.data[0].embedding;

    const search = await pool.query(
      `SELECT content, 1 - (embedding <=> $2::vector) as sim
       FROM document_chunks
       WHERE agent_id = $1
       ORDER BY embedding <=> $2::vector
       LIMIT 10`,
      [agent.id, JSON.stringify(vec)]
    );

    const best = Number(search.rows[0]?.sim || 0);
    const hasContext = best >= 0.35;
    if (hasContext) passed += 1; else failed += 1;

    const context = hasContext ? search.rows.map(r => r.content).join('\n\n---\n\n').slice(0, 12000) : '';

    const sys = [
      'Voce e um especialista em Processo Administrativo Previdenciario.',
      'Responda somente com base no contexto documental fornecido.',
      'Se faltar base no contexto, diga claramente que nao localizou na base.',
      'Se houver base, cite fundamentos normativos de forma objetiva.',
      agent.instructions || ''
    ].join('\n\n');

    let answer = '';
    if (hasContext) {
      const chat = await openai.chat.completions.create({
        model: process.env.CHAT_MODEL || 'gemini-2.5-flash',
        temperature: 0.2,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: `PERGUNTA:\n${q}\n\nCONTEXTO:\n${context}` },
        ],
      });
      answer = (chat.choices?.[0]?.message?.content || '').replace(/\s+/g, ' ').trim();
    } else {
      answer = 'Nao localizei essa informacao na base normativa deste agente.';
    }

    console.log(`[${i + 1}/30] sim=${best.toFixed(3)} context=${hasContext ? 'OK' : 'NO'}`);
    console.log(`Q: ${q}`);
    console.log(`A: ${answer.slice(0, 260)}${answer.length > 260 ? '...' : ''}`);
    console.log('');
  }

  console.log('=== RESUMO ===');
  console.log(`Com contexto (>=0.35): ${passed}`);
  console.log(`Sem contexto (<0.35): ${failed}`);
  console.log(`Taxa de cobertura: ${(passed / QUESTIONS.length * 100).toFixed(1)}%`);

  await pool.end();
}

run().catch(async (e) => {
  console.error(e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
