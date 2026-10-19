// End-to-end agent QA. Each case uses an isolated conversation, verifies the
// stored answer and deletes the temporary conversation in a finally block.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const baseUrl = String(process.env.APP_BASE_URL || 'http://localhost:5057').replace(/\/$/, '');
const casesPath = process.argv.find((arg) => arg.endsWith('.json'));
if (!casesPath) throw new Error('Usage: node script/audit-agent-answers.mjs <cases.json>');
const cases = JSON.parse(await fs.readFile(casesPath, 'utf8'));
const only = new Set(String(process.env.AUDIT_ONLY || '').split(',').map((value) => value.trim()).filter(Boolean));
const selected = only.size ? cases.filter((item) => only.has(String(item.id))) : cases;
const numberWords = { '1': ['um', 'uma'], '5': ['cinco'], '8': ['oito'], '10': ['dez'], '12': ['doze'], '15': ['quinze'], '20': ['vinte'], '25': ['vinte e cinco'], '30': ['trinta'], '35': ['trinta e cinco'], '55': ['cinquenta e cinco'], '60': ['sessenta'], '62': ['sessenta e dois'], '65': ['sessenta e cinco'], '90': ['noventa'], '120': ['cento e vinte'], '180': ['cento e oitenta'] };
const normalize = (value) => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function hasRequired(answer, term) {
  const normalizedTerm = normalize(term);
  if (/^\d+$/.test(normalizedTerm)) {
    return new RegExp(`\\b${normalizedTerm}\\b`).test(answer)
      || (numberWords[normalizedTerm] || []).some((word) => new RegExp(`\\b${word}\\b`).test(answer));
  }
  return answer.includes(normalizedTerm);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(100000), ...options });
  const raw = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 350)}`);
  return { response, raw };
}

async function runCase(testCase) {
  const userId = crypto.randomUUID();
  const headers = { 'Content-Type': 'application/json', 'x-user-id': userId };
  let conversationId = null;
  const startedAt = Date.now();
  const result = { id: testCase.id, agent: testCase.agent, question: testCase.question };
  try {
    const created = await request('/api/conversations', {
      method: 'POST', headers, body: JSON.stringify({ title: `[QA] ${testCase.id}`, agentId: testCase.agentId }),
    });
    conversationId = JSON.parse(created.raw).id;
    if (!conversationId) throw new Error('Conversation ID missing');
    const completion = await request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST', headers, body: JSON.stringify({ content: testCase.question, agentId: testCase.agentId }),
    });
    let answer = '';
    let streamError = '';
    for (const line of completion.raw.split(/\r?\n/)) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.content) answer += event.content;
        if (event.error) streamError = String(event.error);
      } catch { /* Ignore a partial SSE record. */ }
    }
    result.answer = answer.trim();
    result.streamError = streamError || undefined;
    const saved = await request(`/api/conversations/${conversationId}/messages`, { headers });
    const messages = JSON.parse(saved.raw);
    result.savedMatches = messages.filter((item) => item.role === 'assistant').at(-1)?.content === result.answer;
    const normalizedAnswer = normalize(result.answer);
    result.abstained = /nao consegui confirmar|nao (?:consta|foi possivel confirmar|localizei|encontrei|encontro)|informac(?:ao|oes) nao (?:consta|constam|esta|estao)|nao tenho (?:dados|acesso)/.test(normalizedAnswer);
    result.missingRequired = (testCase.required || []).filter((term) => !hasRequired(normalizedAnswer, term));
    result.forbiddenPresent = (testCase.forbidden || []).filter((term) => normalizedAnswer.includes(normalize(term)));
    result.pass = !streamError && Boolean(result.answer) && result.savedMatches
      && result.missingRequired.length === 0 && result.forbiddenPresent.length === 0
      && (testCase.allowAbstention || !result.abstained);
  } catch (error) {
    result.error = error?.message || String(error);
    result.pass = false;
  } finally {
    if (conversationId) {
      try {
        await request(`/api/conversations/${conversationId}`, { method: 'DELETE', headers });
        result.deleted = true;
      } catch (error) {
        result.deleted = false;
        result.cleanupError = error?.message || String(error);
      }
    }
    result.durationMs = Date.now() - startedAt;
  }
  console.log(JSON.stringify(result));
  return result;
}

const results = [];
for (const testCase of selected) {
  results.push(await runCase(testCase));
}
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  summary: { cases: results.length, passed: results.filter((item) => item.pass).length, failed: results.filter((item) => !item.pass).length, deleted: results.filter((item) => item.deleted).length },
  results,
};
if (process.env.AUDIT_REPORT_PATH) {
  await fs.writeFile(process.env.AUDIT_REPORT_PATH, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ summary: report.summary }));
if (report.summary.failed > 0 || report.summary.deleted !== report.summary.cases) process.exitCode = 1;
