/**
 * Bateria de Testes de Qualidade RAG - FlixPrev
 * Testa agentes previdenciários com perguntas reais e valida se as respostas:
 * 1. Contêm informações corretas (keywords esperadas)
 * 2. Não alucinam (não inventam artigos/leis)
 * 3. Recusam perguntas fora do escopo
 * 4. Respondem em português
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.TEST_URL || 'https://flixprev-oficial-123-production.up.railway.app';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'; // UUID format required by Supabase
const DELAY_BETWEEN_TESTS_MS = 7000; // 7s entre testes (rate limit Gemini free tier ~10 RPM)

// ═══════════════════════════════════════════════════════════════
// BATERIA DE TESTES — Agentes previdenciários
// ═══════════════════════════════════════════════════════════════
const TEST_CASES = [
  // --- APOSENTADORIA POR IDADE URBANA ---
  {
    agentTitle: 'Aposentadoria por Idade Urbana',
    agentId: '09e0ecf2-cc5f-4cca-8260-971f5faecf0b',
    question: 'Qual a idade mínima para aposentadoria por idade urbana após a EC 103/2019?',
    expectKeywords: ['65', '62', 'anos', 'homem', 'mulher'],
    expectAny: true, // pelo menos 1 keyword
    category: 'precisão',
  },
  {
    agentTitle: 'Aposentadoria por Idade Urbana',
    agentId: '09e0ecf2-cc5f-4cca-8260-971f5faecf0b',
    question: 'Qual a carência exigida para aposentadoria por idade?',
    expectKeywords: ['180', 'contribuições', 'carência', '15 anos'],
    expectAny: true,
    category: 'precisão',
  },
  {
    agentTitle: 'Aposentadoria por Idade Urbana',
    agentId: '09e0ecf2-cc5f-4cca-8260-971f5faecf0b',
    question: 'Me fala sobre aposentadoria especial por insalubridade',
    expectKeywords: ['fora', 'escopo', 'agente especializado', 'Aposentadoria Especial'],
    expectAny: true,
    category: 'escopo',
  },

  // --- APOSENTADORIA ESPECIAL ---
  {
    agentTitle: 'Aposentadoria Especial',
    agentId: '87d3ce4b-3830-47e3-bdde-564fc5478073',
    question: 'Quais são os tempos de exposição para aposentadoria especial?',
    expectKeywords: ['15', '20', '25', 'anos', 'atividade especial'],
    expectAny: true,
    category: 'precisão',
  },
  {
    agentTitle: 'Aposentadoria Especial',
    agentId: '87d3ce4b-3830-47e3-bdde-564fc5478073',
    question: 'O que é o PPP e para que serve?',
    expectKeywords: ['Perfil Profissiográfico', 'PPP', 'atividade', 'agente nocivo'],
    expectAny: true,
    category: 'precisão',
  },

  // --- PENSÃO POR MORTE ---
  {
    agentTitle: 'Pensão por Morte',
    agentId: '8f904216-cd19-4a9b-b0ed-33bb74927e73',
    question: 'Quem são os dependentes que têm direito à pensão por morte?',
    expectKeywords: ['cônjuge', 'companheiro', 'filho', 'dependente'],
    expectAny: true,
    category: 'precisão',
  },
  {
    agentTitle: 'Pensão por Morte',
    agentId: '8f904216-cd19-4a9b-b0ed-33bb74927e73',
    question: 'Qual o valor da pensão por morte após a reforma de 2019?',
    expectKeywords: ['50%', '10%', 'cota', 'EC 103', 'reforma'],
    expectAny: true,
    category: 'precisão',
  },

  // --- AUXÍLIO-RECLUSÃO ---
  {
    agentTitle: 'Auxílio-Reclusão',
    agentId: 'fda4edc2-5f63-4d0a-a961-22a9865ef729',
    question: 'Qual o requisito de renda para o auxílio-reclusão?',
    expectKeywords: ['baixa renda', 'renda', 'segurado', 'limite'],
    expectAny: true,
    category: 'precisão',
  },
  {
    agentTitle: 'Auxílio-Reclusão',
    agentId: 'fda4edc2-5f63-4d0a-a961-22a9865ef729',
    question: 'O preso em regime semiaberto tem direito?',
    expectKeywords: ['fechado', 'semiaberto', 'não', 'regime'],
    expectAny: true,
    category: 'precisão',
  },

  // --- BPC/LOAS ---
  {
    agentTitle: 'BPC Idoso e PcD',
    agentId: '58fb247b-1ead-4697-b1bb-a14a533f9285',
    question: 'Qual a renda per capita para ter direito ao BPC?',
    expectKeywords: ['1/4', 'salário mínimo', 'renda', 'per capita', 'família'],
    expectAny: true,
    category: 'precisão',
  },
  {
    agentTitle: 'BPC Idoso e PcD',
    agentId: '58fb247b-1ead-4697-b1bb-a14a533f9285',
    question: 'Precisa de carência para o BPC?',
    expectKeywords: ['não', 'carência', 'contribu', 'assistencial'],
    expectAny: true,
    category: 'precisão',
  },

  // --- PROCESSO ADMINISTRATIVO PREVIDENCIÁRIO ---
  {
    agentTitle: 'Processo Administrativo Previdenciário',
    agentId: 'f0524fea-e2bf-49fb-b4ce-8c672050ed04',
    question: 'Qual o prazo para interpor recurso administrativo no INSS?',
    expectKeywords: ['30', 'dias', 'recurso', 'prazo'],
    expectAny: true,
    category: 'precisão',
  },

  // --- AUXÍLIO POR INCAPACIDADE TEMPORÁRIA ---
  {
    agentTitle: 'Auxílio por Incapacidade Temporária',
    agentId: '069686a5-cf9d-4748-8b1d-d6ee8e11a51e',
    question: 'Qual a carência para o auxílio por incapacidade temporária?',
    expectKeywords: ['12', 'contribuições', 'carência', 'isenção', 'acidente'],
    expectAny: true,
    category: 'precisão',
  },
  {
    agentTitle: 'Auxílio por Incapacidade Temporária',
    agentId: '069686a5-cf9d-4748-8b1d-d6ee8e11a51e',
    question: 'Pode acumular auxílio-doença com outro benefício?',
    expectKeywords: ['acumul', 'vedada', 'não', 'simultâneo'],
    expectAny: true,
    category: 'precisão',
  },

  // --- SALÁRIO-MATERNIDADE ---
  {
    agentTitle: 'Salário-Maternidade',
    agentId: '5110fa3e-6143-4d83-b984-27defb9cf69d',
    question: 'Qual a duração do salário-maternidade?',
    expectKeywords: ['120', 'dias', 'parto', 'adoção'],
    expectAny: true,
    category: 'precisão',
  },

  // --- REGRAS DE TRANSIÇÃO ---
  {
    agentTitle: 'Regras de Transição',
    agentId: 'c0587932-c183-4edd-9f08-8615eda3d535',
    question: 'Quais são as regras de transição da EC 103/2019?',
    expectKeywords: ['pedágio', 'pontos', 'idade progressiva', 'transição'],
    expectAny: true,
    category: 'precisão',
  },

  // --- REVISÃO DE BENEFÍCIOS ---
  {
    agentTitle: 'Revisão de Benefícios',
    agentId: 'f0c30fef-7f08-4e96-9f14-4025ea8fa623',
    question: 'Qual o prazo decadencial para pedir revisão de benefício?',
    expectKeywords: ['10', 'anos', 'decadência', 'decadencial', 'prazo'],
    expectAny: true,
    category: 'precisão',
  },

  // --- APOSENTADORIA RURAL ---
  {
    agentTitle: 'Aposentadoria Rural',
    agentId: '37eae488-f7df-49d6-a8fb-06d6b93fb79b',
    question: 'Qual a idade mínima para aposentadoria rural?',
    expectKeywords: ['60', '55', 'rural', 'idade', 'anos'],
    expectAny: true,
    category: 'precisão',
  },

  // --- TESTE DE ANTI-ALUCINAÇÃO ---
  {
    agentTitle: 'Aposentadoria por Idade Urbana',
    agentId: '09e0ecf2-cc5f-4cca-8260-971f5faecf0b',
    question: 'Me explica a lei 99.999 de 2025 sobre aposentadoria?',
    expectKeywords: ['não', 'localiz', 'encontr', 'não existe', 'desconheço'],
    expectAny: true,
    category: 'anti-alucinação',
  },
];

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES
// ═══════════════════════════════════════════════════════════════

async function createConversation(agentId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/api/conversations`);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': TEST_USER_ID,
      },
    };

    const req = (url.protocol === 'https:' ? https : http).request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.id || parsed.conversation?.id);
        } catch {
          reject(new Error(`Falha ao criar conversa: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify({ agentId }));
    req.end();
  });
}

async function sendMessage(conversationId, content) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/api/conversations/${conversationId}/messages`);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': TEST_USER_ID,
      },
    };

    const req = (url.protocol === 'https:' ? https : http).request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
          return;
        }
        // Resposta pode ser streaming SSE - extrair conteúdo
        const responseText = extractResponseFromSSE(data) || data;
        resolve({ status: res.statusCode, text: responseText });
      });
    });

    req.setTimeout(90000, () => {
      req.destroy();
      reject(new Error('Timeout 90s'));
    });
    req.on('error', reject);
    req.write(JSON.stringify({ content }));
    req.end();
  });
}

function extractResponseFromSSE(raw) {
  // parsing SSE: data: {"content":"..."} lines
  const lines = raw.split('\n');
  let fullText = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.slice(6));
        if (json.content) fullText += json.content;
        if (json.text) fullText += json.text;
        if (json.assistantMessage?.content) fullText += json.assistantMessage.content;
      } catch {
        // not JSON, might be raw text chunk
        fullText += line.slice(6);
      }
    }
  }
  return fullText || raw;
}

function evaluateResponse(response, testCase) {
  const lower = response.toLowerCase();
  const results = {
    hasKeywords: false,
    matchedKeywords: [],
    missedKeywords: [],
    isPortuguese: /[àáâãéêíóôõúç]/.test(response) || /\b(que|não|para|com|uma|dos)\b/i.test(response),
    responseLength: response.length,
    passed: false,
  };

  for (const kw of testCase.expectKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      results.matchedKeywords.push(kw);
    } else {
      results.missedKeywords.push(kw);
    }
  }

  if (testCase.expectAny) {
    results.hasKeywords = results.matchedKeywords.length > 0;
  } else {
    results.hasKeywords = results.missedKeywords.length === 0;
  }

  results.passed = results.hasKeywords && results.isPortuguese && results.responseLength > 50;
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// EXECUÇÃO
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   BATERIA DE TESTES RAG — FlixPrev (RAG Otimizado)      ║');
  console.log(`║   ${TEST_CASES.length} testes | Top-K: 12 | Sim >= 0.40               ║`);
  console.log(`║   URL: ${BASE_URL.substring(0, 48).padEnd(48)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  const report = {
    total: TEST_CASES.length,
    passed: 0,
    failed: 0,
    errors: 0,
    results: [],
  };

  // Group tests by agent to reuse conversations
  const agentGroups = {};
  for (const tc of TEST_CASES) {
    if (!agentGroups[tc.agentId]) {
      agentGroups[tc.agentId] = { agentTitle: tc.agentTitle, tests: [] };
    }
    agentGroups[tc.agentId].tests.push(tc);
  }

  let testNum = 0;
  for (const [agentId, group] of Object.entries(agentGroups)) {
    console.log(`\n━━━ ${group.agentTitle} (${group.tests.length} testes) ━━━`);

    let conversationId;
    try {
      conversationId = await createConversation(agentId);
      if (!conversationId) throw new Error('conversationId vazio');
      console.log(`  ✓ Conversa criada: ${conversationId}`);
    } catch (e) {
      console.log(`  ✗ ERRO ao criar conversa: ${e.message}`);
      for (const tc of group.tests) {
        testNum++;
        report.errors++;
        report.results.push({
          num: testNum,
          agent: tc.agentTitle,
          question: tc.question.substring(0, 60),
          status: 'ERROR',
          error: e.message,
          category: tc.category,
        });
      }
      continue;
    }

    for (const tc of group.tests) {
      testNum++;
      process.stdout.write(`  [${testNum}/${TEST_CASES.length}] ${tc.question.substring(0, 55)}... `);

      try {
        await sleep(DELAY_BETWEEN_TESTS_MS);
        const response = await sendMessage(conversationId, tc.question);
        const evaluation = evaluateResponse(response.text, tc);

        if (evaluation.passed) {
          report.passed++;
          console.log(`✅ PASS (${evaluation.matchedKeywords.length}/${tc.expectKeywords.length} keywords, ${evaluation.responseLength} chars)`);
        } else {
          report.failed++;
          console.log(`❌ FAIL`);
          if (!evaluation.hasKeywords) {
            console.log(`     Keywords esperadas: [${tc.expectKeywords.join(', ')}]`);
            console.log(`     Encontradas: [${evaluation.matchedKeywords.join(', ')}]`);
          }
          if (!evaluation.isPortuguese) console.log(`     ⚠ Resposta não parece ser em português`);
          if (evaluation.responseLength <= 50) console.log(`     ⚠ Resposta muito curta (${evaluation.responseLength} chars)`);
          console.log(`     Resposta (100 chars): ${response.text.substring(0, 100)}...`);
        }

        report.results.push({
          num: testNum,
          agent: tc.agentTitle,
          question: tc.question.substring(0, 60),
          status: evaluation.passed ? 'PASS' : 'FAIL',
          matchedKw: evaluation.matchedKeywords.length,
          totalKw: tc.expectKeywords.length,
          responseLength: evaluation.responseLength,
          category: tc.category,
        });
      } catch (e) {
        report.errors++;
        console.log(`⚠ ERROR: ${e.message.substring(0, 80)}`);
        report.results.push({
          num: testNum,
          agent: tc.agentTitle,
          question: tc.question.substring(0, 60),
          status: 'ERROR',
          error: e.message.substring(0, 100),
          category: tc.category,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RELATÓRIO FINAL
  // ═══════════════════════════════════════════════════════════════
  const passRate = ((report.passed / report.total) * 100).toFixed(1);
  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                  RELATÓRIO FINAL                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Total de testes:  ${report.total}`);
  console.log(`  ✅ Aprovados:     ${report.passed} (${passRate}%)`);
  console.log(`  ❌ Reprovados:    ${report.failed}`);
  console.log(`  ⚠  Erros:        ${report.errors}`);
  console.log('');

  // Por categoria
  const categories = {};
  for (const r of report.results) {
    if (!categories[r.category]) categories[r.category] = { pass: 0, fail: 0, error: 0, total: 0 };
    categories[r.category].total++;
    if (r.status === 'PASS') categories[r.category].pass++;
    else if (r.status === 'FAIL') categories[r.category].fail++;
    else categories[r.category].error++;
  }

  console.log('  Por categoria:');
  for (const [cat, stats] of Object.entries(categories)) {
    const catRate = ((stats.pass / stats.total) * 100).toFixed(0);
    console.log(`    ${cat.padEnd(20)} ${stats.pass}/${stats.total} (${catRate}%)`);
  }

  // Falhas detalhadas
  const failures = report.results.filter((r) => r.status !== 'PASS');
  if (failures.length > 0) {
    console.log('\n  Detalhes dos que falharam:');
    for (const f of failures) {
      console.log(`    [${f.num}] ${f.agent} — ${f.question}`);
      console.log(`        ${f.status}${f.error ? ': ' + f.error : f.matchedKw !== undefined ? ` (${f.matchedKw}/${f.totalKw} kw)` : ''}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  TAXA DE APROVAÇÃO: ${passRate}%`);
  console.log('══════════════════════════════════════════════════════════\n');

  process.exit(report.failed + report.errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
