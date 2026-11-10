import test from 'node:test';
import assert from 'node:assert/strict';
import { getGeminiThinkingOptions, isGeminiThinkingModel } from '../lib/gemini-thinking.mjs';

test('limita o raciocinio do gemini-3.8-flash e da folga ao limite de saida', () => {
  const options = getGeminiThinkingOptions('gemini-3.8-flash', {});
  assert.deepEqual(options.thinkingConfig, { thinkingLevel: 'low' });
  assert.ok(options.extraOutputTokens >= 1000);
});

test('nao mexe em modelos lite nem em outros provedores', () => {
  for (const model of ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gpt-4o', 'claude-sonnet-4-6', '']) {
    assert.deepEqual(getGeminiThinkingOptions(model, {}), { thinkingConfig: null, extraOutputTokens: 0 }, model);
  }
  assert.equal(isGeminiThinkingModel('gemini-3-pro'), true);
});

test('respeita GEMINI_THINKING_LEVEL e ignora valores invalidos', () => {
  assert.deepEqual(getGeminiThinkingOptions('gemini-3.8-flash', { GEMINI_THINKING_LEVEL: 'Medium' }).thinkingConfig, { thinkingLevel: 'medium' });
  assert.equal(getGeminiThinkingOptions('gemini-3.8-flash', { GEMINI_THINKING_LEVEL: 'off' }).thinkingConfig, null);
  assert.equal(getGeminiThinkingOptions('gemini-3.8-flash', { GEMINI_THINKING_LEVEL: 'minimal' }).thinkingConfig, null);
});

test('modelos pro pensam em high por padrao com folga maior', () => {
  const pro = getGeminiThinkingOptions('gemini-3.1-pro-preview', { GEMINI_THINKING_LEVEL: 'low' });
  assert.deepEqual(pro.thinkingConfig, { thinkingLevel: 'high' });
  assert.ok(pro.extraOutputTokens >= 8000);
  assert.deepEqual(getGeminiThinkingOptions('gemini-3.1-pro-preview', { GEMINI_PRO_THINKING_LEVEL: 'medium' }).thinkingConfig, { thinkingLevel: 'medium' });
});
