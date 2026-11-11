import test from 'node:test';
import assert from 'node:assert/strict';
import { SQL_ACCENT_FROM, SQL_ACCENT_TO, sqlAccentFold, extractNumberedPrecedentPhrases, likeToAccentRegex } from '../lib/keyword-search.mjs';

test('translate() precisa de listas do mesmo tamanho, senao apaga letras', () => {
  assert.equal([...SQL_ACCENT_FROM].length, [...SQL_ACCENT_TO].length);
  const fold = (s) => [...s].map((c) => { const i = SQL_ACCENT_FROM.indexOf(c); return i < 0 ? c : SQL_ACCENT_TO[i]; }).join('');
  assert.equal(fold('Transição Carência SÚMULA Ação'), 'Transicao Carencia SUMULA Acao');
  assert.equal(sqlAccentFold('dc.content'), `translate(dc.content, '${SQL_ACCENT_FROM}', '${SQL_ACCENT_TO}')`);
});

test('sumula, tema e OJ com numero viram expressao de busca', () => {
  assert.deepEqual(extractNumberedPrecedentPhrases('O que diz a Súmula 75 da TNU?'), ['sumula 75', 'sumula n_ 75', 'sumula n._ 75']);
  assert.ok(extractNumberedPrecedentPhrases('Súmula nº 331 do TST').includes('sumula 331'));
  assert.ok(extractNumberedPrecedentPhrases('Súmula Vinculante 33').includes('sumula 33'));
  assert.ok(extractNumberedPrecedentPhrases('e o Tema 1102 do STF?').includes('tema 1102'));
  assert.ok(extractNumberedPrecedentPhrases('OJ 342 da SDI-1').includes('oj 342'));
});

test('pergunta sem precedente numerado nao gera expressao, e o limite e 6', () => {
  assert.deepEqual(extractNumberedPrecedentPhrases('Como funciona a regra de transição por pontos em 2026?'), []);
  assert.equal(extractNumberedPrecedentPhrases('Súmula 1, Súmula 2, Súmula 3').length, 6);
});

test('likeToAccentRegex: curingas do ILIKE viram regex e vogais aceitam acento', () => {
  assert.equal(likeToAccentRegex('%pedagio%'), 'p[eéèêëEÉÈÊË]d[aáàâãäAÁÀÂÃÄ]g[iíìîïIÍÌÎÏ][oóòôõöOÓÒÔÕÖ]');
  assert.equal(likeToAccentRegex('%sumula n_ 75%').includes('[nñNÑ]. 75'), true);
  assert.equal(likeToAccentRegex('%50% (x)%'), '50.* \\(x\\)');
  assert.equal(likeToAccentRegex('abc'), '^[aáàâãäAÁÀÂÃÄ]b[cçCÇ]$');
  const re = new RegExp(likeToAccentRegex('%transicao%'), 'i');
  assert.ok(re.test('Regra de TRANSIÇÃO por pontos'));
  assert.ok(!re.test('transacao'));
  assert.ok(new RegExp(likeToAccentRegex('%emenda constitucional nº 103%'), 'i').test('Emenda Constitucional nº 103/2019'));
  assert.ok(new RegExp(likeToAccentRegex('%§ 1º%'), 'i').test('art. 57, § 1º'));
  assert.ok(new RegExp(likeToAccentRegex('%correspondente ao tempo que%faltaria%'), 'is').test('correspondente ao tempo que\nfaltaria'));
});
