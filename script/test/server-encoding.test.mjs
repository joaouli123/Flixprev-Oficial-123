import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// O Node le o server.mjs como UTF-8. Um acento gravado em latin1 vira "�" e
// aparece quebrado para o usuario ("O servi�o de IA est� indispon�vel").
test('server.mjs e UTF-8 valido, sem acento gravado em latin1', () => {
  const text = fs.readFileSync(new URL('../../server.mjs', import.meta.url)).toString('utf8');
  const broken = text.split('\n').flatMap((line, i) => (line.includes('�') ? [i + 1] : []));
  assert.deepEqual(broken, []);
  assert.ok(text.includes('O serviço de IA está temporariamente indisponível'));
});
