/**
 * Bateria COMPLETA de Testes RAG — 100 Perguntas por Agente
 * Testa 11 agentes previdenciários com perguntas variadas e valida:
 * 1. Resposta mínima (>50 chars)
 * 2. Resposta em português
 * 3. NÃO contém "Não encontrei essa informação na base do agente"
 * 4. Contém pelo menos 1 keyword esperada (quando aplicável)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');

const BASE_URL = process.env.TEST_URL || 'https://flixprev-oficial-123-production.up.railway.app';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const DELAY_MS = 7500; // 7.5s entre testes (Gemini free tier 10 RPM)

// ═══════════════════════════════════════════
// AGENTES E PERGUNTAS
// ═══════════════════════════════════════════

const AGENTS = [
  {
    id: '09e0ecf2-cc5f-4cca-8260-971f5faecf0b',
    title: 'Aposentadoria por Idade Urbana',
    questions: [
      { q: 'Qual a idade mínima para aposentadoria por idade urbana para homem?', kw: ['65'] },
      { q: 'Qual a idade mínima para aposentadoria por idade urbana para mulher?', kw: ['62'] },
      { q: 'Qual a carência exigida para aposentadoria por idade?', kw: ['180', 'carência'] },
      { q: 'Quanto tempo de contribuição precisa o homem após a EC 103/2019?', kw: ['20', 'anos'] },
      { q: 'Quanto tempo de contribuição precisa a mulher?', kw: ['15', 'anos'] },
      { q: 'Como é calculado o salário de benefício?', kw: ['salário', 'benefício'] },
      { q: 'O que é a média dos salários de contribuição?', kw: ['média', 'contribuição'] },
      { q: 'Existe aposentadoria compulsória? Com qual idade?', kw: ['compulsória', '75'] },
      { q: 'O que mudou com a Emenda Constitucional 103/2019?', kw: ['EC 103', 'reforma'] },
      { q: 'Pode aposentar por idade sem nunca ter contribuído?', kw: ['não'] },
    ],
  },
  {
    id: '87d3ce4b-3830-47e3-bdde-564fc5478073',
    title: 'Aposentadoria Especial',
    questions: [
      { q: 'O que é aposentadoria especial?', kw: ['atividade', 'especial', 'nocivo'] },
      { q: 'Quais os tempos de exposição possíveis?', kw: ['15', '20', '25'] },
      { q: 'O que é o PPP?', kw: ['PPP', 'Perfil'] },
      { q: 'Quem tem direito à aposentadoria especial de 25 anos?', kw: ['25', 'anos'] },
      { q: 'É necessário laudo técnico?', kw: ['laudo', 'LTCAT'] },
      { q: 'O que são agentes nocivos?', kw: ['agente', 'nocivo'] },
      { q: 'Aposentadoria especial exige idade mínima após a EC 103?', kw: ['idade', 'EC 103'] },
      { q: 'O que é o LTCAT?', kw: ['LTCAT', 'laudo'] },
      { q: 'Qual a carência da aposentadoria especial?', kw: ['180', 'carência'] },
      { q: 'Pode converter tempo especial em comum?', kw: ['convert', 'fator'] },
    ],
  },
  {
    id: '8f904216-cd19-4a9b-b0ed-33bb74927e73',
    title: 'Pensão por Morte',
    questions: [
      { q: 'Quem são os dependentes de primeira classe?', kw: ['cônjuge', 'filho'] },
      { q: 'Qual o valor da pensão por morte após a reforma?', kw: ['50%', '10%'] },
      { q: 'Quanto tempo dura a pensão por morte para o cônjuge?', kw: ['anos', 'duração'] },
      { q: 'A pensão por morte exige carência?', kw: ['carência', 'não'] },
      { q: 'Filho menor de qual idade tem direito à pensão?', kw: ['21', 'filho'] },
      { q: 'Companheiro tem direito à pensão por morte?', kw: ['companheiro', 'sim'] },
      { q: 'O que é a cota familiar de 50%?', kw: ['50%', 'cota'] },
      { q: 'Pensão por morte é vitalícia?', kw: ['vitalíci', 'duração'] },
      { q: 'É possível acumular pensão por morte com outro benefício?', kw: ['acumul'] },
      { q: 'O que acontece com a pensão quando o dependente completa 21 anos?', kw: ['cessa', '21'] },
    ],
  },
  {
    id: 'fda4edc2-5f63-4d0a-a961-22a9865ef729',
    title: 'Auxílio-Reclusão',
    questions: [
      { q: 'O que é o auxílio-reclusão?', kw: ['preso', 'reclusão', 'dependente'] },
      { q: 'Qual o requisito de renda para o auxílio-reclusão?', kw: ['baixa renda', 'renda'] },
      { q: 'Quem são os dependentes que recebem o auxílio-reclusão?', kw: ['dependente'] },
      { q: 'O preso em regime semiaberto tem direito?', kw: ['semiaberto', 'fechado'] },
      { q: 'Qual a carência do auxílio-reclusão?', kw: ['carência', '24'] },
      { q: 'O auxílio-reclusão é por segurado de baixa renda?', kw: ['baixa renda'] },
      { q: 'O que acontece com o auxílio quando o preso é solto?', kw: ['cessa', 'liber'] },
      { q: 'Preso que trabalha na prisão mantém o auxílio?', kw: ['trabalh'] },
      { q: 'Qual a base de cálculo do auxílio-reclusão?', kw: ['cálculo', 'salário'] },
      { q: 'O auxílio-reclusão é pago ao preso ou aos dependentes?', kw: ['dependente'] },
    ],
  },
  {
    id: '58fb247b-1ead-4697-b1bb-a14a533f9285',
    title: 'BPC Idoso e PcD',
    questions: [
      { q: 'O que é o BPC?', kw: ['Benefício de Prestação Continuada', 'BPC'] },
      { q: 'Qual a renda per capita para ter direito ao BPC?', kw: ['1/4', 'salário mínimo'] },
      { q: 'Precisa de carência para o BPC?', kw: ['não', 'carência'] },
      { q: 'Qual a idade mínima para o BPC do idoso?', kw: ['65'] },
      { q: 'O que define pessoa com deficiência para o BPC?', kw: ['deficiência', 'impedimento'] },
      { q: 'O BPC é benefício previdenciário ou assistencial?', kw: ['assistencial'] },
      { q: 'Estrangeiro residente no Brasil tem direito ao BPC?', kw: ['estrangeir', 'resid'] },
      { q: 'O BPC pode ser acumulado com outro benefício?', kw: ['acumul', 'não'] },
      { q: 'Qual o valor do BPC?', kw: ['salário mínimo', '1'] },
      { q: 'É necessário estar inscrito no CadÚnico?', kw: ['CadÚnico', 'Cadastro'] },
    ],
  },
  {
    id: 'f0524fea-e2bf-49fb-b4ce-8c672050ed04',
    title: 'Processo Administrativo Previdenciário',
    questions: [
      { q: 'Qual o prazo para interpor recurso administrativo no INSS?', kw: ['30', 'dias'] },
      { q: 'O que é o recurso ordinário na previdência?', kw: ['recurso', 'ordinário'] },
      { q: 'Quem julga os recursos administrativos do INSS?', kw: ['CRPS', 'Junta', 'Conselho'] },
      { q: 'O que é a revisão administrativa de benefício?', kw: ['revisão'] },
      { q: 'Qual o prazo de prescrição para cobrar valores devidos do INSS?', kw: ['5', 'anos', 'prescrição'] },
      { q: 'O que é o requerimento administrativo?', kw: ['requerimento', 'INSS'] },
      { q: 'Qual o prazo para cumprimento de exigência no INSS?', kw: ['30', 'dias'] },
      { q: 'O que fazer quando o INSS nega um benefício?', kw: ['recurso', 'revisão'] },
      { q: 'Qual o prazo para o INSS analisar um requerimento?', kw: ['dias', 'prazo'] },
      { q: 'O que é a justificação administrativa no INSS?', kw: ['justificação', 'administrativa'] },
    ],
  },
  {
    id: '069686a5-cf9d-4748-8b1d-d6ee8e11a51e',
    title: 'Auxílio por Incapacidade Temporária',
    questions: [
      { q: 'O que é o auxílio por incapacidade temporária?', kw: ['incapacidade', 'temporária'] },
      { q: 'Qual a carência do auxílio-doença?', kw: ['12', 'contribuições'] },
      { q: 'Quando a carência é dispensada?', kw: ['acidente', 'dispensada'] },
      { q: 'Quem paga os primeiros 15 dias de afastamento?', kw: ['empregador', '15'] },
      { q: 'É necessária perícia médica?', kw: ['perícia'] },
      { q: 'Pode acumular auxílio-doença com outro benefício?', kw: ['não', 'acumul'] },
      { q: 'Qual a duração máxima do auxílio por incapacidade temporária?', kw: ['duração', 'prazo'] },
      { q: 'O que é o high-five no cálculo do auxílio?', kw: ['cálculo', 'média'] },
      { q: 'Segurado especial tem direito ao auxílio por incapacidade?', kw: ['segurado especial'] },
      { q: 'Qual a diferença entre auxílio por incapacidade temporária e permanente?', kw: ['temporária', 'permanente'] },
    ],
  },
  {
    id: '5110fa3e-6143-4d83-b984-27defb9cf69d',
    title: 'Salário-Maternidade',
    questions: [
      { q: 'Qual a duração do salário-maternidade?', kw: ['120', 'dias'] },
      { q: 'Quem tem direito ao salário-maternidade?', kw: ['segurada', 'empregada'] },
      { q: 'Adoção dá direito ao salário-maternidade?', kw: ['adoção', 'sim'] },
      { q: 'Qual a carência do salário-maternidade para contribuinte individual?', kw: ['10', 'contribuições'] },
      { q: 'O salário-maternidade é pago pelo INSS ou pela empresa?', kw: ['empresa', 'INSS'] },
      { q: 'Homem pode receber salário-maternidade?', kw: ['adoção', 'falecimento'] },
      { q: 'Qual o valor do salário-maternidade?', kw: ['remuneração', 'salário'] },
      { q: 'O que acontece em caso de aborto não criminoso?', kw: ['aborto', '2 semanas', '14 dias'] },
      { q: 'Desempregada pode receber salário-maternidade?', kw: ['período de graça', 'qualidade'] },
      { q: 'É possível prorrogar o salário-maternidade?', kw: ['prorrog'] },
    ],
  },
  {
    id: 'c0587932-c183-4edd-9f08-8615eda3d535',
    title: 'Regras de Transição',
    questions: [
      { q: 'Quais são as regras de transição da EC 103/2019?', kw: ['pedágio', 'pontos', 'transição'] },
      { q: 'O que é a regra do pedágio de 50%?', kw: ['pedágio', '50%'] },
      { q: 'O que é a regra do pedágio de 100%?', kw: ['pedágio', '100%'] },
      { q: 'Como funciona a regra de pontos?', kw: ['pontos'] },
      { q: 'O que é a regra da idade progressiva?', kw: ['idade', 'progressiva'] },
      { q: 'Quem pode usar as regras de transição?', kw: ['filiado', 'antes', '2019'] },
      { q: 'Qual a diferença entre as regras de transição?', kw: ['regra', 'transição'] },
      { q: 'A regra de pontos se aplica a professores?', kw: ['professor'] },
      { q: 'Qual regra de transição é mais vantajosa?', kw: ['vantagos', 'cálculo'] },
      { q: 'As regras de transição têm prazo para acabar?', kw: ['progressiv'] },
    ],
  },
  {
    id: 'f0c30fef-7f08-4e96-9f14-4025ea8fa623',
    title: 'Revisão de Benefícios',
    questions: [
      { q: 'Qual o prazo decadencial para pedir revisão?', kw: ['10', 'anos', 'decadência'] },
      { q: 'O que é a revisão da vida toda?', kw: ['vida toda', 'vida inteira'] },
      { q: 'Quando é possível pedir revisão de benefício?', kw: ['revisão', 'erro'] },
      { q: 'O que é a revisão do buraco negro?', kw: ['buraco negro'] },
      { q: 'A revisão pode reduzir o valor do benefício?', kw: ['reduz', 'sim'] },
      { q: 'É possível revisar aposentadoria por invalidez?', kw: ['sim', 'revisão'] },
      { q: 'O que é a revisão do teto?', kw: ['teto', 'EC 20', 'EC 41'] },
      { q: 'Qual a diferença entre revisão administrativa e judicial?', kw: ['administrativa', 'judicial'] },
      { q: 'O que é o artigo 29, II da Lei 8.213/91?', kw: ['art', '29', 'cálculo'] },
      { q: 'Aposentado pode pedir revisão a qualquer momento?', kw: ['10 anos', 'prazo', 'decadência'] },
    ],
  },
  {
    id: '37eae488-f7df-49d6-a8fb-06d6b93fb79b',
    title: 'Aposentadoria Rural',
    questions: [
      { q: 'Qual a idade mínima para aposentadoria rural?', kw: ['55', '60'] },
      { q: 'A mulher rural aposenta com qual idade?', kw: ['55'] },
      { q: 'O homem rural aposenta com qual idade?', kw: ['60'] },
      { q: 'Quem é considerado segurado especial?', kw: ['segurado especial', 'rural'] },
      { q: 'Precisa de contribuição para aposentadoria rural?', kw: ['qualidade', 'exercício'] },
      { q: 'Como provar atividade rural?', kw: ['prov', 'documento'] },
      { q: 'O que é o regime de economia familiar?', kw: ['economia familiar', 'família'] },
      { q: 'Pescador artesanal tem direito à aposentadoria rural?', kw: ['pescador', 'sim'] },
      { q: 'Qual o valor da aposentadoria rural?', kw: ['salário mínimo'] },
      { q: 'Pode somar tempo rural com tempo urbano?', kw: ['sim', 'somar', 'híbrida'] },
    ],
  },
];

// ═══════════════════════════════════════════
// FUNÇÕES HTTP
// ═══════════════════════════════════════════
function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const req = mod.request(parsedUrl, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout 120s')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function createConversation(agentId) {
  const { status, body } = await httpRequest(
    `${BASE_URL}/api/conversations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID } },
    JSON.stringify({ agentId })
  );
  if (status >= 400) throw new Error(`HTTP ${status}: ${body.substring(0, 200)}`);
  const parsed = JSON.parse(body);
  return parsed.id || parsed.conversation?.id;
}

async function sendMessage(conversationId, content) {
  const { status, body } = await httpRequest(
    `${BASE_URL}/api/conversations/${conversationId}/messages`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER_ID } },
    JSON.stringify({ content })
  );
  if (status >= 400) throw new Error(`HTTP ${status}: ${body.substring(0, 300)}`);
  return extractText(body);
}

function extractText(raw) {
  const lines = raw.split('\n');
  let text = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const j = JSON.parse(line.slice(6));
        if (j.content) text += j.content;
        if (j.text) text += j.text;
        if (j.assistantMessage?.content) text += j.assistantMessage.content;
      } catch {
        text += line.slice(6);
      }
    }
  }
  return text || raw;
}

function evaluate(response, tc) {
  const lower = response.toLowerCase();
  const result = {
    passed: true,
    reasons: [],
    matchedKw: [],
    totalKw: tc.kw.length,
  };

  // Critério 1: Não pode ser "Não encontrei"
  if (/não encontrei essa informação/i.test(response)) {
    result.passed = false;
    result.reasons.push('RECUSOU (disse "não encontrei")');
  }

  // Critério 2: Tamanho mínimo
  if (response.length < 50) {
    result.passed = false;
    result.reasons.push(`CURTO (${response.length} chars)`);
  }

  // Critério 3: Português
  if (!/[àáâãéêíóôõúç]/.test(response) && !/\b(que|não|para|com|uma|dos)\b/i.test(response)) {
    result.passed = false;
    result.reasons.push('NÃO-PT');
  }

  // Critério 4: Keywords
  for (const kw of tc.kw) {
    if (lower.includes(kw.toLowerCase())) {
      result.matchedKw.push(kw);
    }
  }
  if (result.matchedKw.length === 0 && tc.kw.length > 0) {
    result.passed = false;
    result.reasons.push(`0-KW [${tc.kw.join(', ')}]`);
  }

  return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
async function main() {
  const totalQuestions = AGENTS.reduce((s, a) => s + a.questions.length, 0);
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║   BATERIA COMPLETA: ${totalQuestions} perguntas | ${AGENTS.length} agentes`.padEnd(63) + '║');
  console.log(`║   URL: ${BASE_URL.substring(0, 52)}`.padEnd(63) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const report = { total: totalQuestions, passed: 0, failed: 0, errors: 0, failures: [], agentStats: {} };
  let globalNum = 0;

  for (const agent of AGENTS) {
    const agentName = agent.title;
    report.agentStats[agentName] = { pass: 0, fail: 0, err: 0, total: agent.questions.length };
    console.log(`\n━━━ ${agentName} (${agent.questions.length} perguntas) ━━━`);

    let convId;
    try {
      convId = await createConversation(agent.id);
      console.log(`  ✓ Conversa: ${convId}`);
    } catch (e) {
      console.log(`  ✗ ERRO conversa: ${e.message}`);
      for (const tc of agent.questions) {
        globalNum++;
        report.errors++;
        report.agentStats[agentName].err++;
        report.failures.push({ num: globalNum, agent: agentName, q: tc.q, status: 'CONV_ERROR', detail: e.message });
      }
      continue;
    }

    for (let i = 0; i < agent.questions.length; i++) {
      const tc = agent.questions[i];
      globalNum++;
      const label = `  [${globalNum}/${totalQuestions}] ${tc.q.substring(0, 55)}...`;

      try {
        await sleep(DELAY_MS);
        const response = await sendMessage(convId, tc.q);
        const ev = evaluate(response, tc);

        if (ev.passed) {
          report.passed++;
          report.agentStats[agentName].pass++;
          console.log(`${label} ✅ (${ev.matchedKw.length}/${ev.totalKw}kw, ${response.length}c)`);
        } else {
          report.failed++;
          report.agentStats[agentName].fail++;
          console.log(`${label} ❌ ${ev.reasons.join(' | ')}`);
          if (response.length < 200) console.log(`     → "${response.substring(0, 150)}"`);
          report.failures.push({
            num: globalNum,
            agent: agentName,
            q: tc.q,
            status: 'FAIL',
            reasons: ev.reasons,
            response: response.substring(0, 200),
            matchedKw: ev.matchedKw,
          });
        }
      } catch (e) {
        report.errors++;
        report.agentStats[agentName].err++;
        console.log(`${label} ⚠ ERROR: ${e.message.substring(0, 80)}`);
        report.failures.push({ num: globalNum, agent: agentName, q: tc.q, status: 'ERROR', detail: e.message.substring(0, 150) });

        // Se for 429 ou 5xx, wait extra
        if (/429|5\d\d|Timeout/.test(e.message)) {
          console.log('     → Aguardando 15s extra...');
          await sleep(15000);
        }
      }

      // A cada 5 testes, criar nova conversa para evitar contexto longo
      if ((i + 1) % 5 === 0 && i < agent.questions.length - 1) {
        try {
          convId = await createConversation(agent.id);
        } catch { /* keep old convId */ }
      }
    }
  }

  // RELATÓRIO FINAL
  const passRate = ((report.passed / report.total) * 100).toFixed(1);
  console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    RELATÓRIO FINAL                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`  Total:     ${report.total}`);
  console.log(`  ✅ Pass:   ${report.passed} (${passRate}%)`);
  console.log(`  ❌ Fail:   ${report.failed}`);
  console.log(`  ⚠  Error:  ${report.errors}`);
  console.log('');

  console.log('  Por agente:');
  for (const [name, stats] of Object.entries(report.agentStats)) {
    const rate = ((stats.pass / stats.total) * 100).toFixed(0);
    const status = stats.fail + stats.err === 0 ? '✅' : '❌';
    console.log(`    ${status} ${name.padEnd(45)} ${stats.pass}/${stats.total} (${rate}%)`);
  }

  if (report.failures.length > 0) {
    console.log('\n  Falhas detalhadas:');
    for (const f of report.failures) {
      console.log(`    [${f.num}] ${f.agent} — ${f.q}`);
      if (f.reasons) console.log(`        ${f.reasons.join(' | ')}`);
      if (f.detail) console.log(`        ${f.detail}`);
      if (f.response) console.log(`        "${f.response.substring(0, 120)}"`);
    }
  }

  console.log(`\n  ════════════════════════════════════════════`);
  console.log(`  TAXA FINAL: ${passRate}% (${report.passed}/${report.total})`);
  console.log(`  ════════════════════════════════════════════\n`);

  // Salvar JSON
  fs.writeFileSync('testsprite_tests/rag_100q_results.json', JSON.stringify(report, null, 2), 'utf8');
  console.log('  Resultados salvos em testsprite_tests/rag_100q_results.json');

  process.exit(report.failed + report.errors > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
