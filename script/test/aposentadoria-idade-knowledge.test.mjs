import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APOSENTADORIA_IDADE_SOURCE_TEXT,
  APOSENTADORIA_IDADE_SOURCE_TITLE,
  isAposentadoriaIdadeQuestion,
  withAposentadoriaIdadeGuidance,
  withAposentadoriaIdadeSource,
} from '../lib/aposentadoria-idade-knowledge.mjs';

const idadeAgent = { name: 'Aposentadoria por Idade', instructions: 'Agente previdenciario do INSS.' };
const previdAgent = { name: 'Ag. Previdenciario', instructions: 'Especialista em beneficios do INSS e RGPS.' };
const cltAgent = { name: 'CLT', instructions: 'Especialista em ferias, jornada e rescisao trabalhista.' };

// Mesmo parser usado pelo validador em server.mjs (getGroundedSourceMap).
function parseSources(context) {
  const sources = new Map();
  for (const section of context.split(/\n\n---\n\n/)) {
    const match = section.match(/^\[Fonte\s+(\d+)\s*\|\s*(.+?)\s*\|\s*trecho\s+([^\]|]+)[^\n]*\]\n/i);
    if (match) sources.set(Number(match[1]), { title: match[2].trim(), content: section.slice(match[0].length) });
  }
  return sources;
}

test('detecta as perguntas do Valdir e variacoes', () => {
  const positives = [
    ['Quais as regras da aposentadoria por idade?', previdAgent],
    ['Meu cliente tem 66 anos de idade, quanto tempo de contribuicao ele precisa ter?', idadeAgent],
    ['Qual a idade minima para se aposentar no INSS?', previdAgent],
    ['Como funciona a aposentadoria por idade rural?', previdAgent],
    ['Mulher de 61 anos que contribui desde 2005 ja pode se aposentar?', previdAgent],
    ['Quais as regras de calculo?', idadeAgent],
    ['Qual a carencia?', idadeAgent],
    ['Cliente 66 anos', idadeAgent],
    ['E se for mulher?', idadeAgent],
    ['aposentadoria programada da mulher apos a EC 103/2019', previdAgent],
  ];
  for (const [question, agentData] of positives) {
    assert.equal(isAposentadoriaIdadeQuestion(question, { agentData }), true, question);
  }
});

test('usa a conversa recente para continuacoes curtas', () => {
  const conversationContext = 'Usuario: quais as regras da aposentadoria por idade?\nAssistente: ...';
  assert.equal(
    isAposentadoriaIdadeQuestion('E se ele tiver 66 anos e 12 anos de contribuicao?', { agentData: previdAgent, conversationContext }),
    true,
  );
});

test('nao dispara fora do tema ou fora de agente previdenciario', () => {
  assert.equal(isAposentadoriaIdadeQuestion('Quais as regras da aposentadoria por idade?', { agentData: cltAgent }), false);
  assert.equal(isAposentadoriaIdadeQuestion('Qual o prazo para conceder ferias?', { agentData: previdAgent }), false);
  assert.equal(isAposentadoriaIdadeQuestion('Como pedir auxilio-doenca?', { agentData: previdAgent }), false);
  assert.equal(isAposentadoriaIdadeQuestion('', { agentData: idadeAgent }), false);
});

test('nao mistura com outros beneficios', () => {
  const especialAgent = { title: 'Aposentadoria Especial', instructions: 'Agente do INSS.' };
  const pensaoAgent = { title: 'Pensão por Morte', instructions: 'Agente do INSS.' };
  assert.equal(isAposentadoriaIdadeQuestion('Trabalhador exposto a ruido ha 22 anos, tem 53 anos. Ja pode pedir aposentadoria especial?', { agentData: previdAgent }), false);
  assert.equal(isAposentadoriaIdadeQuestion('Cliente de 53 anos, ja pode se aposentar?', { agentData: especialAgent }), false);
  assert.equal(isAposentadoriaIdadeQuestion('Viuva de 44 anos, quanto tempo recebe?', { agentData: pensaoAgent }), false);
  // Mesmo em outro agente, quem pergunta explicitamente "por idade" recebe a base.
  assert.equal(isAposentadoriaIdadeQuestion('E a aposentadoria por idade, quais as regras?', { agentData: especialAgent }), true);
});

test('a base conferida traz os numeros oficiais', () => {
  const text = APOSENTADORIA_IDADE_SOURCE_TEXT;
  const required = [
    'Homem: 65 anos de idade e 20 anos de tempo de contribuicao', // EC 103 art. 19
    'Mulher: 62 anos de idade e 15 anos de tempo de contribuicao', // EC 103 art. 19
    'Homem: 65 anos de idade e 15 anos de tempo de contribuicao', // EC 103 art. 18
    '62 anos a partir de 2023', // EC 103 art. 18 § 1º
    '180 contribuicoes mensais', // Lei 8.213 art. 25, II
    '60% dessa media, mais 2 pontos percentuais por ano de contribuicao que exceder 20 anos', // art. 26 § 2º
    'a partir do que exceder 15 anos de contribuicao', // art. 26 § 5º
    'Homem: 60 anos de idade. Mulher: 55 anos de idade.', // rural e PCD
  ];
  for (const fragment of required) assert.ok(text.includes(fragment), fragment);
  assert.ok(!/\b61 anos e 6 meses em 2023\b/.test(text));
});

test('insere a base como Fonte 1 e renumera as fontes recuperadas', () => {
  const retrieved = [
    '[Fonte 1 | LC 142/2013 | trecho 4 | sim 0.812]\nArt. 3o ... pessoa com deficiencia',
    '[Fonte 2 | Lei 8.213/1991 | trecho 90]\nArt. 48 ... rural',
  ].join('\n\n---\n\n');
  const merged = withAposentadoriaIdadeSource(`ANEXO ENVIADO PELO USUARIO (cnis.pdf):\ntexto\n\n---\n\n${retrieved}`);
  assert.ok(merged.startsWith('ANEXO ENVIADO'));
  const sources = parseSources(merged);
  assert.equal(sources.get(1).title, APOSENTADORIA_IDADE_SOURCE_TITLE);
  assert.equal(sources.get(2).title, 'LC 142/2013');
  assert.equal(sources.get(3).title, 'Lei 8.213/1991');
  assert.equal(withAposentadoriaIdadeSource(merged), merged, 'nao duplica a base');
});

test('funciona sem contexto recuperado', () => {
  const sources = parseSources(withAposentadoriaIdadeSource(''));
  assert.equal(sources.size, 1);
  assert.ok(sources.get(1).content.includes('EMENDA CONSTITUCIONAL'));
});

test('acrescenta a orientacao uma unica vez', () => {
  const once = withAposentadoriaIdadeGuidance('Instrucoes originais.');
  assert.ok(once.startsWith('Instrucoes originais.'));
  assert.ok(once.includes('Comece SEMPRE pela regra geral urbana'));
  assert.equal(withAposentadoriaIdadeGuidance(once), once);
});
