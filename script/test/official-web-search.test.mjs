import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOfficialDomain,
  evaluateGroundedCandidate,
  searchOfficialWeb,
  buildOfficialWebAnswer,
  looksLikeMissingAnswer,
  findMissingStatements,
  buildOfficialWebComplement,
} from '../lib/official-web-search.mjs';

test('looksLikeMissingAnswer reconhece "não tem na base" escrito de vários jeitos', () => {
  assert.equal(looksLikeMissingAnswer('Os documentos consultados não informam o valor do salário mínimo para o ano de 2026.'), true);
  assert.equal(looksLikeMissingAnswer('Infelizmente, não há informações no contexto fornecido sobre receitas culinárias.'), true);
  assert.equal(looksLikeMissingAnswer('Não encontrei essa informação nos documentos.'), true);
  assert.equal(looksLikeMissingAnswer('O material disponível não trata da revisão da vida toda.'), true);
  assert.equal(looksLikeMissingAnswer('A carência é de 12 contribuições mensais, dispensada em caso de acidente.'), false);
  assert.equal(looksLikeMissingAnswer(`${'Resposta completa com regras e valores. '.repeat(20)} Os documentos não informam o índice de 2027.`), false);
  assert.equal(looksLikeMissingAnswer(''), false);
});

function payload(text, chunks, supports) {
  return {
    candidates: [{
      content: { parts: [{ text }] },
      groundingMetadata: {
        groundingChunks: chunks.map(([domain, title, uri = '']) => ({ web: { domain, title, uri } })),
        groundingSupports: supports.map(([segText, idx]) => ({ segment: { text: segText }, groundingChunkIndices: idx })),
      },
    }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  };
}

const OFFICIAL_TEXT = 'O salário mínimo em 2026 é de R$ 1.621,00, conforme o Decreto publicado no Diário Oficial.';

test('isOfficialDomain aceita só domínios oficiais brasileiros', () => {
  assert.equal(isOfficialDomain('www.gov.br'), true);
  assert.equal(isOfficialDomain('portal.stf.jus.br'), true);
  assert.equal(isOfficialDomain('https://www.camara.leg.br/x'), true);
  assert.equal(isOfficialDomain('mpf.mp.br'), true);
  assert.equal(isOfficialDomain('jusbrasil.com.br'), false);
  assert.equal(isOfficialDomain('gov.br.golpe.com'), false);
  assert.equal(isOfficialDomain('fakegov.br'), false);
  assert.equal(isOfficialDomain(''), false);
});

test('aceita resposta apoiada em fonte oficial e remove lista de fontes do modelo', () => {
  const r = evaluateGroundedCandidate(payload(
    `${OFFICIAL_TEXT}\n\nFontes:\n- gov.br`,
    [['www.gov.br', 'Gov.br'], ['blog.com.br', 'Blog']],
    [[OFFICIAL_TEXT, [0]]],
  ));
  assert.equal(r.accepted, true);
  assert.equal(r.ratio, 1);
  assert.equal(r.text, OFFICIAL_TEXT);
  assert.deepEqual(r.sources.map((s) => s.domain), ['www.gov.br']);
});

test('rejeita resposta apoiada principalmente em sites não oficiais', () => {
  const r = evaluateGroundedCandidate(payload(
    OFFICIAL_TEXT,
    [['www.gov.br', 'Gov.br'], ['blog.com.br', 'Blog']],
    [['O salário mínimo em 2026', [0]], ['é de R$ 1.621,00, conforme o Decreto publicado no Diário Oficial.', [1]]],
  ));
  assert.equal(r.accepted, false);
  assert.ok(r.ratio < 0.7);
});

test('tira a linha apoiada só em blog, mas mantém o resto apoiado em fonte oficial', () => {
  const blogLine = 'Segundo especialistas, o valor deve subir para R$ 1.700 em 2027.';
  const r = evaluateGroundedCandidate(payload(
    `${OFFICIAL_TEXT}\n${blogLine}`,
    [['www.gov.br', 'Gov.br'], ['blog.com.br', 'Blog']],
    [[OFFICIAL_TEXT, [0]], [blogLine, [1]]],
  ));
  assert.equal(r.accepted, true);
  assert.equal(r.text, OFFICIAL_TEXT);
});

test('rejeita quando a resposta direta (primeira frase) só tem apoio em blog', () => {
  const answer = 'A idade mínima da mulher é de 62 anos após a Reforma da Previdência.';
  const rest = 'Além da idade, exige-se o tempo mínimo de 15 anos de contribuição, conforme a EC 103/2019.';
  const r = evaluateGroundedCandidate(payload(
    `${answer}\n${rest}`,
    [['www.gov.br', 'Gov.br'], ['blog.com.br', 'Blog']],
    [[answer, [1]], [rest, [0]]],
  ));
  assert.equal(r.accepted, false);
});

test('remove introdução de lista que ficou sem itens', () => {
  const r = evaluateGroundedCandidate(payload(
    `${OFFICIAL_TEXT}\nA carência é dispensada nos seguintes casos:\n- acidente de 2 tipos`,
    [['www.gov.br', 'Gov.br'], ['blog.com.br', 'Blog']],
    [[OFFICIAL_TEXT, [0]], ['acidente de 2 tipos', [1]]],
  ));
  assert.equal(r.accepted, true);
  assert.equal(r.text, OFFICIAL_TEXT);
});

test('rejeita SEM_FONTE_OFICIAL e resposta sem grounding', () => {
  assert.equal(evaluateGroundedCandidate(payload('SEM_FONTE_OFICIAL', [['www.gov.br', 'Gov']], [['SEM_FONTE_OFICIAL', [0]]])).accepted, false);
  assert.equal(evaluateGroundedCandidate(payload(OFFICIAL_TEXT, [], [])).accepted, false);
  assert.equal(evaluateGroundedCandidate({}).accepted, false);
});

test('searchOfficialWeb devolve a primeira resposta aceita sem esperar as demais', async () => {
  let calls = 0;
  const fetchImpl = (url, opts) => {
    calls += 1;
    const n = calls;
    if (n === 1) {
      return Promise.resolve(new Response(JSON.stringify(payload(OFFICIAL_TEXT, [['www.gov.br', 'Gov.br', 'https://www.gov.br/x']], [[OFFICIAL_TEXT, [0]]])), { status: 200 }));
    }
    // As outras variantes ficam penduradas até serem canceladas.
    return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  };
  const started = Date.now();
  const r = await searchOfficialWeb({ question: 'Qual o salário mínimo em 2026?', apiKey: 'k', baseURL: 'https://aiplatform.googleapis.com/v1', fetchImpl, timeoutMs: 5000 });
  assert.ok(Date.now() - started < 2000);
  assert.equal(r.found, true);
  assert.equal(r.text, OFFICIAL_TEXT);
  assert.deepEqual(r.sources, [{ title: 'Gov.br', url: 'https://www.gov.br/x' }]);
  assert.deepEqual(r.errors, []);
});

test('searchOfficialWeb não encontra quando nada é oficial ou a API falha', async () => {
  const fetchImpl = () => Promise.resolve(new Response(JSON.stringify(payload(OFFICIAL_TEXT, [['blog.com.br', 'Blog']], [[OFFICIAL_TEXT, [0]]])), { status: 200 }));
  const r = await searchOfficialWeb({ question: 'x?', apiKey: 'k', fetchImpl });
  assert.equal(r.found, false);
  const fail = () => Promise.resolve(new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 }));
  const r2 = await searchOfficialWeb({ question: 'x?', apiKey: 'k', fetchImpl: fail });
  assert.equal(r2.found, false);
  assert.ok(r2.errors.includes('quota'));
  assert.equal(await searchOfficialWeb({ question: 'x?', apiKey: '' }), null);
});

test('buildOfficialWebAnswer deixa claro que veio da internet e lista os links oficiais', () => {
  const text = buildOfficialWebAnswer({ text: OFFICIAL_TEXT, sources: [{ title: 'Gov.br', url: 'https://www.gov.br/x' }] }, new Date('2026-11-09T15:00:00Z'));
  assert.match(text, /fontes oficiais na internet/);
  assert.match(text, /\[Gov\.br\]\(https:\/\/www\.gov\.br\/x\)/);
  assert.match(text, /09\/11\/2026/);
  assert.ok(text.includes(OFFICIAL_TEXT));
});

test('findMissingStatements acha a lacuna dentro de resposta longa', () => {
  const longa = `${'A pensão por morte é devida aos dependentes do segurado. '.repeat(15)}Os documentos não especificam se a pensão exige carência. A renda é de 50% mais 10% por dependente.`;
  assert.deepEqual(findMissingStatements(longa), ['Os documentos não especificam se a pensão exige carência.']);
  assert.deepEqual(findMissingStatements('A carência é de 12 contribuições mensais, dispensada em caso de acidente.'), []);
  assert.deepEqual(findMissingStatements(''), []);
});

test('rejeita resposta da web que só traz linhas de "Base legal"', () => {
  const t1 = 'Base legal: Lei nº 11.196/2005, art. 70, I, d.';
  const t2 = '**Fundamentação legal:** Lei nº 8.212/1991.';
  const r = evaluateGroundedCandidate(payload(`${t1}
${t2}`, [['www.planalto.gov.br', 'Planalto']], [[t1, [0]], [t2, [0]]]));
  assert.equal(r.accepted, false);
});

test('searchOfficialWeb manda as lacunas para a pesquisa', async () => {
  let body = null;
  const fetchImpl = async (_url, opts) => { body = body || JSON.parse(opts.body); return { ok: true, json: async () => payload(OFFICIAL_TEXT, [['www.gov.br', 'Gov.br']], [[OFFICIAL_TEXT, [0]]]) }; };
  const r = await searchOfficialWeb({ question: 'Pensão exige carência?', apiKey: 'k', baseURL: 'https://aiplatform.googleapis.com/v1', gaps: ['Os documentos não especificam a carência.'], fetchImpl });
  assert.equal(r.found, true);
  const userText = body.contents[0].parts[0].text;
  assert.match(userText, /ficou sem estes pontos/);
  assert.match(userText, /não especificam a carência/);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'high');
});

test('buildOfficialWebComplement mantém a resposta da base e acrescenta o complemento com links', () => {
  const out = buildOfficialWebComplement('Resposta da base.', { text: 'A pensão independe de carência (art. 26, I, Lei 8.213/91).', sources: [{ title: 'Planalto', url: 'https://www.planalto.gov.br/x' }] }, new Date('2026-11-10T12:00:00Z'));
  assert.ok(out.startsWith('Resposta da base.'));
  assert.match(out, /Complemento em fontes oficiais/);
  assert.match(out, /independe de carência/);
  assert.ok(out.includes('[Planalto](https://www.planalto.gov.br/x)'));
  assert.ok(out.includes('10/11/2026'));
});

test('findMissingStatements pega lacuna escrita como "não está expressa nos trechos"', () => {
  const resp = 'Sim. O artigo 477 da CLT determina o pagamento das verbas rescisórias dentro do prazo do § 6º. No entanto, a quantidade exata de dias desse prazo não está expressa nos trechos disponíveis na base normativa consultada.\n* Paga multa? Sim, conforme o § 8º.';
  assert.equal(findMissingStatements(resp).length, 1);
  assert.match(findMissingStatements(resp)[0], /não está expressa/);
  assert.equal(findMissingStatements('Os trechos não detalham os critérios da proporcionalidade do aviso prévio.').length, 1);
  assert.equal(findMissingStatements('O texto integral do § 6º não foi reproduzido na base consultada.').length, 1);
  // respostas completas não podem disparar a busca
  assert.equal(findMissingStatements('Não é permitido acumular duas aposentadorias no RGPS, conforme o art. 124 da Lei 8.213/91.').length, 0);
  assert.equal(findMissingStatements('A carência não é exigida em caso de acidente de qualquer natureza.').length, 0);
  assert.equal(findMissingStatements('O BPC não exige contribuição ao INSS; a idade mínima é 65 anos.').length, 0);
});

test('evaluateGroundedCandidate mantém a conta aplicada ao caso e derruba número inventado', () => {
  const rule = 'A Lei 12.506/2011 garante 30 dias de aviso mais 3 dias por ano completo de serviço.';
  const calc = 'Para quem tem 3 anos de empresa, o aviso prévio é de 39 dias.';
  const fake = 'Para quem tem 3 anos de empresa, o aviso prévio é de 47 dias.';
  const noCase = 'O prazo de pagamento é de 15 dias corridos.';
  const p = (t) => payload(t, [['planalto.gov.br', 'Lei 12.506']], [[rule, [0]]]);
  const q = { question: 'aviso previo e sempre 30 dias né? o cara tinha 3 anos de firma' };
  const ok = evaluateGroundedCandidate(p(`${rule}\n${calc}`), q);
  assert.match(ok.text, /39 dias/);
  assert.doesNotMatch(evaluateGroundedCandidate(p(`${rule}\n${fake}`), q).text, /47 dias/);
  assert.doesNotMatch(evaluateGroundedCandidate(p(`${rule}\n${noCase}`), q).text, /15 dias/);
  // sem dado do caso na pergunta, linha numérica sem apoio continua saindo
  assert.doesNotMatch(evaluateGroundedCandidate(p(`${rule}\n${calc}`), { question: 'como funciona o aviso prévio?' }).text, /39 dias/);
});

test('searchOfficialWeb só faz a 2a rodada (temperatura maior) depois que a 1a não achou nada, e pede o resultado do caso nas lacunas', async () => {
  const bodies = [];
  let inFlight = 0;
  const fetchImpl = async (_u, o) => {
    const b = JSON.parse(o.body);
    b.concurrentAtStart = inFlight;
    bodies.push(b);
    inFlight += 1;
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }) };
  };
  await searchOfficialWeb({ question: 'aviso 3 anos de firma?', apiKey: 'k', gaps: ['a lei 12.506 não consta na base'], fetchImpl });
  const temps = bodies.map((b) => b.generationConfig.temperature);
  assert.equal(bodies.length % 2, 0);
  const half = bodies.length / 2;
  assert.ok(temps.slice(0, half).every((t) => t === 0) && temps.slice(half).every((t) => t === 0.5));
  // a 2a rodada só começa com a 1a toda terminada
  assert.equal(bodies[half].concurrentAtStart, 0);
  assert.match(bodies[0].contents[0].parts[0].text, /resultado final em número/);
  bodies.length = 0;
  await searchOfficialWeb({ question: 'x?', apiKey: 'k', copies: 1, fetchImpl });
  assert.ok(bodies.every((b) => b.generationConfig.temperature === 0));
});

test('evaluateGroundedCandidate mantém "Resultado final" e a conta ligada a blog, mas não o eco do número da pergunta', () => {
  const rule = 'A Lei 12.506/2011 garante 30 dias de aviso mais 3 dias por ano completo de serviço.';
  const calc = 'Para 3 anos de empresa, o cálculo é: 30 dias (base) + 9 dias (3 anos x 3 dias).';
  const result = 'Resultado final: 39 dias de aviso prévio.';
  const q = { question: 'aviso previo e sempre 30 dias né? o cara tinha 3 anos de firma' };
  const pr = payload(`${rule}\n${calc} = 39 dias.\n${result}`, [['planalto.gov.br', 'Lei 12.506'], ['blog.com.br', 'blog']], [[rule, [0]], [calc, [1]]]);
  const r = evaluateGroundedCandidate(pr, q);
  assert.match(r.text, /Resultado final: 39 dias/);
  assert.match(r.text, /\+ 9 dias/);
  // eco do número da pergunta sem fonte nenhuma: sai (e derruba a resposta por ser a 1a frase)
  const echo = 'Sim, a mulher se aposenta por idade com 60 anos.';
  const pe = payload(`${echo}\nA Lei garante aposentadoria por idade conforme o art. 201 da Constituição.`, [['planalto.gov.br', 'CF']], [['A Lei garante aposentadoria por idade conforme o art. 201 da Constituição.', [0]]]);
  const re = evaluateGroundedCandidate(pe, { question: 'mulher se aposenta por idade com 60 anos ne?' });
  assert.doesNotMatch(re.text, /60 anos/);
  assert.equal(re.accepted, false);
});

test('evaluateGroundedCandidate mantém a 1a frase ligada a blog quando seus números estão na linha oficial', () => {
  const first = 'O prazo para pagar a rescisão é de 10 dias corridos (Art. 477, § 6º, da CLT).';
  const off = 'Art. 477, § 6º: a entrega dos documentos e o pagamento devem ocorrer em até 10 dias contados do término do contrato.';
  const wrong = 'O prazo para pagar a rescisão é de 30 dias corridos (Art. 477, § 6º, da CLT).';
  const p = (t, l) => payload(`${t}\n${off}`, [['planalto.gov.br', 'CLT'], ['blog.com.br', 'blog']], [[l, [1]], [off, [0]]]);
  const ok = evaluateGroundedCandidate(p(first, first), { question: 'prazo rescisao?' });
  assert.equal(ok.accepted, true);
  assert.match(ok.text, /^O prazo para pagar a rescisão é de 10 dias/);
  const bad = evaluateGroundedCandidate(p(wrong, wrong), { question: 'prazo rescisao?' });
  assert.equal(bad.accepted, false);
  assert.equal(bad.reason, '1a_frase_caiu');
});
