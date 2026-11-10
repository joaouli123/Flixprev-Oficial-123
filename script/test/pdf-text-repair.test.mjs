import test from 'node:test';
import assert from 'node:assert/strict';
import { repairSplitPortugueseWords } from '../lib/pdf-text-repair.mjs';

test('junta palavras partidas no ç', () => {
  assert.equal(repairSplitPortugueseWords('quando da atualizaç ão de dados'), 'quando da atualização de dados');
  assert.equal(repairSplitPortugueseWords('a obtenç ão de aposentadoria'), 'a obtenção de aposentadoria');
  assert.equal(repairSplitPortugueseWords('as contribuiç ões e as declaraç ões'), 'as contribuições e as declarações');
  assert.equal(repairSplitPortugueseWords('REVISÃO DA CONCESSÇ ÃO'), 'REVISÃO DA CONCESSÇÃO');
  assert.equal(repairSplitPortugueseWords('compensaç ão'), 'compensação');
});

test('nao mexe em texto correto nem em mesoclise', () => {
  const ok = 'aplicar - se - ão a partir do primeiro dia; à raz ão de meio ponto; § 6º O pagamento';
  assert.equal(repairSplitPortugueseWords(ok), ok);
  assert.equal(repairSplitPortugueseWords('a efetiva exposiç ao agente'), 'a efetiva exposiç ao agente');
  assert.equal(repairSplitPortugueseWords('a funç ãozinha'), 'a funç ãozinha');
  assert.equal(repairSplitPortugueseWords('ç isolado e Ç 1'), 'ç isolado e Ç 1');
  assert.equal(repairSplitPortugueseWords(''), '');
  assert.equal(repairSplitPortugueseWords(null), '');
});
