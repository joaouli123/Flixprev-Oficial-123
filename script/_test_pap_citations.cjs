/**
 * _test_pap_citations.cjs
 * 
 * Testa se o agente PAP cita normas corretamente após o fix.
 * Verifica que:
 *  - NÃO diz "do contexto"
 *  - Identifica IN 128/2022 pelo nome
 *  - Identifica Portarias pelo número
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const AGENT_ID = 'f0524fea-e2bf-49fb-b4ce-8c672050ed04';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = 'gemini-embedding-001';
const CHAT_MODEL = 'gemini-2.0-flash';
const TOP_K = 25;
const SIM_THRESHOLD = 0.35;

async function embedQuery(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY'
    })
  });
  const data = await r.json();
  return data.embedding.values;
}

async function ragSearch(query) {
  const emb = await embedQuery(query);
  const embStr = JSON.stringify(emb);
  const sql = `
    SELECT content, 1 - (embedding <=> $1::vector) AS similarity
    FROM document_chunks
    WHERE agent_id = $2
      AND 1 - (embedding <=> $1::vector) > $3
    ORDER BY embedding <=> $1::vector
    LIMIT $4
  `;
  const r = await pool.query(sql, [embStr, AGENT_ID, SIM_THRESHOLD, TOP_K]);
  return r.rows;
}

async function chat(question) {
  const chunks = await ragSearch(question);
  const context = chunks.map(c => c.content).join('\n---\n');

  // Get instructions
  const instR = await pool.query('SELECT instructions FROM agents WHERE id = $1', [AGENT_ID]);
  const instructions = instR.rows[0]?.instructions || '';

  const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GEMINI_API_KEY}`
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: instructions + '\n\n=== BASE DE CONHECIMENTO ===\n' + context },
        { role: 'user', content: question }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })
  });
  const data = await r.json();
  return data.choices?.[0]?.message?.content || '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const TESTS = [
  {
    question: 'O que faz o agente PAP? Cite os artigos e normas que regulam suas atribuições.',
    mustContain: ['128/2022', 'IN INSS'],
    mustNotContain: ['do contexto', 'desta norma', 'deste normativo'],
    label: 'Atribuições do PAP — deve citar IN 128/2022, não "do contexto"'
  },
  {
    question: 'Qual portaria regula a reabilitação profissional no INSS? Cite o número exato.',
    mustContain: ['nº 1'],
    mustNotContain: ['nº 2/Dirat', 'Portaria Conjunta nº 2'],
    label: 'Portaria Reabilitação — deve ser nº 1/2021, não inventar nº 2/2020'
  },
  {
    question: 'O que diz o Art. 24 da IN 128 sobre o CNIS?',
    mustContain: ['128/2022', 'CNIS'],
    mustNotContain: ['do contexto'],
    label: 'Art. 24 — deve citar IN 128/2022, não "do contexto"'
  },
  {
    question: 'O que é a "Portaria Conjunta DTI/DIRBEN/PFE/INSS"? Qual número?',
    mustContain: ['nº 1', '2021'],
    mustNotContain: ['nº 2/Dirat', '2020'],
    label: 'Identifica corretamente a Portaria Conjunta — nº 1/2021'
  },
  {
    question: 'Qual o prazo para o INSS decidir um requerimento? Cite o dispositivo legal.',
    mustContain: ['30', '3.048'],
    mustNotContain: ['do contexto'],
    label: 'Prazo de decisão — deve citar Decreto 3.048/99'
  },
  {
    question: 'A que norma se refere a expressão "do contexto" nos materiais sobre PAP?',
    mustContain: ['128/2022'],
    mustNotContain: [],
    label: 'Tradução de "do contexto" — deve identificar como IN 128/2022'
  }
];

(async () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   TESTE DE CITAÇÃO NORMATIVA — AGENTE PAP       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let pass = 0;
  let fail = 0;

  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    console.log(`\n[${i + 1}/${TESTS.length}] ${t.label}`);
    console.log(`  Q: ${t.question}`);

    const answer = await chat(t.question);
    const answerLower = answer.toLowerCase();

    let ok = true;
    const issues = [];

    for (const term of t.mustContain) {
      if (!answerLower.includes(term.toLowerCase())) {
        ok = false;
        issues.push(`FALTA: "${term}"`);
      }
    }

    for (const term of t.mustNotContain) {
      if (answerLower.includes(term.toLowerCase())) {
        ok = false;
        issues.push(`PROIBIDO encontrado: "${term}"`);
      }
    }

    if (ok) {
      console.log(`  ✅ PASS`);
      pass++;
    } else {
      console.log(`  ❌ FAIL — ${issues.join('; ')}`);
      fail++;
    }

    // Show first 300 chars of answer
    console.log(`  A: ${answer.substring(0, 300)}...`);

    if (i < TESTS.length - 1) await sleep(3000);
  }

  console.log('\n══════════════════════════════════════');
  console.log(`RESULTADO: ${pass}/${TESTS.length} PASS | ${fail} FAIL`);
  console.log('══════════════════════════════════════');

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
})();
