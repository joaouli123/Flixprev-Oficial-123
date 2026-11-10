import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOfficialDomain,
  evaluateGroundedCandidate,
  searchOfficialWeb,
  buildOfficialWebAnswer,
} from '../lib/official-web-search.mjs';

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
