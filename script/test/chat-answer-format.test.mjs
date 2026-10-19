import test from 'node:test';
import assert from 'node:assert/strict';
import { formatChatAnswerForUser } from '../lib/chat-answer-format.mjs';

test('removes internal source markers and the source footer', () => {
  const answer = 'O prazo é de 10 dias. [Fonte 1]\n\nFontes consultadas:\n- Fonte 1: Lei 9.784, trecho 7';
  assert.equal(formatChatAnswerForUser(answer), 'O prazo é de 10 dias.');
});

test('preserves legal provisions that are part of the answer', () => {
  const answer = 'O art. 59 da Lei 9.784 prevê 10 dias [Fonte 1] e admite exceção expressa. [Fonte 2]';
  assert.equal(formatChatAnswerForUser(answer), 'O art. 59 da Lei 9.784 prevê 10 dias e admite exceção expressa.');
});

test('removes grouped references without changing lists', () => {
  const answer = 'São necessários:\n- Documento A [Fontes 1, 2]\n- Documento B [Fonte 3]';
  assert.equal(formatChatAnswerForUser(answer), 'São necessários:\n- Documento A\n- Documento B');
});

test('leaves plain answers and unsupported-answer messages intact', () => {
  assert.equal(formatChatAnswerForUser('Não encontrei essa informação no material do agente.'), 'Não encontrei essa informação no material do agente.');
  assert.equal(formatChatAnswerForUser('  Sim.  '), 'Sim.');
});
