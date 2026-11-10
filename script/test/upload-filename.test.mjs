import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeUploadFileName } from '../lib/upload-filename.mjs';

const asMulter = (s) => Buffer.from(s, 'utf8').toString('latin1');

test('corrige nome UTF-8 lido como latin1', () => {
  for (const n of ['2.Regras de Transição.pdf', 'AÇÕES CIVIS PÚBLICAS.pdf', 'PORTARIA Nº 991 DE 28 DE MARÇO DE 2022.pdf', 'Instrução Normativa 128.pdf']) {
    assert.equal(decodeUploadFileName(asMulter(n)), n);
  }
});

test('mantem nome que ja esta certo', () => {
  for (const n of ['CONSTITUIÇÃO DA REPÚBLICA.pdf', 'LEI 8.213.pdf', 'Ação.pdf', 'Súmula 7.pdf', 'arquivo – travessão.pdf', '']) {
    assert.equal(decodeUploadFileName(n), n);
  }
  assert.equal(decodeUploadFileName(null), '');
});
