import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEmbeddingRoute } from '../lib/embedding-availability.mjs';

const express = { chatProvider: 'gemini-express', chatApiKey: 'k', embeddingModel: 'gemini-embedding-001' };

test('Express sem chave dedicada usa a propria chave do chat (antes ficava sem busca semantica)', () => {
  assert.equal(resolveEmbeddingRoute({ ...express, env: { GEMINI_API_KEY: 'antiga' } }), 'express');
});

test('chave dedicada ou OpenAI tem prioridade', () => {
  assert.equal(resolveEmbeddingRoute({ ...express, env: { EMBEDDING_API_KEY: 'x' } }), 'dedicated');
  assert.equal(resolveEmbeddingRoute({ ...express, env: { OPENAI_API_KEY: 'x' } }), 'dedicated');
  assert.equal(resolveEmbeddingRoute({ ...express, env: { AI_EMBEDDING_API_KEY: ' x ' } }), 'dedicated');
});

test('Express sem chave ou com modelo nao Gemini desliga a busca semantica', () => {
  assert.equal(resolveEmbeddingRoute({ ...express, chatApiKey: '', env: {} }), 'none');
  assert.equal(resolveEmbeddingRoute({ ...express, embeddingModel: 'text-embedding-3-large', env: {} }), 'none');
  assert.equal(resolveEmbeddingRoute({ ...express, env: { OPENAI_API_KEY: '   ' } }), 'express');
});

test('outros provedores seguem o caminho antigo', () => {
  assert.equal(resolveEmbeddingRoute({ chatProvider: 'openai-compatible', chatApiKey: 'k', embeddingModel: 'gemini-embedding-001', env: {} }), 'default');
});
