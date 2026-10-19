import assert from 'node:assert/strict';
import test from 'node:test';
import { htmlToPlainText } from './link-content-utils.mjs';

test('preserves statutory text after a section mentioning social networks', () => {
  const html = `<html><body><main>
    <p>Art. 140. Comunicação institucional e redes sociais.</p>
    <p>Art. 141. A norma continua nesta seção.</p>
    <p>Art. 544. Disposições finais.</p>
  </main></body></html>`;
  const text = htmlToPlainText(html, { sourceUrl: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm' });
  assert.match(text, /Art\. 140/);
  assert.match(text, /Art\. 141/);
  assert.match(text, /Art\. 544/);
});
