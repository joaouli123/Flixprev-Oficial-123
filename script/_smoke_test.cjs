/**
 * Smoke test: 3 perguntas em 3 agentes para verificar se buildPrompt fix funciona
 */
const https = require('https');
const BASE_URL = 'https://flixprev-oficial-123-production.up.railway.app';
const USER_ID = '00000000-0000-0000-0000-000000000001';

function req(url, opts, body) {
  return new Promise((res, rej) => {
    const r = https.request(new URL(url), opts, (resp) => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ s: resp.statusCode, b: d }));
    });
    r.setTimeout(120000, () => { r.destroy(); rej(new Error('Timeout')); });
    r.on('error', rej);
    if (body) r.write(body);
    r.end();
  });
}

function extractText(raw) {
  let t = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const j = JSON.parse(line.slice(6));
        if (j.content) t += j.content;
        if (j.text) t += j.text;
        if (j.assistantMessage && j.assistantMessage.content) t += j.assistantMessage.content;
      } catch { t += line.slice(6); }
    }
  }
  return t || raw;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function test(agentId, agentName, question) {
  console.log('Testing: ' + agentName + ' — ' + question);
  const conv = await req(BASE_URL + '/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID }
  }, JSON.stringify({ agentId }));
  const convId = JSON.parse(conv.b).id;
  await sleep(2000);
  const msg = await req(BASE_URL + '/api/conversations/' + convId + '/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID }
  }, JSON.stringify({ content: question }));
  const text = extractText(msg.b);
  const hasRefuse = /não encontrei essa informação/i.test(text);
  const len = text.length;
  const status = (hasRefuse ? 'FAIL' : 'OK') + ' [' + len + 'c]';
  console.log('  ' + status);
  console.log('  >>> ' + text.substring(0, 150));
  console.log('');
  return !hasRefuse && len > 50;
}

async function main() {
  const tests = [
    ['069686a5-cf9d-4748-8b1d-d6ee8e11a51e', 'Aux Inc Temp', 'Qual a carencia do auxilio-doenca?'],
    ['09e0ecf2-cc5f-4cca-8260-971f5faecf0b', 'Apos Idade Urbana', 'Qual a idade minima para aposentadoria por idade urbana?'],
    ['8f904216-cd19-4a9b-b0ed-33bb74927e73', 'Pensao Morte', 'Quem sao os dependentes da primeira classe?'],
  ];
  let pass = 0;
  for (let i = 0; i < tests.length; i++) {
    if (i > 0) await sleep(8000);
    const ok = await test(tests[i][0], tests[i][1], tests[i][2]);
    if (ok) pass++;
  }
  console.log('Smoke test: ' + pass + '/' + tests.length + ' passed');
  process.exit(pass === tests.length ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
